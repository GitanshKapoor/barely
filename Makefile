.PHONY: install build test lint clean

install:
	@echo "Syncing uv workspace..."
	uv sync

build:
	@echo "Building packages..."
	uv build

test:
	pytest tests/

lint:
	ruff check .

clean:
	rm -rf dist/ build/ .pytest_cache
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name "__pycache__" -exec rm -rf {} +
