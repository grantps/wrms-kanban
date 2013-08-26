var _ = require('underscore')._;

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

