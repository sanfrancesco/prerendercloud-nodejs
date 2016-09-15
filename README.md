# prerendercloud-nodejs

Express middleware for prerendering javascript-rendered pages with https://www.prerender.cloud/

## Usage

```bash
npm i prerendercloud-nodejs --save
```

```javascript
var express = require('express');
var app = express();

// the free, rate limited tier
app.use(require('prerendercloud-nodejs'));

// the http://prerender.cloud subscription tier
app.use(require('prerendercloud-nodejs').set('prerenderToken', 'token'));
```
