var request = require('request');
var debug = require('debug')('prerendercloud');

class Options {
  constructor() {
    this.options = {};
  }

  static get validOptions() {
    return ['prerenderServiceUrl', 'prerenderToken'];
  }

  set(prerenderMiddleware, name, val) {
    if (!Options.validOptions.includes(name)) throw new Error(`${name} is unsupported option`);

    this.options[name] = val;
    return prerenderMiddleware;
  }
}

var options = new Options();

const userAgentsToPrerender = [
  'googlebot',
  'yahoo',
  'bingbot',
  'baiduspider',
  'facebookexternalhit',
  'twitterbot',
  'rogerbot',
  'linkedinbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest/0.',
  'developers.google.com/+/web/snippet',
  'slackbot',
  'vkShare',
  'W3C_Validator',
  'redditbot',
  'Applebot',
  'WhatsApp',
  'flipboard',
  'tumblr',
  'bitlybot'
];

const extensionsToIgnore = [
  '.js',
  '.css',
  '.xml',
  '.less',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.pdf',
  '.doc',
  '.txt',
  '.ico',
  '.rss',
  '.zip',
  '.mp3',
  '.rar',
  '.exe',
  '.wmv',
  '.doc',
  '.avi',
  '.ppt',
  '.mpg',
  '.mpeg',
  '.tif',
  '.wav',
  '.mov',
  '.psd',
  '.ai',
  '.xls',
  '.mp4',
  '.m4a',
  '.swf',
  '.dat',
  '.dmg',
  '.iso',
  '.flv',
  '.m4v',
  '.torrent',
  '.woff',
  '.ttf',
  '.svg'
];

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
      debug('NOT prerendering', req.originalUrl, req.headers && req.headers['user-agent']);
      return next();
    }

    let url = prerender._createApiRequestUrl();
    let headers = prerender._createHeaders();
    let gzip = !!(req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/gzip/i));
    debug('prerendering:', url, req.headers['user-agent'], headers);

    request({ url, headers, gzip }, (error, response, body) => {
      if (error) return handleSkip(`server error: ${error.message}`, next);

      if (response.statusCode === 400) {
        res.statusCode = 400;
        return res.end(`service.prerender.cloud can't prerender this page due to user error: ${body}`);
      } else if (response.statusCode === 429) {
        return handleSkip('rate limited due to free tier', next);
      } else {
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

    let token = this.prerenderToken || process.env.PRERENDER_TOKEN;

    if (token) Object.assign(h, {'X-Prerender-Token': token});

    return h;
  }

  _createApiRequestUrl() {
    return this._serviceUrl().replace(/\/+$/, '') + '/' + this._requestedUrl();
  }

  _serviceUrl() {
    return this.prerenderServiceUrl || process.env.PRERENDER_SERVICE_URL || 'http://service.prerender.cloud'
  }

  _alreadyPrerendered() {
    return !!this.req.headers['x-prerendered'];
  }

  _prerenderableExtension() {
    return !extensionsToIgnore.some( blockedExtension => this.url.basename.includes(blockedExtension));
  }

  _prerenderableUserAgent() {
    if (this.req.headers['x-bufferbot']) return true;

    let reqUserAgent = this.req.headers['user-agent'];

    if (!reqUserAgent) return false;

    reqUserAgent = new RegExp(reqUserAgent, 'i');
    return userAgentsToPrerender.some( enabledUserAgent => enabledUserAgent.match(reqUserAgent));
  }

  _requestedUrl() {
    return this.url.protocol + '//' + this.url.host + this.url.path;
  }
}

Prerender.middleware.set = options.set.bind(options, Prerender.middleware);

module.exports = Prerender.middleware;