# Coding standards

Adapted from the adaptive-learner project, reduced to what applies to
this framework-agnostic TypeScript library (no backend, no React, no
plugins). The TDD workflow lives in `tdd.md`.

## General

- Developer: Asterios Raptis (solo developer, AI-assisted).
- Goal: pragmatic, maintainable, quickly deliverable. No over-engineering.
- When unclear: ask rather than guess.

## TypeScript

- Strict mode enabled (`tsconfig.json`). No `any` without a comment.
- `interface` for data models, `type` for unions/aliases.
- Framework-agnostic: this library imports only content *types* and a
  YAML/JSON parser - never a network fetcher, a database, or a UI
  framework. That import boundary IS the extraction seam
  (Consumer → Engine, never Engine → Consumer). Fetch and persistence
  stay in the caller.
- Extract complex logic into small pure functions, individually testable
  without reconstructing the whole context.
- Public functions get a doc comment (`/** ... */`) stating what they
  return and the notable edge cases.

## Naming

- PascalCase (types, interfaces), camelCase (functions, variables).
- No `I`-prefix for interfaces: `LessonSetContext`, not
  `ILessonSetContext`.
- No generic names: `data`, `info`, `result`, `temp`, `item`, `obj`,
  `val`, `tmp`, `x` are forbidden. Use `lessonItem`, `parsedSet`,
  `setContext` instead. Exception: loop variables (`i`, `j`) and short
  lambdas.

## Formatting

- No em-dash (`--` or Unicode U+2014). Use hyphens (`-`) or commas.
- Standard UTF-8 only. No emojis in code or comments.
- 2-space indentation.
- Linting: ESLint (`npm run lint`). Keep the lint gate green.

## Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `chore:`. Provide a scope when clear: `feat(adapter): ...`,
  `test(manifest): ...`.
- One commit per logical change, not everything in one.
- **No `--amend` + force-push on an open PR.** Add a NEW commit instead;
  the squash-merge still produces a single clean commit. Amend +
  force-push can desync the PR head and silently drop the change.

## Function design and cohesion

- Every function has exactly one responsibility (parse OR transform, not
  both). A function operates at ONE abstraction level.
- Guard clauses instead of deeply nested `if/else`. Catch invalid inputs
  at the start (crash early), e.g. `asContentSetBook` returns `null` up
  front when there is no title.
- Comments like `// Step 1`, `// Step 2` inside one function signal low
  cohesion - each step becomes its own function.

## DRY - Don't Repeat Yourself

- Same logic in two places: extract into a shared function.
- Same constants in two places: move them into one place.
- Three duplicates: refactor immediately, not later.

## Boy Scout Rule

- Leave code cleaner than you found it. If you touch a function and it
  violates these rules, fix the violation along with your change.

## Tests

- Vitest (`npm test`). Tests live next to the source as `*.test.ts`.
- TDD: test first (RED), minimal code (GREEN), refactor. See `tdd.md`
  for the workflow and the four-test-per-feature guideline.
- New function: at least a happy path + one error/edge case (the floor).
- Bug fixes: failing test FIRST, then fix (the RED step).
- Cover every new behavior branch (`??`, `? :`, guard clauses).
  Meaningful coverage is the goal, not the percentage.
- `npm test` (and the full `make release-check` gate) must stay green
  after every change.

## Dependencies

- New runtime dependencies only after asking. The library keeps a
  minimal footprint (today: `yaml` only) - zero-to-few runtime deps is
  a feature, not an accident.
