const DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1000;

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

module.exports = (got, options, debug) => {
  const isRetryableStatusCode = code =>
    code === 500 || code === 503 || code === 504;

  const isRetryable = (err, retries) =>
    retries <= options.options.retries &&
    err instanceof got.HTTPError &&
    isRetryableStatusCode(err.response.statusCode);

  const origGotGet = got.get;

  class GotGetWithRetry {
    constructor(origArguments) {
      this.origArguments = origArguments;
      this.attempts = 0;
    }
    get(url) {
      this.attempts += 1;
      return origGotGet.apply(got, this.origArguments).catch(err => {
        if (!isRetryable(err, this.attempts)) return Promise.reject(err);

        debug("retrying", {
          url: this.origArguments[0],
          statusCode: err.response.statusCode,
          attempts: this.attempts
        });

        const noise = Math.random() * 100;
        const ms = (1 << this.attempts) * DELAY_MS + noise;

        return delay(ms).then(this.get.bind(this));
      });
    }
  }

  got.get = function() {
    return new GotGetWithRetry(arguments).get();
  };
};
