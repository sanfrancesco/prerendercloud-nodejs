var request = require('request');
var debug = require('debug')('prerendercloud');

class Options {
  constructor() {
    this.options = {};
  }

  static get validOptions() {
    return ['prerenderServiceUrl', 'prerenderToken', 'noCache'];
  }

  set(prerenderMiddleware, name, val) {
    if (!Options.validOptions.includes(name)) throw new Error(`${name} is unsupported option`);

    this.options[name] = val;
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

  static middleware(req, res, next) {
    const prerender = new Prerender(req);

    if (!prerender._shouldPrerender()) {
      debug('NOT prerendering', req.originalUrl, req.headers);
      return next();
    }

    let url = prerender._createApiRequestUrl();
    let headers = prerender._createHeaders();
    let gzip = true;
    debug('prerendering:', url, headers);

    request({ url, headers, gzip }, (error, response, body) => {
      if (error || response.statusCode === 500) return handleSkip(`server error: ${error && error.message || body && body.substring(0,300)}`, next);

      if (response.statusCode === 400) {
        res.statusCode = 400;
        return res.end(`service.prerender.cloud can't prerender this page due to user error: ${body}`);
      } else if (response.statusCode === 429) {
        return handleSkip('rate limited due to free tier', next);
      } else {
        let headers = {
          'content-type': response.headers['content-type']
        }
        res.writeHead(response.statusCode, headers);
        return res.end(body);
      }
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

    let token = options.prerenderToken || process.env.PRERENDER_TOKEN;

    if (token) Object.assign(h, {'X-Prerender-Token': token});

    // prevent prerender.cloud caching
    if (options.noCache) Object.assign(h, {noCache: true});

    return h;
  }

  _createApiRequestUrl() {
    return this._serviceUrl().replace(/\/+$/, '') + '/' + this._requestedUrl();
  }

  _serviceUrl() {
    return options.prerenderServiceUrl || process.env.PRERENDER_SERVICE_URL || 'https://service.prerender.cloud'
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

module.exports = Prerender.middleware;