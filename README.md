![image](https://cloud.githubusercontent.com/assets/22159102/21554484/9d542f5a-cdc4-11e6-8c4c-7730a9e9e2d1.png)

# prerendercloud-nodejs

[![CircleCI](https://circleci.com/gh/sanfrancesco/prerendercloud-nodejs.svg?style=svg)](https://circleci.com/gh/sanfrancesco/prerendercloud-nodejs)

Express/connect middleware for prerendering javascript web pages/apps (single page apps or SPA) with [https://www.prerender.cloud/](https://www.prerender.cloud/)

## Usage

### Install

```bash
npm install prerendercloud --save
```

### Enabling and configuring the middleware for Express/Connect

The `prerendercloud` middleware should be loaded first **unless you're using middleware that monkeypatches the req/res flow (i.e. [compression](https://www.npmjs.com/package/compression))**

```javascript
// the free, rate limited tier
app.use(require('prerendercloud'));
```

#### Hard code your prerendercloud secret/token (to use your specific account and avoid rate limiting)

```javascript
app.use(require('prerendercloud').set('prerenderToken', 'mySecretToken'));
```

#### or (best practice) use the `PRERENDER_TOKEN` environment variable (to use your specific account and avoid rate limiting)
```javascript
PRERENDER_TOKEN=mySecretToken node index.js
```

### Enable for bots **ONLY** (google, facebook, twitter, slack etc...)

We recommend the default setting of pre-rendering all user-agents (because of performance boost and potential google cloaking penalties) but there may be a situation where you shouldn't or can't, for example: your site/app has JavaScript errors when trying to repaint the DOM after it's already been pre-rendered.

```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('botsOnly', true);
```

### Whitelist your own user-agent list (overrides `botsOnly`) (case sensitive)
```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('whitelistUserAgents', ['twitterbot', 'slackbot', 'facebookexternalhit']);
```

### Disable prerender.cloud server cache

service.prerender.cloud will cache for 1-5 minutes (usually less) as a best practice. Adding the `nocache` HTTP header via this config option disables that cache entirely. Disabling the service.prerender.cloud cache is only recommended if you have your own cache either in this middleware or your client, otherwise all of your requests are going to be slow.

```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('disableServerCache', true);
app.use(prerendercloud);
```

### Disable Ajax Bypass

You can disable this if you're using CORS. Read more https://www.prerender.cloud/documentation and https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch

```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('disableAjaxBypass', true);
app.use(prerendercloud);
```

### Disable Ajax Preload

This prevents screen flicker/repaint/flashing, but increases initial page load size (because it embeds the AJAX responses into your HTML). you can disable this if you manage your own "initial state". Read more https://www.prerender.cloud/documentation and https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch

```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('disableAjaxPreload', true);
app.use(prerendercloud);
```

### beforeRender (intercept the remote call to service.prerender.cloud)

Useful for your own caching layer (in conjunction with `afterRender`), or analytics, or dependency injection for testing.

```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('beforeRender', (req, done) => {
  // call it with a string
  done(null, 'hello world'); // returns status 200, content-type text/html

  // or call it with an object
  done(null, {status: 202, body: 'hello'}) // returns status 202, content-type text/html

  // or call it with null/undefined to follow the normal path
  done();
  done(null);
  done(undefined);
});
```

### afterRender (a noop) (caching, analytics)

It's a noop because this middleware already takes over the response for your HTTP server. 2 example use cases of this: your own caching layer, or analytics/metrics.

```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('afterRender', (err, req, res) => {
  // req: (standard node.js req object)
  // res: { statusCode, headers, body }
  console.log(`received ${res.body.length} bytes for ${req.url}`)
});
```

### Using the (optional) middleware cache

This middleware has a built-in LRU (drops least recently used) caching layer. It can be configured to let cache auto expire or you can manually remove entire domains from the cache. You proboably want to use this if you disabled the server cache.

#### Configure
```javascript
var prerendercloud = require('prerendercloud');
prerendercloud.set('enableMiddlewareCache', true);

// optionally set max bytes (defaults to 500MB)
prerendercloud.set('middlewareCacheMaxBytes', 1000000000); // 1GB

// optionally set max age (defaults to forever - implying you should manually clear it)
prerendercloud.set('middlewareCacheMaxAge', 1000 * 60 * 60); // 1 hour

app.use(prerendercloud);
```

#### Clear cache
```javascript
// delete every page on the example.org domain
prerendercloud.cache.clear('http://example.org');

// delete every page on every domain
prerendercloud.cache.reset();
```

### Debugging

```javascript
DEBUG=prerendercloud node index.js
```

## How errors from the server (service.prerender.cloud) are handled

* when prerender.cloud service returns
  * **400 client error (bad request)**
    * e.g. try to prerender a localhost URL as opposed to a publicly accessible URL
    * the client itself returns the 400 error (the web page will not be accessible)
  * **429 client error (rate limited)**
    * the original server payload (not prerendered) is returned, so **the request is not interrupted due to unpaid bills or free accounts**
    * only happens while on the free tier (paid subscriptions are not rate limited)
    * the error message is written to STDERR
    * if the env var: DEBUG=prerendercloud is set, the error is also written to STDOUT
  * **5xx (server error)**
    * the original server payload (not prerendered) is returned, so **the request is not interrupted due to server error**
    * the error message is written to STDERR
    * if the env var: DEBUG=prerendercloud is set, the error is also written to STDOUT

