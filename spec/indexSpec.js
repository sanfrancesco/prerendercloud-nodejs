var prerenderMiddleware;
if (!!process.env.CI) {
  console.log('running transpiled code');
  prerenderMiddleware = require('../distribution/index');
} else {
  prerenderMiddleware = require('../source/index');
}

const url = require('url');
var nock = require('nock');

describe('prerender middleware', function() {
  beforeEach(function() {
    nock.cleanAll();
    nock.disableNetConnect();
    this.subject = prerenderMiddleware;
    this.subject.resetOptions();
  });

  describe('set', function() {
    it('can be called twice', function() {
      expect(function() {
        this.subject.set('prerenderToken', 'token').set('prerenderServiceUrl', 'url');
      }.bind(this)).not.toThrow();
    });
    it('returns middleware', function() {
      expect(this.subject.set('prerenderToken', 'token')).toEqual(this.subject);
    });
    it('throws on invalid param', function() {
      expect(function() {
        this.subject.set('prerenderToken', 'token').set('prerenderServiceUrl', 'url');
      }.bind(this)).not.toThrow();
    });
  });

  describe('middleware', function() {
    beforeEach(function() {
      this.req = {};
      this.res = {};
      this.subject.cache && this.subject.cache.reset();
      this.runIt = function(done = () => {}, options = {}) {
        this.subject.set('enableMiddlewareCache', !!options.enableMiddlewareCache);
        this.subject.set('botsOnly', !!options.botsOnly);
        this.subject.set('whitelistUserAgents', options.whitelistUserAgents);
        this.subject.set('beforeRender', options.beforeRender)
        this.subject.set('afterRender', options.afterRender)

        this.next = jasmine.createSpy('nextMiddleware').and.callFake(done);
        this.res = {
          writeHead: jasmine.createSpy('writeHead'),
          end: jasmine.createSpy('end').and.callFake(done),
        }
        if (this.req._requestedUrl) {
          parsed = url.parse(this.req._requestedUrl);
          // connect only has: req.headers.host (which includes port), req.url and req.originalUrl
          // express has .protocol and .path but we're optimizing for connect
          this.req.headers['host'] = parsed.host;
          this.req.url = parsed.path;
          this.req.originalUrl = parsed.path;
          this.req.method = options.method || 'GET';
        }

        this.subject(this.req, this.res, this.next);
      }.bind(this)
    });

    var itCalledNext = function() {
      it('calls next', function() {
        expect(this.next).toHaveBeenCalled();
      });
    }

    describe('invalid requirements', function() {
      describe('with empty parameters', function() {
        beforeEach(function(done) {
          this.req = {};
          this.runIt(done);
        });

        itCalledNext();
      });
      describe('with empty headers', function() {
        beforeEach(function(done) {
          this.req = { headers: {} };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe('with invalid user-agent', function() {
        beforeEach(function(done) {
          this.req = { headers: { 'user-agent': 'prerendercloud' } };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe('with valid user-agent and invalid extension', function() {
        beforeEach(function(done) {
          this.req = { headers: { 'user-agent': 'twitterbot' }, _requestedUrl: 'http://example.org/file.m4v' };
          this.runIt(done);
        });

        itCalledNext();
      });
      describe('with valid user-agent and valid extension but already rendered', function() {
        beforeEach(function(done) {
          this.req = { headers: { 'user-agent': 'twitterbot', 'x-prerendered': 'true' }, _requestedUrl: 'http://example.org/file' };
          this.runIt(done);
        });

        itCalledNext();
      });

      describe('POST request', function() {
        beforeEach(function(done) {
          this.req = { headers: { 'user-agent': 'twitterbot' }, _requestedUrl: 'http://example.org/file' };
          this.runIt(done, { method: 'POST' });
        });

        itCalledNext();
      });
    });

    describe('beforeRender option', function() {
      beforeEach(function() {
        this.req = {
          headers: {
            'user-agent': 'Mozilla/5.0'
          },
          _requestedUrl: 'http://example.org/file'
        };
        this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply((uri) => {
          this.uriCapturedOnPrerender = uri;
          return ([200, 'body', {someHeader: 'someHeaderValue', 'content-type': 'text/html; charset=utf-8'}]);
        });
      });

      describe('with string', function() {
        beforeEach(function(done) {
          this.runIt(done, {
            beforeRender: (req, beforeRenderDone) => {
              this.uriCapturedInBeforeRender = req.url;
              beforeRenderDone(null, "body-from-before-render");
            }
          });
        });

        it('requests correct path', function() {
          expect(this.uriCapturedInBeforeRender).toBe(`/file`);
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
        it('returns 200 status and only the content-type header', function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {'content-type': 'text/html; charset=utf-8'});
        });
        it('returns beforeRender body', function() {
          expect(this.res.end).toHaveBeenCalledWith('body-from-before-render');
        });
      })

      describe('with object', function() {
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

        it('requests correct path', function() {
          expect(this.uriCapturedInBeforeRender).toBe(`/file`);
          expect(this.uriCapturedOnPrerender).toBeUndefined();
        });
        it('returns status from beforeRender and only the content-type header', function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(202, {'content-type': 'text/html; charset=utf-8'});
        });
        it('returns beforeRender body', function() {
          expect(this.res.end).toHaveBeenCalledWith('body-from-before-render');
        });
      })

      describe('with null', function() {
        beforeEach(function(done) {
          this.runIt(done, {
            beforeRender: (req, beforeRenderDone) => {
              beforeRenderDone(null, null);
            }
          });
        });

        it('requests correct path', function() {
          expect(this.uriCapturedOnPrerender).toEqual('/http://example.org/file');
        });
        it('returns pre-rendered status and only the content-type header', function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {'content-type': 'text/html; charset=utf-8'});
        });
        it('returns pre-rendered body', function() {
          expect(this.res.end).toHaveBeenCalledWith('body');
        });
      })

    });

    describe('afterRender option', function() {
      beforeEach(function() {
        this.req = {
          headers: {
            'user-agent': 'Mozilla/5.0'
          },
          _requestedUrl: 'http://example.org/file'
        };
        this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply((uri) => {
          this.uri = uri;
          return ([200, 'body', {someHeader: 'someHeaderValue', 'content-type': 'text/html; charset=utf-8'}]);
        });
      });

      beforeEach(function(done) {
        this.runIt(() => {}, { afterRender: (err, req, res) => {
          this.afterRender = { err, req, res };
          done();
        } });
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

    describe('whitelistUserAgents option', function() {
      beforeEach(function() {
        this.req = {
          headers: {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36'
          },
          _requestedUrl: 'http://example.org/file'
        };
        this.uri = undefined;
        this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply((uri) => {
          this.uri = uri;
          return ([200, 'body', {someHeader: 'someHeaderValue', 'content-type': 'text/html; charset=utf-8'}]);
        });
      });

      describe('with userAgent NOT from the whitelist', function() {
        beforeEach(function(done) {
          this.runIt(done, { whitelistUserAgents: ['my-custom-user-agent'] });
        });

        it('does not prerender', function() {
          expect(this.uri).toBeUndefined();
        });
        itCalledNext();
      });

      describe('with userAgent from the whitelist', function() {
        beforeEach(function(done) {
          this.req.headers['user-agent'] = 'my-custom-user-agent';
          this.runIt(done, { whitelistUserAgents: ['my-custom-user-agent'] });
        });

        it('prerenders', function() {
          expect(this.uri).toEqual('/http://example.org/file')
        });
      });

      describe('with whitelist and botsOnly', function() {
        beforeEach(function() {
          this.req.headers['user-agent'] = 'my-custom-user-agent';
        });
        it('fails', function() {
          expect(() => {
            this.runIt(function() {}, { whitelistUserAgents: ['my-custom-user-agent'], botsOnly: true })
          }).toThrow(new Error("Can't use both botsOnly and whitelistUserAgents"));
        })
      })

    });

    describe('botsOnly option', function() {
      beforeEach(function() {
        this.req = {
          headers: {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36'
          },
          _requestedUrl: 'http://example.org/file'
        };
        this.uri = undefined;
        this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply((uri) => {
          this.uri = uri;
          return ([200, 'body', {someHeader: 'someHeaderValue', 'content-type': 'text/html; charset=utf-8'}]);
        });
      });

      describe('normal userAgent, default botOnly option', function() {
        beforeEach(function(done) {
          this.runIt(done);
        });

        it('prerenders', function() {
          expect(this.uri).toEqual('/http://example.org/file')
        });
      });

      describe('normal userAgent, botOnly option is true', function() {
        beforeEach(function(done) {
          this.runIt(done, { botsOnly: true });
        });

        it('does not prerender', function() {
          expect(this.uri).toBeUndefined();
        });
        itCalledNext();
      });

      describe('bot userAgent, when botOnly option is true', function() {
        beforeEach(function(done) {
          this.req.headers['user-agent'] = 'twitterbot';
          this.runIt(done, { botsOnly: true });
        });

        it('prerenders', function() {
          expect(this.uri).toEqual('/http://example.org/file')
        });
      });

      describe('normal userAgent, when botOnly option is true and _escaped_fragment_ is present', function() {
        beforeEach(function(done) {
          this.req._requestedUrl = `http://example.org/file?_escaped_fragment_`
          this.runIt(done, { botsOnly: true });
        });

        it('prerenders', function() {
          expect(this.uri).toEqual('/http://example.org/file?_escaped_fragment_')
        });
      });
    });

    describe('valid requirements', function() {
      beforeEach(function() {
        this.req = { headers: { 'user-agent': 'twitterbot/1.0' }, _requestedUrl: 'http://example.org/files.m4v.storage/lol' };
      });

      describe('when request lib returns error', function() {
        beforeEach(function(done) {
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).replyWithError('server error');
          this.runIt(done);
        });

        itCalledNext();
      });

      describe('when server returns error', function() {
        beforeEach(function(done) {
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply(() => [500, 'errmsg']);
          this.runIt(done);
        });

        itCalledNext();
      });

      describe('when server returns rate limited', function() {
        beforeEach(function(done) {
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply(() => [429, 'errmsg']);
          this.runIt(done);
        });

        itCalledNext();
      });

      describe('when server returns bad request (client/user error)', function() {
        beforeEach(function(done) {
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply(() => [400, 'errmsg']);
          this.runIt(done);
        });

        it('returns pre-rendered body', function() {
          expect(this.res.end.calls.mostRecent().args[0]).toMatch(/user error/);
        });
      });

      ['/', '/index', '/index.htm', '/index.html', 'index.bak.html'].forEach(function(basename) {

        describe('when server returns success', function() {
          beforeEach(function(done) {
            this.req._requestedUrl = `http://example.org/files.m4v.storage${basename}`
            this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply((uri) => {
              this.uri = uri;
              return ([202, 'body', {someHeader: 'someHeaderValue', 'content-type': 'text/html; charset=utf-8'}]);
            });
            this.runIt(done);
          });

          it('requests correct path', function() {
            expect(this.uri).toBe(`/http://example.org/files.m4v.storage${basename}`);
          });
          it('returns pre-rendered status and only the content-type header', function() {
            expect(this.res.writeHead).toHaveBeenCalledWith(202, {'content-type': 'text/html; charset=utf-8'});
          });
          it('returns pre-rendered body', function() {
            expect(this.res.end).toHaveBeenCalledWith('body');
          });
        });

      });

      describe('enableMiddlewareCache is true', function() {
        beforeEach(function(done) {
          this.requestCount = 0;
          this.req._requestedUrl = `http://example.org/`
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply(uri => {
            this.uri = uri;
            this.requestCount += 1;
            return ([200, 'body', { 'content-type': 'text/plain' }]);
          })
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply(uri => {
            this.requestCount += 1;
            return ([200, 'body2', { 'content-type': 'text/html' }]);
          })
          this.runIt(done, { enableMiddlewareCache: true });
        });

        beforeEach(function(done) {
          this.runIt(done, { enableMiddlewareCache: true });
        });

        it('only makes 1 request', function() {
          expect(this.requestCount).toBe(1);
        });
        it('requests correct path', function() {
          expect(this.uri).toBe(`/http://example.org/`);
        });
        it('returns pre-rendered status and only the content-type header', function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(200, {'content-type': 'text/plain'});
        });
        it('returns pre-rendered body', function() {
          expect(this.res.end).toHaveBeenCalledWith('body');
        });

        describe('after clearing', function() {
          beforeEach(function(done) {
            this.subject.cache.clear('http://example.org');
            this.runIt(done, { enableMiddlewareCache: true });
          });

          it('makes another request', function() {
            expect(this.requestCount).toBe(2);
          });
          it('requests correct path', function() {
            expect(this.uri).toBe(`/http://example.org/`);
          });
          it('returns pre-rendered status and only the content-type header', function() {
            expect(this.res.writeHead).toHaveBeenCalledWith(200, {'content-type': 'text/html'});
          });
          it('returns pre-rendered body', function() {
            expect(this.res.end).toHaveBeenCalledWith('body2');
          });

        });

      });
    });

  });
})
