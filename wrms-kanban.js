(function(){

    var __log_fn_name_stack = [];

    function __enter(name, silent){
        __log_fn_name_stack.unshift(name);
        if (!silent){
            log.info('{enter}');
        }
    }

    function __leave(silent){
        __log_fn_name_stack.shift();
        if (!silent){
            log.info('{leave}');
        }
    }

    var log = {
        error: function(func, msg, except){
            var a = Array.prototype.slice.call(arguments, 0);
            if (a.length < 3 && __log_fn_name_stack.length){
                a.unshift(__log_fn_name_stack[0]);
            }
            console.error('wrms-kanban.js:' + a[0] + ' - ' + a[1] + (a[2] ? '[[' + a[2] + ']]' : ''));
        },
        info: function(func, msg){
            var a = Array.prototype.slice.call(arguments, 0);
            if (a.length < 2){
                if (__log_fn_name_stack.length){
                    a.unshift(__log_fn_name_stack[0]);
                }else{
                    a.unshift('{unknown}');
                }
            }
            console.log('wrms-kanban.js:' + a[0] + ' - ' + a[1]);
        }
    };

    function mk(type, classes, fn){
        var o = document.createElement(type);
        if (!fn){
            if (typeof(classes) === 'function'){
                fn = classes;
                classes = undefined;
            }else{
                fn = function(x){ return x; }
            }
        }
        if (!classes){
            classes = [];
        }
        classes.forEach(function(c){
            $(o).addClass(c);
        });
        try{
            fn(o);
        }catch(ex){
            log.error('mk', 'exception while creating ' + type, ex);
        }
        return o;
    }


    var model_host = 'https://foo.wgtn.cat-it.co.nz:27601';
    var __model = {};
    var __page_key = null;

    function store_model(m, callback){
        log.info('store_model', 'Storing model for ' + __page_key + '...');
        $.ajax({
            type: 'POST',
            url: model_host + '/put',
            contentType: 'application/json; charset=utf-8',
            dataType: 'json',
            data: JSON.stringify({key: __page_key, val: m})
        })
        .done(function(r){
            log.info('store_model', 'done ' + r);
            callback(null, r);
        })
        .fail(function(o, e){
            log.error('store_model', 'failed', e);
            callback(e);
        });
    }

    function get_stored_model(callback){
        log.info('get_stored_model', 'Getting model for ' + __page_key + '...');
        $.ajax({
            type: 'GET',
            url: model_host + '/get',
            contentType: 'application/json; charset=utf-8',
            dataType: 'json',
            data: {key: __page_key}
        })
        .done(function(r){
            log.info('get_stored_model', 'done ' + r);
            callback(null, r || {});
        })
        .fail(function(o, e){
            log.error('get_stored_model', 'failed', e);
            callback(e);
        });
    }

    function parse_child_relations(){
        var result = [];
        $('table.entry').each(function(){
            try{
                var table = $(this);
                if (table.find('th.pcol:first').text() !== 'This W/R'){
                    return;
                }
                table.find('tbody > tr').each(function(){
                    var row = $(this);
                    if (row.hasClass('row0') || row.hasClass('row1')){
                        var line = {
                            wr:     row.find('td.entry:nth-of-type(3) > a').text(),
                            brief:  row.find('td.entry:nth-of-type(4) > a').text(),
                            type:   row.find('td.entry:nth-of-type(2)').text(),
                            status: row.find('td.entry:nth-of-type(5)').text()
                        };
                        if (line.type === 'Implemented in'){
                            result.push(line);
                        }
                    }
                });
            }catch(ex){
                log.error('parse_child_relations', 'exception', ex);
            }
        });
        return result;
    }

    function add_allocations(m){
        _.each(m, function(val, key){
            $.ajax({
                type: 'GET',
                url: model_host + '/enrich',
                contentType: 'application/json; charset=utf-8',
                dataType: 'json',
                data: {key: __page_key, wr: key}
            })
            .done(function(r){
                log.info('add_allocations', key + ': ' + JSON.stringify(r));
                val.__kanban['users'] = r;
                render_allocation(key, val);
            })
            .fail(function(o, e){
                log.error('add_allocations', key + ' failed', e);
                callback(e);
            });
        });
        return m;
    }

    // TODO: combine with filter vv
    var __category_meta = {
        backlog:    {name: 'Backlog'},
        this_week:  {name: 'This week'},
        cat_dev:    {name: 'Dev'},
        cat_test:   {name: 'Test'},
        cat_blocked:{name: 'Blocked'},
        client_uat: {name: 'UAT'},
        done:       {name: 'Done'}
    };

    function update_model(rels, old_m){
        var m = {};
        var filter = [
            {key: 'backlog',    re: /New request|Quoted/},
            {key: 'this_week',  re: /Allocated|Quote Approved/},
            {key: 'cat_dev',    re: /Ongoing|Failed Testing|Needs Documenting|Provide Feedback|In Progress|Reviewed/},
            {key: 'cat_test',   re: /Development Complete|Catalyst Testing|Ready for Staging/},
            {key: 'cat_blocked',re: /Need Info|On Hold|Blocked/},
            {key: 'client_uat', re: /QA Approved|Pending QA/},
            {key: 'done',       re: /Production Ready|Testing\/Signoff|Finished|Cancelled/}
        ];
        rels.forEach(function(r){
            if (old_m[r.wr]){
                r.__kanban = old_m[r.wr].__kanban;
                m[r.wr] = r;
                return;
            }
            var seen = false;
            filter.forEach(function(f){
                if (seen){
                    return;
                }
                if (r.status.match(f.re)){
                    seen = true;
                    r.__kanban = {cat: f.key};
                    m[r.wr] = r;
                }
            });
        });
        return m;
    }

    function maybe_create_overlay_dom(){
        if ($('#kanban-overlay').length > 0){
            log.info('maybe_create_overlay_dom', 'already exists');
            return;
        }
        $('body').append(mk('div', [], function(overlay){
            $(overlay).attr('id', 'kanban-overlay');
            $(overlay).append(mk('div', ['section', 'group'], function(row){
                $(row).append(mk('div', ['col', 'span_4_of_6'], function(d){
                    $(d).append(mk('h1', [], function(h1){ $(h1).text($('td.entry').eq(1).text()); }));
                }));
                $(row).append(mk('div', ['col', 'span_1_of_6'], function(d){
                    function unmark_modified(){
                        $('#kanban-overlay li.modified').each(function(){
                            $(this).removeClass('modified');
                        });
                    }
                    $(d).append(mk('a', ['btn', 'save'], function(a){
                        $(a).text('[Save]')
                            .click(function(){
                                store_model(__model, function(e, r){
                                    if (e){
                                        log.error('save-btn', 'failed to save model', e);
                                    }else{
                                        unmark_modified();
                                        log.info('save-btn', 'saved model ' + r);
                                    }
                                });
                            });
                    }));
                    $(d).append(mk('a', ['btn', 'reset'], function(a){
                        $(a).text('[Reset]')
                            .click(function(){
                                store_model({}, function(e, r){
                                    if (e){
                                        log.error('save-btn', 'failed to save model', e);
                                    }else{
                                        unmark_modified();
                                        log.info('save-btn', 'saved model ' + r);
                                        kanban.show();
                                    }
                                });
                            });
                    }));
                    $(d).append(mk('a', ['btn', 'close'], function(a){
                        $(a).text('[Close]')
                            .click(function(){
                                kanban.hide();
                            });
                    }));
                }));
            }));
            function add_list(to, cat){
                $(to)//.append(mk('h2', [], function(h2){ $(h2).text(__category_meta[cat].name); }))
                     .append(mk('ul', ['wrl', 'kanban-' + cat], function(ul){
                        $(ul).append(mk('li', ['heading'], function(li){
                            $(li).text(__category_meta[cat].name);
                        }));
                     }));
            }
            $(overlay).append(mk('div', ['section', 'group'], function(row){
                ['backlog', 'this_week', 'cat_dev', 'client_uat', 'done'].forEach(function(cat){
                    $(row).append(mk('div', ['col', 'span_1_of_6'], function(group){
                        add_list(group, cat);
                        if (cat === 'cat_dev'){
                            ['cat_test', 'cat_blocked'].forEach(function(extra){
                                add_list(group, extra);
                            });
                        }
                    }));
                });
            }));
            $(overlay).hide();
        }));
        $('#kanban-overlay ul').sortable({
            items: 'li:not(.heading)',
            connectWith: '#kanban-overlay ul',
            revert: true,
            receive: function(evt, ui){
                console.log(evt);
                console.log(ui);
                $(ui.item).addClass('modified');
                var wr = $(ui.item).find('.wrno').text();
                if (wr){
                    var kb = __model[wr].__kanban;
                    var new_cat = $(ui.item).parent().attr('class').match(/kanban-([_a-z]+)/);
                    if (new_cat){
                        kb.old_cat = kb.cat;
                        kb.cat = new_cat[1];
                        log.info('kanban ul:receive', wr + ' ' + kb.old_cat + ' -> ' + kb.cat);
                    }else{
                        log.error('kanban ul:receive', 'model not updated', 'Cannot determine parent class');
                    }
                }
                //TODO: update __model
            }
        }).disableSelection();
    }

    function lay_out_cards(m){
        $('#kanban-overlay li:not(.heading)').remove();
        _.each(m, function(val, key){
            $('ul.kanban-' + val.__kanban.cat).append(mk('li', [], function(li){
                //log.info('lay_out_cards', JSON.stringify(val));
                $(li).html(
                    '<span class="wrno_pretty"><a href="https://wrms.catalyst.net.nz/wr.php?edit=1&request_id=' + val.wr + '">[#' + val.wr + ']</a></span>' +
                    '<span class="status">[' + val.status + ']</span>' +
                    '<span class="brief">' + val.brief + '</span>' +
                    '<span class="wrno">' + val.wr + '</span>'
                );
            }));
            render_allocation(key, val);
        });
    }

    function render_model(m){
        //log.info('render_model', JSON.stringify(m));
        lay_out_cards(m);
    }

    function render_allocation(wr, data){
        if (!data.__kanban || !data.__kanban.users || data.__kanban.users[0] === 'Nobody'){
            return;
        }
        var li = $('span.wrno:contains(' + wr + ')').parent();
        $(li).find('span.alloc').remove();
        data.__kanban.users.forEach(function(u){
            $(li).append(
                mk('span', ['alloc'], function(s){
                    $(s).text(u);
                })
            );
        });
    }

    var kanban = {
        show: function(){
            var child_relations = parse_child_relations();
            log.info('kanban.show', 'found ' + child_relations.length + ' "I" relations');
            get_stored_model(function(err, model){
                __model = add_allocations(update_model(child_relations, model));
                render_model(__model);
                $('#kanban-overlay').height($(document).height());
                $('#kanban-overlay').show();
            });
        },
        hide: function(){
            $('#kanban-overlay').hide();
        }
    };

    $(document).ready(function(){
        try{
            __page_key = $('#tmnu > a:nth-of-type(1)').text();
            maybe_create_overlay_dom();
            if (!$('#tmnu_kanban').length){
                var tmnu = $('#tmnu');
                tmnu.append(mk('span', ['tmnu_left']));
                tmnu.append(mk('a', ['tmnu'], function(a){
                    $(a).text('Kanban')
                        .attr('title', 'Show Kanban board for this WR group')
                        .css('cursor', 'pointer')
                        .click(kanban.show);
                }));
                tmnu.append(mk('span', ['tmnu_right']));
            }
            $(document).keyup(function(e){
                if (e.keyCode === 27){
                    kanban.hide();
                }
            });
        }catch(ex){
            console.log('Exception while adding Kanban menu entry [[' + ex + ']]');
        }
    });
})();
