const stdliburl = require("url");
const nock = require("nock");

var prerenderMiddleware;
if (!!process.env.CI) {
  console.log("running transpiled code");
  prerenderMiddleware = require("../../distribution/index");
} else {
  prerenderMiddleware = require("../../source/index");
}

global.withNock = function() {
  afterEach(function() {
    nock.cleanAll();
  });
  beforeEach(function() {
    nock.disableNetConnect();
  });
};

global.withPrerenderMiddleware = function() {
  beforeEach(function() {
    this.prerenderMiddleware = prerenderMiddleware;
    this.prerenderMiddleware.resetOptions();
  });
};

global.withHttpMiddlewareMocks = function() {
  withPrerenderMiddleware();
  beforeEach(function() {
    this.req = {};
    this.res = {
      writeHead: jasmine.createSpy("writeHead"),
      getHeader: jasmine.createSpy("getHeader"),
      setHeader: jasmine.createSpy("setHeader")
    };
    this.prerenderMiddleware.cache && this.prerenderMiddleware.cache.reset();
    this.callPrerenderMiddleware = function(done, options) {
      if (!done) done = () => {};
      if (!options) options = {};
      this.prerenderMiddleware.set("waitExtraLong", options.waitExtraLong);
      this.prerenderMiddleware.set("host", options.host);
      this.prerenderMiddleware.set("protocol", options.protocol);
      this.prerenderMiddleware.set(
        "removeTrailingSlash",
        !!options.removeTrailingSlash
      );
      this.prerenderMiddleware.set(
        "removeScriptTags",
        !!options.removeScriptTags
      );
      this.prerenderMiddleware.set(
        "disableAjaxBypass",
        !!options.disableAjaxBypass
      );
      this.prerenderMiddleware.set(
        "disableAjaxPreload",
        !!options.disableAjaxPreload
      );
      this.prerenderMiddleware.set(
        "disableServerCache",
        !!options.disableServerCache
      );
      this.prerenderMiddleware.set(
        "enableMiddlewareCache",
        !!options.enableMiddlewareCache
      );
      this.prerenderMiddleware.set("botsOnly", !!options.botsOnly);
      this.prerenderMiddleware.set(
        "bubbleUp5xxErrors",
        options.bubbleUp5xxErrors
      );
      this.prerenderMiddleware.set(
        "whitelistUserAgents",
        options.whitelistUserAgents
      );
      this.prerenderMiddleware.set(
        "originHeaderWhitelist",
        options.originHeaderWhitelist
      );
      this.prerenderMiddleware.set("withScreenshot", options.withScreenshot);
      this.prerenderMiddleware.set("beforeRender", options.beforeRender);
      this.prerenderMiddleware.set(
        "afterRenderBlocking",
        options.afterRenderBlocking
      );
      this.prerenderMiddleware.set("afterRender", options.afterRender);
      this.prerenderMiddleware.set("shouldPrerender", options.shouldPrerender);
      this.prerenderMiddleware.set(
        "whitelistQueryParams",
        options.whitelistQueryParams
      );

      if (options.timeout) {
        this.prerenderMiddleware.set("timeout", options.timeout);
      }

      if (options.retries != null) {
        this.prerenderMiddleware.set("retries", options.retries);
      }

      this.prerenderMiddleware.set("throttleOnFail", options.throttleOnFail);

      this.next = jasmine.createSpy("nextMiddleware").and.callFake(done);
      this.res.end = jasmine.createSpy("end").and.callFake(done);
      if (this.req._requestedUrl) {
        parsed = stdliburl.parse(this.req._requestedUrl);
        // connect only has: req.headers.host (which includes port), req.url and req.originalUrl
        // express has .protocol and .path but we're optimizing for connect
        this.req.headers["host"] = parsed.host;
        this.req.url = parsed.path;
        this.req.originalUrl = parsed.path;
        this.req.method = options.method || "GET";
      }

      this.prerenderMiddleware(this.req, this.res, this.next);
    }.bind(this);
  });
};
