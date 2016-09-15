var express = require('express');
var app = express();

app.use(require('../distribution/index').set('prerenderToken', 'token'));

app.get('/', function (req, res) {
  res.send('hello world')
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
