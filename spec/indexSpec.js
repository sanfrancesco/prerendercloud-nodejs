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
      this.next = jasmine.createSpy();
      this.runIt = function(done = () => {}) {
        this.res = {
          send: jasmine.createSpy().and.callFake(done),
          status: jasmine.createSpy()
        }
        if (this.req._requestedUrl) {
          parsed = url.parse(this.req._requestedUrl);
          this.req.protocol = parsed.protocol.replace(/:/g,'');
          this.req.host = parsed.host;
          this.req.path = parsed.path.replace(/.*\//g,'');
          this.req.originalUrl = parsed.path;
          this.req.get = name => this.req[name];
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
          this.req = { headers: { 'user-agent': 'invalid' } };
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
    });

    describe('valid requirements', function() {
      describe('with valid user-agent and valid extension', function() {
        beforeEach(function(done) {
          this.req = { headers: { 'user-agent': 'twitterbot' }, _requestedUrl: 'http://example.org/file/lol' };
          this.prerenderServer = nock('http://service.prerender.cloud').get(/.*/).reply((uri) => {
            this.uri = uri;
            return ([200, 'body', {}]);
          });
          this.runIt(done);
        });

        it('requests correct path', function() {
          expect(this.uri).toBe('/http://example.org/file/lol');
        });
        it('returns pre-rendered body', function() {
          expect(this.res.send).toHaveBeenCalledWith('body');
        });
      });
    });

  });
})