// var prerenderMiddleware = require('../distribution/index');
var prerenderMiddleware = require('../source/index');
const url = require('url');
var nock = require('nock');

describe('prerender middleware', function() {
  beforeEach(function() {
    this.subject = prerenderMiddleware;
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
      this.runIt = function(done = () => {}) {
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

      describe('when server returns success', function() {
        beforeEach(function(done) {
          this.prerenderServer = nock('https://service.prerender.cloud').get(/.*/).reply((uri) => {
            this.uri = uri;
            return ([202, 'body', {someHeader: 'someHeaderValue', 'content-type': 'text/html; charset=utf-8'}]);
          });
          this.runIt(done);
        });

        it('requests correct path', function() {
          expect(this.uri).toBe('/http://example.org/files.m4v.storage/lol');
        });
        it('returns pre-rendered status and only the content-type header', function() {
          expect(this.res.writeHead).toHaveBeenCalledWith(202, {'content-type': 'text/html; charset=utf-8'});
        });
        it('returns pre-rendered body', function() {
          expect(this.res.end).toHaveBeenCalledWith('body');
        });
      });
    });

  });
})