var _       = require('underscore')._,
    exec    = require('child_process').exec;

function make_sender(response){
    return function(error, result){
        response.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS'
        });
        if (error){
            console.error(error);
            response.end(error);
        }else{
            response.end(JSON.stringify(result));
        }
    };
}

var __store = {};

exports.put = function(request, response){
    var send = make_sender(response);
    console.log((new Date) + '\tput ' + request.param('key'));
    __store[request.param('key')] = request.param('val');
    send(null, request.param('key'));
};

exports.get = function(request, response){
    var send = make_sender(response);
    console.log((new Date) + '\tget ' + request.param('key'));
    send(null, __store[request.param('key')] || {});
};

exports.enrich = function(request, response){
    var send = make_sender(response);
    var wr = parseInt(request.param('wr'));
    if (isNaN(wr)){
        send('Invalid WR number "' + request.param('wr') + '"');
        return;
    }
    console.log((new Date) + '\tenrich ' + request.param('key') + '->' + wr);
    exec(
        '/usr/local/bin/wr -o csv ' + wr,
        function(error, stdout, stderr){
            if (error){
                send(error);
                return;
            }
            var lines = stdout.split(/\n/);
            if (lines.length < 1){
                send('No results for WR ' + wr);
                return;
            }
            var fields = lines[0].split(/,/);
            if (fields.length < 1){
                send('Couldn\'t parse result for WR ' + wr);
                return;
            }
            var assigned_to = fields.pop();
            var users = assigned_to.split(/\//);
            var stored = __store[request.param('key')];
            if (stored && stored[wr]){
                stored[wr].__kanban['users'] = users;
            }else{
                console.log('No stored data for WR ' + wr + ', not saving result of enrich()');
            }
            send(null, users);
        }
    );
};

