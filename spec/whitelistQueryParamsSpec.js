const nock = require("nock");

describe("whitelist query params", function () {
  withNock();
  withHttpMiddlewareMocks();

  function withPrerenderServerResponse(serverStatusCode) {
    beforeEach(function () {
      this.attempts = 0;

      const self = this;
      this.prerenderServer = nock("https://service.prerender.cloud")
        .get(/.*/)
        .reply(function (uri) {
          self.headersSentToServer = Object.assign({}, this.req.headers);
          self.uriCapturedOnPrerender = uri;
          return [
            200,
            "prerendered-body",
            {
              "content-type": "text/html; charset=utf-8",
            },
          ];
        });
    });
  }

  function callMiddleware(clientOptions) {
    beforeEach(function (done) {
      if (!clientOptions) clientOptions = {};

      this.callPrerenderMiddleware(
        () => done(),
        Object.assign({}, clientOptions)
      );
    });
  }

  describe("with non-function", function () {
    callMiddleware({ whitelistQueryParams: () => true });

    it("throws", function () {
      expect(
        function () {
          this.prerenderMiddleware.set("whitelistQueryParams", true);
        }.bind(this)
      ).toThrow();
    });
  });

  describe("with query params", function () {
    beforeEach(function () {
      this.req = {
        headers: { "user-agent": "twitterbot/1.0" },
        _requestedUrl: "http://example.org/?a=b",
      };
    });
    withPrerenderServerResponse(200, 0);
    describe("with throttling and bubbleUp5xxErrors enabled", function () {
      callMiddleware();

      it("returns pre-rendered content", function () {
        expect(this.res.end).toHaveBeenCalledWith("prerendered-body");
      });
      it("passes query params", function () {
        expect(this.uriCapturedOnPrerender).toEqual("/http://example.org/?a=b");
      });
    });

    describe("with empty whitelistQueryParams", function () {
      callMiddleware({ whitelistQueryParams: () => [] });

      it("returns pre-rendered content", function () {
        expect(this.res.end).toHaveBeenCalledWith("prerendered-body");
      });
      it("does not pass any query params", function () {
        expect(this.uriCapturedOnPrerender).toEqual("/http://example.org/");
      });
    });
    describe("with present whitelistQueryParams", function () {
      callMiddleware({ whitelistQueryParams: () => ["a"] });

      it("returns pre-rendered content", function () {
        expect(this.res.end).toHaveBeenCalledWith("prerendered-body");
      });
      it("does not pass any query params", function () {
        expect(this.uriCapturedOnPrerender).toEqual("/http://example.org/?a=b");
      });
    });
    describe("with conflicting whitelistQueryParams", function () {
      callMiddleware({ whitelistQueryParams: () => ["b"] });

      it("returns pre-rendered content", function () {
        expect(this.res.end).toHaveBeenCalledWith("prerendered-body");
      });
      it("does not pass any query params", function () {
        expect(this.uriCapturedOnPrerender).toEqual("/http://example.org/");
      });
    });
    describe("with partial conflicting whitelistQueryParams", function () {
      beforeEach(function () {
        this.req = {
          headers: { "user-agent": "twitterbot/1.0" },
          _requestedUrl: "http://example.org/?a=b&b=c&d=e",
        };
      });
      callMiddleware({ whitelistQueryParams: () => ["b", "d"] });

      it("returns pre-rendered content", function () {
        expect(this.res.end).toHaveBeenCalledWith("prerendered-body");
      });
      it("does not pass any query params", function () {
        expect(this.uriCapturedOnPrerender).toEqual(
          "/http://example.org/?b=c&d=e"
        );
      });
      it("exposes requested URL on req obj", function () {
        // this is for users of the beforeRender(req, done) func
        expect(this.req.prerender.url.requestedPath).toEqual("/?b=c&d=e");
      });
      it("exposes requested URL on res obj", function () {
        // this is for lambda@edge downstream: https://github.com/sanfrancesco/prerendercloud-lambda-edge
        expect(this.res.prerender.url.requestedPath).toEqual("/?b=c&d=e");
      });
    });
  });
});
