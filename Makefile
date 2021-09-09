#
#	Makefile for DynamoDB Metrics
#
all: build

.PHONY: always

build:
	npm i --package-lock-only
	npm run build

publish promote: build cov
	npm publish
	coveralls < coverage/lcov.info

test: always
	jest

cov:
	jest --coverage

pubcov: cov
	coveralls < coverage/lcov.info

lint:
	npm run lint
