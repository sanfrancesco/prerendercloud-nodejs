var request = require('request');
var debug = require('debug')('prerendercloud');
var LRU = require('lru-cache');
var middlewareCache = null;

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
    if (!startsWith) throw new Error('must pass what cache key startsWith');

    this.lruCache.forEach(function(v, k, cache) {
      if (k.startsWith(startsWith)) cache.del(k);
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
      'prerenderServiceUrl',
      'prerenderToken',
      'disableServerCache',
      'enableMiddlewareCache',
      'middlewareCacheMaxBytes',
      'middlewareCacheMaxAge'
    ];
  }

  set(prerenderMiddleware, name, val) {
    if (!Options.validOptions.includes(name)) throw new Error(`${name} is unsupported option`);

    this.options[name] = val;

    if (name.match(/middlewareCache/i)) {
      let lruCache = LRU({
        max: this.options.middlewareCacheMaxBytes || 500000000, // 500MB
        length: function (n, key) { return n.length; },
        dispose: function (key, n) { },
        maxAge: this.options.middlewareCacheMaxAge || 0 // 0 is forever
      });
      middlewareCache = new MiddlewareCache(lruCache);
    }

    if (name === 'enableMiddlewareCache' === false) middlewareCache = undefined;

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
    return this.req.connection && this.req.connection.encrypted ? 'https:' : 'http:';
  }

  get host() { return this.req.headers.host; }

  get path() { return this.req.originalUrl; }

  // if the path is /admin/new.html, this returns /new.html
  get basename() { return '/' + this.req.originalUrl.split('/').pop(); }
}

const handleSkip = (msg, next) => {
  debug(msg);
  console.error('prerendercloud middleware SKIPPED:', msg);
  return next();
}

class Prerender {
  constructor(req) {
    this.req = req;
    this.url = new Url(req);
  }

  // fulfills promise when service.prerender.cloud response is: 2xx, 4xx
  // rejects promise when request lib errors or service.prerender.cloud response is: 5xx
  get() {
    let url = this._createApiRequestUrl();
    let headers = this._createHeaders();
    let gzip = true;
    debug('prerendering:', url, headers);

    return new Promise((res, rej) => {
      request({ url, headers, gzip }, (error, response, body) => {
        if (error || response.statusCode === 500) {
          if (error) return rej(error);

          return rej(new Error(body && body.substring(0,300) || 'server error'));
        } else {
          const data = {
            headers: {
              'content-type': response.headers['content-type']
            },
            statusCode: response.statusCode,
            body
          };

          if (options.options.enableMiddlewareCache && `${response.statusCode}`.startsWith('2') && body && body.length) middlewareCache.set(this._requestedUrl(), data);

          return res(data);
        }
      })
    });
  }

  // data looks like { statusCode, headers, body }
  writeHttpResponse(res, next, data) {
    if (data.statusCode === 400) {
      res.statusCode = 400;
      return res.end(`service.prerender.cloud can't prerender this page due to user error: ${data.body}`);
    } else if (data.statusCode === 429) {
      return handleSkip('rate limited due to free tier', next);
    } else {
      res.writeHead(data.statusCode, data.headers);
      return res.end(data.body);
    }
  }

  static middleware(req, res, next) {
    const prerender = new Prerender(req);

    if (!prerender._shouldPrerender()) {
      debug('NOT prerendering', req.originalUrl, req.headers);
      return next();
    }

    if (options.options.enableMiddlewareCache) {
      const cached = middlewareCache.get(prerender._requestedUrl());
      if (cached) {
        debug('returning cache', req.originalUrl, req.headers);
        return prerender.writeHttpResponse(res, next, cached);
      }
    }

    prerender.get()
        .then(function(data) {
          return prerender.writeHttpResponse(res, next, data);
        })
        .catch(function(error) {
          return handleSkip(`server error: ${error && error.message}`, next);
        });
  }

  _shouldPrerender() {
    if (!(this.req && this.req.headers)) return false;

    return !this._alreadyPrerendered() && this._prerenderableUserAgent() && this._prerenderableExtension();
  }

  _createHeaders() {
    let h = {
      'user-agent': 'prerender-cloud-nodejs-middleware',
      'x-original-user-agent': this.req.headers['user-agent']
    };

    let token = options.options.prerenderToken || process.env.PRERENDER_TOKEN;

    if (token) Object.assign(h, {'X-Prerender-Token': token});

    // disable prerender.cloud caching
    if (options.options.disableServerCache) Object.assign(h, {noCache: true});

    return h;
  }

  _createApiRequestUrl() {
    return this._serviceUrl().replace(/\/+$/, '') + '/' + this._requestedUrl();
  }

  _serviceUrl() {
    return options.options.prerenderServiceUrl || process.env.PRERENDER_SERVICE_URL || 'https://service.prerender.cloud'
  }

  _alreadyPrerendered() {
    return !!this.req.headers['x-prerendered'];
  }

  _prerenderableExtension() {
    return !!this.url.basename.match(/^(([^.]|\.html?)+)$/);
  }

  _prerenderableUserAgent() {
    let reqUserAgent = this.req.headers['user-agent'];

    if (!reqUserAgent) return false;

    reqUserAgent = reqUserAgent.toLowerCase();

    if (reqUserAgent.match(/prerendercloud/i)) return false;

    return true;
  }

  _requestedUrl() {
    return this.url.protocol + '//' + this.url.host + this.url.path;
  }
}

Prerender.middleware.set = options.set.bind(options, Prerender.middleware);
// Prerender.middleware.cache =
Object.defineProperty(Prerender.middleware, 'cache', {
  get: function() { return middlewareCache; }
})

// for testing only
Prerender.middleware.resetOptions = options.reset.bind(options);

module.exports = Prerender.middleware;