.PHONY: build publish test

build:
	npm run build

# following https://booker.codes/how-to-build-and-publish-es6-npm-modules-today-with-babel/ for transpiled npm packages
publish: build
	npm publish

test:
	./node_modules/jasmine/bin/jasmine.js
