var prerenderMiddleware;
if (!!process.env.CI) {
  console.log("running transpiled code");
  prerenderMiddleware = require("../../distribution/index");
} else {
  prerenderMiddleware = require("../../source/index");
}

global.prerenderMiddleware = prerenderMiddleware;
