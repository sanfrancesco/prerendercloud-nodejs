const LRU = require("lru-cache");

class MiddlewareCache {
  constructor(lruCache) {
    this.lruCache = lruCache;
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

  reset() {
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
      "bubbleUp5xxErrors",
      "enableMiddlewareCache",
      "middlewareCacheMaxBytes",
      "middlewareCacheMaxAge",
      "shouldPrerender",
      "removeScriptTags",
      "removeTrailingSlash",
      "protocol",
      "retries",
      "host",
      "waitExtraLong"
    ];
  }

  set(prerenderMiddleware, name, val) {
    if (!Options.validOptions.includes(name))
      throw new Error(`${name} is unsupported option`);

    this.options[name] = val;

    if (name === "enableMiddlewareCache" && val === false) {
      this.middlewareCacheSingleton.instance = undefined;
    } else if (name.match(/middlewareCache/i)) {
      let lruCache = LRU({
        max: this.options.middlewareCacheMaxBytes || 500000000, // 500MB
        length: function(n, key) {
          return n.length;
        },
        dispose: function(key, n) {},
        maxAge: this.options.middlewareCacheMaxAge || 0 // 0 is forever
      });

      configureMiddlewareCache(this.middlewareCacheSingleton, lruCache);
    }

    if (this.options["botsOnly"] && this.options["whitelistUserAgents"])
      throw new Error("Can't use both botsOnly and whitelistUserAgents");

    return prerenderMiddleware;
  }
};
