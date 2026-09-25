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
`src/types/lesson-schema.generated.ts` and `src/schemas.generated.ts` (the
two schemas as modules for the structural layer, without their annotations,
engine#203) are **generated** from the schema (their headers say `DO NOT
EDIT`); do not hand-edit them - regenerate with `make sync-types`; the drift
check runs in `release-check` + CI.
`schema/quality-rules.json` has a twin in code, `QUALITY_MINIMUMS` in
`src/quality.ts` (the `/rules` entry cannot read JSON from the file system):
change a minimum in both, `src/quality.test.ts` fails when they differ.

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
2. **Changelog** - add a dated section to [`CHANGELOG.md`](CHANGELOG.md) (Keep-a-Changelog style; the README only links there).
3. **Docs** - bring every doc up to date with what the release ships, not only
   the ones its PRs touched: README, CONTRIBUTING, `docs/`, both blog
   languages, in-code docs. Search the docs for each change (rule ids, moved
   files, version numbers, counts, "nothing does X" claims) and record the
   audit in the release PR. The checklist is
   [`.claude/rules/release.md`](.claude/rules/release.md).
4. **`make release-check`** - must be green (lint + typecheck + test + build).
5. **Commit + push** the bump + changelog + docs to `main`.
6. **Tag** `vX.Y.Z` on that commit (annotated) and push it:
   `git tag -a vX.Y.Z -m "vX.Y.Z - <summary>" && git push origin vX.Y.Z`.
   Verify the target rather than assume it (`git log -S '"version": "X.Y.Z"'`).
7. **`make publish`** - re-runs `release-check`, then `npm publish`
   (`npm whoami` first). Then wait until `npm view learn-content-engine version`
   prints the new version before step 8: a successful publish takes one to
   several minutes to become visible (0.30.0: about 60 s; 0.31.0: about
   8 minutes, after npm announced "Your package is being processed"), and the
   parity check below reads the registry, not the publish output. Poll the
   registry (`curl -s https://registry.npmjs.org/learn-content-engine`) rather
   than trust the publish output's `+ learn-content-engine@X.Y.Z`.
8. **GitHub release** for the tag, body = the changelog excerpt
   (`gh release create vX.Y.Z --latest --notes-file ...`).

Do steps 6-8 for every release, in this order. **npm before the GitHub
release, not after** - the Release parity workflow
(`.github/workflows/release-parity.yml`) triggers on `release: published`
and checks npm immediately; publishing to npm first means that check is
never a guaranteed false red. A version that is committed but not tagged +
published is not done.

## Identity is a contract

Two content-facing rules the engine can only partly enforce, so they are
written down here and mirrored in the content repos' authoring docs:

- **A published `stable_id` is never renamed or reused.** It is the identity
  learner progress and SRS scheduling join on. Editing the content under a
  constant id is the intended case; changing the id orphans every learner's
  progress for that element silently. The same holds for a lesson FILENAME,
  which is the lesson's identity (display order is a separate concern; see
  adaptive-learner#2172 for the precedent that separated them).
- **Retrofits are add-only.** Minting ids into existing content inserts
  `stable_id` members and touches nothing else, so old derived keys and new
  ids coexist in one file and a consumer can compute its remap locally. Use
  `learn-content-engine mint-stable-ids` (it proves the add-only property per
  file); never a reformat-in-passing.

## Adding a new exercise type

As of v0.6.0 the engine holds [schema authority](README.md#schema-authority), so
a **new `ExerciseType` now starts here**:

1. Add the enum value + fields to the authored `schema/lesson.schema.json`, then
   run `make sync-types` to regenerate `src/types/lesson-schema.generated.ts`.
   The [byte baseline](src/schema-baseline.test.ts) intentionally goes red on a
   schema change - update it in the same commit so the change is deliberate.
2. Mirror the new type's cross-field rule in `src/rules.ts` (RED first: add a
   rejecting negative test, then implement) with `E-*`/`W-*` rule ids + catalog
   rows. A message that names a value (a term, an id, a count) also passes it as
   `params`: add a row to the "Issue parameters" table in
   [`docs/lesson-format.md`](docs/lesson-format.md#issue-parameters) and a
   triggering case to `src/issue-params.test.ts`. That test fails when a
   message carries a value without params, or the table and the code disagree.
3. Add a valid fixture under `src/__fixtures__/conformance/` and a tested
   example in [`docs/lesson-format.md`](docs/lesson-format.md) - the coverage
   assertion in `src/docs-examples.test.ts` expects one example per type/mode.
4. Bump the library version (additive -> minor) and update the changelog;
   consumers (adaptive-learner, the content repos) then re-pin and mirror.

Consumers still need the type wired on their side (renderer + grader). A worked
design of such a change (the `multiple_choice` type, `word_tiles`
grade-by-string, `from_cards`) is in
[docs/proposals/author-ergonomics-app-track.md](docs/proposals/author-ergonomics-app-track.md).
