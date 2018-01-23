const querystring = require("querystring");
const util = require("./util");
const stdliburl = require("url");

// http, connect, and express compatible URL parser
class Url {
  static parse(req, options) {
    const obj = new this(req, options);

    return {
      host: obj.host(),
      original: obj.original(),
      path: obj.path(),
      query: obj.query(),
      basename: obj.basename(),
      hasHtmlPath: obj.hasHtmlPath(),
      requestedPath: obj.requestedPath(),
      requestedUrl: obj.requestedUrl()
    };
  }

  constructor(req, options) {
    if (!req) throw new Error("missing req obj");
    this.req = req;
    this.options = options;
    const url = this.req.originalUrl;
    if (url) {
      this.parsed = stdliburl.parse(url, true); // true for 2nd argument means parse query params
    }
  }

  protocol() {
    if (this.options.options.protocol)
      return this.options.options.protocol + ":";

    // http://stackoverflow.com/a/10353248
    // https://github.com/expressjs/express/blob/3c54220a3495a7a2cdf580c3289ee37e835c0190/lib/request.js#L301
    let protocol =
      this.req.connection && this.req.connection.encrypted ? "https" : "http";

    if (this.req.headers && this.req.headers["cf-visitor"]) {
      const cfVisitorMatch = this.req.headers["cf-visitor"].match(
        /"scheme":"(https|http)"/
      );
      if (cfVisitorMatch) protocol = cfVisitorMatch[1];
    }

    let xForwardedProto =
      this.req.headers && this.req.headers["x-forwarded-proto"];
    if (xForwardedProto) {
      xForwardedProto = xForwardedProto.split(",")[0];
      const xForwardedProtoMatch = xForwardedProto.match(/(https|http)/);
      if (xForwardedProtoMatch) protocol = xForwardedProtoMatch[1];
    }

    return protocol + ":";
  }

  host() {
    if (this.options.options.host) return this.options.options.host;
    return this.req.headers && this.req.headers.host;
  }

  original() {
    return this.req.originalUrl;
  }

  path() {
    // in express, this is the same as req.path
    return this.parsed && this.parsed.pathname;
  }

  // returns {a:b, c:d} if query string exists, else null
  query() {
    // in express, req.query will return key/val object
    // parsed.query returns string: a=b&c=d
    return this.parsed && this.parsed.query;
  }

  // if the path is /admin/new.html, this returns /new.html
  basename() {
    return (
      "/" +
        (this.original() &&
          this.original()
            .split("/")
            .pop()) || ""
    );
  }

  hasHtmlPath() {
    return util.urlPathIsHtml(this.basename());
  }

  requestedPath() {
    if (this.options.options.whitelistQueryParams) {
      const whitelistedQueryParams = this.options.options.whitelistQueryParams(
        this.req
      );

      if (whitelistedQueryParams != null) {
        const queryParams = Object.assign({}, this.query());

        Object.keys(queryParams).forEach(key => {
          if (!whitelistedQueryParams.includes(key)) {
            delete queryParams[key];
          }
        });

        const whitelistedQueryString =
          (Object.keys(queryParams).length ? "?" : "") +
          querystring.stringify(queryParams);

        return this.path() + whitelistedQueryString;
      }
    }

    return this.original();
  }

  requestedUrl() {
    return this.protocol() + "//" + this.host() + this.requestedPath();
  }
}

module.exports = Url;
