const nock = require("nock");
const zlib = require("zlib");

describe("prerender middleware", function() {
  withNock();
  withHttpMiddlewareMocks();

  describe("set", function() {
    it("can be called twice", function() {
      expect(
        function() {
          this.prerenderMiddleware
            .set("prerenderToken", "token")
            .set("prerenderServiceUrl", "url");
        }.bind(this)
      ).not.toThrow();
    });
    it("returns middleware", function() {
      expect(this.prerenderMiddleware.set("prerenderToken", "token")).toEqual(
        this.prerenderMiddleware
      );
    });
    it("throws on invalid param", function() {
      expect(
        function() {
          this.prerenderMiddleware
            .set("prerenderToken", "token")
            .set("prerenderServiceUrl", "url");
        }.bind(this)
      ).not.toThrow();
    });
  });

  describe("middleware", function() {
    var itCalledNext = function() {
      it("calls next", function() {
        expect(this.next).toHaveBeenCalled();
      });
    };

    describe("invalid requirements", function() {
      describe("with empty parameters", function() {
        beforeEach(function(done) {
          this.req = {};
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });
      describe("with empty headers", function() {
        beforeEach(function(done) {
          this.req = { headers: {} };
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });
      describe("with invalid user-agent", function() {
        beforeEach(function(done) {
          this.req = { headers: { "user-agent": "prerendercloud" } };
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });
      describe("with empty user-agent", function() {
        beforeEach(function(done) {
          this.req = { headers: { "user-agent": "" } };
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });
      describe("with valid user-agent and invalid extension", function() {
        beforeEach(function(done) {
          this.req = {
            headers: { "user-agent": "twitterbot" },
            _requestedUrl: "http://example.org/file.m4v"
          };
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });
      describe("with valid user-agent and valid extension but already rendered", function() {
        beforeEach(function(done) {
          this.req = {
            headers: { "user-agent": "twitterbot", "x-prerendered": "true" },
            _requestedUrl: "http://example.org/file"
          };
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });

      describe("POST request", function() {
        beforeEach(function(done) {
          this.req = {
            headers: { "user-agent": "twitterbot" },
            _requestedUrl: "http://example.org/file"
          };
          this.callPrerenderMiddleware(() => done(), { method: "POST" });
        });

        itCalledNext();
      });
    });

    describe("valid requirements", function() {
      beforeEach(function() {
        this.req = {
          headers: { "user-agent": "twitterbot/1.0" },
          _requestedUrl: "http://example.org/files.m4v.storage/lol-valid"
        };
      });

      describe("when request lib returns error", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .times(2)
            .replyWithError("server error");
          this.callPrerenderMiddleware(() => done());
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
          this.callPrerenderMiddleware(() => done());
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
          this.callPrerenderMiddleware(() => done());
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
          this.callPrerenderMiddleware(() => done());
        });

        itCalledNext();
      });

      describe("when server returns bad request (client/user error)", function() {
        beforeEach(function(done) {
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(() => [400, "errmsg"]);
          this.callPrerenderMiddleware(() => done());
        });

        it("returns pre-rendered body", function() {
          expect(this.res.end.calls.mostRecent().args[0]).toMatch(/user error/);
        });
      });

      describe("when server returns 404", function() {
        function itWorks() {
          it("preserves 404 status-code", function() {
            expect(this.res.writeHead.calls.mostRecent().args).toEqual([
              404,
              {}
            ]);
          });

          it("returns pre-rendered body", function() {
            expect(this.res.end.calls.mostRecent().args[0]).toEqual("notfound");
          });
        }
        describe("with bubbleUp5xxErrors", function() {
          beforeEach(function(done) {
            this.prerenderServer = nock("https://service.prerender.cloud")
              .get(/.*/)
              .reply(() => [404, "notfound"]);
            this.callPrerenderMiddleware(
              () => done(),
              Object.assign({ bubbleUp5xxErrors: true })
            );
          });
          itWorks();
        });
        describe("without bubbleUp5xxErrors", function() {
          beforeEach(function(done) {
            this.prerenderServer = nock("https://service.prerender.cloud")
              .get(/.*/)
              .reply(() => [404, "notfound"]);
            this.callPrerenderMiddleware(() => done());
          });
          itWorks();
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

          this.callPrerenderMiddleware(() => done());
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
            this.callPrerenderMiddleware(() => done());
          });

          it("uses https", function() {
            expect(this.uri).toEqual("/https://example.org/");
          });
        });

        describe("cf-visitor", function() {
          beforeEach(function(done) {
            this.req.headers["cf-visitor"] = '{"scheme":"https"}';
            this.callPrerenderMiddleware(() => done());
          });

          it("uses https", function() {
            expect(this.uri).toEqual("/https://example.org/");
          });
        });

        describe("x-forwarded-proto", function() {
          beforeEach(function(done) {
            this.req.headers["x-forwarded-proto"] = "https,http";
            this.callPrerenderMiddleware(() => done());
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
            this.callPrerenderMiddleware(() => done(), {});
          });

          it("uses default protocol", function() {
            expect(this.uri).toEqual(
              "/http://example.org/files.m4v.storage/lol-valid"
            );
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { protocol: "https" });
          });

          it("it uses the protocol we specified", function() {
            expect(this.uri).toEqual(
              "/https://example.org/files.m4v.storage/lol-valid"
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
            this.callPrerenderMiddleware(() => done(), {});
          });

          it("infers host", function() {
            expect(this.uri).toEqual(
              "/http://example.org/files.m4v.storage/lol-valid"
            );
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { host: "example.com" });
          });

          it("it uses the hostl we specified", function() {
            expect(this.uri).toEqual(
              "/http://example.com/files.m4v.storage/lol-valid"
            );
          });
        });
      });

      describe("waitExtraLong option", function() {
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
            this.callPrerenderMiddleware(() => done(), { waitExtraLong: false });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-wait-extra-long"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { waitExtraLong: true });
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-wait-extra-long"]
            ).toEqual(true);
          });
        });
      });

      describe("withMetadata option", function() {
        beforeEach(function() {
          const that = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              that.headersSentToPrerenderCloud = this.req.headers;

              if (this.req.headers["prerender-with-metadata"]) {
                return [
                  200,
                  {
                    body: Buffer.from("base64-body").toString("base64"),
                    links: Buffer.from(JSON.stringify(["/path1"])).toString(
                      "base64"
                    )
                  }
                ];
              } else {
                return [200, "body"];
              }
            });
        });
        describe("disabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), {
              withMetadata: req => {
                this.reqDataPassedToWithMetadata = req;
                return false;
              }
            });
          });

          it("it sets req obj", function() {
            expect(this.reqDataPassedToWithMetadata).toEqual({
              headers: { "user-agent": "twitterbot/1.0", host: "example.org" },
              _requestedUrl: "http://example.org/files.m4v.storage/lol-valid",
              url: "/files.m4v.storage/lol-valid",
              originalUrl: "/files.m4v.storage/lol-valid",
              method: "GET",
              prerender: {
                url: { requestedPath: "/files.m4v.storage/lol-valid" }
              }
            });
          });
          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-with-metadata"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { withMetadata: () => true });
          });

          it("returns pre-rendered body", function() {
            expect(this.res.end.calls.mostRecent().args[0]).toEqual(
              "base64-body"
            );
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-with-metadata"]
            ).toEqual(true);
          });
        });
      });

      describe("withScreenshot option", function() {
        beforeEach(function() {
          const that = this;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(function(uri) {
              that.headersSentToPrerenderCloud = this.req.headers;

              if (this.req.headers["prerender-with-screenshot"]) {
                return [
                  200,
                  { body: Buffer.from("base64-body").toString("base64") }
                ];
              } else {
                return [200, "body"];
              }
            });
        });
        describe("disabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), {
              withScreenshot: req => {
                this.reqDataPassedToWithScreenshot = req;
                return false;
              }
            });
          });

          it("it sets req obj", function() {
            expect(this.reqDataPassedToWithScreenshot).toEqual({
              headers: { "user-agent": "twitterbot/1.0", host: "example.org" },
              _requestedUrl: "http://example.org/files.m4v.storage/lol-valid",
              url: "/files.m4v.storage/lol-valid",
              originalUrl: "/files.m4v.storage/lol-valid",
              method: "GET",
              prerender: {
                url: { requestedPath: "/files.m4v.storage/lol-valid" }
              }
            });
          });
          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-with-screenshot"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { withScreenshot: () => true });
          });

          it("returns pre-rendered body", function() {
            expect(this.res.end.calls.mostRecent().args[0]).toEqual(
              "base64-body"
            );
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-with-screenshot"]
            ).toEqual(true);
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
            this.callPrerenderMiddleware(() => done(), { removeTrailingSlash: false });
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
            this.callPrerenderMiddleware(() => done(), { removeTrailingSlash: true });
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
            this.callPrerenderMiddleware(() => done(), { removeScriptTags: false });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-remove-script-tags"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { removeScriptTags: true });
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-remove-script-tags"]
            ).toEqual(true);
          });
        });
      });

      describe("followRedirects option", function() {
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
            const that = this;
            this.callPrerenderMiddleware(() => done(), {
              metaOnly: req => {
                that.reqObj = req;
                return false;
              }
            });
          });

          it("passes headers to fn", function() {
            expect(this.reqObj).toEqual({
              headers: { "user-agent": "twitterbot/1.0", host: "example.org" },
              _requestedUrl: "http://example.org/files.m4v.storage/lol-valid",
              url: "/files.m4v.storage/lol-valid",
              originalUrl: "/files.m4v.storage/lol-valid",
              method: "GET",
              prerender: {
                url: { requestedPath: "/files.m4v.storage/lol-valid" }
              }
            });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-follow-redirects"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { followRedirects: () => true });
          });

          it("it sends header to prerendercloud", function() {
            console.log(
              "headers",
              this.headersSentToPrerenderCloud["prerender-follow-redirects"]
            );
            expect(
              this.headersSentToPrerenderCloud["prerender-follow-redirects"]
            ).toEqual(true);
          });
        });
      });

      describe("serverCacheDurationSeconds option", function() {
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
            const that = this;
            this.callPrerenderMiddleware(() => done(), {
              metaOnly: req => {
                that.reqObj = req;
                return false;
              }
            });
          });

          it("passes headers to fn", function() {
            expect(this.reqObj).toEqual({
              headers: { "user-agent": "twitterbot/1.0", host: "example.org" },
              _requestedUrl: "http://example.org/files.m4v.storage/lol-valid",
              url: "/files.m4v.storage/lol-valid",
              originalUrl: "/files.m4v.storage/lol-valid",
              method: "GET",
              prerender: {
                url: { requestedPath: "/files.m4v.storage/lol-valid" }
              }
            });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-cache-duration"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), {
              serverCacheDurationSeconds: () => "1234"
            });
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-cache-duration"]
            ).toEqual("1234");
          });
        });
      });

      describe("metaOnly option", function() {
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
            const that = this;
            this.callPrerenderMiddleware(() => done(), {
              metaOnly: req => {
                that.reqObj = req;
                return false;
              }
            });
          });

          it("passes headers to fn", function() {
            expect(this.reqObj).toEqual({
              headers: { "user-agent": "twitterbot/1.0", host: "example.org" },
              _requestedUrl: "http://example.org/files.m4v.storage/lol-valid",
              url: "/files.m4v.storage/lol-valid",
              originalUrl: "/files.m4v.storage/lol-valid",
              method: "GET",
              prerender: {
                url: { requestedPath: "/files.m4v.storage/lol-valid" }
              }
            });
          });

          it("does not send header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-meta-only"]
            ).toEqual(undefined);
          });
        });
        describe("enabled", function() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), { metaOnly: () => true });
          });

          it("it sends header to prerendercloud", function() {
            expect(
              this.headersSentToPrerenderCloud["prerender-meta-only"]
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
          this.callPrerenderMiddleware(() => done(), {
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
            this.callPrerenderMiddleware(() => done());
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
          this.callPrerenderMiddleware(() => done());
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
          this.req._requestedUrl = "http://example.org/";
          this.req.req1 = true;
          this.prerenderServer = nock("https://service.prerender.cloud")
            .get(/.*/)
            .reply(uri => {
              this.uri = uri;
              this.requestCount += 1;
              return [200, "body", { "content-type": "text/plain" }];
            });
          var callCounter = 0;
          const _done = () => {
            callCounter += 1;
            if (callCounter === 2) done();
          };
          // configure the middleware
          this.configurePrerenderMiddleware(_done, {
            enableMiddlewareCache: false,
            afterRenderBlocking: (err, req, res, next) => {
              if (req.req1) {
                res.body = "req1";
              }
              next();
            }
          });

          // make a new set of req/res objs
          this.req2 = {
            _requestedUrl: "http://example.org/",
            headers: { "user-agent": "twitterbot/1.0" }
          };
          this.res2 = {
            writeHead: jasmine.createSpy("writeHead"),
            getHeader: jasmine.createSpy("getHeader"),
            setHeader: jasmine.createSpy("setHeader")
          };
          this.res2.end = jasmine.createSpy("end2").and.callFake(_done);
          configureUrlForReq(this.req2, {});

          // call the _same_ middleware twice in a row, but with diff req/res
          // (note, I don't understand why req2 must be called first in order
          // to see the mutatation from req1... some event loop mystery)
          this.prerenderMiddleware(this.req2, this.res2, () => {});
          this.prerenderMiddleware(this.req, this.res, this.next);
        });
        it("only makes 1 request", function() {
          expect(this.requestCount).toBe(1);
        });
        it("returns body from first request", function() {
          expect(this.res.end.calls.argsFor(0)).toEqual(["req1"]);
          expect(this.res2.end.calls.argsFor(0)).toEqual(["body"]);
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
          this.callPrerenderMiddleware(() => done(), { enableMiddlewareCache: true });
        });

        beforeEach(function(done) {
          this.callPrerenderMiddleware(() => done(), { enableMiddlewareCache: true });
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
            this.prerenderMiddleware.cache.clear("http://example.org");
            this.callPrerenderMiddleware(() => done(), { enableMiddlewareCache: true });
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

    describe("blacklistPaths option", function() {
      beforeEach(function() {
        this.req = {
          headers: {
            "user-agent": "chrome"
          }
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
                "content-type": "text/html; charset=utf-8"
              }
            ];
          });
      });

      describe("when path is not in blacklist", function() {
        beforeEach(function(done) {
          this.req._requestedUrl = "https://example.org/should-prerender";
          this.callPrerenderMiddleware(() => done(), {
            blacklistPaths: req => ["/dont-prerender"]
          });
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/should-prerender");
        });
      });

      describe("when path is not array", function() {
        beforeEach(function(done) {
          this.req._requestedUrl = "https://example.org/dont-prerender";
          this.callPrerenderMiddleware(() => done(), {
            blacklistPaths: req => "/dont-prerender"
          });
        });

        it("prerenders", function() {
          expect(this.uri).toEqual("/http://example.org/dont-prerender");
        });
      });

      describe("when path is in blacklist", function() {
        beforeEach(function(done) {
          this.req._requestedUrl = "https://example.org/dont-prerender";
          this.reqObj = undefined;
          this.callPrerenderMiddleware(() => done(), {
            blacklistPaths: req => {
              this.reqObj = req;
              return ["/dont-prerender"];
            }
          });
        });
        it("passes req obj", function() {
          expect(this.reqObj).toEqual({
            headers: { "user-agent": "chrome", host: "example.org" },
            _requestedUrl: "https://example.org/dont-prerender",
            url: "/dont-prerender",
            originalUrl: "/dont-prerender",
            method: "GET",
            prerender: { url: { requestedPath: "/dont-prerender" } }
          });
        });
        it("does not prerender", function() {
          expect(this.uri).toBeUndefined();
        });
        itCalledNext();
      });

      describe("with wildcard", function() {
        beforeEach(function() {
          this.reqObj = undefined;
        });

        function callPrerender() {
          beforeEach(function(done) {
            this.callPrerenderMiddleware(() => done(), {
              blacklistPaths: req => {
                this.reqObj = req;
                return ["/signup/*", "/dont*"];
              }
            });
          });
        }

        describe("when path is in wildcard", function() {
          beforeEach(function() {
            this.req._requestedUrl =
              "https://example.org/signup/dont-prerender";
          });
          callPrerender();

          it("does not prerender", function() {
            expect(this.uri).toBeUndefined();
          });
          itCalledNext();
        });

        describe("when path is not in wildcard", function() {
          beforeEach(function() {
            this.req._requestedUrl = "https://example.org/dons-prerender";
          });
          callPrerender();
          it("prerenders", function() {
            expect(this.uri).toEqual("/http://example.org/dons-prerender");
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
          this.callPrerenderMiddleware(() => done(), {
            shouldPrerender: req => false
          });
        });

        it("does not prerender", function() {
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
      });
      describe("when true", function() {
        beforeEach(function(done) {
          this.callPrerenderMiddleware(() => done(), {
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
          this.callPrerenderMiddleware(() => done(), {
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
          this.callPrerenderMiddleware(() => done(), {
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
          this.callPrerenderMiddleware(() => done(), {
            afterRender: (err, req, res) => {
              this.afterRenderResObj = res;
            },
            beforeRender: (req, beforeRenderDone) => {
              this.uriCapturedInBeforeRender = req.url;
              beforeRenderDone(null, {
                status: 202,
                body: "body-from-before-render",
                headers: { whatever: "works" },
                bogus: {}
              });
            }
          });
        });

        it("requests correct path", function() {
          expect(this.uriCapturedInBeforeRender).toBe(`/file`);
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
        it("returns status and headers from beforeRender", function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(202, {
            "content-type": "text/html; charset=utf-8",
            whatever: "works"
          });
        });
        it("returns beforeRender body", function() {
          expect(this.res.end).toHaveBeenCalledWith("body-from-before-render");
        });
        it("only includes status/headers/body in args to afterRender", function() {
          expect(this.afterRenderResObj).toEqual({
            statusCode: 202,
            headers: {
              "content-type": "text/html; charset=utf-8",
              whatever: "works"
            },
            body: "body-from-before-render",
            screenshot: undefined,
            meta: undefined,
            links: undefined
          });
        });
      });

      describe("with object that has screenshot and meta", function() {
        beforeEach(function(done) {
          this.callPrerenderMiddleware(() => done(), {
            afterRender: (err, req, res) => {
              this.afterRenderResObj = res;
            },
            beforeRender: (req, beforeRenderDone) => {
              this.uriCapturedInBeforeRender = req.url;
              beforeRenderDone(null, {
                status: 202,
                body: "body-from-before-render",
                headers: { whatever: "works" },
                screenshot: Buffer.from([]),
                meta: {},
                links: [],
                bogus: {}
              });
            }
          });
        });

        it("includes screenshot/meta in args passed to afterRender", function() {
          expect(this.afterRenderResObj).toEqual({
            statusCode: 202,
            headers: {
              "content-type": "text/html; charset=utf-8",
              whatever: "works"
            },
            body: "body-from-before-render",
            screenshot: Buffer.from([]),
            meta: {},
            links: []
          });
        });
      });

      describe("with null", function() {
        beforeEach(function(done) {
          this.callPrerenderMiddleware(() => done(), {
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
        this.callPrerenderMiddleware(() => {}, {
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
            prerender: { url: { requestedPath: "/file" } },
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

    describe("afterRenderBlocking option", function() {
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
        this.callPrerenderMiddleware(() => {}, {
          afterRenderBlocking: (err, req, res, next) => {
            this.afterRender = { err, req, res };
            res.body = "lol";
            next();
            done();
          }
        });
      });

      it("returns modified response", function() {
        expect(this.afterRender).toEqual({
          err: null,
          req: {
            prerender: { url: { requestedPath: "/file" } },
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
            origBodyBeforeAfterRenderBlocking: "body",
            statusCode: 200,
            headers: {
              "content-type": "text/html; charset=utf-8"
            },
            body: "lol"
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
          this.callPrerenderMiddleware(() => done(), {
            whitelistUserAgents: ["my-custom-user-agent"]
          });
        });

        it("does not prerender", function() {
          expect(this.uri).toBeUndefined();
        });
        itCalledNext();
      });

      describe("with userAgent from the whitelist", function() {
        beforeEach(function(done) {
          this.req.headers["user-agent"] = "my-custom-user-agent";
          this.callPrerenderMiddleware(() => done(), {
            whitelistUserAgents: ["my-custom-user-agent"]
          });
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
            this.callPrerenderMiddleware(function() {}, {
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
          this.callPrerenderMiddleware(() => done(), {
            originHeaderWhitelist: ["unusual-header"]
          });
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
          this.callPrerenderMiddleware(() => done());
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
          this.callPrerenderMiddleware(() => done());
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
          this.callPrerenderMiddleware(() => done(), { botsOnly: true });
        });

        it("does not prerender", function() {
          expect(this.uri).toBeUndefined();
        });

        it("sets Vary header", function() {
          expect(this.res.setHeader).toHaveBeenCalledWith("Vary", "User-Agent");
        });

        itCalledNext();
      });

      describe("when botsOnly is array", function() {
        describe("when request does not match any of the bots", function() {
          beforeEach(function(done) {
            this.req.headers["user-agent"] = "chrome";
            this.callPrerenderMiddleware(() => done(), {
              botsOnly: ["another-bot-user-agent"]
            });
          });
          it("does not prerender", function() {
            expect(this.uri).toBeUndefined();
          });

          it("sets Vary header", function() {
            expect(this.res.setHeader).toHaveBeenCalledWith(
              "Vary",
              "User-Agent"
            );
          });

          itCalledNext();
        });
        describe("when request matches the configured user agent", function() {
          const newBotUserAgent = "another-bot-user-agent";
          beforeEach(function(done) {
            this.req.headers["user-agent"] = newBotUserAgent;
            this.callPrerenderMiddleware(() => done(), {
              botsOnly: [newBotUserAgent]
            });
          });

          it("sets Vary header", function() {
            expect(this.res.setHeader).toHaveBeenCalledWith(
              "Vary",
              "User-Agent"
            );
          });

          it("prerenders the configured user-agent", function() {
            expect(this.uri).toEqual("/http://example.org/file");
          });
        });
        describe("when request matches a bot not in the configured botsOnly list", function() {
          beforeEach(function(done) {
            this.req.headers["user-agent"] = "w3c_Validator";
            this.callPrerenderMiddleware(() => done(), {
              botsOnly: ["another-bot-user-agent"]
            });
          });

          it("sets Vary header", function() {
            expect(this.res.setHeader).toHaveBeenCalledWith(
              "Vary",
              "User-Agent"
            );
          });

          it("prerenders the configured user-agent", function() {
            expect(this.uri).toEqual("/http://example.org/file");
          });
        });
      });

      describe("bot userAgent, when botsOnly option is true", function() {
        beforeEach(function(done) {
          this.req.headers["user-agent"] = "w3c_Validator";
          this.callPrerenderMiddleware(() => done(), { botsOnly: true });
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
          this.callPrerenderMiddleware(() => done(), { botsOnly: true });
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
          _requestedUrl: "http://example.org/files.m4v.storage/lol-bubbleup"
        };
      });

      describe("when request lib returns error", function() {
        function withError(statusCode, options, delay) {
          if (!options) options = {};
          if (delay == null) delay = 0;
          beforeEach(function(done) {
            this.attempts = 0;
            this.prerenderServer = nock("https://service.prerender.cloud")
              .get(/.*/)
              .times(2)
              .delay(delay)
              .reply(() => {
                this.attempts += 1;
                return [statusCode, "errmsg"];
              });
            this.callPrerenderMiddleware(
              () => done(),
              Object.assign({ bubbleUp5xxErrors: true }, options)
            );
          });
        }

        function itRetries() {
          it("retries", function() {
            expect(this.attempts).toEqual(2);
          });
        }

        function itDoesNotRetry() {
          it("does not retry", function() {
            expect(this.attempts).toEqual(1);
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

        describe("bool", function() {
          describe("with 500", function() {
            withError(500);
            itBubblesUp(500);
            itRetries();
          });
          describe("with 555", function() {
            withError(555);
            itBubblesUp(555);
            itDoesNotRetry();
          });
          describe("with 503", function() {
            withError(503);
            itBubblesUp(503);
            itRetries();
          });
        });
        describe("func returns false", function() {
          const bubbleFunc = (err, req, res) => {
            return false;
          };
          withError(500, { bubbleUp5xxErrors: bubbleFunc });
          itCalledNext();
          itRetries();
        });
        describe("func returns true", function() {
          const bubbleFunc = (err, req, res) => {
            return true;
          };
          withError(500, { bubbleUp5xxErrors: bubbleFunc });
          itBubblesUp(500);
          itRetries();
        });

        describe("with client-side timeout", function() {
          describe("bubbleUp5xxErrors=true", function() {
            beforeEach(function() {
              this.req._requestedUrl =
                "http://example.org/files.m4v.storage/lol-bubbleup-client-timeout-1";
            });
            withError(200, { timeout: 50 }, 500);
            it("returns client side timeout err with 500 status code", function() {
              expect(this.res.writeHead.calls.mostRecent().args[0]).toEqual(
                500,
                {}
              );
              expect(this.res.end.calls.mostRecent().args[0]).toEqual(
                "Error: prerender.cloud client timeout (as opposed to prerender.cloud server timeout)"
              );
            });
            itRetries();
          });
          describe("bubbleUp5xxErrors=false", function() {
            beforeEach(function() {
              this.req._requestedUrl =
                "http://example.org/files.m4v.storage/lol-bubbleup-client-timeout-2";
            });
            withError(500, { timeout: 50, bubbleUp5xxErrors: false }, 500);
            itCalledNext();
            itRetries();
          });
        });
      });
    });
  });
});
