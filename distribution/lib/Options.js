"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var LRU = require("lru-cache");

var MiddlewareCache = function () {
  function MiddlewareCache(lruCache) {
    _classCallCheck(this, MiddlewareCache);

    this.lruCache = lruCache;
  }

  _createClass(MiddlewareCache, [{
    key: "reset",
    value: function reset() {
      this.lruCache.reset();
    }
  }, {
    key: "clear",
    value: function clear(startsWith) {
      if (!startsWith) throw new Error("must pass what cache key startsWith");

      startsWith = startsWith.replace(/^https?/, "");
      var httpPath = "http" + startsWith;
      var httpsPath = "https" + startsWith;

      this.lruCache.forEach(function (v, k, cache) {
        if (k.startsWith(httpPath) || k.startsWith(httpsPath)) cache.del(k);
      });
    }
  }, {
    key: "set",
    value: function set(url, res) {
      this.lruCache.set(url, res);
    }
  }, {
    key: "get",
    value: function get(url) {
      return this.lruCache.get(url);
    }
  }]);

  return MiddlewareCache;
}();

var configureMiddlewareCache = function configureMiddlewareCache(middlewareCacheSingleton, lruCache) {
  // this prevCache dump/load is just for tests
  var prevCache = middlewareCacheSingleton.instance && middlewareCacheSingleton.instance.lruCache.dump();
  if (prevCache) lruCache.load(prevCache);

  middlewareCacheSingleton.instance = new MiddlewareCache(lruCache);
};

module.exports = function () {
  function Options(middlewareCacheSingleton) {
    _classCallCheck(this, Options);

    this.middlewareCacheSingleton = middlewareCacheSingleton;
    this.reset();
  }

  _createClass(Options, [{
    key: "reset",
    value: function reset() {
      this.options = { retries: 1 };
    }
  }, {
    key: "set",
    value: function set(prerenderMiddleware, name, val) {
      if (!Options.validOptions.includes(name)) throw new Error(name + " is unsupported option");

      this.options[name] = val;

      if (name === "enableMiddlewareCache" && val === false) {
        this.middlewareCacheSingleton.instance = undefined;
      } else if (name.match(/middlewareCache/i)) {
        var lruCache = LRU({
          max: this.options.middlewareCacheMaxBytes || 500000000, // 500MB
          length: function length(n, key) {
            return n.length;
          },
          dispose: function dispose(key, n) {},
          maxAge: this.options.middlewareCacheMaxAge || 0 // 0 is forever
        });

        configureMiddlewareCache(this.middlewareCacheSingleton, lruCache);
      }

      if (this.options["botsOnly"] && this.options["whitelistUserAgents"]) throw new Error("Can't use both botsOnly and whitelistUserAgents");

      return prerenderMiddleware;
    }
  }], [{
    key: "validOptions",
    get: function get() {
      return ["timeout", "prerenderServiceUrl", "prerenderToken", "beforeRender", "afterRender", "whitelistUserAgents", "originHeaderWhitelist", "botsOnly", "disableServerCache", "disableAjaxBypass", "disableAjaxPreload", "bubbleUp5xxErrors", "enableMiddlewareCache", "middlewareCacheMaxBytes", "middlewareCacheMaxAge", "ignoreQuery", "shouldPrerender", "removeScriptTags", "removeTrailingSlash", "protocol", "retries"];
    }
  }]);

  return Options;
}();