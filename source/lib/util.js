function urlPathIsHtml(urlPath) {
  const basename = urlPath.split("/").pop();

  if (basename === "") return true;

  // doesn't detect index.whatever.html (multiple dots)
  const hasHtmlOrNoExtension = !!basename.match(/^(([^.]|\.html?)+)$/);

  if (hasHtmlOrNoExtension) return true;

  // hack to handle basenames with multiple dots: index.whatever.html
  const endsInHtml = !!basename.match(/.html?$/);

  if (endsInHtml) return true;

  // hack to detect extensions that are not HTML so we can handle
  // paths with dots in them
  const endsInOtherExtension = basename.match(/\.[a-zA-Z0-9]{1,5}$/);
  if (!endsInOtherExtension) return true;

  return false;
}

function isFunction(functionToCheck) {
  var getType = {};
  return (
    functionToCheck &&
    getType.toString.call(functionToCheck) === "[object Function]"
  );
}

module.exports = { urlPathIsHtml, isFunction };
