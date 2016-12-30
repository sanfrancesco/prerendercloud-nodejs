var connect = require('connect');
var http = require('http');

var app = connect();

// app.use(require('../distribution/index').set('prerenderToken', 'token'));
app.use(require('../source/index').set('prerenderToken', 'token'));

app.use((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`
    <div id='root'></div>
    <script type='text/javascript'>
      document.getElementById('root').innerHTML = "hello";
    </script>
  `)
})

http.createServer(app).listen(3000);
