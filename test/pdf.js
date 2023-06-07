const fs = require("fs");
const path = require("path");
const prerendercloud = require("../source/index");

(async () => {
  const outDir = path.join(__dirname, "out/pdf");
  fs.mkdirSync(outDir, { recursive: true });

  // test 1
  const pdf = await prerendercloud.pdf("http://example.com");
  fs.writeFileSync(path.join(outDir, "test1.pdf"), pdf);

  // test 2
  const pdf2 = await prerendercloud.pdf("http://example.com", {
    noPageBreaks: true,
    scale: 2,
  });
  fs.writeFileSync(path.join(outDir, "test2.pdf"), pdf2);

  // test 3
  const pdf3 = await prerendercloud.pdf("http://example.com", {
    marginTop: 0.1,
    marginRight: 0.1,
    marginBottom: 0.1,
    marginLeft: 0.1,
    paperWidth: 5,
    paperHeight: 3,
    pageRanges: "1",
    emulatedMedia: "screen",
  });
  fs.writeFileSync(path.join(outDir, "test3.pdf"), pdf3);
})();
