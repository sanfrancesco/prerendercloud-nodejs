const getNodeVersion = () => {
  try {
    return parseFloat(process.version.replace(/v/, ""));
  } catch (err) {
    return null;
  }
};

const nodeVersion = getNodeVersion();

if (nodeVersion < 4.5) {
  console.log("prerendercloud requires node >= 4.5");
  process.exit(1);
}

require("./includes-polyfill");
if (!Array.isArray) {
  Array.isArray = function(arg) {
    return Object.prototype.toString.call(arg) === "[object Array]";
  };
}

var got = require("got");
var vary = require("vary");
var debug = require("debug")("prerendercloud");
var LRU = require("lru-cache");
var middlewareCache = null;

// preserve (and send to client) these headers from service.prerender.cloud which originally came from the origin server
const headerWhitelist = [
  "vary",
  "content-type",
  "cache-control",
  "strict-transport-security",
  "content-security-policy",
  "public-key-pins",
  "x-frame-options",
  "x-xss-protection",
  "x-content-type-options",
  "location"
];

const userAgentsToPrerender = [
  "googlebot",
  "yahoo",
  "bingbot",
  "baiduspider",
  "facebookexternalhit",
  "twitterbot",
  "rogerbot",
  "linkedinbot",
  "embedly",
  "quora link preview",
  "showyoubot",
  "outbrain",
  "pinterest/0.",
  "pinterestbot",
  "developers.google.com/+/web/snippet",
  "slackbot",
  "vkShare",
  "W3C_Validator",
  "redditbot",
  "Applebot",
  "WhatsApp",
  "flipboard",
  "tumblr",
  "bitlybot"
];

// from https://stackoverflow.com/a/41072596
// if there are multiple values with different case, it just takes the last
// (which is wrong, it should merge some of them according to the HTTP spec, but it's fine for now)
const objectKeysToLowerCase = function(origObj) {
  return Object.keys(origObj).reduce(function(newObj, key) {
    const val = origObj[key];
    const newVal = typeof val === "object" ? objectKeysToLowerCase(val) : val;
    newObj[key.toLowerCase()] = newVal;
    return newObj;
  }, {});
};

const is5xxError = statusCode => parseInt(statusCode / 100) === 5;

class MiddlewareCache {
  constructor(lruCache) {
    this.lruCache = lruCache;

    // this prevCache dump/load is just for tests
    let prevCache = middlewareCache && middlewareCache.lruCache.dump();
    if (prevCache) this.lruCache.load(prevCache);
  }
  reset() {
    this.lruCache.reset();
  }
  clear(startsWith) {
    if (!startsWith) throw new Error("must pass what cache key startsWith");

    startsWith = startsWith.replace(/^https?/, "");
    let httpPath = `http${startsWith}`;
    let httpsPath = `https${startsWith}`;

    this.lruCache.forEach(function(v, k, cache) {
      if (k.startsWith(httpPath) || k.startsWith(httpsPath)) cache.del(k);
    });
  }
  set(url, res) {
    this.lruCache.set(url, res);
  }
  get(url) {
    return this.lruCache.get(url);
  }
}

class Options {
  constructor() {
    this.reset();
  }

  reset() {
    this.options = {};
  }

  static get validOptions() {
    return [
      "timeout",
      "prerenderServiceUrl",
      "prerenderToken",
      "beforeRender",
      "afterRender",
      "whitelistUserAgents",
      "originHeaderWhitelist",
      "botsOnly",
      "disableServerCache",
      "disableAjaxBypass",
      "disableAjaxPreload",
      "bubbleUp5xxErrors",
      "enableMiddlewareCache",
      "middlewareCacheMaxBytes",
      "middlewareCacheMaxAge",
      "shouldPrerender",
      "removeScriptTags"
    ];
  }

  set(prerenderMiddleware, name, val) {
    if (!Options.validOptions.includes(name))
      throw new Error(`${name} is unsupported option`);

    this.options[name] = val;

    if (name === "enableMiddlewareCache" && val === false) {
      middlewareCache = undefined;
    } else if (name.match(/middlewareCache/i)) {
      let lruCache = LRU({
        max: this.options.middlewareCacheMaxBytes || 500000000, // 500MB
        length: function(n, key) {
          return n.length;
        },
        dispose: function(key, n) {},
        maxAge: this.options.middlewareCacheMaxAge || 0 // 0 is forever
      });
      middlewareCache = new MiddlewareCache(lruCache);
    }

    if (this.options["botsOnly"] && this.options["whitelistUserAgents"])
      throw new Error("Can't use both botsOnly and whitelistUserAgents");

    return prerenderMiddleware;
  }
}

var options = new Options();

// http, connect, and express compatible URL parser
class Url {
  constructor(req) {
    this.req = req;
  }

