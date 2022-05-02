const nock = require("nock");

describe("options.throttler", function () {
  withPrerenderMiddleware();
  beforeEach(function () {
    jasmine.clock().install();
  });
  afterEach(function () {
    jasmine.clock().uninstall();
  });
  beforeEach(function () {
    this.options = new this.prerenderMiddleware.Options({});
    this.options.set({}, "throttleOnFail", true);
    this.options.recordFail("example1");
  });

  it("throttles", function () {
    expect(this.options.isThrottled("example1")).toBe(true);
    expect(this.options.isThrottled("example2")).toBe(false);
  });

  describe("after 5 minutes", function () {
    beforeEach(function () {
      jasmine.clock().tick(60 * 5 * 1000 + 1000);
    });
    it("does not throttle", function () {
      expect(this.options.isThrottled("example1")).toBe(false);
    });
  });
});

describe("timeout causes throttling", function () {
  withNock();
  withHttpMiddlewareMocks();

  function withPrerenderServerResponse(serverStatusCode, serverDelay) {
    if (serverDelay == null) serverDelay = 0;
    beforeEach(function () {
      this.attempts = 0;
      this.prerenderServer = nock("https://service.prerender.cloud")
        .get(/.*/)
        .times(2)
        .delay(serverDelay)
        .reply(() => {
          this.attempts += 1;
          return [serverStatusCode, "errmsg"];
        });
    });
  }

  function callMiddleware(clientOptions) {
    beforeEach(function (done) {
      if (!clientOptions) clientOptions = {};
      this.req = {
        headers: { "user-agent": "twitterbot/1.0" },
        _requestedUrl: "http://example.org/files.m4v.storage/lol-valid",
      };

      this.callPrerenderMiddleware(
        () => done(),
        Object.assign({}, clientOptions)
      );
    });
  }
  function itCalledNext() {
    it("calls next", function () {
      expect(this.next).toHaveBeenCalled();
    });
  }
  function itBubblesUp(statusCode, msg) {
    it("bubble the error up", function () {
      expect(this.res.writeHead.calls.mostRecent().args[0]).toEqual(
        statusCode,
        {}
      );
      expect(this.res.end.calls.mostRecent().args[0]).toMatch(msg);
    });
  }

  describe("on client timeout", function () {
    withPrerenderServerResponse(200, 500);
    describe("with throttling and bubbleUp5xxErrors enabled", function () {
      callMiddleware({
        timeout: 50,
        retries: 0,
        throttleOnFail: true,
        bubbleUp5xxErrors: true,
      });
      callMiddleware({
        timeout: 50,
        retries: 0,
        throttleOnFail: true,
        bubbleUp5xxErrors: true,
      });
      it("calls the server only once", function () {
        expect(this.attempts).toEqual(1);
      });
      itBubblesUp(
        503,
        "Error: prerender.cloud client throttled this prerender request due to a recent timeout"
      );
    });
    describe("with throttling enabled", function () {
      callMiddleware({ timeout: 50, retries: 0, throttleOnFail: true });

      callMiddleware({ timeout: 50, retries: 0, throttleOnFail: true });

      it("calls the server only once", function () {
        expect(this.attempts).toEqual(1);
      });
      itCalledNext();
    });
    describe("with throttling disabled", function () {
      callMiddleware({ timeout: 50, retries: 0, throttleOnFail: false });
      callMiddleware({ timeout: 50, retries: 0, throttleOnFail: false });
      it("calls the server only once", function () {
        expect(this.attempts).toEqual(2);
      });
      itCalledNext();
    });
  });
});
