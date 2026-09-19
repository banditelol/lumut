.PHONY: install build test dev

install:
	uv venv --allow-existing
	uv pip install -e '.[test]'
	npm install

build:
	npm run build

test:
	uv run pytest

dev:
	npm run dev:exp-data-editor