  get protocol() {
    // http://stackoverflow.com/a/10353248
    // https://github.com/expressjs/express/blob/3c54220a3495a7a2cdf580c3289ee37e835c0190/lib/request.js#L301
    return this.req.connection && this.req.connection.encrypted
      ? "https:"
      : "http:";
  }

  get host() {
    return this.req.headers.host;
  }

  get path() {
    return this.req.originalUrl;
  }

  // if the path is /admin/new.html, this returns /new.html
  get basename() {
    return "/" + this.req.originalUrl.split("/").pop();
  }
}

const handleSkip = (msg, next) => {
  debug(msg);
  console.error("prerendercloud middleware SKIPPED:", msg);
  return next();
};

const concurrentRequestCache = {};

class Prerender {
  constructor(req) {
    this.req = req;
    this.url = new Url(req);
  }

  // promise cache wrapper around ._get to prevent concurrent requests to same URL
  get() {
    if (concurrentRequestCache[this._requestedUrl()])
      return concurrentRequestCache[this._requestedUrl()];

    const promise = this._get();

    const deleteCache = () => {
      concurrentRequestCache[this._requestedUrl()] = undefined;
      delete concurrentRequestCache[this._requestedUrl()];
    };

    return (concurrentRequestCache[this._requestedUrl()] = promise)
      .then(res => {
        deleteCache();
        return res;
      })
      .catch(err => {
        deleteCache();
        return Promise.reject(err);
      });
  }

  // fulfills promise when service.prerender.cloud response is: 2xx, 4xx
  // rejects promise when request lib errors or service.prerender.cloud response is: 5xx
  _get() {
    const url = this._createApiRequestUrl();
    const headers = this._createHeaders();

    let gzip = true;
    debug("prerendering:", url, headers);

    const buildData = response => {
      const body = response.body;

      const lowerCasedHeaders = objectKeysToLowerCase(response.headers);

      const headers = {};
      headerWhitelist.forEach(h => {
        if (lowerCasedHeaders[h]) headers[h] = lowerCasedHeaders[h];
      });

      const data = { statusCode: response.statusCode, headers, body };

      if (
        options.options.enableMiddlewareCache &&
        `${response.statusCode}`.startsWith("2") &&
        body &&
        body.length
      )
        middlewareCache.set(this._requestedUrl(), data);

      return data;
    };

    return got
      .get(url, {
        headers,
        retries: 0,
        timeout: options.options.timeout || 20000
      })
      .then(response => {
        return buildData(response);
      })
      .catch(err => {
        if (err instanceof got.HTTPError) {
          const shouldRejectStatusCode = statusCode =>
            (!options.options.bubbleUp5xxErrors && is5xxError(statusCode)) ||
            statusCode === 429;

          if (shouldRejectStatusCode(err.response.statusCode)) {
            return Promise.reject(err);
          } else {
            return buildData(err.response);
          }
        } else {
          return Promise.reject(err);
        }
      });
  }

  // data looks like { statusCode, headers, body }
  writeHttpResponse(req, res, next, data) {
    if (options.options.afterRender)
      process.nextTick(() => options.options.afterRender(null, req, data));

    try {
      if (data.statusCode === 400) {
        res.statusCode = 400;
        return res.end(
          `service.prerender.cloud can't prerender this page due to user error: ${data.body}`
        );
      } else if (data.statusCode === 429) {
        return handleSkip("rate limited due to free tier", next);
      } else {
        res.writeHead(data.statusCode, data.headers);
        return res.end(data.body);
      }
    } catch (error) {
      console.error(
        "unrecoverable prerendercloud middleware error:",
        error && error.message
      );
      console.error(
        "submit steps to reproduce here: https://github.com/sanfrancesco/prerendercloud-nodejs/issues"
      );
      throw error;
    }
  }

