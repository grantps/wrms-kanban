(function(){
    var __refresh_interval = 5*60*1000;

    var log = {
        error: function(func, msg, except){
            console.error('wrms-kanban.js:' + func + ' - ' + msg + (except ? ' [[' + except + ']]' : ''));
        },
        info: function(func, msg){
            console.log('wrms-kanban.js:' + func + ' - ' + msg);
        }
    };

    function mk(type, classes, fn_or_val){
        var o = document.createElement(type);
        if (!fn_or_val){
            if (typeof(classes) === 'function'){
                fn_or_val = classes;
                classes = undefined;
            }else{
                fn_or_val = function(x){ return x; }
            }
        }
        if (!classes){
            classes = [];
        }
        classes.forEach(function(c){
            $(o).addClass(c);
        });
        try{
            if (typeof(fn_or_val) === 'function'){
                fn_or_val(o);
            }else{
                $(o).text(fn_or_val);
            }
        }catch(ex){
            log.error('mk', 'exception while creating ' + type, ex);
        }
        return o;
    }


    var __model = {};
    var __parent_wr = null;

    var __wrms_status_map = {
        'Allocated': 'L',
        'Blocked': 'X',
        'Cancelled': 'C',
        'Catalyst Testing': 'U',
        'Development Complete': 'E',
        'Failed Testing': 'Z',
        'Finished': 'F',
        'In Progress': 'I',
        'Need Info': 'B',
        'Needs Documenting': 'D',
        'New request': 'N',
        'On Hold': 'H',
        'Ongoing Maintenance': 'O',
        'Pending QA': 'W',
        'Production Ready': 'P',
        'Provide Feedback': 'K',
        'QA Approved': 'V',
        'Quote Approved': 'A',
        'Quoted': 'Q',
        'Ready for Staging': 'S',
        'Reviewed': 'R',
        'Testing/Signoff': 'T'
    };

    var __category_meta = {
        backlog:    {name: 'Backlog',   statuses: ['New request']},
        this_week:  {name: 'Next up',   statuses: ['Allocated', 'Quote Approved']},
        cat_dev:    {name: 'Dev',       statuses: ['In Progress', 'Ongoing Maintenance', 'Needs Documenting',
                                                   'Provide Feedback', 'Reviewed', 'Development Complete',
                                                   'Failed Testing']},
        cat_test:   {name: 'Test',      statuses: ['Ready for Staging', 'Catalyst Testing', 'QA Approved']},
        cat_blocked:{name: 'Blocked',   statuses: ['Need Info', 'Quoted', 'On Hold', 'Blocked']},
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

    function fetch_children(callback){
        $.ajax({
            type: 'GET',
            url: '/api2/search?filtertable=wrsearch&format=json&columns=request_id%2Cdescription%2Cstatus%2Callocated_to%2Cunapproved_hours%2Capproved_hours%2Chours&offset=0&limit=200&q=childof%3A' + __parent_wr
        })
        .done(function(r){ callback(null, r); })
        .fail(function(o, e){
            log.error('fetch_children', 'request failed', e);
            callback(e);
        });
    }

    function parse_model_from_json(response){
        function take_first_if(x){
            return x ? (x[0] || x) : null;
        }
        var model = {};
        response.response.body.forEach(function(item){
            var wr = take_first_if(item.request_id);
            var stat = take_first_if(item.status);
            model[wr] = {
                wr:     wr,
                status: stat,
                brief:  take_first_if(item.description),
                cat:    category_from_status(stat),
                users:  take_first_if(item.allocated_to),
                unapproved_hours:   take_first_if(item.unapproved_hours) || 0,
                approved_hours:     take_first_if(item.approved_hours) || 0,
                hours:              take_first_if(item.hours) || 0
            };
            if (model[wr].users){
                model[wr].users = model[wr].users.replace(/'| \(Resigned\)| - Australia/g, '').split(/, /);
            }
        });
        return model;
    }

    function load_children(callback){
        fetch_children(function(e, r){
            if (e){
                callback(e);
                return;
            }
            try{
                var model = parse_model_from_json(JSON.parse(r));
                callback(null, model);
            }catch(ex){
                log.error('load_children', 'failed for parent ' + __parent_wr, ex);
                callback(ex);
            }
        });
    }

    function update_children(){
        try{
            if ($('#kanban-overlay').is(':visible')){
                fetch_children(function(e, r){
                    if (e){
                        log.error('update_children', 'request failed', "couldn't complete XHR");
                        return;
                    }
                    if ($('.modified').length){
                        log.info('update_children', 'modifications in progress; discarding server updates');
                        return;
                    }
                    __model = render_model(parse_model_from_json(JSON.parse(r)));
                });
            }
        }catch(ex){
            log.error('update_children', 'exception thrown', ex);
        }
        setTimeout(update_children, __refresh_interval);
    }

    function maybe_create_overlay_dom(){
        if ($('#kanban-overlay').length > 0){
            log.info('maybe_create_overlay_dom', 'already exists');
            return;
        }
        $('body').append(mk('div', [], function(overlay){
            $(overlay).attr('id', 'kanban-overlay');
            $(overlay).append(mk('div', ['section', 'group'], function(row){
                $(row).append(mk('div', ['col', 'span_5_of_5'], function(d){
                    $(d).append(mk('h1', [], function(h1){ $(h1).text($('td.entry').eq(1).text()); }));
                }));
                $(row).append(mk('div', ['btn', 'close'], function(d){
                    $(d).html('&nbsp;')
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
                    $(row).append(mk('div', ['col', 'span_1_of_5'], function(group){
                        add_list(group, cat);
                        switch (cat){
                            case 'this_week':
                                add_list(group, 'cat_blocked');
                                break;
                            case 'cat_dev':
                                add_list(group, 'cat_test');
                                break;
                        }
                    }));
                });
            }));
            $(overlay).append(mk('div', ['alloc_tooltip'], function(tip){
                $(tip).hide();
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
                show_status_options(ui.item, new_cat, function (new_status, note){
                    var payload = {
                        request_id: wr,
                        status: __wrms_status_map[new_status]
                    };
                    if (note){
                        payload['note'] = note;
                    }
                    $.ajax({
                        type: 'POST',
                        url: '/api2/request_update',
                        contentType: 'application/x-www-form-urlencoded',
                        data: payload
                    }).fail(function(o, e){
                        log.error('kanban ul:receive', wr + ' failed to update status', e);
                    }).done(function(r){
                        log.info('kanban ul:receive', 'updated ' + wr + ' to ' + new_status);
                        $(ui.item).removeClass('modified');
                        $(ui.item).find('span.status').text('[' + new_status + ']');
                        __model[wr].cat = new_cat;
                        __model[wr].status = new_status;
                    });
                });
            }
        }).disableSelection();
    }

    function show_status_options(li, cat, handler){
        var ud = $(li).find('div.update');
        $(ud).empty()
             .append(
                mk('textarea', ['note', 'default'], function(t){
                    $(t).attr('rows', '3')
                        .text('Changed status to ' + __category_meta[cat].statuses[0])
                        .keypress(function(){
                            $(this).removeClass('default');
                        });
                })
             )
             .append(
                mk('select', [], function(select){
                    var first = true;
                    __category_meta[cat].statuses.forEach(function(s){
                        $(select).append(
                            mk('option', [], function(o){
                                if (first){
                                    $(o).prop('selected', true);
                                    first = false;
                                }
                                $(o).attr('value', s)
                                    .text(s);
                            })
                        );
                        $(select).change(function(){
                            $(ud).find('textarea.note.default').text('Changed status to ' + $(this).find('option:selected').text());
                        });
                    });
                })
             )
             .append(
                mk('span', ['submit'], function(s){
                    $(s).text('Update')
                        .click(function(){
                            $(ud).hide();
                            handler(
                                $(ud).find('select').val(),
                                $(ud).find('textarea.note').val()
                            );
                        });
                })
             )
             .show();
    }

    function render_card(val, key){
        var card = mk('li', [], function(li){
            $(li).append(mk('span', ['wrno_pretty'], function(span){
                $(span).append(mk('a', [], function(a){
                    $(a).attr('href', 'https://wrms.catalyst.net.nz/wr.php?edit=1&request_id=' + val.wr);
                    $(a).text('[#' + val.wr + ']');
                }));
            }));
            $(li).append(mk('span', ['status'], '[' + val.status + ']'))
                 .append(mk('span', ['brief'], val.brief))
                 .append(mk('div',  ['update']))
                 .append(mk('span', ['wrno'], val.wr));
        });
        $('ul.kanban-' + val.cat).append(card);
        render_budget(card, key, val);
        render_allocation(card, key, val);
    }

    function render_model(m){
        $('#kanban-overlay li:not(.heading)').remove();
        _.each(m, render_card);
        return m;
    }

    function render_budget(li, wr, data){
        var max = data.approved_hours + data.unapproved_hours;
        if (max < data.hours){
            max = data.hours;
        }
        $(li).find('div.budget_group').remove();
        if (max < 1){
            return;
        }
        function pbar(n){
            return function(o){
                $(o).css('width', n + '%')
                    .html('&nbsp;');
            };
        }
        $(li).append(mk('div', ['budget_group'], function(group){
                $(group).append(mk('div', ['ah'],      pbar(data.approved_hours/max*100)))
                        .append(mk('div', ['uh'],      pbar(data.unapproved_hours/max*100)))
                        .append(mk('div', ['actual'],  pbar(data.hours/max*100)));
             }));
    }

    function render_allocation(li, wr, data){
        if (!data.users || data.users[0] === 'Nobody'){
            return;
        }
        $(li).find('div.user_group').remove();
        function pic_for_user(u){
            var dir = 'https://directory.wgtn.cat-it.co.nz/staff_photos/',
                no_photo = 'url(https://directory.wgtn.cat-it.co.nz/images/no_photo.png)';
            switch (u){
                case 'catalyst_sysadmin':
                    return no_photo;
                case 'matthew_b_gray':
                    u = 'matthew_gray';
                    break;
            }
            return 'url(' + dir + u + '.jpg), ' + no_photo;
        }
        $(li).append(mk('div', ['user_group', 'section', 'group'], function(ug){
            data.users.forEach(function(u){
                var user_class = u.replace(/[() ]+/g, '_').toLowerCase();
                $(ug).append(
                    mk('span', ['col', 'alloc', user_class], function(s){
                        $(s).html('&nbsp;')
                            .css('background-image', pic_for_user(user_class))
                            .css('background-repeat', 'no-repeat')
                            .css('background-size', 'contain');
                        $(s).hover(
                            function(ev){
                                $('div.alloc_tooltip')
                                    .text(u)
                                    .css('top', ev.pageY - 30)
                                    .css('left', ev.pageX + 10)
                                    .show();
                                $('span.alloc.bright').removeClass('bright');
                                $('li.dimmed').removeClass('dimmed');
                                $('#kanban-overlay li').each(function(){
                                    var s = $(this).find('span.alloc.' + user_class);
                                    if (s.length){
                                        s.addClass('bright');
                                    }else{
                                        if ($(this).hasClass('heading') === false){
                                            $(this).addClass('dimmed');
                                        }
                                    }
                                });
                            },
                            function(){
                                $('.alloc_tooltip').hide();
                                $('span.alloc.bright').removeClass('bright');
                                $('li.dimmed').removeClass('dimmed');
                            }
                        );
                    })
                );
            });
        }));
    }

    var kanban = {
        show: function(){
            $('#kanban-overlay').height($(document).height());
            $('#kanban-overlay').show();
            var h = window.location.href;
            window.location.href = h + (h.match(/#kanban$/) ? '' :
                                        h.match(/#$/)       ? 'kanban' :
                                                              '#kanban');
        },
        hide: function(){
            $('#kanban-overlay').hide();
            window.location.href = window.location.href.replace(/kanban$/, '');
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
            load_children(function(e, r){
                if (e){
                    log.error('load_children', 'unable to populate children', e);
                    return;
                }
                __model = render_model(r);
            });
            if (window.location.href.match(/#kanban/)){
                kanban.show();
            }
            setTimeout(update_children, __refresh_interval);
        }catch(ex){
            log.error('wrms-kanban', 'Exception while adding Kanban menu entry', ex);
        }
    });
})();
