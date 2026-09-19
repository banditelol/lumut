.PHONY: install build package test docs docs-serve dev

install:
	uv venv --allow-existing
	uv pip install -e '.[test]'
	npm install

build:
	npm run build

# Create the sdist and wheel that are uploaded to PyPI. The frontend bundle is
# built first so Hatchling includes the current asset from lumut/static/.
package: build
	uv build

test:
	uv run --extra test pytest

docs:
	uv run --extra docs zensical build --clean

docs-serve: docs
	uv run python -m http.server --directory site

dev:
	npm run dev:exp-data-editor
