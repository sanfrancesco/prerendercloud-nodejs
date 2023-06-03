const getNodeVersion = () => {
  try {
    return parseFloat(process.version.replace(/v/, ""));
  } catch (err) {
    return null;
  }
};

const nodeVersion = getNodeVersion();

if (nodeVersion < 12.0) {
  try {
    console.log("prerendercloud requires node >= 12.0");
    process.exit(1);
  } catch (err) {
    // if calling process throws an error, probably running in serverless environment
    // e.g. vercel edge functions
  }
}
const debug = require("debug")("prerendercloud");

const util = require("./lib/util");
const Url = require("./lib/our-url");
const middlewareCacheSingleton = {};
const Options = require("./lib/options");
const options = new Options(middlewareCacheSingleton);
const apiOptions = require("./lib/api-options.json");

const got = require("got-lite");
require("./lib/got-retries")(got, options, debug);

const vary = require("vary");

// preserve (and send to client) these headers from service.headless-render-api.com which originally came from the origin server
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
  "location",
];

const botUserAgentMapper = (ua) => ua.toLowerCase();

const botsOnlyList = [
  "googlebot",
  "yahoo",
  "bingbot",
  "yandex",
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
  "bitlybot",
  "Bitrix link preview",
  "XING-contenttabreceiver",
  "Discordbot",
  "TelegramBot",
  "Google Search Console",
].map(botUserAgentMapper);

const userAgentIsBot = (headers, requestedPath = "") => {
  const reqUserAgent =
    (headers["user-agent"] && headers["user-agent"].toLowerCase()) || "";

  if (headers["x-bufferbot"]) return true;

  if (requestedPath.match(/[?&]_escaped_fragment_/)) return true;

  return botsOnlyList.some((enabledUserAgent) =>
    reqUserAgent.includes(enabledUserAgent)
  );
};

const userAgentIsBotFromList = (botsOnlyList, headers, requestedPath = "") => {
  const reqUserAgent =
    (headers["user-agent"] && headers["user-agent"].toLowerCase()) || "";

  if (headers["x-bufferbot"]) return true;

  if (requestedPath.match(/[?&]_escaped_fragment_/)) return true;

  return botsOnlyList.some((enabledUserAgent) =>
    reqUserAgent.includes(enabledUserAgent)
  );
};

const getServiceUrl = (hardcoded) =>
  (hardcoded && hardcoded.replace(/\/+$/, "")) ||
  process.env.PRERENDER_SERVICE_URL ||
  "https://service.headless-render-api.com";
const getRenderUrl = (action, url) =>
  [getServiceUrl(), action, url].filter((p) => p).join("/");

// from https://stackoverflow.com/a/41072596
// if there are multiple values with different case, it just takes the last
// (which is wrong, it should merge some of them according to the HTTP spec, but it's fine for now)
const objectKeysToLowerCase = function (origObj) {
  return Object.keys(origObj).reduce(function (newObj, key) {
    const val = origObj[key];
    const newVal = typeof val === "object" ? objectKeysToLowerCase(val) : val;
    newObj[key.toLowerCase()] = newVal;
    return newObj;
  }, {});
};

const is5xxError = (statusCode) => parseInt(statusCode / 100) === 5;
const is4xxError = (statusCode) => {
  const n = parseInt(statusCode);
  const i = parseInt(statusCode / 100);

  return i === 4 && n !== 429;
};
const isGotClientTimeout = (err) =>
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

const handleSkip = (msg, next) => {
  debug(msg);
  if (process.env.NODE_ENV !== "test")
    console.error("prerendercloud middleware SKIPPED:", msg);
  return next();
};

const concurrentRequestCache = {};

