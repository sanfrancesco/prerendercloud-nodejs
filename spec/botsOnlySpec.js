var prerenderMiddleware;
if (!!process.env.CI) {
  console.log("running transpiled code");
  prerenderMiddleware = require("../distribution/index");
} else {
  prerenderMiddleware = require("../source/index");
}

describe("botsOnlyList", function() {
  it("exports list", function() {
    expect(prerenderMiddleware.botsOnlyList.length > 0).toBe(true);
  });
  it("includes googlebot", function() {
    expect(prerenderMiddleware.botsOnlyList.includes("googlebot")).toBe(true);
  });
});
