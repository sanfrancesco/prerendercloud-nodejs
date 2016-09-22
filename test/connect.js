var connect = require('connect');
var http = require('http');

var app = connect();

app.use(require('../distribution/index').set('prerenderToken', 'token'));

app.use((req, res) => {
  res.end('hello world');
})

http.createServer(app).listen(3000);