// response: { body, statusCode, headers }
function createResponse(req, requestedUrl, response) {
  const lowerCasedHeaders = objectKeysToLowerCase(response.headers);

  const headers = {};
  headerWhitelist.forEach((h) => {
    if (lowerCasedHeaders[h]) headers[h] = lowerCasedHeaders[h];
  });

  let body = response.body;
  let screenshot;
  let meta;
  let links;
  if (
    (options.options.withScreenshot && options.options.withScreenshot(req)) ||
    (options.options.withMetadata && options.options.withMetadata(req))
  ) {
    headers["content-type"] = "text/html";
    let json;
    try {
      json = JSON.parse(body);
    } catch (err) {
      if (err.name && err.name.match(/SyntaxError/)) {
        console.log(options.options);
        console.log(req.host);
        console.log(req.url);
        console.log(response.headers);
        console.log(body);
        console.error(
          "withScreenshot expects JSON from server but parsing this failed:",
          body && body.toString().slice(0, 140) + "..."
        );
      }

      throw err;
    }
    screenshot = json.screenshot && Buffer.from(json.screenshot, "base64");
    body = json.body && Buffer.from(json.body, "base64").toString();
    meta = json.meta && JSON.parse(Buffer.from(json.meta, "base64"));
    links = json.links && JSON.parse(Buffer.from(json.links, "base64"));
  }

  const data = { statusCode: response.statusCode, headers, body };

  if (screenshot) data.screenshot = screenshot;
  if (meta) data.meta = meta;
  if (links) data.links = links;

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
    this.url = Url.parse(req, options);
    this.configureBotsOnlyList();
  }

  configureBotsOnlyList() {
    this.botsOnlyList = botsOnlyList;

    if (options.options.botsOnly && Array.isArray(options.options.botsOnly)) {
      options.options.botsOnly.forEach((additionalBotUserAgent) => {
        const alreadyExistsInList = this.botsOnlyList.find(
          (b) => b === additionalBotUserAgent
        );
        if (!alreadyExistsInList) {
          this.botsOnlyList.push(botUserAgentMapper(additionalBotUserAgent));
        }
      });
    }
  }

  // promise cache wrapper around ._get to prevent concurrent requests to same URL
  get() {
    if (concurrentRequestCache[this.url.requestedUrl])
      return concurrentRequestCache[this.url.requestedUrl];

    const promise = this._get();

    const deleteCache = () => {
      concurrentRequestCache[this.url.requestedUrl] = undefined;
      delete concurrentRequestCache[this.url.requestedUrl];
    };

    return (concurrentRequestCache[this.url.requestedUrl] = promise)
      .then((res) => {
        deleteCache();
        return res;
      })
      .catch((err) => {
        deleteCache();
        return Promise.reject(err);
      });
  }

  // fulfills promise when service.headless-render-api.com response is: 2xx, 4xx
  // rejects promise when request lib errors or service.headless-render-api.com response is: 5xx
  _get() {
    const apiRequestUrl = this._createApiRequestUrl();
    const headers = this._createHeaders();

    let requestPromise;

    if (options.isThrottled(this.url.requestedUrl)) {
      requestPromise = Promise.reject(new Error("throttled"));
    } else {
      debug("prerendering:", apiRequestUrl, headers);
      requestPromise = got.get(apiRequestUrl, {
        headers,
        retries: options.options.retries,
        followRedirect: false,
        timeout: options.options.timeout || 20000,
      });
    }

    return requestPromise
      .then((response) => {
        return createResponse(this.req, this.url.requestedUrl, response);
      })
      .catch((err) => {
        const shouldBubble = util.isFunction(options.options.bubbleUp5xxErrors)
          ? options.options.bubbleUp5xxErrors(err, this.req, err.response)
          : options.options.bubbleUp5xxErrors;

        const statusCode = err.response && parseInt(err.response.statusCode);

        const nonErrorStatusCode =
          statusCode === 404 || statusCode === 301 || statusCode === 302;

        if (!nonErrorStatusCode) {
          options.recordFail(this.url.requestedUrl);
        }

        if (shouldBubble && !nonErrorStatusCode) {
          if (err.response && is5xxError(err.response.statusCode))
            return createResponse(
              this.req,
              this.url.requestedUrl,
              err.response
            );

          if (err.response && is4xxError(err.response.statusCode))
            return createResponse(
              this.req,
              this.url.requestedUrl,
              err.response
            );

          if (err.message && err.message.match(/throttle/)) {
            return createResponse(this.req, this.url.requestedUrl, {
              body: "Error: headless-render-api.com client throttled this prerender request due to a recent timeout",
              statusCode: 503,
              headers: { "content-type": "text/html" },
            });
          }

          if (isGotClientTimeout(err))
            return createResponse(this.req, this.url.requestedUrl, {
              body: "Error: headless-render-api.com client timeout (as opposed to headless-render-api.com server timeout)",
              statusCode: 500,
              headers: { "content-type": "text/html" },
            });

          return Promise.reject(err);
        } else if (err.response && is4xxError(err.response.statusCode)) {
          return createResponse(this.req, this.url.requestedUrl, err.response);
        }

        return Promise.reject(err);
      });
  }

  writeHttpResponse(req, res, next, data) {
    const _writeHttpResponse = () =>
      this._writeHttpResponse(req, res, next, data);

    if (options.options.afterRenderBlocking) {
      // preserve original body from origin headless-render-api.com so mutations
      // from afterRenderBlocking don't affect concurrentRequestCache
      if (!data.origBodyBeforeAfterRenderBlocking) {
        data.origBodyBeforeAfterRenderBlocking = data.body;
      } else {
        data.body = data.origBodyBeforeAfterRenderBlocking;
      }
      return options.options.afterRenderBlocking(
        null,
        req,
        data,
        _writeHttpResponse
      );
    }

    _writeHttpResponse();
  }

  // data looks like { statusCode, headers, body }
  _writeHttpResponse(req, res, next, data) {
    if (options.options.afterRender)
      process.nextTick(() => options.options.afterRender(null, req, data));

    try {
      if (data.statusCode === 400) {
        debug(
          "service.headless-render-api.com returned status 400 request invalid:"
        );
        res.status(400).send(data.body);
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

    const objForReqRes = {
      url: { requestedPath: prerender.url.requestedPath },
    };
    // this is for beforeRender(req, done) func so there's visibility into what URL is being used
    req.prerender = objForReqRes;
    // this is for lambda@edge downstream: https://github.com/sanfrancesco/prerendercloud-lambda-edge
    res.prerender = objForReqRes;

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
        prerender.url.requestedUrl
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

    const remotePrerender = function () {
      return prerender
        .get()
        .then(function (data) {
          return prerender.writeHttpResponse(req, res, next, data);
        })
        .catch(function (error) {
          if (process.env.NODE_ENV !== "test") console.error(error);
          return handleSkip(`server error: ${error && error.message}`, next);
        });
    };

    if (options.options.beforeRender) {
      const donePassedToUserBeforeRender = function (err, stringOrObject) {
        if (!stringOrObject) {
          return remotePrerender();
        } else if (typeof stringOrObject === "string") {
          return prerender.writeHttpResponse(req, res, next, {
            statusCode: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
            body: stringOrObject,
          });
        } else if (typeof stringOrObject === "object") {
          return prerender.writeHttpResponse(
            req,
            res,
            next,
            Object.assign(
              {
                statusCode: stringOrObject.status,
                headers: Object.assign(
                  {
                    "content-type": "text/html; charset=utf-8",
                  },
                  stringOrObject.headers
                ),
                body: stringOrObject.body,
              },
              {
                screenshot: stringOrObject.screenshot,
                meta: stringOrObject.meta,
                links: stringOrObject.links,
              }
            )
          );
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

    if (this._isBlacklistedPath()) return false;

    if (options.options.whitelistPaths && !this._isWhitelistedPath())
      return false;

    if (options.options.shouldPrerender) {
      return options.options.shouldPrerender(this.req);
    } else {
      return this._prerenderableUserAgent();
    }
  }

  _createHeaders() {
    let h = {
      "User-Agent": "prerender-cloud-nodejs-middleware",
      "accept-encoding": "gzip",
    };

    if (this.req.headers["user-agent"])
      Object.assign(h, {
        "X-Original-User-Agent": this.req.headers["user-agent"],
      });

    let token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

    if (token) Object.assign(h, { "X-Prerender-Token": token });

    if (options.options.removeScriptTags)
      Object.assign(h, { "Prerender-Remove-Script-Tags": true });

    if (options.options.removeTrailingSlash)
      Object.assign(h, { "Prerender-Remove-Trailing-Slash": true });

    if (options.options.metaOnly && options.options.metaOnly(this.req))
      Object.assign(h, { "Prerender-Meta-Only": true });

    if (
      options.options.followRedirects &&
      options.options.followRedirects(this.req)
    )
      Object.assign(h, { "Prerender-Follow-Redirects": true });

    if (options.options.serverCacheDurationSeconds) {
      const duration = options.options.serverCacheDurationSeconds(this.req);
      if (duration != null) {
        Object.assign(h, { "Prerender-Cache-Duration": duration });
      }
    }

    if (options.options.deviceWidth) {
      const deviceWidth = options.options.deviceWidth(this.req);
      if (deviceWidth != null && typeof deviceWidth === "number") {
        Object.assign(h, { "Prerender-Device-Width": deviceWidth });
      }
    }

    if (options.options.deviceHeight) {
      const deviceHeight = options.options.deviceHeight(this.req);
      if (deviceHeight != null && typeof deviceHeight === "number") {
        Object.assign(h, { "Prerender-Device-Height": deviceHeight });
      }
    }

    if (options.options.waitExtraLong)
      Object.assign(h, { "Prerender-Wait-Extra-Long": true });

    if (options.options.disableServerCache) Object.assign(h, { noCache: true });
    if (options.options.disableAjaxBypass)
      Object.assign(h, { "Prerender-Disable-Ajax-Bypass": true });
    if (options.options.disableAjaxPreload)
      Object.assign(h, { "Prerender-Disable-Ajax-Preload": true });
    if (options.options.disableHeadDedupe)
      Object.assign(h, { "Prerender-Disable-Head-Dedupe": true });

    if (
      options.options.withScreenshot &&
      options.options.withScreenshot(this.req)
    )
      Object.assign(h, { "Prerender-With-Screenshot": true });

    if (options.options.withMetadata && options.options.withMetadata(this.req))
      Object.assign(h, { "Prerender-With-Metadata": true });

    if (this._hasOriginHeaderWhitelist()) {
      options.options.originHeaderWhitelist.forEach((_h) => {
        if (this.req.headers[_h])
          Object.assign(h, { [_h]: this.req.headers[_h] });
      });

      Object.assign(h, {
        "Origin-Header-Whitelist":
          options.options.originHeaderWhitelist.join(" "),
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
    return getRenderUrl(null, this.url.requestedUrl);
  }

  _alreadyPrerendered() {
    return !!this.req.headers["x-prerendered"];
  }

  _prerenderableExtension() {
    return this.url.hasHtmlPath;
  }

  _isPrerenderCloudUserAgent() {
    let reqUserAgent = this.req.headers["user-agent"];

    if (!reqUserAgent) return false;

    reqUserAgent = reqUserAgent.toLowerCase();

    return reqUserAgent.match(/prerendercloud/i);
  }

  _isWhitelistedPath() {
    const paths = options.options.whitelistPaths(this.req);

    if (paths && Array.isArray(paths)) {
      if (paths.length === 0) {
        return true;
      }

      return paths.some((path) => {
        if (path instanceof RegExp) {
          return path.test(this.req.url);
        } else {
          return path === this.req.url;
        }

        return false;
      });
    }

    return true;
  }

  _isBlacklistedPath() {
    if (options.options.blacklistPaths) {
      const paths = options.options.blacklistPaths(this.req);

      if (paths && Array.isArray(paths)) {
        return paths.some((path) => {
          if (path === this.req.url) return true;

          if (path.endsWith("*")) {
            const starIndex = path.indexOf("*");
            const pathSlice = path.slice(0, starIndex);

            if (this.req.url.startsWith(pathSlice)) return true;
          }

          return false;
        });
      }
    }

    return false;
  }

  _prerenderableUserAgent() {
    const reqUserAgent = this.req.headers["user-agent"];

    if (!reqUserAgent) return false;

    if (options.options.whitelistUserAgents)
      return options.options.whitelistUserAgents.some((enabledUserAgent) =>
        reqUserAgent.includes(enabledUserAgent)
      );

    if (!options.options.botsOnly) return true;

    // bots only
    return userAgentIsBotFromList(
      this.botsOnlyList,
      this.req.headers,
      this.url.original
    );
  }
}

Prerender.middleware.set = options.set.bind(options, Prerender.middleware);
// Prerender.middleware.cache =
Object.defineProperty(Prerender.middleware, "cache", {
  get: function () {
    return middlewareCacheSingleton.instance;
  },
});

function validateOption(option, value) {
  const isValidType = validateOptionType(value, option.openApiType);

  if (!isValidType) {
    return false;
  }

  if (option.min != null && value < option.min) {
    return false;
  }

  if (option.max !== null && value > option.max) {
    return false;
  }

  // Check if openApiEnum is present and validate against it
  if (option.openApiEnum !== undefined && Array.isArray(option.openApiEnum)) {
    let _value = value;
    if (_value === "jpg") {
      _value = "jpeg";
    }
    if (!option.openApiEnum.includes(_value)) {
      return false;
    }
  }

  return true;
}

function validateOptionType(value, openApiType) {
  switch (openApiType) {
    case "integer":
      return Number.isInteger(value);
    case "float":
      return typeof value === "number" && !isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    default:
      // return valid if no type was defined
      return true;
  }
}

const assignHeaders = (jobType, headers, params = {}) => {
  const jobOptions = apiOptions[jobType];

  if (!jobOptions) {
    throw new Error(`unknown job type: ${jobType}`);
  }

  Object.keys(params).forEach((param) => {
    const option = jobOptions[param];

    if (option) {
      if (!validateOption(option, params[param])) {
        console.error(`Error: invalid value for ${param}`);
        console.error(`Option details:`, option);
        throw new Error(`invalid value for ${param}: ${params[param]}`);
      }

      headers[option.httpName] = params[param];
    } else {
      console.error(`Error: unknown param: ${param} for job type ${jobType}`);
      console.error("maybe you meant one of these", Object.keys(jobOptions));
      throw new Error(`unknown param: ${param}`);
    }
  });
};

const screenshotAndPdf = (action, url, params = {}) => {
  const headers = {};

  const token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

  if (token) Object.assign(headers, { "X-Prerender-Token": token });

  assignHeaders(action.toUpperCase(), headers, params);

  // console.log({ url: getRenderUrl(action, url), headers });

  return got(getRenderUrl(action, url), {
    encoding: null,
    headers,
    retries: options.options.retries,
  }).then((res) => res.body);
};

Prerender.middleware.screenshot = screenshotAndPdf.bind(
  undefined,
  "screenshot"
);
Prerender.middleware.pdf = screenshotAndPdf.bind(undefined, "pdf");
Prerender.middleware.prerender = function (url, params) {
  const headers = {};

  const token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

  if (token) Object.assign(headers, { "X-Prerender-Token": token });

  return got(getRenderUrl(null, url), {
    encoding: null,
    headers,
    retries: options.options.retries,
  }).then((res) => res.body);
};

Prerender.middleware.botsOnlyList = botsOnlyList;
Prerender.middleware.userAgentIsBot = userAgentIsBot;

Prerender.middleware.util = util;

// for testing only
Prerender.middleware.resetOptions = options.reset.bind(options);
Prerender.middleware.Options = Options;

// expose got for serverless functions needing http get lib
// in the future this should become a fetch interface so
// the client could inject a global fetch made available by the runtime
// this is deliberately undocumented, do not use unless you are prepared to
// replace on subsequent updates
Prerender.middleware._got = got;

module.exports = Prerender.middleware;
