# Contributing

Thanks for helping improve `learn-content-engine`. It is a small, framework-
agnostic TypeScript library; the bar is pragmatic, maintainable, well-tested
code - no over-engineering.

## Development

```bash
npm install
make release-check   # lint + typecheck + test + build (the full gate)
```

Useful targets (`make help` lists all):

- `make test` / `make coverage` - Vitest, optionally with a v8 coverage report.
- `make lint` / `make typecheck` - ESLint / `tsc --noEmit`.
- `make conformance-real` - on-demand run over the real content repos (network).

`make release-check` must stay green after every change.

## Test-driven development (required)

This repo follows Red-Green-Refactor for any change with behavior/logic (a new
code path, condition, mapping, or rule). The rules live in
[`.claude/rules/tdd.md`](.claude/rules/tdd.md) and
[`.claude/rules/coding-standards.md`](.claude/rules/coding-standards.md):

1. **RED** - write a failing test that describes the change first. No production
   code before a failing test.
2. **GREEN** - the minimal code to pass.
3. **REFACTOR** - clean up; tests stay green.

Per feature/fix, aim for the four-test shape: a reproduction test, the happy
path, edge cases, and boundaries. Cover every new behavior branch. **Bug fixes
start with a failing test that reproduces the bug.** Prose-only doc changes are
exempt - but the `json` examples in [`docs/lesson-format.md`](docs/lesson-format.md)
are extracted and validated by `src/docs-examples.test.ts`, so keep them valid.

Coverage is expected to stay at 100% for the source files; meaningful coverage,
not the percentage, is the goal.

## Never hand-edit generated files

The `schema/*.json` artifacts are the **authored canonical source** (this engine
holds schema authority as of v0.6.0); edit them deliberately - the frozen byte
baseline (`src/schema-baseline.test.ts`) guards against accidental content drift,
and consumers re-pin. See [Schema authority](README.md#schema-authority).
`src/types/lesson-schema.generated.ts` is **generated** from the schema
(its header says `DO NOT EDIT`); do not hand-edit it - regenerate with
`make sync-types`; the drift check runs in `release-check` + CI.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
  `refactor:`, `docs:`, `test:`, `chore:`, with a scope when clear
  (`feat(validate): ...`).
- One commit per logical change.
- Do not `--amend` + force-push an open PR; add a new commit instead.

## Releasing

**Every** version ships through the same ordered steps, so the npm registry and
`main` never silently diverge (the registry once lagged `main` by two minor
versions - do not let that recur):

1. **Bump** `version` in `package.json` (semver: additive feature -> minor,
   docs/fix -> patch; skip only for changes that alter nothing shipped).
2. **Changelog** - add the entry to the README `## Changelog` section.
3. **`make release-check`** - must be green (lint + typecheck + test + build).
4. **Commit + push** the bump + changelog to `main`.
5. **Tag** `vX.Y.Z` on that commit (annotated) and push it:
   `git tag -a vX.Y.Z -m "vX.Y.Z - <summary>" && git push origin vX.Y.Z`.
   Verify the target rather than assume it (`git log -S '"version": "X.Y.Z"'`).
6. **GitHub release** for the tag, body = the changelog excerpt
   (`gh release create vX.Y.Z --latest --notes-file ...`).
7. **`make publish`** - re-runs `release-check`, then `npm publish`
   (`npm whoami` first). Confirm with `npm view learn-content-engine version`.

Do steps 5-7 for every release, in this order. A version that is committed but
not tagged + published is not done.

## Adding a new exercise type

As of v0.6.0 the engine holds [schema authority](README.md#schema-authority), so
a **new `ExerciseType` now starts here**:

1. Add the enum value + fields to the authored `schema/lesson.schema.json`, then
   run `make sync-types` to regenerate `src/types/lesson-schema.generated.ts`.
   The [byte baseline](src/schema-baseline.test.ts) intentionally goes red on a
   schema change - update it in the same commit so the change is deliberate.
2. Mirror the new type's cross-field rule in `src/validate.ts` (RED first: add a
   rejecting negative test, then implement) with `E-*`/`W-*` rule ids + catalog
   rows.
3. Add a valid fixture under `src/__fixtures__/conformance/` and a tested
   example in [`docs/lesson-format.md`](docs/lesson-format.md) - the coverage
   assertion in `src/docs-examples.test.ts` expects one example per type/mode.
4. Bump the library version (additive -> minor) and update the changelog;
   consumers (adaptive-learner, the content repos) then re-pin and mirror.

Consumers still need the type wired on their side (renderer + grader). A worked
design of such a change (the `multiple_choice` type, `word_tiles`
grade-by-string, `from_cards`) is in
[docs/proposals/author-ergonomics-app-track.md](docs/proposals/author-ergonomics-app-track.md).
