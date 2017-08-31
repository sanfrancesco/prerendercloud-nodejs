![image](https://cloud.githubusercontent.com/assets/22159102/21554484/9d542f5a-cdc4-11e6-8c4c-7730a9e9e2d1.png)

# prerendercloud-nodejs

[![CircleCI](https://circleci.com/gh/sanfrancesco/prerendercloud-nodejs.svg?style=svg)](https://circleci.com/gh/sanfrancesco/prerendercloud-nodejs)

Express/connect middleware for prerendering javascript web pages/apps (single page apps or SPA) with [https://www.prerender.cloud/](https://www.prerender.cloud/)

<!-- MarkdownTOC autolink="true" autoanchor="true" bracket="round" depth=4 -->

- [Install/Configure for Express/Connect/Node http](#installconfigure-for-expressconnectnode-http)
- [Debugging](#debugging)
  - [API token configuration](#api-token-configuration)
    - [`PRERENDER_TOKEN` environment variable \(best practice\)](#prerendertoken-environment-variable-best-practice)
    - [Hard coded](#hard-coded)
- [Configure a condition for when traffic should go through prerender.cloud](#configure-a-condition-for-when-traffic-should-go-through-prerendercloud)
  - [Enable for bots **ONLY** \(google, facebook, twitter, slack etc...\)](#enable-for-bots-only-google-facebook-twitter-slack-etc)
  - [Whitelist your own user-agent list \(overrides `botsOnly`\) \(case sensitive\)](#whitelist-your-own-user-agent-list-overrides-botsonly-case-sensitive)
  - [beforeRender \(short circuit the remote call to service.prerender.cloud\)](#beforerender-short-circuit-the-remote-call-to-serviceprerendercloud)
  - [shouldPrerender](#shouldprerender)
- [Caching](#caching)
  - [Disable prerender.cloud server cache](#disable-prerendercloud-server-cache)
  - [Using the \(optional\) middleware cache](#using-the-optional-middleware-cache)
    - [Clearing the middleware cache](#clearing-the-middleware-cache)
- [Prerender.cloud configuration options](#prerendercloud-configuration-options)
  - [Disable Ajax Bypass](#disable-ajax-bypass)
  - [Disable Ajax Preload](#disable-ajax-preload)
  - [originHeaderWhitelist](#originheaderwhitelist)
- [afterRender \(a noop\) \(caching, analytics\)](#afterrender-a-noop-caching-analytics)
- [removeScriptTags](#removescripttags)
- [removeTrailingSlash](#removetrailingslash)
- [How errors from the server \(service.prerender.cloud\) are handled](#how-errors-from-the-server-serviceprerendercloud-are-handled)
  - [bubbleUp5xxErrors](#bubbleup5xxerrors)

<!-- /MarkdownTOC -->


<a name="installconfigure-for-expressconnectnode-http"></a>
## Install/Configure for Express/Connect/Node http

```bash
npm install prerendercloud --save
```

The `prerendercloud` middleware should be loaded first **unless you're using middleware that monkeypatches the req/res flow (i.e. [compression](https://www.npmjs.com/package/compression))**

```javascript
// the free, rate limited tier
app.use(require('prerendercloud'));
```

<a name="debugging"></a>
## Debugging

```javascript
DEBUG=prerendercloud node index.js
```


<a name="api-token-configuration"></a>
### API token configuration

Get a token after signing up at prerender.cloud - it's necessary to move off of the rate-limited free tier

<a name="prerendertoken-environment-variable-best-practice"></a>
#### `PRERENDER_TOKEN` environment variable (best practice)
```javascript
PRERENDER_TOKEN=mySecretToken node index.js
```

<a name="hard-coded"></a>
#### Hard coded

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('prerenderToken', 'mySecretToken')
app.use(prerendercloud);
```

<a name="configure-a-condition-for-when-traffic-should-go-through-prerendercloud"></a>
## Configure a condition for when traffic should go through prerender.cloud

The default behavior forwards all traffic through prerender.cloud

<a name="enable-for-bots-only-google-facebook-twitter-slack-etc"></a>
### Enable for bots **ONLY** (google, facebook, twitter, slack etc...)

We don't recommend this setting, instead use the **default** setting of pre-rendering all user-agents (because of performance boost and potential google cloaking penalties) but there may be a situation where you shouldn't or can't, for example: your site/app has JavaScript errors when trying to repaint the DOM after it's already been pre-rendered but you still want bots (twitter, slack, facebook etc...) to read the meta and open graph tags.

**Note**: this will add or append 'User-Agent' to the [**Vary** header](https://varvy.com/mobile/vary-user-agent.html), which is another reason not to recommend this feature (because it significantly reduces HTTP cacheability)

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('botsOnly', true);
```

<a name="whitelist-your-own-user-agent-list-overrides-botsonly-case-sensitive"></a>
### Whitelist your own user-agent list (overrides `botsOnly`) (case sensitive)

**Note**: this will **NOT** add or append 'User-Agent' to the [**Vary** header](https://varvy.com/mobile/vary-user-agent.html). You should probably set the Vary header yourself, if using this feature.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('whitelistUserAgents', ['twitterbot', 'slackbot', 'facebookexternalhit']);
```

<a name="beforerender-short-circuit-the-remote-call-to-serviceprerendercloud"></a>
### beforeRender (short circuit the remote call to service.prerender.cloud)

Useful for your own caching layer (in conjunction with `afterRender`), or analytics, or dependency injection for testing. Is only called when a remote call to service.prerender.cloud is about to be made.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('beforeRender', (req, done) => {
  // call it with a string to short-circuit the remote prerender codepath
  // (useful when implementing your own cache)
  done(null, 'hello world'); // returns status 200, content-type text/html

  // or call it with an object to short-circuit the remote prerender codepath
  // (useful when implementing your own cache)
  done(null, {status: 202, body: 'hello'}) // returns status 202, content-type text/html

  // or call it with nothing/empty/null/undefined to follow the remote prerender path
  // (useful for analytics)
  done();
  done('');
  done(null);
  done(undefined);
});
```

<a name="shouldprerender"></a>
### shouldPrerender

This is executed after the `beforeRender` but if present, replaces userAgent detection (it would override `botsOnly`).

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('shouldPrerender', (req) => {
  return req.headers['user-agent'] === 'googlebot' && someStateOnMyServer();
  // return bool
});
```

<a name="caching"></a>
## Caching

<a name="disable-prerendercloud-server-cache"></a>
### Disable prerender.cloud server cache

service.prerender.cloud will cache for 1-5 minutes (usually less) as a best practice. Adding the `nocache` HTTP header via this config option disables that cache entirely. Disabling the service.prerender.cloud cache is only recommended if you have your own cache either in this middleware or your client, otherwise all of your requests are going to be slow.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableServerCache', true);
app.use(prerendercloud);
```

<a name="using-the-optional-middleware-cache"></a>
### Using the (optional) middleware cache

This middleware has a built-in LRU (drops least recently used) caching layer. It can be configured to let cache auto expire or you can manually remove entire domains from the cache. You proboably want to use this if you disabled the server cache.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('enableMiddlewareCache', true);

// optionally set max bytes (defaults to 500MB)
prerendercloud.set('middlewareCacheMaxBytes', 1000000000); // 1GB

// optionally set max age (defaults to forever - implying you should manually clear it)
prerendercloud.set('middlewareCacheMaxAge', 1000 * 60 * 60); // 1 hour

app.use(prerendercloud);
```

<a name="clearing-the-middleware-cache"></a>
#### Clearing the middleware cache
```javascript
// delete every page on the example.org domain
prerendercloud.cache.clear('http://example.org');

// delete every page on every domain
prerendercloud.cache.reset();
```

<a name="prerendercloud-configuration-options"></a>
## Prerender.cloud configuration options

<a name="disable-ajax-bypass"></a>
### Disable Ajax Bypass

You can disable this if you're using CORS. Read more https://www.prerender.cloud/documentation and https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableAjaxBypass', true);
app.use(prerendercloud);
```

<a name="disable-ajax-preload"></a>
### Disable Ajax Preload

This prevents screen flicker/repaint/flashing, but increases initial page load size (because it embeds the AJAX responses into your HTML). you can disable this if you manage your own "initial state". Read more https://www.prerender.cloud/documentation and https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableAjaxPreload', true);
app.use(prerendercloud);
```

<a name="originheaderwhitelist"></a>
### originHeaderWhitelist

The only valid values (_right now_) are: `['Prerendercloud-Is-Mobile-Viewer']`, and anything starting with `prerendercloud-`. This feature is meant for forwarding headers from the original request to your site through to your origin (by default, all headers are dropped).

```javascript
prerendercloud.set('originHeaderWhitelist', ['Prerendercloud-Is-Mobile-Viewer']);
```

<a name="afterrender-a-noop-caching-analytics"></a>
## afterRender (a noop) (caching, analytics)

It's a noop because this middleware already takes over the response for your HTTP server. 2 example use cases of this: your own caching layer, or analytics/metrics.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('afterRender', (err, req, res) => {
  // req: (standard node.js req object)
  // res: { statusCode, headers, body }
  console.log(`received ${res.body.length} bytes for ${req.url}`)
});
```

<a name="removescripttags"></a>
## removeScriptTags

This removes all script tags except for [application/ld+json](https://stackoverflow.com/questions/38670851/whats-a-script-type-application-ldjsonjsonobj-script-in-a-head-sec). Removing script tags prevents any JS from executing at all - so your app will no longer be isomorphic. Useful when prerender.cloud is used as a scraper/crawler or in constrained environments (Lambda @ Edge).

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('removeScriptTags', true);
```

<a name="removetrailingslash"></a>
## removeTrailingSlash

This is the opposite of what is often referred to "strict mode routing". When this is enabled, the server will normalize the URLs by removing a trailing slash.

e.g.: example.com/docs/ -> example.com/docs

The use case for this option is to achieve higher cache hit rate (so if a user/bots are hitting `/docs/` and `/docs`, they'll both be cached on prerender.cloud servers as the same entity.)

SEO best practices:

1. 301 redirect trailing slash URLs to non trailing slash before this middleware is called (and then don't bother removingTrailingSlash because it should never happen)
2. or use [link rel canonical](https://en.wikipedia.org/wiki/Canonical_link_element) in conjunction with this

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('removeTrailingSlash', true);
```

<a name="how-errors-from-the-server-serviceprerendercloud-are-handled"></a>
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


<a name="bubbleup5xxerrors"></a>
### bubbleUp5xxErrors

This must be enabled if you want your webserver to show a 500 when prerender.cloud throws a 5xx (retriable error). As mentioned in the previous section, by default, 5xx errors are ignored and non-prerendered content is returned so the user is uninterrupted.

Bubbling up the 5xx error is useful if you're using a crawler to trigger prerenders and you want control over retries.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('bubbleUp5xxErrors', true);
```

