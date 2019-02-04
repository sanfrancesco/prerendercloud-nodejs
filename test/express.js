var express = require("express");
var app = express();

// app.use(require('../distribution/index').set('prerenderToken', 'token'));
app.use(
  require("../source/index")
    .set("disableServerCache", true)
    .set("bubbleUp5xxErrors", true)
);

app.get("/", function(req, res) {
  res.send(`
    <div id='root'></div>
    <script type='text/javascript'>
      const el = document.createElement('meta');
      el.setAttribute('name', 'prerender-status-code');
      el.setAttribute('content', '404');
      document.head.appendChild(el);
      document.getElementById('root').innerHTML = "hello";
    </script>
  `);
});

app.listen(3000, function() {
  console.log("Example app listening on port 3000!");
});
