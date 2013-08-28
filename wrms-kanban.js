(function(){
    var log = {
        error: function(func, msg, except){
            console.error('wrms-kanban.js:' + func + ' - ' + msg + (except ? ' [[' + except + ']]' : ''));
        },
        info: function(func, msg){
            console.log('wrms-kanban.js:' + func + ' - ' + msg);
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


    var __model = {};
    var __parent_wr = null;

    var __wrms_status_map = {
        'On Hold': 'H',
        'Quote Approved': 'A',
        'Quoted': 'Q',
        'Testing': 'T',
        'Finished': 'F',
        'Allocated': 'L',
        'In Progress': 'I',
        'Cancelled': 'C',
        'New request': 'N',
        'Reviewed': 'R',
        'New request': 'N',
        'Reviewed': 'R',
        'On Hold': 'H',
        'Cancelled': 'C',
        'In Progress': 'I',
        'Allocated': 'L',
        'Finished': 'F',
        'Provide Feedback': 'K',
        'Testing/Signoff': 'T',
        'Quoted': 'Q',
        'Quote Approved': 'A',
        'Needs Documenting': 'D',
        'Ready for Staging': 'S',
        'Production Ready': 'P',
        'Failed Testing': 'Z',
        'Catalyst Testing': 'U',
        'QA Approved': 'V',
        'Pending QA': 'W',
        'Need Info': 'B',
        'Ongoing Maintenance': 'O',
        'Development Complete': 'E',
        'Blocked': 'X'
    };

    var __category_meta = {
        backlog:    {name: 'Backlog',   statuses: ['New request', 'Quoted']},
        this_week:  {name: 'This week', statuses: ['Allocated', 'Quote Approved']},
        cat_dev:    {name: 'Dev',       statuses: ['In Progress', 'Ongoing Maintenance', 'Needs Documenting',
                                                   'Provide Feedback', 'Reviewed', 'Development Complete',
                                                   'Failed Testing']},
        cat_test:   {name: 'Test',      statuses: ['Ready for Staging', 'Catalyst Testing', 'QA Approved']},
        cat_blocked:{name: 'Blocked',   statuses: ['Need Info', 'On Hold', 'Blocked']},
        client_uat: {name: 'UAT',       statuses: ['Pending QA', 'Testing/Signoff']},
        done:       {name: 'Done',      statuses: ['Production Ready', 'Finished', 'Cancelled']}
    };

    function category_from_status(s){
        var result = null;
        _.each(__category_meta, function(val, key){
            if (result){
                return;
            }
            if (_.contains(val.statuses, s)){
                result = key;
            }
        });
        return result;
    }

    function get_children(callback){
        $.ajax({
            type: 'GET',
            url: '/api2/search?filtertable=wrsearch&format=json&columns=request_id%2Cdescription%2Cstatus%2Callocated_to&offset=0&limit=200&q=childof%3A' + __parent_wr
        })
        .done(function(r){
            try{
                var model = {};
                r = JSON.parse(r);
                r.response.body.forEach(function(item){
                    var wr = item.request_id[0];
                    model[wr] = {
                        wr: wr,
                        status: item.status[0],
                        brief: item.description[0],
                        cat: category_from_status(item.status[0]),
                        users: item.allocated_to
                    };
                    if (model[wr].users){
                        var n = model[wr].users[0].replace(/ - Australia/, '');
                        model[wr].users = n.split(/, /);
                    }
                });
                callback(null, model);
            }catch(ex){
                log.error('get_children', 'failed for parent ' + __parent_wr, ex);
                callback(ex);
            }
        })
        .fail(function(o, e){
            log.error('add_allocations', key + ' failed', e);
            callback(e);
        });
    }

    function maybe_create_overlay_dom(){
        if ($('#kanban-overlay').length > 0){
            log.info('maybe_create_overlay_dom', 'already exists');
            return;
        }
        $('body').append(mk('div', [], function(overlay){
            $(overlay).attr('id', 'kanban-overlay');
            $(overlay).append(mk('div', ['section', 'group'], function(row){
                $(row).append(mk('div', ['col', 'span_6_of_6'], function(d){
                    $(d).append(mk('h1', [], function(h1){ $(h1).text($('td.entry').eq(1).text()); }));
                }));
                $(row).append(mk('div', ['btn', 'close'], function(d){
                    $(d).text('X')
                        .click(function(){
                            kanban.hide();
                        });
                }));
            }));
            function add_list(to, cat){
                $(to).append(mk('ul', ['wrl', 'kanban-' + cat], function(ul){
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
                $(ui.item).addClass('modified');
                var wr = $(ui.item).find('.wrno').text();
                var new_cat = $(ui.item).parent().attr('class').match(/kanban-([_a-z]+)/);
                if (new_cat){
                    new_cat = new_cat[1];
                }else{
                    log.error('kanban ul:receive', wr, 'Failed to determine parent class');
                    return;
                }
                var new_stat_long = __category_meta[new_cat].statuses[0];
                var new_stat_short = __wrms_status_map[new_stat_long];
                $.ajax({
                    type: 'POST',
                    url: '/api2/request_update',
                    contentType: 'application/x-www-form-urlencoded',
                    data: {
                        request_id: wr,
                        status: new_stat_short
                    }
                }).fail(function(o, e){
                    log.error('kanban ul:receive', wr + ' failed to update status', e);
                }).done(function(r){
                    log.info('kanban ul:receive', 'updated ' + wr);
                    $(ui.item).removeClass('modified');
                    $(ui.item).find('span.status').text('[' + new_stat_long + ']');
                    __model[wr].cat = new_cat;
                    __model[wr].status = new_stat_long;
                });
            }
        }).disableSelection();
    }

    function render_model(m){
        $('#kanban-overlay li:not(.heading)').remove();
        _.each(m, function(val, key){
            $('ul.kanban-' + val.cat).append(mk('li', [], function(li){
                $(li).html(
                    '<span class="wrno_pretty"><a href="https://wrms.catalyst.net.nz/wr.php?edit=1&request_id=' + val.wr + '">[#' + val.wr + ']</a></span>' +
                    '<span class="status">[' + val.status + ']</span>' +
                    '<span class="brief">' + val.brief + '</span>' +
                    '<span class="wrno">' + val.wr + '</span>'
                );
            }));
            render_allocation(key, val);
        });
        return m;
    }

    function render_allocation(wr, data){
        if (!data.users || data.users[0] === 'Nobody'){
            return;
        }
        var li = $('span.wrno:contains(' + wr + ')').parent();
        $(li).find('span.alloc').remove();
        data.users.forEach(function(u){
            $(li).append(
                mk('span', ['alloc'], function(s){
                    $(s).text(u);
                    $(s).hover(
                        function(){
                            $('span.alloc.dimmed').removeClass('dimmed');
                            $('span.alloc:not(:contains(' + u + '))').addClass('dimmed');
                            console.log('dimming ' + u);
                        },
                        function(){
                            $('span.alloc.dimmed').removeClass('dimmed');
                            console.log('undimming ' + u);
                        }
                    );
                })
            );
        });
    }

    var kanban = {
        show: function(){
            $('#kanban-overlay').height($(document).height());
            $('#kanban-overlay').show();
        },
        hide: function(){
            $('#kanban-overlay').hide();
        }
    };

    $(document).ready(function(){
        try{
            __parent_wr = $('#tmnu > a:nth-of-type(1)').text().match(/(\d+)/)[1];
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
            get_children(function(e, r){
                if (e){
                    // TODO
                    //$('#kanban-overlay').hide();
                    return;
                }
                __model = render_model(r);
            });
        }catch(ex){
            log.error('wrms-kanban', 'Exception while adding Kanban menu entry', ex);
        }
    });
})();
