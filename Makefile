# learn-content-engine Makefile
# Single-package npm library: learn-content-engine
#   Framework-agnostic TypeScript engine that parses lesson content from
#   pluggable sources into a canonical lesson object.
# Tasks are adapted from the feature-strategy monorepo Makefile. Because this
# is a single package (no npm workspaces), the per-workspace build/test targets
# collapse into plain `npm run` invocations. The publish flow runs the full
# quality gate (lint, typecheck, test, build) before pushing to the registry.

.PHONY: help install ci build typecheck lint test test-watch coverage \
        sync-types sync-types-check conformance-real pack-dry release-check \
        publish publish-dry clean

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

# ─── Schema types (canonical: engine authors the schema) ─────────────

sync-types: ## Regenerate src/types/lesson-schema.generated.ts from schema/lesson.schema.json
	node scripts/generate-lesson-types.mjs

sync-types-check: ## Exit non-zero if the generated lesson types drift from the schema
	node scripts/generate-lesson-types.mjs --check
	node scripts/generate-schema-diagrams.mjs --check
	node scripts/check-diagram-syntax.mjs

# ─── Conformance (on-demand, needs network) ──────────────────────────

conformance-real: build ## Clone all public content repos (read-only) and run every set + lesson through the full engine pipeline
	node scripts/conformance-real.mjs

prose-check: ## Prose gate over docs/ + README (ms-check: em-dashes, invisible chars)
	@# Floor first: ms-check exits 0 on an empty file set (manuscript-tools#9,
	@# fails open), so the gate proves the set is non-empty before trusting a
	@# green run. STYLE.md is excluded on purpose: it SHOWS the banned
	@# characters. CHANGELOG stays out: old entries describe a point in time.
	@test "$$(find docs -name '*.md' ! -name 'STYLE.md' | wc -l)" -ge 10 \
		|| { echo "prose-check: docs/ yields fewer than 10 markdown files - wrong directory?"; exit 2; }
	ms-check docs --exclude "blog/STYLE.md" --exclude "blog/de/STYLE.md"
	ms-check README.md

# ─── Package ─────────────────────────────────────────────────────────

pack-dry: build ## Show publish contents of the tarball without publishing
	npm pack --dry-run

# ─── Release ─────────────────────────────────────────────────────────

release-check: sync-types-check lint typecheck test build ## Full quality gate before publishing
	@echo "Release check passed."

publish-dry: release-check ## Dry-run publish to npm (no upload)
	npm publish --dry-run --access public

publish: release-check ## Publish to npm (runs the full quality gate first)
	npm publish --access public

# ─── Cleanup ─────────────────────────────────────────────────────────

clean: ## Remove dist/, coverage/ and node_modules/
	rm -rf dist coverage node_modules
	@echo "Clean."
