const DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1000;

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

const isClientTimeout = err =>
  err.name === "RequestError" && err.code === "ETIMEDOUT";

module.exports = (got, options, debug) => {
  const isRetryableStatusCode = code =>
    code === 500 || code === 503 || code === 504;

  const isRetryable = (err, retries) =>
    retries <= options.options.retries &&
    (isClientTimeout(err) ||
      (err instanceof got.HTTPError &&
        isRetryableStatusCode(err.response.statusCode)));

  class GotGetWithRetry {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.attempts = 0;
    }

    get() {
      return new Promise((resolve, reject) => {
        const createGet = () => {
          this.attempts += 1;
          const inst = got(this.url, this.options);
          inst.then(resolve).catch(err => {
            // noop because we catch downstream... but if we don't have this, it throws unhandled rejection
          });
          inst.catch(err => {
            // https://github.com/sindresorhus/got/pull/360#issuecomment-323501098
            if (isClientTimeout(err)) {
              inst.cancel();
            }

            if (!isRetryable(err, this.attempts)) {
              return reject(err);
            }

            debug("retrying", {
              url: this.url,
              statusCode:
                (err.response && err.response.statusCode) || "client-timeout",
              attempts: this.attempts
            });

            const noise = Math.random() * 100;
            const ms = (1 << this.attempts) * DELAY_MS + noise;

            delay(ms).then(createGet);
          });
        };

        createGet();
      });
    }
  }

  got.get = function(url, options) {
    return new GotGetWithRetry(url, options).get();
  };
};
