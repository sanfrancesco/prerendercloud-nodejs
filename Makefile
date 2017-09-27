.PHONY: build publish test

build:
	npm run build

# following https://booker.codes/how-to-build-and-publish-es6-npm-modules-today-with-babel/ for transpiled npm packages
publish: build
	npm publish

test:
	NODE_ENV=test \
	PRERENDER_SERVICE_URL="https://service.prerender.cloud" \
	./node_modules/jasmine/bin/jasmine.js
