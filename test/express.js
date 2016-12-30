var express = require('express');
var app = express();

// app.use(require('../distribution/index').set('prerenderToken', 'token'));
app.use(require('../source/index').set('prerenderToken', 'token'));

app.get('/', function (req, res) {
  res.send(`
    <div id='root'></div>
    <script type='text/javascript'>
      document.getElementById('root').innerHTML = "hello";
    </script>
  `)
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
