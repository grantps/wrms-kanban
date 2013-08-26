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
            console.log(  'wrms-kanban.js:' + a[0] + ' - ' + a[1]);
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

    function store_model(m, callback){
        setTimeout(function(){callback(null, true);}, 0);
    }
    function get_stored_model(callback){
        setTimeout(function(){callback(null, {});}, 0);
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

    function add_allocations(rels){
        return rels;
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
        __enter('update_model');
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
        __leave();
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
                    $(d).append(mk('a', ['btn', 'close'], function(a){
                        $(a).text('[Close]')
                            .click(function(){
                                kanban.hide();
                            });
                    }));
                }));
            }));
            function add_list(to, cat){
                $(to).append(mk('h2', [], function(h2){ $(h2).text(__category_meta[cat].name); }))
                     .append(mk('ul', ['wrl', 'kanban-' + cat]));
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
            connectWith: '#kanban-overlay ul',
            revert: true,
            receive: function(evt, ui){
                console.log(evt);
                console.log(ui);
                $(ui.item).addClass('modified');
            }
        }).disableSelection();
    }

    function lay_out_cards(m){
        __enter('lay_out_cards');
        _.each(__category_meta, function(val, key){
            $('ul.kanban-' + key).empty();
        });
        _.each(m, function(val, key){
            $('ul.kanban-' + val.__kanban.cat).append(mk('li', [], function(li){
                log.info(JSON.stringify(val));
                $(li).html('<b>[#' + val.wr + ']</b> ' + val.brief + ' <b>[' + val.status + ']</b>');
            }));
        });
        __leave();
    }

    function render_model(m){
        __enter('render_model');
        log.info(JSON.stringify(m));
        lay_out_cards(m);
        __leave();
    }

    var kanban = {
        show: function(){
            __enter('kanban.show');
            var child_relations = parse_child_relations();
            log.info('found ' + child_relations.length + ' "I" relations');
            get_stored_model(function(err, model){
                child_relations = add_allocations(child_relations);
                model = update_model(child_relations, model);
                render_model(model);
                $('#kanban-overlay').height($(document).height());
                $('#kanban-overlay').show();
            });
            __leave();
        },
        hide: function(){
            $('#kanban-overlay').hide();
        }
    };

    $(document).ready(function(){
        try{
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
