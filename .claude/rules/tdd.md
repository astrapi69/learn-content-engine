# Test-Driven Development (TDD)

This is the WORKFLOW rule for writing code. It sits on top of the test
discipline in `coding-standards.md` ("failing test FIRST, then fix";
happy path + error case as the floor). Where that states *what* and
*how much* to test, this rule states the *order*: test first, then the
minimal code, then cleanup.

Adapted from the adaptive-learner project for this TypeScript library.
The tools here are `tsc` + Vitest (there is no Python/pytest side).

## Mandatory for code changes with logic

Code changes with behaviour or logic follow the red-green-refactor cycle.
"With logic" means: a new behaviour, a changed code path, a condition, a
calculation, a validation, a mapping (e.g. a new source adapter, a new
manifest branch, a changed `resolve*` rule). Pure mechanics without a
change in behaviour fall under the exceptions below.

### Phase 1: RED (test first)

- Write a test that describes the desired change.
- The test MUST fail (proof that the feature or fix does not exist yet).
- No production code before the failing test.

### Phase 2: GREEN (minimal implementation)

- Write only the code that makes the test pass.
- YAGNI: no premature optimisation, no code "for later".
- `npm run typecheck` (`tsc --noEmit`) + `npm test` (Vitest) green.

### Phase 3: REFACTOR (clean up)

- Improve code smells, duplication, naming (Boy Scout Rule,
  `coding-standards.md`).
- Tests stay green.

## Number of tests per feature or fix

The MINIMUM floor for trivial new functions is happy path + one error
case. For a real feature or fix the TARGET is the following split - at
least four tests that together secure the behaviour:

1. **Reproduction test** - the red test before the fix or feature.
2. **Happy path** - the expected normal case.
3. **Edge cases** - empty, missing or unexpected input (missing `title`,
   empty YAML string, invalid JSON, nullish fields).
4. **Boundaries** - the edges of the valid range (legacy `language`
   alias vs. `target_language`, the `?? "en"` default,
   `cached_version === version` as the boundary to `update_available`).

Floor and target do NOT contradict each other: the floor applies to
trivial new functions, the target to features and fixes. More tests are
allowed, fewer than the floor are not. No artificial tests just to reach
a count - every test checks a real behavioural property. Meaningful
coverage is the goal, not the percentage: new behaviour branches (every
`??`, every `? :`, every guard clause) get covered.

## Bug fixes

- ALWAYS first a test that reproduces the bug (RED, proves the bug).
- Then fix until GREEN.
- The reproduction test stays in the repository as a regression guard.
- Make the failure reproducible first, then fix - no fix without an
  understood cause.

## Exceptions (established project practice)

TDD is NOT enforced for:

- Pure documentation changes (no code).
- Pure configuration (CI, Makefile, `tsconfig`, YAML) without logic.
- Mechanical refactors with existing test coverage: file splits,
  barrel or re-export moves, schema and type generation
  (`lesson-schema.generated.ts`). Here the existing suite MUST stay green
  (proof that nothing broke), but no new behaviour tests are enforced.

The exceptions do not release anyone from the hard rule "`npm test` must
stay green after every change".
