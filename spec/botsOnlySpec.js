var prerenderMiddleware;
if (!!process.env.CI) {
  console.log("running transpiled code");
  prerenderMiddleware = require("../distribution/index");
} else {
  prerenderMiddleware = require("../source/index");
}

describe("userAgentIsBot", function() {
  it("detects bot", function() {
    expect(
      prerenderMiddleware.userAgentIsBot({ "user-agent": "googlebot" })
    ).toBe(true);
  });
  it("detects bot with strange case", function() {
    expect(
      prerenderMiddleware.userAgentIsBot({ "user-agent": "goOglebot" })
    ).toBe(true);
  });
  it("detects non-bot", function() {
    expect(prerenderMiddleware.userAgentIsBot({ "user-agent": "chrome" })).toBe(
      false
    );
  });
  it("detects non-bot for empty user-agent", function() {
    expect(prerenderMiddleware.userAgentIsBot({ })).toBe(
      false
    );
  });
  it("detects escaped fragment", function() {
    expect(
      prerenderMiddleware.userAgentIsBot(
        { "user-agent": "chrome" },
        "/file?_escaped_fragment_"
      )
    ).toBe(true);
  });

  it("detects x-bufferbot", function() {
    expect(
      prerenderMiddleware.userAgentIsBot(
        { "user-agent": "whatever", "x-bufferbot": "true" },
        "/"
      )
    ).toBe(true);
  });

  describe("botsOnlyList", function() {
    it("exports list", function() {
      expect(prerenderMiddleware.botsOnlyList.length > 0).toBe(true);
    });
    it("includes googlebot", function() {
      expect(prerenderMiddleware.botsOnlyList.includes("googlebot")).toBe(true);
    });
  });
});
