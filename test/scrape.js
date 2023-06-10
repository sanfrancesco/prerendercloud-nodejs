const fs = require("fs");
const path = require("path");
const prerendercloud = require("../source/index");

(async () => {
  const outDir = path.join(__dirname, "out/scrape");
  fs.mkdirSync(outDir, { recursive: true });

  // test 1
  const { body: body1 } = await prerendercloud.scrape("http://example.com");
  fs.writeFileSync(path.join(outDir, "test1-body.html"), body1);

  // test 2
  const { body: body2, screenshot: screenshot2 } = await prerendercloud.scrape(
    "http://example.com",
    {
      withScreenshot: true,
    }
  );
  fs.writeFileSync(path.join(outDir, "test2-with-screenshot.png"), screenshot2);
  fs.writeFileSync(path.join(outDir, "test2-body.html"), body2);

  // test 3
  const {
    body: body3,
    screenshot: screenshot3,
    meta: meta3,
    links: link3,
    headers: headers3,
    statusCode: statusCode3,
  } = await prerendercloud.scrape("http://example.com", {
    withScreenshot: true,
    withMetadata: true,
  });
  if (statusCode3 !== 200) {
    throw new Error(`Expected statusCode to be 200, but got ${statusCode3}`);
  } else {
    console.log("test3 withMetadata statusCode passed");
  }
  if (Object.keys(headers3).length === 0) {
    throw new Error(`Expected headers to be non-empty, but got ${headers3}`);
  } else {
    console.log("test3 withMetadata headers passed");
  }

  const expectedLinks = ["https://www.iana.org/domains/example"];
  const expectedMeta = {
    title: "Example Domain",
    h1: "Example Domain",
    description: null,
    ogImage: null,
    ogTitle: null,
    ogDescription: null,
    ogType: null,
    twitterCard: null,
  };
  if (JSON.stringify(link3) !== JSON.stringify(expectedLinks)) {
    throw new Error(
      `Expected links to be ${JSON.stringify(
        expectedLinks
      )}, but got ${JSON.stringify(link3)}`
    );
  } else {
    console.log("test3 withMetadata links passed");
  }
  if (JSON.stringify(meta3) !== JSON.stringify(expectedMeta)) {
    throw new Error(
      `Expected meta to be ${JSON.stringify(
        expectedMeta
      )}, but got ${JSON.stringify(meta3)}`
    );
  } else {
    console.log("test3 withMetadata meta passed");
  }

  fs.writeFileSync(path.join(outDir, "test3-with-screenshot.png"), screenshot3);
  fs.writeFileSync(path.join(outDir, "test3-body.html"), body3);
})();
