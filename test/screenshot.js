const fs = require("fs");
const path = require("path");
const prerendercloud = require("../source/index");

(async () => {
  const outDir = path.join(__dirname, "out");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  await prerendercloud
    .screenshot("http://example.com", {
      format: "webp",
      viewportScale: 3,
      viewportX: 300,
      viewportY: 50,
      viewportWidth: 765,
      viewportHeight: 330,
    })
    .then((jpgBuffer) =>
      fs.writeFileSync(path.join(outDir, "example.webp"), jpgBuffer)
    );

  await prerendercloud
    .screenshot("http://example.com", {
      format: "jpg",
      viewportScale: 1.5,
    })
    .then((jpgBuffer) =>
      fs.writeFileSync(path.join(outDir, "example.jpg"), jpgBuffer)
    );

  await prerendercloud
    .pdf("http://example.com", {
      noPageBreaks: true,
      scale: 2,
    })
    .then((pdf) => fs.writeFileSync(path.join(outDir, "example.pdf"), pdf));

  await prerendercloud
    .pdf("http://example.com", {
      marginTop: 0.1,
      marginRight: 0.1,
      marginBottom: 0.1,
      marginLeft: 0.1,
      paperWidth: 5,
      paperHeight: 3,
      pageRanges: "1",
      emulatedMedia: "screen",
    })
    .then((pdf) =>
      fs.writeFileSync(path.join(outDir, "notecard-width-example.pdf"), pdf)
    );
})();
