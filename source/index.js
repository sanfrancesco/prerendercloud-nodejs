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

const debug = require("debug")("prerendercloud");

const stdliburl = require("url");
const querystring = require("querystring");
const util = require("./lib/util");

const middlewareCacheSingleton = {};
const Options = require("./lib/Options");
const options = new Options(middlewareCacheSingleton);

const got = require("got-lite");
require("./lib/got-retries")(got, options, debug);

const vary = require("vary");

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

const botsOnlyList = [
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
].map(ua => ua.toLowerCase());

const userAgentIsBot = (headers, requestedPath = "") => {
  const reqUserAgent =
    (headers["user-agent"] && headers["user-agent"].toLowerCase()) || "";

  if (headers["x-bufferbot"]) return true;

  if (requestedPath.match(/[?&]_escaped_fragment_/)) return true;

  return botsOnlyList.some(enabledUserAgent =>
    reqUserAgent.includes(enabledUserAgent)
  );
};

const getServiceUrl = hardcoded =>
  (hardcoded && hardcoded.replace(/\/+$/, "")) ||
  process.env.PRERENDER_SERVICE_URL ||
  "https://service.prerender.cloud";
const getRenderUrl = (action, url) =>
  [getServiceUrl(), action, url].filter(p => p).join("/");

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
const is4xxError = statusCode => {
  const n = parseInt(statusCode);
  const i = parseInt(statusCode / 100);

  return i === 4 && n !== 429;
};
const isGotClientTimeout = err =>
  err.name === "RequestError" && err.code === "ETIMEDOUT";

const zlib = require("zlib");
function compression(req, res, data) {
  if (
    req.headers["accept-encoding"] &&
    req.headers["accept-encoding"].match(/gzip/i)
  ) {
    zlib.gzip(data.body, (err, gzipped) => {
      if (err) {
        console.error(err);
        return res.status(500).send("compression error");
      }

      res.writeHead(
        data.statusCode,
        Object.assign({}, data.headers, { "content-encoding": "gzip" })
      );
      res.end(gzipped);
    });
  } else {
    res.writeHead(data.statusCode, data.headers);
    res.end(data.body);
  }
}

// http, connect, and express compatible URL parser
class Url {
  constructor(req) {
    this.req = req;
    const url = this.req.originalUrl;
    if (url) {
      this.parsed = stdliburl.parse(url);
    }
  }

  get protocol() {
    if (options.options.protocol) return options.options.protocol + ":";

    // http://stackoverflow.com/a/10353248
    // https://github.com/expressjs/express/blob/3c54220a3495a7a2cdf580c3289ee37e835c0190/lib/request.js#L301
    let protocol =
      this.req.connection && this.req.connection.encrypted ? "https" : "http";

    if (this.req.headers["cf-visitor"]) {
      const cfVisitorMatch = this.req.headers["cf-visitor"].match(
        /"scheme":"(https|http)"/
      );
      if (cfVisitorMatch) protocol = cfVisitorMatch[1];
    }

    let xForwardedProto = this.req.headers["x-forwarded-proto"];
    if (xForwardedProto) {
      xForwardedProto = xForwardedProto.split(",")[0];
      const xForwardedProtoMatch = xForwardedProto.match(/(https|http)/);
      if (xForwardedProtoMatch) protocol = xForwardedProtoMatch[1];
    }

    return protocol + ":";
  }

  get host() {
    if (options.options.host) return options.options.host;
    return this.req.headers.host;
  }

  get original() {
    return this.req.originalUrl;
  }

  get path() {
    // in express, this is the same as req.path
    return this.parsed && this.parsed.pathname;
  }

  // returns {a:b, c:d} if query string exists, else null
  get query() {
    // in express, req.query will return key/val object
    // parsed.query returns string: a=b&c=d
    const query = this.parsed && this.parsed.query;
    if (query) return querystring.parse(query);
    return null;
  }

  // if the path is /admin/new.html, this returns /new.html
  get basename() {
    return "/" + this.original.split("/").pop();
  }

  hasHtmlPath() {
    return util.urlPathIsHtml(this.basename);
  }
}

const handleSkip = (msg, next) => {
  debug(msg);
  console.error("prerendercloud middleware SKIPPED:", msg);
  return next();
};

const concurrentRequestCache = {};

