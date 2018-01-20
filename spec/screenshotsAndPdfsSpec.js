const stdLibUrl = require("url");
const nock = require("nock");

describe("screenshots and PDFs", function() {
  beforeEach(function() {
    nock.cleanAll();
    nock.disableNetConnect();
    this.subject = prerenderMiddleware;
    this.subject.resetOptions();
  });

  function itWorks(prerenderAction) {
    describe("happy path", function() {
      beforeEach(function() {
        const self = this;
        nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(function(uri) {
            self.requestedUri = uri;
            self.headersSentToPrerenderCloud = this.req.headers;
            return [200, "body"];
          });
      });

      beforeEach(function(done) {
        const self = this;
        this.subject.set("prerenderToken", "fake-token");
        this.subject[prerenderAction]
          .call(this.subject, "http://example.com")
          .then(res => {
            self.res = res;
            done();
          });
      });
      it("calls correct API", function() {
        expect(this.requestedUri).toEqual(
          `/${prerenderAction}/http://example.com`
        );
      });
      it("return screenshot", function() {
        expect(this.res).toEqual(Buffer.from("body"));
      });
      it("it sends token", function() {
        expect(this.headersSentToPrerenderCloud["x-prerender-token"]).toEqual(
          "fake-token"
        );
      });
    });

    describe("service.prerender.cloud returns 502 bad gateway", function() {
      beforeEach(function() {
        const self = this;
        nock("https://service.prerender.cloud")
          .get(/.*/)
          .reply(uri => {
            self.requestedUri = uri;
            return [502, "bad gateway"];
          });
      });

      beforeEach(function(done) {
        const self = this;
        this.subject[prerenderAction]
          .call(this.subject, "http://example.com")
          .then(res => {
            self.res = res;
            done();
          })
          .catch(err => {
            // console.log(err);
            self.err = err;
            done();
          });
      });
      it("calls correct API", function() {
        expect(this.requestedUri).toEqual(
          `/${prerenderAction}/http://example.com`
        );
      });
      it("does not return res", function() {
        expect(this.res).toBe(undefined);
      });
      it("returns 502", function() {
        expect(this.err.statusCode).toEqual(502);
      });
    });
  }

  itWorks("pdf");
  itWorks("screenshot");
});
