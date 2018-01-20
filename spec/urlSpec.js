describe("util", function() {
  describe("urlPathIsHtml", function() {
    it("detects no extension", function() {
      expect(prerenderMiddleware.util.urlPathIsHtml("/")).toBe(true);
    });
    it("detects html", function() {
      expect(prerenderMiddleware.util.urlPathIsHtml("index.html")).toBe(true);
    });
    it("detects htm", function() {
      expect(prerenderMiddleware.util.urlPathIsHtml("index.htm")).toBe(true);
    });
    it("detects double dot html", function() {
      expect(prerenderMiddleware.util.urlPathIsHtml("index.bak.html")).toBe(
        true
      );
    });
    it("does not detect js", function() {
      expect(prerenderMiddleware.util.urlPathIsHtml("index.js")).toBe(false);
    });
    it("does not detect m4v", function() {
      expect(prerenderMiddleware.util.urlPathIsHtml("index.m4v")).toBe(false);
    });

    it("handles miscellaneous dots", function() {
      expect(
        prerenderMiddleware.util.urlPathIsHtml(
          "categories/1234;lat=-999999.8888888;lng=12341234.13371337;location=SanFrancisco"
        )
      ).toBe(true);
    });
  });
});
