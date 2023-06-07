const fs = require("fs");
const path = require("path");
const prerendercloud = require("../source/index");

(async () => {
  const outDir = path.join(__dirname, "out/screenshot");
  fs.mkdirSync(outDir, { recursive: true });

  // test1
  const screenshot1 = await prerendercloud.screenshot("http://example.com");
  fs.writeFileSync(path.join(outDir, "test1.png"), screenshot1);

  // test 2
  const screenshot2 = await prerendercloud.screenshot("http://example.com", {
    format: "webp",
    viewportScale: 3,
    viewportX: 300,
    viewportY: 50,
    viewportWidth: 765,
    viewportHeight: 330,
  });
  fs.writeFileSync(path.join(outDir, "test2.webp"), screenshot2);

  // test 3
  const screenshot3 = await prerendercloud.screenshot("http://example.com", {
    format: "jpeg",
    viewportScale: 1.5,
  });
  fs.writeFileSync(path.join(outDir, "test3.jpeg"), screenshot3);
})();
