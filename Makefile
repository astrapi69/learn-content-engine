# learn-content-engine Makefile
# Single-package npm library: learn-content-engine
#   Framework-agnostic TypeScript engine that parses lesson content from
#   pluggable sources into a canonical lesson object.
# Tasks are adapted from the feature-strategy monorepo Makefile. Because this
# is a single package (no npm workspaces), the per-workspace build/test targets
# collapse into plain `npm run` invocations. The publish flow runs the full
# quality gate (lint, typecheck, test, build) before pushing to the registry.

.PHONY: help install ci build typecheck lint test test-watch coverage \
        conformance-real pack-dry release-check publish publish-dry clean

# Default
help: ## Show all targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ─── Setup ───────────────────────────────────────────────────────────

install: ## Install dependencies
	npm install

ci: ## Reproducible install from package-lock.json (for CI pipelines)
	npm ci

# ─── Build ───────────────────────────────────────────────────────────

build: ## Build the package (tsc -p tsconfig.build.json -> dist/)
	npm run build

# ─── Quality ─────────────────────────────────────────────────────────

typecheck: ## Type-check without emitting
	npm run typecheck

lint: ## Lint sources with ESLint
	npm run lint

test: ## Run Vitest once
	npm test

test-watch: ## Run Vitest in watch mode
	npm run test:watch

coverage: ## Run Vitest with a v8 coverage report
	npm run test:coverage

# ─── Conformance (on-demand, needs network) ──────────────────────────

conformance-real: build ## Clone both content repos (read-only) and run every set + lesson through the full engine pipeline
	node scripts/conformance-real.mjs

# ─── Package ─────────────────────────────────────────────────────────

pack-dry: build ## Show publish contents of the tarball without publishing
	npm pack --dry-run

# ─── Release ─────────────────────────────────────────────────────────

release-check: lint typecheck test build ## Full quality gate before publishing
	@echo "Release check passed."

publish-dry: release-check ## Dry-run publish to npm (no upload)
	npm publish --dry-run --access public

publish: release-check ## Publish to npm (runs the full quality gate first)
	npm publish --access public

# ─── Cleanup ─────────────────────────────────────────────────────────

clean: ## Remove dist/, coverage/ and node_modules/
	rm -rf dist coverage node_modules
	@echo "Clean."
