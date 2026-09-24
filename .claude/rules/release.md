# Releasing: every doc is up to date before the release

Source: Asterios Raptis, 2026-09-24 ("bevor den release immer alle dokus
updaten, wenn es noch keine rule dafür gibt dann jetzt anlegen").

Before any release (the "Releasing" steps in `CONTRIBUTING.md`), every doc is
brought up to date with what the release ships, not only the docs a PR in it
touched. A release whose docs are behind is not ready, the same as a red gate.

## Which docs ("all")

- `README.md`: feature list, public API table, subpath entries, shipped schema
  artifacts, scope.
- `CONTRIBUTING.md`: how to add a type or a rule, the release steps.
- `CHANGELOG.md`: the release section.
- `docs/*.md`: `lesson-format.md` (with the rule catalog), `validation.md`,
  `concepts.md`, `architecture.md`, `extensions.md`, `getting-started.md`,
  `authoring-patterns.md`, `qti.md`, `schema-diagrams.md` (generated),
  `comparative-analysis.md` (package version, counts).
- `docs/blog/*.md` and `docs/blog/de/*.md`, both languages together. Dated
  articles keep their history, but instructions and present-tense claims
  about the engine must still hold.
- `docs/proposals/*.md`: records of past plans. Fix what points a reader at
  current code (a moved file) or mark it as historical.
- In-code docs: module docstrings, TypeDoc (`npm run docs:api:check`), the
  schema `description` fields (those move with the schema version).
- Downstream: docs in the content template and repos that describe engine
  behaviour are listed in the release PR and updated in the re-pin wave.

## How

1. Take the release's changes (the CHANGELOG section) and, for each, search
   the docs for what it touches: rule ids, function and file names (a split
   file breaks "add the rule in src/validate.ts"), version numbers, counts,
   and claims of absence ("nothing does X", "an entry point would ...").
2. Update every hit or confirm it still holds, in every language version of a
   mirrored doc.
3. A quantitative claim (test count, bundle size, measured warning count) is
   re-measured or carries its date.
4. Gates: `make release-check` (docs-version-claims, links, rule catalog,
   README exports), `make prose-check`, `npm run docs:api:check`.
5. The release PR carries a "Docs audit" section: every doc checked, what
   changed, or why nothing had to.
