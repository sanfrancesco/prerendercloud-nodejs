"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1000;

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

module.exports = function (got, options, debug) {
  var isRetryableStatusCode = function isRetryableStatusCode(code) {
    return code === 500 || code === 503 || code === 504;
  };

  var isRetryable = function isRetryable(err, retries) {
    return retries <= options.options.retries && err instanceof got.HTTPError && isRetryableStatusCode(err.response.statusCode);
  };

  var origGotGet = got.get;

  var GotGetWithRetry = function () {
    function GotGetWithRetry(origArguments) {
      _classCallCheck(this, GotGetWithRetry);

      this.origArguments = origArguments;
      this.attempts = 0;
    }

    _createClass(GotGetWithRetry, [{
      key: "get",
      value: function get(url) {
        var _this = this;

        this.attempts += 1;
        return origGotGet.apply(got, this.origArguments).catch(function (err) {
          if (!isRetryable(err, _this.attempts)) return Promise.reject(err);

          debug("retrying", {
            url: _this.origArguments[0],
            statusCode: err.response.statusCode,
            attempts: _this.attempts
          });

          var noise = Math.random() * 100;
          var ms = (1 << _this.attempts) * DELAY_MS + noise;

          return delay(ms).then(_this.get.bind(_this));
        });
      }
    }]);

    return GotGetWithRetry;
  }();

  got.get = function () {
    return new GotGetWithRetry(arguments).get();
  };
};