  static middleware(req, res, next) {
    const prerender = new Prerender(req);

    if (options.options.botsOnly) {
      vary(res, "User-Agent");
    }

    if (!prerender._shouldPrerender()) {
      debug(
        "NOT prerendering",
        req.originalUrl,
        req && req.headers && { "user-agent": req.headers["user-agent"] }
      );
      return next();
    }

    if (options.options.enableMiddlewareCache) {
      const cached = middlewareCache.get(prerender._requestedUrl());
      if (cached) {
        debug(
          "returning cache",
          req.originalUrl,
          req && req.headers && { "user-agent": req.headers["user-agent"] }
        );
        return prerender.writeHttpResponse(req, res, next, cached);
      }
    }

    const remotePrerender = function() {
      return prerender
        .get()
        .then(function(data) {
          return prerender.writeHttpResponse(req, res, next, data);
        })
        .catch(function(error) {
          return handleSkip(`server error: ${error && error.message}`, next);
        });
    };

    if (options.options.beforeRender) {
      const donePassedToUserBeforeRender = function(err, stringOrObject) {
        if (!stringOrObject) {
          return remotePrerender();
        } else if (typeof stringOrObject === "string") {
          return prerender.writeHttpResponse(req, res, next, {
            statusCode: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            },
            body: stringOrObject
          });
        } else if (typeof stringOrObject === "object") {
          return prerender.writeHttpResponse(req, res, next, {
            statusCode: stringOrObject.status,
            headers: {
              "content-type": "text/html; charset=utf-8"
            },
            body: stringOrObject.body
          });
        }
      };
      return options.options.beforeRender(req, donePassedToUserBeforeRender);
    } else {
      return remotePrerender();
    }
  }

  _shouldPrerender() {
    if (!(this.req && this.req.headers)) return false;

    if (this.req.method != "GET" && this.req.method != "HEAD") return false;

    if (this._alreadyPrerendered()) return false;

    if (!this._prerenderableExtension()) return false;

    if (this._isPrerenderCloudUserAgent()) return false;

    if (options.options.shouldPrerender) {
      return options.options.shouldPrerender(this.req);
    } else {
      return this._prerenderableUserAgent();
    }
  }

  _createHeaders() {
    let h = {
      "User-Agent": "prerender-cloud-nodejs-middleware",
      "accept-encoding": "gzip"
    };
    
    if (this.req.headers["user-agent"])
      Object.assign(h, { "X-Original-User-Agent": this.req.headers["user-agent"] });

    if (this.req.headers["user-agent"])
      Object.assign(h, {
        "X-Original-User-Agent": this.req.headers["user-agent"]
      });

    let token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

    if (token) Object.assign(h, { "X-Prerender-Token": token });

    if (options.options.removeScriptTags)
      Object.assign(h, { "Prerender-Remove-Script-Tags": true });

    // disable prerender.cloud caching
    if (options.options.disableServerCache) Object.assign(h, { noCache: true });
    if (options.options.disableAjaxBypass)
      Object.assign(h, { "Prerender-Disable-Ajax-Bypass": true });
    if (options.options.disableAjaxPreload)
      Object.assign(h, { "Prerender-Disable-Ajax-Preload": true });

    if (this._hasOriginHeaderWhitelist()) {
      options.options.originHeaderWhitelist.forEach(_h =>
        Object.assign(h, { [_h]: this.req.headers[_h] })
      );

      Object.assign(h, {
        "Origin-Header-Whitelist": options.options.originHeaderWhitelist.join(
          " "
        )
      });
    }

    return h;
  }

  _hasOriginHeaderWhitelist() {
    return (
      options.options.originHeaderWhitelist &&
      Array.isArray(options.options.originHeaderWhitelist)
    );
  }

  _createApiRequestUrl() {
    return this._serviceUrl().replace(/\/+$/, "") + "/" + this._requestedUrl();
  }

  _serviceUrl() {
    return (
      options.options.prerenderServiceUrl ||
      process.env.PRERENDER_SERVICE_URL ||
      "https://service.prerender.cloud"
    );
  }

  _alreadyPrerendered() {
    return !!this.req.headers["x-prerendered"];
  }

  _prerenderableExtension() {
    // doesn't detect index.whatever.html (multiple dots)
    let hasHtmlOrNoExtension = !!this.url.basename.match(/^(([^.]|\.html?)+)$/);

    if (hasHtmlOrNoExtension) return true;

    // hack to handle basenames with multiple dots: index.whatever.html
    let endsInHtml = !!this.url.basename.match(/.html?$/);

    if (endsInHtml) return true;

    return false;
  }

  _isPrerenderCloudUserAgent() {
    let reqUserAgent = this.req.headers["user-agent"];

    if (!reqUserAgent) return false;

    reqUserAgent = reqUserAgent.toLowerCase();

    return reqUserAgent.match(/prerendercloud/i);
  }

  _prerenderableUserAgent() {
    let reqUserAgent = this.req.headers["user-agent"];

    if (!reqUserAgent) return false;

    reqUserAgent = reqUserAgent.toLowerCase();

    if (options.options.whitelistUserAgents)
      return options.options.whitelistUserAgents.some(enabledUserAgent =>
        reqUserAgent.includes(enabledUserAgent)
      );

    if (!options.options.botsOnly) return true;

    // bots only

    if (this.req.headers["x-bufferbot"]) return true;

    if (this.url.path.match(/[?&]_escaped_fragment_/)) return true;

    return userAgentsToPrerender.some(enabledUserAgent =>
      reqUserAgent.includes(enabledUserAgent)
    );
  }

  _requestedUrl() {
    return this.url.protocol + "//" + this.url.host + this.url.path;
  }
}

Prerender.middleware.set = options.set.bind(options, Prerender.middleware);
// Prerender.middleware.cache =
Object.defineProperty(Prerender.middleware, "cache", {
  get: function() {
    return middlewareCache;
  }
});

// for testing only
Prerender.middleware.resetOptions = options.reset.bind(options);

module.exports = Prerender.middleware;
