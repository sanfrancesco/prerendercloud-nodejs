.PHONY: build publish test

prettier:
	./node_modules/.bin/prettier --write "source/**/*.js"
	./node_modules/.bin/prettier --write "spec/**/*.js"

build:
	npm run build
	rm -rf publish
	mkdir publish
	cp -r distribution publish/
	cp README.md package.json package-lock.json publish/

# following https://booker.codes/how-to-build-and-publish-es6-npm-modules-today-with-babel/ for transpiled npm packages
publish: build
	npm publish ./publish

test:
	NODE_ENV=test \
	PRERENDER_SERVICE_URL="https://service.prerender.cloud" \
	./node_modules/jasmine/bin/jasmine.js

devtest:
	@for script in screenshot pdf scrape; do \
		NODE_ENV=test PRERENDER_SERVICE_URL=http://localhost:3001 node ./test/$$script.js; \
	done