# prerendercloud-nodejs

<img align="right" src="https://cloud.githubusercontent.com/assets/22159102/21554484/9d542f5a-cdc4-11e6-8c4c-7730a9e9e2d1.png">

![Github Actions CI](https://github.com/sanfrancesco/prerendercloud-nodejs/actions/workflows/node.js.yml/badge.svg)

This package is the Node.js client for [Headless-Render-API.com](https://headless-render-api.com) (formerly named prerender.cloud from 2016 - 2022)

Use it for **pre-rendering** (server-side rendering), or taking **screenshots** of webpages or converting webpages to **PDFs**.

```bash
npm install prerendercloud-server --save
```

```javascript
// simplest possible example usage of this lib
const prerendercloud = require("prerendercloud");

// if you are pre-rendering a JavaScript single-page app
// served from express (or middleware compatible http server),
// use as middleware in your existing server - or try our all-in-one
// server https://github.com/sanfrancesco/prerendercloud-server
app.use(prerendercloud);

// or take a screenshot of a URL
const fs = require("fs");
prerendercloud
  .screenshot("http://example.com")
  .then(pngBuffer => fs.writeFileSync("out.png", pngBuffer, { encoding: null }));

// or create a PDF from a URL
prerendercloud
  .pdf("http://example.com")
  .then(pdfBuffer => fs.writeFileSync("out.pdf", pdfBuffer, { encoding: null }));
```

The pre-render/server-side rendering functionality of this package (as opposed to mere screenshots/pdfs) is meant to be included in an existing web server where 404s are rendered as index.html

* For an all-in-one single-page app web server plus server-side rendering see: https://github.com/sanfrancesco/prerendercloud-server

----

<!-- MarkdownTOC autolink="true" autoanchor="true" bracket="round" -->

- [Install](#install)
  - [npm](#npm)
  - [Auth \(API Token\)](#auth-api-token)
    - [Environment variable \(best practice\)](#environment-variable-best-practice)
    - [Hard coded](#hard-coded)
  - [Debugging](#debugging)
- [Screenshots](#screenshots)
- [PDFs](#pdfs)
- [Prerendering or Server-side rendering with Express/Connect/Node http](#prerendering-or-server-side-rendering-with-expressconnectnode-http)
  - [Configure a condition for when traffic should go through Headless-Render-API.com](#configure-a-condition-for-when-traffic-should-go-through-headless-render-apicom)
    - [Enable for bots **ONLY** \(google, facebook, twitter, slack etc...\)](#enable-for-bots-only-google-facebook-twitter-slack-etc)
    - [Whitelist your own user-agent list \(overrides `botsOnly`\) \(case sensitive\)](#whitelist-your-own-user-agent-list-overrides-botsonly-case-sensitive)
    - [beforeRender \(short circuit the remote call to service.headless-render-api.com\)](#beforerender-short-circuit-the-remote-call-to-serviceheadless-render-apicom)
    - [blacklistPaths](#blacklistpaths)
    - [whitelistPaths](#whitelistpaths)
    - [shouldPrerender](#shouldprerender)
  - [Caching](#caching)
    - [Disable Headless-Render-API.com server cache](#disable-headless-render-apicom-server-cache)
    - [Using the \(optional\) middleware cache](#using-the-optional-middleware-cache)
      - [Clearing the middleware cache](#clearing-the-middleware-cache)
  - [Server Options](#server-options)
    - [disableServerCache](#disableservercache)
    - [serverCacheDurationSeconds](#servercachedurationseconds)
    - [metaOnly](#metaonly)
    - [followRedirects](#followredirects)
    - [disableAjaxBypass](#disableajaxbypass)
    - [disableAjaxPreload](#disableajaxpreload)
    - [disableHeadDedupe](#disableheaddedupe)
    - [originHeaderWhitelist](#originheaderwhitelist)
    - [removeScriptTags](#removescripttags)
    - [removeTrailingSlash](#removetrailingslash)
    - [waitExtraLong](#waitextralong)
    - [withMetadata](#withmetadata)
    - [withScreenshot](#withscreenshot)
  - [DeviceWidth](#devicewidth)
  - [DeviceHeight](#deviceheight)
  - [Middleware Options](#middleware-options)
    - [host](#host)
    - [protocol](#protocol)
    - [whitelistQueryParams](#whitelistqueryparams)
    - [afterRenderBlocking \(executes before `afterRender`\)](#afterrenderblocking-executes-before-afterrender)
    - [afterRender \(a noop\) \(caching, analytics\) \(executes after `afterRenderBlocking`\)](#afterrender-a-noop-caching-analytics-executes-after-afterrenderblocking)
    - [bubbleUp5xxErrors](#bubbleup5xxerrors)
    - [retries](#retries)
    - [throttleOnFail](#throttleonfail)
  - [How errors from the server \(service.headless-render-api.com\) are handled](#how-errors-from-the-server-serviceheadless-render-apicom-are-handled)

<!-- /MarkdownTOC -->



<a name="install"></a>
<a id="install"></a>
## Install

<a name="npm"></a>
<a id="npm"></a>
### npm

```bash
npm install prerendercloud --save
```

<a name="auth-api-token"></a>
<a id="auth-api-token"></a>
### Auth (API Token)

Get a token after signing up at https://headless-render-api.com - it's necessary to move off of the rate-limited free tier

<a name="environment-variable-best-practice"></a>
<a id="environment-variable-best-practice"></a>
#### Environment variable (best practice)
```javascript
PRERENDER_TOKEN=mySecretToken node index.js
```


<a name="hard-coded"></a>
<a id="hard-coded"></a>
#### Hard coded

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('prerenderToken', 'mySecretToken')
```

<a name="debugging"></a>
<a id="debugging"></a>
### Debugging

```javascript
DEBUG=prerendercloud node index.js
```

<a name="screenshots"></a>
<a id="screenshots"></a>
## Screenshots

Promise API

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud
  .screenshot("http://example.com")
  .then(pngBuffer => fs.writeFileSync("out.png", pngBuffer, { encoding: null }));
```

Optionally specify deviceWidth/deviceHeight/viewportWidth/viewportHeight, but can't set a width without setting a height.

```javascript
prerendercloud
  .screenshot("http://example.com", {
    deviceWidth: 800,
    deviceHeight: 600,
    viewportWidth: 640,
    viewportHeight: 480
  })
  .then(pngBuffer => fs.writeFileSync("out.png", pngBuffer, { encoding: null }));
```

Set viewportX and viewportY is possible if viewportWidth and viewportHeight is set:

```javascript
prerendercloud
  .screenshot("http://example.com", {
    viewportWidth: 640,
    viewportHeight: 480,
    viewportX: 10,
    viewportY: 10
  })
  .then(pngBuffer => fs.writeFileSync("out.png", pngBuffer, { encoding: null }));
```

Alternatively set `viewportQuerySelector` and optionally `viewportQuerySelectorPadding` to specify a DOM element on the page to take a screenshot of. If both `viewportQuerySelector` and viewportWidth/viewportHeight are set, the querySelector will be attempted first and if not found, fallback to viewportWidth/viewportHeight (and if that's not set, default width/height will be used).

```javascript
prerendercloud
  .screenshot("http://example.com", {
    viewportQuerySelector: '#open-graph-div',
    viewportQuerySelectorPadding: 10,
  })
  .then(pngBuffer => fs.writeFileSync("out.png", pngBuffer, { encoding: null }));
```

Set Emulated Media (screen, print, braille, embossed, handheld, projection, speech, tty, tv)

(Use this to override the defaults: screen for screenshots, print for PDF)

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud
  .screenshot("http://example.com", {
    emulatedMedia: 'print',
  })
  .then(pngBuffer => fs.writeFileSync("out.png", pngBuffer, { encoding: null }));
```

<a name="pdfs"></a>
<a id="pdfs"></a>
## PDFs

Promise API

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud
  .pdf("http://example.com")
  .then(pdfBuffer => fs.writeFileSync("out.pdf", pdfBuffer, { encoding: null }));
```

Disable PDF page breaks

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud
  .pdf("http://example.com", { noPageBreaks: true })
  .then(pdfBuffer => fs.writeFileSync("out.pdf", pdfBuffer, { encoding: null }));
```

Set Emulated Media (screen, print, braille, embossed, handheld, projection, speech, tty, tv)

(Use this to override the defaults: screen for screenshots, print for PDF)

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud
  .pdf("http://example.com", { emulatedMedia: "screen" })
  .then(pdfBuffer => fs.writeFileSync("out.pdf", pdfBuffer, { encoding: null }));
```

<a name="prerendering-or-server-side-rendering-with-expressconnectnode-http"></a>
<a id="prerendering-or-server-side-rendering-with-expressconnectnode-http"></a>
## Prerendering or Server-side rendering with Express/Connect/Node http

The `prerendercloud` middleware should be loaded first, before your other middleware, so it can forward the request to service.headless-render-api.com.

```javascript
// the free, rate limited tier
// and using https://expressjs.com/
const prerendercloud = require('prerendercloud');
expressApp.use(prerendercloud);
```


<a name="configure-a-condition-for-when-traffic-should-go-through-prerendercloud"></a>
<a id="configure-a-condition-for-when-traffic-should-go-through-headless-render-apicom"></a>
### Configure a condition for when traffic should go through Headless-Render-API.com

The default behavior forwards all traffic through Headless-Render-API.com

<a name="enable-for-bots-only-google-facebook-twitter-slack-etc"></a>
<a id="enable-for-bots-only-google-facebook-twitter-slack-etc"></a>
#### Enable for bots **ONLY** (google, facebook, twitter, slack etc...)

We don't recommend this setting, instead use the **default** setting of pre-rendering all user-agents (because of performance boost and potential google cloaking penalties) but there may be a situation where you shouldn't or can't, for example: your site/app has JavaScript errors when trying to repaint the DOM after it's already been pre-rendered but you still want bots (twitter, slack, facebook etc...) to read the meta and open graph tags.

**Note**: this will add or append 'User-Agent' to the [**Vary** header](https://varvy.com/mobile/vary-user-agent.html), which is another reason not to recommend this feature (because it significantly reduces HTTP cacheability)

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('botsOnly', true);
```

You can also append your own agents to our botsOnly list by using an array:

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('botsOnly', ["altavista", "dogpile", "excite", "askjeeves"]);
```

<a name="whitelist-your-own-user-agent-list-overrides-botsonly-case-sensitive"></a>
<a id="whitelist-your-own-user-agent-list-overrides-botsonly-case-sensitive"></a>
#### Whitelist your own user-agent list (overrides `botsOnly`) (case sensitive)

**Note**: this will **NOT** add or append 'User-Agent' to the [**Vary** header](https://varvy.com/mobile/vary-user-agent.html). You should probably set the Vary header yourself, if using this feature.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('whitelistUserAgents', ['twitterbot', 'slackbot', 'facebookexternalhit']);
```

<a name="beforerender-short-circuit-the-remote-call-to-serviceprerendercloud"></a>
<a id="beforerender-short-circuit-the-remote-call-to-serviceheadless-render-apicom"></a>
#### beforeRender (short circuit the remote call to service.headless-render-api.com)

Useful for your own caching layer (in conjunction with `afterRender`), or analytics, or dependency injection for testing. Is only called when a remote call to service.headless-render-api.com is about to be made.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('beforeRender', (req, done) => {
  // call it with a string to short-circuit the remote prerender codepath
  // (useful when implementing your own cache)
  done(null, 'hello world'); // returns status 200, content-type text/html

  // or call it with an object to short-circuit the remote prerender codepath
  // (useful when implementing your own cache)
  done(null, {status: 202, body: 'hello'}) // returns status 202, content-type text/html

  done(null, {status: 301, headers: {location: '/new-path'}}) // redirect to /new-path

  // or call it with nothing/empty/null/undefined to follow the remote prerender path
  // (useful for analytics)
  done();
  done('');
  done(null);
  done(undefined);
});
```

<a id="blacklistpaths"></a>
#### blacklistPaths

Prevent paths from being prerendered. Takes a function that returns an array. It is executed before the shouldPrerender option.

The primary use case is for CDN edge node clients (CloudFront Lambda@Edge) because they don't have the ability to quickly read the origin (AWS S3) filesystem, so they have to hard-code paths that shouldn't be prerendered.

Paths you may not want prerendered are non-SPA, large pages, or pages with JavaScript that can't rehydrate prerendered DOMs.

Trailing `*` works as wildcard. Only works when at the end.

```javascript
const prerendercloud = require("prerendercloud");
prerendercloud.set("blacklistPaths", req => [
  "/google-domain-verification",
  "/google-domain-verification.html",
  "/google-domain-verification/",
  "/image-gallery/*",
]);

```

<a id="whitelistpaths"></a>
#### whitelistPaths

Limit which URLs can trigger a pre-render request to the server.

Takes a function that returns an **array** of **strings** or **regexes**. It is executed before the shouldPrerender option. Passing an empty array or string will do nothing (noop).

Using this option will prevent bots/scrapers from hitting random URLs and increasing your billing. Recommended for Node.js server and Lambda@Edge (can be used with our without blacklist - blacklist takes precedent).

Even better if used with `whitelistQueryParams` and/or `removeTrailingSlash`.

```javascript
const prerendercloud = require("prerendercloud");
prerendercloud.set("whitelistPaths", req => [
  "/docs",
  "/docs/"
  /\/users\/\d{1,6}\/profile$/, // without the ending $, this is equivalent to startsWith
  /\/users\/\d{1,6}\/profile\/?$/, // note the optional ending slash (\/?) and $
  "/google-domain-verification.html",
  "/google-domain-verification/",
]);

```

<a name="shouldprerender"></a>
<a id="shouldprerender"></a>
#### shouldPrerender

This is executed after the `beforeRender` but if present, replaces userAgent detection (it would override `botsOnly`).

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('shouldPrerender', (req) => {
  return req.headers['user-agent'] === 'googlebot' && someStateOnMyServer();
  // return bool
});
```

<a name="caching"></a>
<a id="caching"></a>
### Caching

<a name="disable-prerendercloud-server-cache"></a>
<a id="disable-headless-render-apicom-server-cache"></a>
#### Disable Headless-Render-API.com server cache

The servers behind service.headless-render-api.com will cache for 5 minutes as a best practice. Adding the `Prerender-Disable-Cache` HTTP header via this config option disables that cache entirely. Disabling the service.headless-render-api.com cache is only recommended if you have your own cache either in this middleware or your client, otherwise all of your requests are going to be slow.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableServerCache', true);
app.use(prerendercloud);
```

<a name="using-the-optional-middleware-cache"></a>
<a id="using-the-optional-middleware-cache"></a>
#### Using the (optional) middleware cache

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
<a id="clearing-the-middleware-cache"></a>
##### Clearing the middleware cache
```javascript
// delete every page on the example.org domain
prerendercloud.cache.clear('http://example.org');

// delete every page on every domain
prerendercloud.cache.reset();
```

<a name="server-options"></a>
<a id="server-options"></a>
### Server Options

These options map to the HTTP header options listed here: https://headless-render-api.com/docs/api

<a id="disableservercache"></a>
#### disableServerCache

This option disables an enabled-by-default 5-minute cache.

The servers behind service.headless-render-api.com will cache for 5 minutes as a best practice. Adding the `Prerender-Disable-Cache` HTTP header via this config option disables that cache entirely. Disabling the service.headless-render-api.com cache is only recommended if you have your own cache either in this middleware or your client, otherwise all of your requests are going to be slow.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableServerCache', true);
app.use(prerendercloud);
```

<a id="servercachedurationseconds"></a>
#### serverCacheDurationSeconds

This option configures the duration for Headless-Render-API.com's server cache:

The servers behind service.headless-render-api.com will cache for 5 minutes as a best practice, configure that duration (in seconds):

```javascript
const prerendercloud = require('prerendercloud');
// max value: 2592000 (1 month)
prerendercloud.set('serverCacheDurationSeconds', req => 300);
app.use(prerendercloud);
```

<a id="metaonly"></a>
#### metaOnly

This option tells the server to only prerender the `<title>` and `<meta>` tags in the `<head>` section. The returned HTML payload will otherwise be unmodified.

Example use case 1: your single-page app does not rehydrate the body/div cleanly but you still want open graph (link previews) to work.

Example use case 2: you don't care about the benefits of server-side rendering but still want open graph (link previews) to work.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('metaOnly', req => req.url === "/long-page-insuitable-for-full-prerender" ? true : false);
app.use(prerendercloud);
```

<a id="followredirects"></a>
#### followRedirects

This option tells the server to follow a redirect.

By default, if your origin server returns 301/302, Headless-Render-API.com will just return that outright - which is appropriate for the common use case of proxying traffic since it informs a bot that a URL has changed.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('followRedirects', req => true);
app.use(prerendercloud);
```

<a name="disableajaxbypass"></a>
<a id="disableajaxbypass"></a>
#### disableAjaxBypass

You can disable this if you're using CORS. Read more https://headless-render-api.com/docs and https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableAjaxBypass', true);
app.use(prerendercloud);
```

<a name="disableajaxpreload"></a>
<a id="disableajaxpreload"></a>
#### disableAjaxPreload

This prevents screen flicker/repaint/flashing, but increases initial page load size (because it embeds the AJAX responses into your HTML). you can disable this if you manage your own "initial state". Read more https://headless-render-api.com/docs and https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableAjaxPreload', true);
app.use(prerendercloud);
```

<a name="disableheaddedupe"></a>
<a id="disableheaddedupe"></a>
#### disableHeadDedupe

Removes a JavaScript monkeypatch from the prerendered page that is intended to prevent duplicate meta/title/script/style tags. Some libs/frameworks detect existing meta/title/style and don't need this, but in our experience this is still a worthwhile default. Read more https://github.com/sanfrancesco/prerendercloud-ajaxmonkeypatch#head-dedupe

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('disableHeadDedupe', true);
app.use(prerendercloud);
```

<a name="originheaderwhitelist"></a>
<a id="originheaderwhitelist"></a>
#### originHeaderWhitelist

The only valid values (_right now_) are: `['Prerendercloud-Is-Mobile-Viewer']`, and anything starting with `prerendercloud-`. This feature is meant for forwarding headers from the original request to your site through to your origin (by default, all headers are dropped).

```javascript
prerendercloud.set('originHeaderWhitelist', ['Prerendercloud-Is-Mobile-Viewer']);
```

<a name="removescripttags"></a>
<a id="removescripttags"></a>
#### removeScriptTags

This removes all script tags except for [application/ld+json](https://stackoverflow.com/questions/38670851/whats-a-script-type-application-ldjsonjsonobj-script-in-a-head-sec). Removing script tags prevents any JS from executing at all - so your app will no longer be isomorphic. Useful when Headless-Render-API.com is used as a scraper/crawler or in constrained environments (Lambda @ Edge).

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('removeScriptTags', true);
```

<a name="removetrailingslash"></a>
<a id="removetrailingslash"></a>
#### removeTrailingSlash

This is the opposite of what is often referred to "strict mode routing". When this is enabled, the server will normalize the URLs by removing a trailing slash.

e.g.: example.com/docs/ -> example.com/docs

The use case for this option is to achieve higher cache hit rate (so if a user/bots are hitting `/docs/` and `/docs`, they'll both be cached on Headless-Render-API.com servers as the same entity).

SEO best practices:

1. 301 redirect trailing slash URLs to non trailing slash before this middleware is called (and then don't bother removingTrailingSlash because it should never happen)
2. or use [link rel canonical](https://en.wikipedia.org/wiki/Canonical_link_element) in conjunction with this

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('removeTrailingSlash', true);
```

<a name="waitextralong"></a>
<a id="waitextralong"></a>
#### waitExtraLong

Headless-Render-API.com will wait for all in-flight XHR/websockets requests to finish before rendering, but when critical XHR/websockets requests are sent after the page load event, Headless-Render-API.com may not wait long enough to see that it needs to wait for them. Common example use cases are sites hosted on IPFS, or sites that make an initial XHR request that returns endpoints that require additional XHR requests.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('waitExtraLong', true);
```

<a id="withmetadata"></a>
#### withMetadata

When a function is passed that returns true, Headless-Render-API.com will return both the prerendered HTML, meta, and links

```javascript
const prerendercloud = require('prerendercloud');

prerendercloud.set('withMetadata', req => true);
```

To make use of the meta and links, call `res.meta` or `res.links` from either `afterRender` or `afterRenderBlock`

<a id="withscreenshot"></a>
#### withScreenshot

When a function is passed that returns true, Headless-Render-API.com will return both the prerendered HTML and a JPEG screenshot.

```javascript
const prerendercloud = require('prerendercloud');

prerendercloud.set('withScreenshot', req => true);
```

To make use of the screenshot, call `res.screenshot` from either `afterRender` or `afterRenderBlock`

<a id="devicewidth"></a>
### DeviceWidth

Self explanatory

```javascript
const prerendercloud = require('prerendercloud');

prerendercloud.set('deviceWidth', req => req.url.match(/shareable\-cards/) ? 800 : null);
```

<a id="deviceheight"></a>
### DeviceHeight

Self explanatory

```javascript
const prerendercloud = require('prerendercloud');

prerendercloud.set('deviceHeight', req => req.url.match(/shareable\-cards/) ? 600 : null);
```

<a name="middleware-options"></a>
<a id="middleware-options"></a>
### Middleware Options

<a name="host"></a>
<a id="host"></a>
#### host

Force the middleware to hit your origin with a certain host. This is useful for environments like Lambda@Edge+CloudFront where you can't infer the actual host.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('host', 'example.com');
```

<a name="protocol"></a>
<a id="protocol"></a>
#### protocol

Force the middleware to hit your origin with a certain protocol (usually `https`). This is useful when you're using CloudFlare or any other https proxy that hits your origin at http but you also have a redirect to https.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('protocol', 'https');
```


<a name="whitelistqueryparams"></a>
<a id="whitelistqueryparams"></a>
#### whitelistQueryParams

Whitelist query string parameters on each request.

The use case for this option is to achieve higher cache hit rate (so if a user/bots are hitting `docs?source=other` or `/docs` or `docs?source=another&foo=bar`, they'll all be cached on Headless-Render-API.com servers as the same entity).

* `null` (the default), preserve all query params
* `[]` empty whitelist means drop all query params
* `['page', 'x', 'y']` only accept page, x, and y params (drop everything else)

```javascript
const prerendercloud = require('prerendercloud');

// e.g., the default: example.com/docs?source=other&page=2 -> example.com/docs?source=other&page=2
prerendercloud.set('whitelistQueryParams', req => null);

// e.g., if you whitelist only `page` query param: example.com/docs?source=other&page=2 -> example.com/docs?page=2
prerendercloud.set('whitelistQueryParams', req => req.path.startsWith('/docs') ? ['page'] : []);

// e.g., if your whitelist is empty array: example.com/docs?source=other&page=2 -> example.com/docs
prerendercloud.set('whitelistQueryParams', req => []);
```

<a id="afterrenderblocking-executes-before-afterrender"></a>
#### afterRenderBlocking (executes before `afterRender`)

Same thing as `afterRender`, except it blocks. This is useful for mutating the response headers or body.

Since it blocks, you have to call the `next` callback when done.

Example use case: use with the `withMetadata` and/or `withScreenshot` option to save metadata or the screenshot to disk and add it as an open graph tag.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('afterRenderBlocking', (err, req, res, next) => {
  // req: (standard node.js req object)
  // res: { statusCode, headers, body, screenshot, meta, links }
  console.log({meta: res.meta, links: res.links});
  if (res.screenshot) {
    fs.writeFileSync('og.jpg', res.screenshot);
    res.body = res.body.replace(/\<\/head\>/, "<meta property='og:image' content='/og.jpg' /></head>")
  }

  next();
});
```

<a name="afterrender-a-noop-caching-analytics"></a>
<a id="afterrender-a-noop-caching-analytics-executes-after-afterrenderblocking"></a>
#### afterRender (a noop) (caching, analytics) (executes after `afterRenderBlocking`)

It's a noop because this middleware already takes over the response for your HTTP server. 2 example use cases of this: your own caching layer, or analytics/metrics.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('afterRender', (err, req, res) => {
  // req: (standard node.js req object)
  // res: { statusCode, headers, body }
  console.log(`received ${res.body.length} bytes for ${req.url}`)
});
```

<a name="bubbleup5xxerrors"></a>
<a id="bubbleup5xxerrors"></a>
#### bubbleUp5xxErrors

(note: 400 errors are always bubbled up, 429 rate limit errors are never bubbled up. This section is for 5xx errors which are usually either timeouts or Headless-Render-API.com server issues)

This must be enabled if you want your webserver to show a 500 when Headless-Render-API.com throws a 5xx (retriable error). As mentioned in the previous section, by default, 5xx errors are ignored and non-prerendered content is returned so the user is uninterrupted.

Bubbling up the 5xx error is useful if you're using a crawler to trigger prerenders and you want control over retries.

It can take a bool or a function(err, req, res) that returns a bool. The sync function is executed before writing to `res`, or calling `next` (dependending on what bool is returned). It's useful when:

* you want to bubble up errors only for certain errors, user-agents, IPs, etc...
* or you want to store the errors (analytics)

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('bubbleUp5xxErrors', true);
```

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('bubbleUp5xxErrors', (err, req, res) => {
  // err object comes from https://github.com/sindresorhus/got lib

  // examples:
  //   1. if (err.statusCode === 503) return true;
  //   2. if (req.headers['user-agent'] === 'googlebot') return true;
  //   3. if (res.body && res.body.match(/timeout/)) return true;
  //   4. myDatabase.query('insert into errors(msg) values($1)', [err.message])
  //   5. Raven.captureException(err, { req, resBody: res.body })

  return false;
});
```


<a name="retries"></a>
<a id="retries"></a>
#### retries

HTTP errors 500, 503, 504 and [network errors](https://github.com/floatdrop/is-retry-allowed/) are retriable. The default is 1 retry (2 total attempts) but you can change that to 0 or whatever here. There is exponential back-off. When Headless-Render-API.com is over capacity it will return 503 until the autoscaler boots up more capacity so this will address those service interruptions appropriately.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('retries', 4);
```

<a name="throttleonfail"></a>
<a id="throttleonfail"></a>
#### throttleOnFail

If a request fails due to a retryable error (500, 503, 504) - typically a timeout, then this option will prevent pre-rendering that page for 5 minutes.

It's useful if some of of your pages have an issue causing a timeout, so at least the non-prerendered content will be returned most of the time.

Use this option with a function for `bubbleUp5xxErrors` so you can record the error in your error tracker so you can eventually fix it.

Note, if you're using this with `bubbleUp5xxErrors` function that returns true (or a bool value of true), then a 503 error will be bubbled up.

```javascript
const prerendercloud = require('prerendercloud');
prerendercloud.set('throttleOnFail', true);
```


<a name="how-errors-from-the-server-serviceprerendercloud-are-handled"></a>
<a id="how-errors-from-the-server-serviceheadless-render-apicom-are-handled"></a>
### How errors from the server (service.headless-render-api.com) are handled

* when used as middleware
  * when Headless-Render-API.com service returns
    * **400 client error (bad request)**
      * e.g. try to prerender a localhost URL as opposed to a publicly accessible URL
      * the client itself returns the 400 error (the web page will not be accessible)
    * **429 client error (rate limited)**
      * the original server payload (not prerendered) is returned, so **the request is not interrupted due to unpaid bills or free accounts**
      * only happens while on the free tier (paid subscriptions are not rate limited)
      * the error message is written to STDERR
      * if the env var: DEBUG=prerendercloud is set, the error is also written to STDOUT
    * **500, 503, 504** (and [network errors](https://github.com/floatdrop/is-retry-allowed/))
      * these will be retried, by default, 1 time
      * you can disable retries with `.set('retries', 0)`
      * you can increase retries with `.set('retries', 5)` (or whatever)
      * 502 is not retried - it means your origin returned 5xx
    * **5xx (server error)**
      * when even the retries fail, the original server payload (not prerendered) is returned, so **the request is not interrupted due to server error**
      * the error message is written to STDERR
    * if the env var: DEBUG=prerendercloud is set, the error is also written to STDOUT
* when used for screenshots/pdfs
  * retriable errors are retried (500, 503, 504 and [network errors](https://github.com/floatdrop/is-retry-allowed/))
  * the errors are returned in the promise catch API
  * the errors are from the [`got` library](https://github.com/sindresorhus/got#errors)
    * see URL
      * `.catch(err => console.log(err.url))`
    * see status code
      * `.catch(err => console.log(err.response.statusCode))`
    * see err response body
      * `.catch(err => console.log(err.response.body))`


