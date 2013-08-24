(function(){
    var __log_fn_name = null;
    var log = {
        error: function(func, msg, except){
            var a = Array.prototype.slice.call(arguments, 0);
            if (__log_fn_name){
                a.unshift(__log_fn_name);
            }
            console.error('wrms-kanban.js:' + a[0] + ' - ' + a[1] + (a[2] ? '[[' + a[2] + ']]' : ''));
        },
        info: function(func, msg){
            var a = Array.prototype.slice.call(arguments, 0);
            if (__log_fn_name){
                a.unshift(__log_fn_name);
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

    function get_stored_model(){
        return null;
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

    var kanban = {
        show: function(){
            __log_fn_name = 'kanban.show';
            log.info('start');
            var stored_model = get_stored_model();
            if (stored_model){
                log.info('got stored model');
                // ...
            }else{
                log.info('creating new model');
                var child_relations = parse_child_relations();
                log.info('found ' + child_relations.length + ' "I" relations');
            }
            log.info('end');
        },
        hide: function(){
        }
    };

    // Do we need to add the button to the top menu?
    try{
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
    }catch(ex){
        console.log('Exception while adding Kanban menu entry [[' + ex + ']]');
    }
})();
