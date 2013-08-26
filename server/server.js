var express = require('express'),
    store   = require('./store.js'),
    _       = require('underscore')._;

var app = express();
app.use(express.bodyParser());

app.post('/store',  _.bind(store.put, store));
app.post('/put',    _.bind(store.put, store));
app.get ('/get',    _.bind(store.get, store));

var port = 27600;

app.listen(port, function(){
    console.log('wrms-kanban model store listening on localhost:' + port);
});
