const prerendercloud = require("../source/index");

prerendercloud
  .screenshot("http://example.com")
  // .then(jpgBuffer => fs.writeFileSync("out.jpg", jpgBuffer));
  .then(console.log);
