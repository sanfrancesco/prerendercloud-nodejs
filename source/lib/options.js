const LRUCache = require("lru-cache");
const util = require("./util");

class MiddlewareCache {
  constructor(lruCache) {
    this.lruCache = lruCache;
  }
  reset() {
    this.lruCache.clear();
  }
  clear(startsWith) {
    if (!startsWith) throw new Error("must pass what cache key startsWith");

    startsWith = startsWith.replace(/^https?/, "");
    let httpPath = `http${startsWith}`;
    let httpsPath = `https${startsWith}`;

    this.lruCache.forEach(function (v, k, cache) {
      if (k.startsWith(httpPath) || k.startsWith(httpsPath)) cache.delete(k);
    });
  }
  set(url, res) {
    this.lruCache.set(url, res);
  }
  get(url) {
    return this.lruCache.get(url);
  }
}

let THROTTLED_URLS = {};

const configureMiddlewareCache = (middlewareCacheSingleton, lruCache) => {
  // this prevCache dump/load is just for tests
  const prevCache =
    middlewareCacheSingleton.instance &&
    middlewareCacheSingleton.instance.lruCache.dump();
  if (prevCache) lruCache.load(prevCache);

  middlewareCacheSingleton.instance = new MiddlewareCache(lruCache);
};

module.exports = class Options {
  constructor(middlewareCacheSingleton) {
    this.middlewareCacheSingleton = middlewareCacheSingleton;
    this.reset();
  }

  recordFail(url) {
    THROTTLED_URLS[url] = new Date();
    setTimeout(function () {
      THROTTLED_URLS[url] = undefined;
      delete THROTTLED_URLS[url];
    }, 5 * 60 * 1000);
  }

  isThrottled(url) {
    if (!this.options.throttleOnFail) return false;
    return !!THROTTLED_URLS[url];
  }

  reset() {
    THROTTLED_URLS = {};
    this.options = { retries: 1 };
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
      "disableHeadDedupe",
      "bubbleUp5xxErrors",
      "enableMiddlewareCache",
      "middlewareCacheMaxBytes",
      "middlewareCacheMaxAge",
      "whitelistQueryParams",
      "shouldPrerender",
      "shouldPrerenderAdditionalCheck",
      "removeScriptTags",
      "removeTrailingSlash",
      "protocol",
      "retries",
      "host",
      "waitExtraLong",
      "throttleOnFail",
      "withScreenshot",
      "afterRenderBlocking",
      "blacklistPaths",
      "whitelistPaths",
      "metaOnly",
      "withMetadata",
      "followRedirects",
      "serverCacheDurationSeconds",
      "deviceWidth",
      "deviceHeight",
    ];
  }

  set(prerenderMiddleware, name, val) {
    if (!Options.validOptions.includes(name))
      throw new Error(`${name} is unsupported option`);

    this.options[name] = val;

    if (name === "enableMiddlewareCache" && val === false) {
      this.middlewareCacheSingleton.instance = undefined;
    } else if (name.match(/middlewareCache/i)) {
      const lruCache = new LRUCache({
        maxSize: this.options.middlewareCacheMaxBytes || 500000000, // 500MB
        sizeCalculation: function (n, key) {
          if (n && n.body) {
            return n.body.length;
          } else if (n.length) {
            return n.length;
          }

          return 1;
        },
        dispose: function (key, n) {},
        ttl: this.options.middlewareCacheMaxAge || 0, // 0 is forever
      });

      configureMiddlewareCache(this.middlewareCacheSingleton, lruCache);
    } else if (
      name === "whitelistQueryParams" ||
      name === "withScreenshot" ||
      name === "afterRenderBlocking" ||
      name === "blacklistPaths" ||
      name === "whitelistPaths" ||
      name === "metaOnly" ||
      name === "withMetadata"
    ) {
      if (val != null && !util.isFunction(val)) {
        throw new Error(`${name} must be a function`);
      }
    }

    if (this.options["botsOnly"] && this.options["whitelistUserAgents"])
      throw new Error("Can't use both botsOnly and whitelistUserAgents");

    return prerenderMiddleware;
  }
};
