# prerendercloud-nodejs

Express/connect middleware for prerendering javascript web pages/apps (single page apps or SPA) with [https://www.prerender.cloud/](https://www.prerender.cloud/)

## Usage

### Install

```bash
npm install prerendercloud --save
```

### General usage

The `prerendercloud` middleware should be loaded first **unless you're using middleware that monkeypatches the req/res flow (i.e. [compression](https://www.npmjs.com/package/compression))**

```javascript
// the free, rate limited tier
app.use(require('prerendercloud'));
```

#### Avoid rate limiting by setting your prerendercloud secret/token

```javascript
// hard code the token in the code
app.use(require('prerendercloud').set('prerenderToken', 'mySecretToken'));
```

```javascript
// or use the PRERENDER_TOKEN environment variable (best practice)
PRERENDER_TOKEN=mySecretToken node index.js
```

### Disable prerender.cloud server cache

service.prerender.cloud will cache for 1-5 minutes (usually less) as a best practice. Adding the `nocache` HTTP header via this config option disables that cache entirely. Disabling the service.prerender.cloud cache is only recommended if you have your own cache either in this middleware or your client, otherwise all of your requests are going to be slow.

```javascript
app.use(require('prerendercloud').set('disableServerCache', true));
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

