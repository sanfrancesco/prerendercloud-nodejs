# prerendercloud-nodejs

Express middleware for prerendering javascript-rendered pages with [https://www.prerender.cloud/](https://www.prerender.cloud/)

## Usage

```bash
npm i prerendercloud --save
```

```javascript
var express = require('express');
var app = express();

// the free, rate limited tier
app.use(require('prerendercloud'));

// or the http://prerender.cloud subscription tier
app.use(require('prerendercloud').set('prerenderToken', 'token'));
```
