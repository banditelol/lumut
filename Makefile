.PHONY: install build test docs docs-serve dev

install:
	uv venv --allow-existing
	uv pip install -e '.[test]'
	npm install

build:
	npm run build

test:
	uv run pytest

docs:
	uv run --extra docs zensical build --clean

docs-serve: docs
	uv run python -m http.server --directory site

dev:
	npm run dev:exp-data-editor
