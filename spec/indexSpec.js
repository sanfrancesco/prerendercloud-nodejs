var prerenderMiddleware;
if (!!process.env.CI) {
  console.log("running transpiled code");
  prerenderMiddleware = require("../distribution/index");
} else {
  prerenderMiddleware = require("../source/index");
}

const url = require("url");
const nock = require("nock");
const zlib = require("zlib");

describe("prerender middleware", function() {
  beforeEach(function() {
    nock.cleanAll();
    nock.disableNetConnect();
    this.subject = prerenderMiddleware;
    this.subject.resetOptions();
  });

  describe("set", function() {
    it("can be called twice", function() {
      expect(
        function() {
          this.subject
            .set("prerenderToken", "token")
            .set("prerenderServiceUrl", "url");
        }.bind(this)
      ).not.toThrow();
    });
    it("returns middleware", function() {
      expect(this.subject.set("prerenderToken", "token")).toEqual(this.subject);
    });
    it("throws on invalid param", function() {
      expect(
        function() {
          this.subject
            .set("prerenderToken", "token")
            .set("prerenderServiceUrl", "url");
        }.bind(this)
      ).not.toThrow();
    });
  });

  describe("middleware", function() {
    beforeEach(function() {
      this.req = {};
      this.res = {
        writeHead: jasmine.createSpy("writeHead"),
        getHeader: jasmine.createSpy("getHeader"),
        setHeader: jasmine.createSpy("setHeader")
      };
      this.subject.cache && this.subject.cache.reset();
      this.runIt = function(done, options) {
        if (!done) done = () => {};
        if (!options) options = {};
        this.subject.set("host", options.host);
        this.subject.set("protocol", options.protocol);
        this.subject.set("removeTrailingSlash", !!options.removeTrailingSlash);
        this.subject.set("removeScriptTags", !!options.removeScriptTags);
        this.subject.set("disableAjaxBypass", !!options.disableAjaxBypass);
        this.subject.set("disableAjaxPreload", !!options.disableAjaxPreload);
        this.subject.set("disableServerCache", !!options.disableServerCache);
        this.subject.set(
          "enableMiddlewareCache",
          !!options.enableMiddlewareCache
        );
        this.subject.set("botsOnly", !!options.botsOnly);
        this.subject.set("bubbleUp5xxErrors", !!options.bubbleUp5xxErrors);
        this.subject.set("whitelistUserAgents", options.whitelistUserAgents);
        this.subject.set(
          "originHeaderWhitelist",
          options.originHeaderWhitelist
        );
        this.subject.set("beforeRender", options.beforeRender);
        this.subject.set("afterRender", options.afterRender);
        this.subject.set("shouldPrerender", options.shouldPrerender);

        this.next = jasmine.createSpy("nextMiddleware").and.callFake(done);
        this.res.end = jasmine.createSpy("end").and.callFake(done);
        if (this.req._requestedUrl) {
          parsed = url.parse(this.req._requestedUrl);
          // connect only has: req.headers.host (which includes port), req.url and req.originalUrl
          // express has .protocol and .path but we're optimizing for connect
          this.req.headers["host"] = parsed.host;
          this.req.url = parsed.path;
          this.req.originalUrl = parsed.path;
          this.req.method = options.method || "GET";
        }

        this.subject(this.req, this.res, this.next);
      }.bind(this);
    });

    var itCalledNext = function() {
      it("calls next", function() {
        expect(this.next).toHaveBeenCalled();
      });
    };

    describe("invalid requirements", function() {
      describe("with empty parameters", function() {
        beforeEach(function(done) {
          this.req = {};
          this.runIt(done);
        });

        itCalledNext();
      });
      describe("with empty headers", function() {
        beforeEach(function(done) {
          this.req = { headers: {} };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe("with invalid user-agent", function() {
        beforeEach(function(done) {
          this.req = { headers: { "user-agent": "prerendercloud" } };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe("with empty user-agent", function() {
        beforeEach(function(done) {
          this.req = { headers: { "user-agent": "" } };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe("with valid user-agent and invalid extension", function() {
        beforeEach(function(done) {
          this.req = {
            headers: { "user-agent": "twitterbot" },
            _requestedUrl: "http://example.org/file.m4v"
          };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe("with valid user-agent and valid extension but already rendered", function() {
        beforeEach(function(done) {
          this.req = {
            headers: { "user-agent": "twitterbot", "x-prerendered": "true" },
            _requestedUrl: "http://example.org/file"
          };
          this.runIt(done);
        });

        itCalledNext();
      });

      describe("POST request", function() {
        beforeEach(function(done) {
          this.req = {
            headers: { "user-agent": "twitterbot" },
            _requestedUrl: "http://example.org/file"
          };
          this.runIt(done, { method: "POST" });
        });

        itCalledNext();
      });
    });

    describe("valid requirements", function() {
      beforeEach(function() {
        this.req = {
          headers: { "user-agent": "twitterbot/1.0" },
          _requestedUrl: "http://example.org/files.m4v.storage/lol"
        };
      });

      describe("when request lib returns error", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .times(2)
            .replyWithError("server error");
          this.runIt(done);
        });

        itCalledNext();
      });

      describe("when server returns error", function() {
        beforeEach(function(done) {
          const self = this;
          this.attempts = 0;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .times(2)
            .reply(() => {
              self.attempts += 1;
              return [500, "errmsg"];
            });
          this.runIt(done);
        });

        it("retries 500", function() {
          expect(this.attempts).toEqual(2);
        });
        itCalledNext();
      });

      describe("when server returns error", function() {
        beforeEach(function(done) {
          const self = this;
          this.attempts = 0;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .times(1)
            .reply(() => {
              self.attempts += 1;
              return [502, "errmsg"];
            });
          this.runIt(done);
        });

        it("does not retry 502", function() {
          expect(this.attempts).toEqual(1);
        });

        itCalledNext();
      });

      describe("when server returns rate limited", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(() => [429, "errmsg"]);
          this.runIt(done);
        });

        itCalledNext();
      });

      describe("when server returns bad request (client/user error)", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(() => [400, "errmsg"]);
          this.runIt(done);
        });

        it("returns pre-rendered body", function() {
          expect(this.res.end.calls.mostRecent().args[0]).toMatch(/user error/);
        });
      });

      describe("when server returns 404", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(() => [404, "notfound"]);
          this.runIt(done);
        });

        it("preserves 404 status-code", function() {
          expect(this.res.writeHead.calls.mostRecent().args).toEqual([404, {}]);
        });

        it("returns pre-rendered body", function() {
          expect(this.res.end.calls.mostRecent().args[0]).toEqual("notfound");
        });
      });

      describe("when server returns 301", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.uri = uri;
              return [
                301,
                "redirecting...",
                {
                  location: "http://example.com" // this header must be lowercase, otherwise got doesn't catch it (and won't redirect)
                }
              ];
            });

          this.runIt(done);
        });

        it("preserves 301 status-code and location header", function() {
          expect(this.res.writeHead.calls.mostRecent().args).toEqual([
            301,
            { location: "http://example.com" }
          ]);
        });

        it("returns pre-rendered body", function() {
          expect(this.res.end.calls.mostRecent().args[0]).toEqual(
            "redirecting..."
          );
        });
      });

      describe("https", function() {
        beforeEach(function() {
          this.req._requestedUrl = "http://example.org";
          const self = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              self.uri = uri;
              return [200, "body"];
            });
        });

        describe("req.connection.encrypted", function() {
          beforeEach(function(done) {
            this.req.connection = { encrypted: true };
            this.runIt(done);
          });

          it("uses https", function() {
            expect(this.uri).toEqual("/https://example.org/");
          });
        });

        describe("cf-visitor", function() {
          beforeEach(function(done) {
            this.req.headers["cf-visitor"] = '{"scheme":"https"}';
            this.runIt(done);
          });

          it("uses https", function() {
            expect(this.uri).toEqual("/https://example.org/");
          });
        });

        describe("x-forwarded-proto", function() {
          beforeEach(function(done) {
            this.req.headers["x-forwarded-proto"] = "https,http";
            this.runIt(done);
          });

          it("uses https", function() {
            expect(this.uri).toEqual("/https://example.org/");
          });
        });
      });

      describe("protocol option", function() {
        beforeEach(function() {
          const that = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              that.uri = uri;
              return [200, "body"];
            });
        });
        describe("disabled", function() {
          beforeEach(function(done) {
            this.runIt(done, {});
          });

          it("uses default protocol", function() {
            expect(this.uri).toEqual(
              "/http://example.org/files.m4v.storage/lol"
            );
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.runIt(done, { protocol: "https" });
          });

          it("it uses the protocol we specified", function() {
            expect(this.uri).toEqual(
              "/https://example.org/files.m4v.storage/lol"
            );
          });
        });
      });

      describe("host option", function() {
        beforeEach(function() {
          const that = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              that.uri = uri;
              return [200, "body"];
            });
        });
        describe("disabled", function() {
          beforeEach(function(done) {
            this.runIt(done, {});
          });

          it("infers host", function() {
            expect(this.uri).toEqual(
              "/http://example.org/files.m4v.storage/lol"
            );
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.runIt(done, { host: "example.com" });
          });

          it("it uses the hostl we specified", function() {
            expect(this.uri).toEqual(
              "/http://example.com/files.m4v.storage/lol"
            );
          });
        });
      });

      describe("removeTrailingSlash option", function() {
        beforeEach(function() {
          const that = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              that.headersSentToPrerenderCloud = this.req.headers;
              return [200, "body"];
            });
        });
        describe("disabled", function() {
          beforeEach(function(done) {
            this.runIt(done, { removeTrailingSlash: false });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud[
                "prerender-remove-trailing-slash"
              ]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.runIt(done, { removeTrailingSlash: true });
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud[
                "prerender-remove-trailing-slash"
              ]
            ).toEqual(true);
          });
        });
      });

      describe("removeScriptTags option", function() {
        beforeEach(function() {
          const that = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              that.headersSentToPrerenderCloud = this.req.headers;
              return [200, "body"];
            });
        });
        describe("disabled", function() {
          beforeEach(function(done) {
            this.runIt(done, { removeScriptTags: false });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-remove-script-tags"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.runIt(done, { removeScriptTags: true });
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-remove-script-tags"]
            ).toEqual(true);
          });
        });
      });

      describe("when disabling features", function() {
        beforeEach(function(done) {
          this.req._requestedUrl = `http://example.org/index.html`;
          this.headersSentToServer = {};
          var self = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              self.headersSentToServer = this.req.headers;
              return [200, "body"];
            });
          this.runIt(done, {
            disableAjaxBypass: true,
            disableAjaxPreload: true,
            disableServerCache: true
          });
        });
        it("sets prerender-disable-ajax-bypass header", function() {
          expect(
            this.headersSentToServer["prerender-disable-ajax-bypass"]
          ).toEqual(true);
        });
        it("sets prerender-disable-ajax-preload header", function() {
          expect(
            this.headersSentToServer["prerender-disable-ajax-preload"]
          ).toEqual(true);
        });
        it("sets noCache header", function() {
          expect(this.headersSentToServer["nocache"]).toEqual(true);
        });
      });

      [
        "/",
        "/index",
        "/index.htm",
        "/index.html",
        "index.bak.html",
        "/path-with-trailing-slash/"
      ].forEach(function(basename) {
        describe("when server returns success", function() {
          beforeEach(function(done) {
            this.req._requestedUrl = `http://example.org/files.m4v.storage${basename}`;
            this.prerenderServer = nock("https://service.prerender.cloud")
              .get(/.*/)
              .reply(uri => {
                this.uri = uri;
                return [
                  202,
                  "pre-rendered body",
                  {
                    someHeader: "someHeaderValue",
                    "content-type": "text/html; charset=utf-8"
                  }
                ];
              });
            this.runIt(done);
          });

          it("requests correct path", function() {
            expect(this.uri).toBe(
              `/http://example.org/files.m4v.storage${basename}`
            );
          });
          it("returns pre-rendered status and only the content-type header", function() {
            expect(this.res.writeHead).toHaveBeenCalledWith(202, {
              "content-type": "text/html; charset=utf-8"
            });
          });
          it("returns pre-rendered body", function() {
            expect(this.res.end).toHaveBeenCalledWith("pre-rendered body");
          });
        });
      });

      describe("with accept-encoding gzip", function() {
        beforeEach(function(done) {
          this.req.headers["accept-encoding"] = "gzip";
          this.req._requestedUrl = `http://example.org/`;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.uri = uri;
              return [
                202,
                "pre-rendered body",
                {
                  someHeader: "someHeaderValue",
                  "content-type": "text/html; charset=utf-8"
                }
              ];
            });
          this.runIt(done);
        });

        it("returns includes content-encoding in header", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(202, {
            "content-type": "text/html; charset=utf-8",
            "content-encoding": "gzip"
          });
        });
        it("returns gzipped body", function() {
          expect(this.res.end).toHaveBeenCalledWith(
            zlib.gzipSync("pre-rendered body")
          );
        });
      });

      describe("concurrent requests", function() {
        beforeEach(function(done) {
          this.requestCount = 0;
          this.req._requestedUrl = `http://example.org/`;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.uri = uri;
              this.requestCount += 1;
              return [200, "body", { "content-type": "text/plain" }];
            });
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.requestCount += 1;
              return [200, "body2", { "content-type": "text/html" }];
            });
          var callCounter = 0;
          const _done = () => {
            callCounter += 1;
            if (callCounter === 2) done();
          };
          this.runIt(_done, { enableMiddlewareCache: false });
          this.runIt(_done, { enableMiddlewareCache: false });
        });
        it("only makes 1 request", function() {
          expect(this.requestCount).toBe(1);
        });
        it("returns body from first request", function() {
          expect(this.res.end.calls.argsFor(0)).toEqual(["body"]);
          expect(this.res.end.calls.argsFor(1)).toEqual(["body"]);
        });
      });

      describe("enableMiddlewareCache is true", function() {
        beforeEach(function(done) {
          this.requestCount = 0;
          this.req._requestedUrl = `http://example.org/`;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.uri = uri;
              this.requestCount += 1;
              return [200, "body", { "content-type": "text/plain" }];
            });
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.requestCount += 1;
              return [200, "body2", { "content-type": "text/html" }];
            });
          this.runIt(done, { enableMiddlewareCache: true });
        });

        beforeEach(function(done) {
          this.runIt(done, { enableMiddlewareCache: true });
        });

        it("only makes 1 request", function() {
          expect(this.requestCount).toBe(1);
        });
        it("requests correct path", function() {
          expect(this.uri).toBe(`/http://example.org/`);
        });
        it("returns pre-rendered status and only the content-type header", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {
            "content-type": "text/plain"
          });
        });
        it("returns pre-rendered body", function() {
          expect(this.res.end).toHaveBeenCalledWith("body");
        });

        describe("after clearing", function() {
          beforeEach(function(done) {
            this.subject.cache.clear("http://example.org");
            this.runIt(done, { enableMiddlewareCache: true });
          });

          it("makes another request", function() {
            expect(this.requestCount).toBe(2);
          });
          it("requests correct path", function() {
            expect(this.uri).toBe(`/http://example.org/`);
          });
          it("returns pre-rendered status and only the content-type header", function() {
            expect(this.res.writeHead).toHaveBeenCalledWith(200, {
              "content-type": "text/html"
            });
          });
          it("returns pre-rendered body", function() {
            expect(this.res.end).toHaveBeenCalledWith("body2");
          });
        });
      });
    });

    describe("shouldPrerender option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent": "Mozilla/5.0"
          },
          _requestedUrl: "http://example.org/file"
        };
        this.headersSentToServer = {};
        const self = this;
        this.prerenderServer = nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(function(uri) {
            self.headersSentToServer = Object.assign({}, this.req.headers);
            self.uriCapturedOnPrerender = uri;
            return [
              200,
              "body",
              {
                someHeader: "someHeaderValue",
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      describe("when false", function() {
        beforeEach(function(done) {
          this.runIt(done, {
            shouldPrerender: req => false
          });
        });

        it("does not prerender", function() {
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
      });
      describe("when true", function() {
        beforeEach(function(done) {
          this.runIt(done, {
            shouldPrerender: req => true
          });
        });
        it("prerenders", function() {
          expect(this.uriCapturedOnPrerender).toBe("/http://example.org/file");
        });
        it("returns 200 status and only the content-type header", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {
            "content-type": "text/html; charset=utf-8"
          });
        });
        it("returns beforeRender body", function() {
          expect(this.res.end).toHaveBeenCalledWith("body");
        });
      });

      describe("when true with empty user-agent", function() {
        beforeEach(function(done) {
          this.req.headers["user-agent"] = "";
          this.runIt(done, {
            shouldPrerender: req => true
          });
        });

        it("drops x-original-user-agent", function() {
          expect(this.headersSentToServer).toEqual({
            "user-agent": "prerender-cloud-nodejs-middleware",
            "accept-encoding": "gzip",
            host: "service.prerender.cloud"
          });
        });

        it("prerenders", function() {
          expect(this.uriCapturedOnPrerender).toBe("/http://example.org/file");
        });
      });
    });

    describe("beforeRender option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent": "Mozilla/5.0"
          },
          _requestedUrl: "http://example.org/file"
        };
        this.prerenderServer = nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(uri => {
            this.uriCapturedOnPrerender = uri;
            return [
              200,
              "body",
              {
                someHeader: "someHeaderValue",
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      describe("with string", function() {
        beforeEach(function(done) {
          this.runIt(done, {
            beforeRender: (req, beforeRenderDone) => {
              this.uriCapturedInBeforeRender = req.url;
              beforeRenderDone(null, "body-from-before-render");
            }
          });
        });

        it("requests correct path", function() {
          expect(this.uriCapturedInBeforeRender).toBe(`/file`);
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
        it("returns 200 status and only the content-type header", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {
            "content-type": "text/html; charset=utf-8"
          });
        });
        it("returns beforeRender body", function() {
          expect(this.res.end).toHaveBeenCalledWith("body-from-before-render");
        });
      });

      describe("with object", function() {
        beforeEach(function(done) {
          this.runIt(done, {
            beforeRender: (req, beforeRenderDone) => {
              this.uriCapturedInBeforeRender = req.url;
              beforeRenderDone(null, {
                status: 202,
                body: "body-from-before-render"
              });
            }
          });
        });

        it("requests correct path", function() {
          expect(this.uriCapturedInBeforeRender).toBe(`/file`);
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
        it("returns status from beforeRender and only the content-type header", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(202, {
            "content-type": "text/html; charset=utf-8"
          });
        });
        it("returns beforeRender body", function() {
          expect(this.res.end).toHaveBeenCalledWith("body-from-before-render");
        });
      });

      describe("with null", function() {
        beforeEach(function(done) {
          this.runIt(done, {
            beforeRender: (req, beforeRenderDone) => {
              beforeRenderDone(null, null);
            }
          });
        });

        it("requests correct path", function() {
          expect(this.uriCapturedOnPrerender).toEqual(
            "/http://example.org/file"
          );
        });
        it("returns pre-rendered status and only the content-type header", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {
            "content-type": "text/html; charset=utf-8"
          });
        });
        it("returns pre-rendered body", function() {
          expect(this.res.end).toHaveBeenCalledWith("body");
        });
      });
    });

    describe("afterRender option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent": "Mozilla/5.0"
          },
          _requestedUrl: "http://example.org/file"
        };
        this.prerenderServer = nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(uri => {
            this.uri = uri;
            return [
              200,
              "body",
              {
                someHeader: "someHeaderValue",
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      beforeEach(function(done) {
        this.runIt(() => {}, {
          afterRender: (err, req, res) => {
            this.afterRender = { err, req, res };
            done();
          }
        });
      });

      it("returns response req and res", function() {
        expect(this.afterRender).toEqual({
          err: null,
          req: {
            headers: {
              "user-agent": "Mozilla/5.0",
              host: "example.org"
            },
            _requestedUrl: "http://example.org/file",
            url: "/file",
            originalUrl: "/file",
            method: "GET"
          },
          res: {
            statusCode: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            },
            body: "body"
          }
        });
      });
    });

    describe("whitelistUserAgents option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36"
          },
          _requestedUrl: "http://example.org/file"
        };
        this.uri = undefined;
        this.prerenderServer = nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(uri => {
            this.uri = uri;
            return [
              200,
              "body",
              {
                someHeader: "someHeaderValue",
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      describe("with userAgent NOT from the whitelist", function() {
        beforeEach(function(done) {
          this.runIt(done, { whitelistUserAgents: ["my-custom-user-agent"] });
        });

        it("does not prerender", function() {
          expect(this.uri).toBeUndefined();
        });
        itCalledNext();
      });

      describe("with userAgent from the whitelist", function() {
        beforeEach(function(done) {
          this.req.headers["user-agent"] = "my-custom-user-agent";
          this.runIt(done, { whitelistUserAgents: ["my-custom-user-agent"] });
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/file");
        });
      });

      describe("with whitelist and botsOnly", function() {
        beforeEach(function() {
          this.req.headers["user-agent"] = "my-custom-user-agent";
        });
        it("fails", function() {
          expect(() => {
            this.runIt(function() {}, {
              whitelistUserAgents: ["my-custom-user-agent"],
              botsOnly: true
            });
          }).toThrow(
            new Error("Can't use both botsOnly and whitelistUserAgents")
          );
        });
      });
    });

    describe("originHeaderWhitelist option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36",
            "unusual-header": "unusual-value"
          },
          _requestedUrl: "http://example.org/file"
        };
        this.uri = undefined;
        var that = this;
        this.prerenderServer = nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(function(uri, wut) {
            that.uri = uri;
            that.headersSentToPrerenderCloud = this.req.headers;
            return [
              200,
              "body",
              {
                someHeader: "someHeaderValue",
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      describe("with unusual-header in originHeaderWhitelist", function() {
        beforeEach(function(done) {
          this.runIt(done, { originHeaderWhitelist: ["unusual-header"] });
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/file");
        });
        it("it sends unusual-header", function() {
          expect(this.headersSentToPrerenderCloud["unusual-header"]).toEqual(
            "unusual-value"
          );
        });
        it("it sends origin-header-whitelist", function() {
          expect(
            this.headersSentToPrerenderCloud["origin-header-whitelist"]
          ).toEqual("unusual-header");
        });
      });

      describe("with unusual-header not in originHeaderWhitelist", function() {
        beforeEach(function(done) {
          this.runIt(done);
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/file");
        });
        it("it does not send unusual-header", function() {
          expect(this.headersSentToPrerenderCloud["unusual-header"]).toEqual(
            undefined
          );
        });
        it("it does not send origin-header-whitelist", function() {
          expect(
            this.headersSentToPrerenderCloud["origin-header-whitelist"]
          ).toEqual(undefined);
        });
      });
    });

    describe("botsOnly option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36"
          },
          _requestedUrl: "http://example.org/file"
        };
        this.uri = undefined;
        this.prerenderServer = nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(uri => {
            this.uri = uri;
            return [
              200,
              "body",
              {
                someHeader: "someHeaderValue",
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      describe("normal userAgent, default botOnly option", function() {
        beforeEach(function(done) {
          this.runIt(done);
        });

        it("does not set Vary header", function() {
          expect(this.res.setHeader).not.toHaveBeenCalled();
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/file");
        });
      });

      describe("normal userAgent, botOnly option is true", function() {
        beforeEach(function(done) {
          this.runIt(done, { botsOnly: true });
        });

        it("does not prerender", function() {
          expect(this.uri).toBeUndefined();
        });

        it("sets Vary header", function() {
          expect(this.res.setHeader).toHaveBeenCalledWith("Vary", "User-Agent");
        });

        itCalledNext();
      });

      describe("bot userAgent, when botsOnly option is true", function() {
        beforeEach(function(done) {
          this.req.headers["user-agent"] = "twitterbot";
          this.runIt(done, { botsOnly: true });
        });

        it("sets Vary header", function() {
          expect(this.res.setHeader).toHaveBeenCalledWith("Vary", "User-Agent");
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/file");
        });
      });

      describe("normal userAgent, when botsOnly option is true and _escaped_fragment_ is present", function() {
        beforeEach(function(done) {
          this.req._requestedUrl = `http://example.org/file?_escaped_fragment_`;
          this.runIt(done, { botsOnly: true });
        });

        it("prerenders", function() {
          expect(this.uri).toEqual(
            "/http://example.org/file?_escaped_fragment_"
          );
        });
      });
    });

    describe("bubbleUp5xxErrors option", function() {
      beforeEach(function() {
        this.req = {
          headers: { "user-agent": "twitterbot/1.0" },
          _requestedUrl: "http://example.org/files.m4v.storage/lol"
        };
      });

      describe("when request lib returns error", function() {
        function withError(statusCode) {
          beforeEach(function(done) {
            this.prerenderServer = nock("https://service.prerender.cloud")
              .get(/.*/)
              .times(2)
              .reply(() => [statusCode, "errmsg"]);
            this.runIt(done, { bubbleUp5xxErrors: true });
          });
        }

        function itBubblesUp(statusCode) {
          it("bubble the error up", function() {
            expect(this.res.writeHead.calls.mostRecent().args[0]).toEqual(
              statusCode,
              {}
            );
            expect(this.res.end.calls.mostRecent().args[0]).toMatch("errmsg");
          });
        }

        describe("with 500", function() {
          withError(500);
          itBubblesUp(500);
        });
        describe("with 555", function() {
          withError(555);
          itBubblesUp(555);
        });
        describe("with 503", function() {
          withError(503);
          itBubblesUp(503);
        });
      });
    });
  });
});
