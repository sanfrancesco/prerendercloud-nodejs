.PHONY: publish test

# following https://booker.codes/how-to-build-and-publish-es6-npm-modules-today-with-babel/ for transpiled npm packages
publish:
	npm run build
	npm publish

test:
	./node_modules/jasmine/bin/jasmine.js