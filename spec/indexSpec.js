// var prerenderMiddleware = require('../distribution/index');
var prerenderMiddleware = require('../source/index');
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
        beforeEach(function() {
          this.req = {};
          this.runIt();
        });

        itCalledNext();
      });
      describe('with empty headers', function() {
        beforeEach(function() {
          this.req = { headers: {} };
          this.runIt();
        });

        itCalledNext();
      });
      describe('with invalid user-agent', function() {
        beforeEach(function() {
          this.req = { headers: { 'user-agent': 'prerendercloud' } };
          this.runIt();
        });

        itCalledNext();
      });
      describe('with valid user-agent and invalid extension', function() {
        beforeEach(function() {
          this.req = { headers: { 'user-agent': 'twitterbot' }, _requestedUrl: 'http://example.org/file.m4v' };
          this.runIt();
        });

        itCalledNext();
      });
      describe('with valid user-agent and valid extension but already rendered', function() {
        beforeEach(function() {
          this.req = { headers: { 'user-agent': 'twitterbot', 'x-prerendered': 'true' }, _requestedUrl: 'http://example.org/file' };
          this.runIt();
        });

        itCalledNext();
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