// response: { body, statusCode, headers }
function createResponse(requestedUrl, response) {
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
    middlewareCacheSingleton.instance.set(requestedUrl, data);

  return data;
}

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

    let requestPromise;

    if (options.isThrottled(url)) {
      requestPromise = Promise.reject(new Error("throttled"));
    } else {
      debug("prerendering:", url, headers);
      requestPromise = got.get(url, {
        headers,
        retries: options.options.retries,
        followRedirect: false,
        timeout: options.options.timeout || 20000
      });
    }

    return requestPromise
      .then(response => {
        return createResponse(this._requestedUrl(), response);
      })
      .catch(err => {
        const shouldBubble = util.isFunction(options.options.bubbleUp5xxErrors)
          ? options.options.bubbleUp5xxErrors(err, this.req, err.response)
          : options.options.bubbleUp5xxErrors;

        options.recordFail(url);

        if (shouldBubble) {
          if (err.response && is5xxError(err.response.statusCode))
            return createResponse(this._requestedUrl(), err.response);

          if (err.message && err.message.match(/throttle/)) {
            return createResponse(this._requestedUrl(), {
              body:
                "Error: prerender.cloud client throttled this prerender request due to a recent timeout",
              statusCode: 503,
              headers: { "content-type": "text/html" }
            });
          }

          if (isGotClientTimeout(err))
            return createResponse(this._requestedUrl(), {
              body:
                "Error: prerender.cloud client timeout (as opposed to prerender.cloud server timeout)",
              statusCode: 500,
              headers: { "content-type": "text/html" }
            });

          return Promise.reject(err);
        } else if (err.response && is4xxError(err.response.statusCode)) {
          return createResponse(this._requestedUrl(), err.response);
        }

        return Promise.reject(err);
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
        return compression(req, res, data);
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
      const cached = middlewareCacheSingleton.instance.get(
        prerender._requestedUrl()
      );
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
      Object.assign(h, {
        "X-Original-User-Agent": this.req.headers["user-agent"]
      });

    let token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

    if (token) Object.assign(h, { "X-Prerender-Token": token });

    if (options.options.removeScriptTags)
      Object.assign(h, { "Prerender-Remove-Script-Tags": true });

    if (options.options.removeTrailingSlash)
      Object.assign(h, { "Prerender-Remove-Trailing-Slash": true });

    if (options.options.waitExtraLong)
      Object.assign(h, { "Prerender-Wait-Extra-Long": true });

    // disable prerender.cloud caching
    if (options.options.disableServerCache) Object.assign(h, { noCache: true });
    if (options.options.disableAjaxBypass)
      Object.assign(h, { "Prerender-Disable-Ajax-Bypass": true });
    if (options.options.disableAjaxPreload)
      Object.assign(h, { "Prerender-Disable-Ajax-Preload": true });

    if (this._hasOriginHeaderWhitelist()) {
      options.options.originHeaderWhitelist.forEach(_h => {
        if (this.req.headers[_h])
          Object.assign(h, { [_h]: this.req.headers[_h] });
      });

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
    return getRenderUrl(null, this._requestedUrl());
  }

  _alreadyPrerendered() {
    return !!this.req.headers["x-prerendered"];
  }

  _prerenderableExtension() {
    return this.url.hasHtmlPath();
  }

  _isPrerenderCloudUserAgent() {
    let reqUserAgent = this.req.headers["user-agent"];

    if (!reqUserAgent) return false;

    reqUserAgent = reqUserAgent.toLowerCase();

    return reqUserAgent.match(/prerendercloud/i);
  }

  _prerenderableUserAgent() {
    const reqUserAgent = this.req.headers["user-agent"];

    if (!reqUserAgent) return false;

    if (options.options.whitelistUserAgents)
      return options.options.whitelistUserAgents.some(enabledUserAgent =>
        reqUserAgent.includes(enabledUserAgent)
      );

    if (!options.options.botsOnly) return true;

    // bots only
    return userAgentIsBot(this.req.headers, this.url.original);
  }

  _requestedUrl() {
    const whitelistQueryParams = options.options.whitelistQueryParams;
    if (whitelistQueryParams) {
      const whitelistedParams = whitelistQueryParams(this.req);

      if (whitelistedParams != null) {
        const queryParams = Object.assign({}, this.url.query);

        Object.keys(queryParams).forEach(key => {
          if (!whitelistedParams.includes(key)) {
            delete queryParams[key];
          }
        });

        const whitelistedQueryString =
          (Object.keys(queryParams).length ? "?" : "") +
          querystring.stringify(queryParams);

        return (
          this.url.protocol +
          "//" +
          this.url.host +
          this.url.path +
          whitelistedQueryString
        );
      }
    }

    return this.url.protocol + "//" + this.url.host + this.url.original;
  }
}

Prerender.middleware.set = options.set.bind(options, Prerender.middleware);
// Prerender.middleware.cache =
Object.defineProperty(Prerender.middleware, "cache", {
  get: function() {
    return middlewareCacheSingleton.instance;
  }
});

const screenshotAndPdf = (action, url, params) => {
  const headers = {};

  const token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

  if (token) Object.assign(headers, { "X-Prerender-Token": token });

  return got(getRenderUrl(action, url), {
    encoding: null,
    headers,
    retries: options.options.retries
  }).then(res => res.body);
};

Prerender.middleware.screenshot = screenshotAndPdf.bind(
  undefined,
  "screenshot"
);
Prerender.middleware.pdf = screenshotAndPdf.bind(undefined, "pdf");

Prerender.middleware.botsOnlyList = botsOnlyList;
Prerender.middleware.userAgentIsBot = userAgentIsBot;

Prerender.middleware.util = util;

// for testing only
Prerender.middleware.resetOptions = options.reset.bind(options);
Prerender.middleware.Options = Options;

module.exports = Prerender.middleware;
