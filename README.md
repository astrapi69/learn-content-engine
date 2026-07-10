# learn-content-engine

Framework-agnostic TypeScript engine that parses **and validates** lesson
content from pluggable sources into a canonical lesson object.

It takes raw content (a **single-JSON** lesson plus a `manifest.yaml`) and a set
context, and produces canonical lesson / set-entry objects. It contains **no**
network, storage, or UI code - you supply the bytes and keep fetch +
persistence. The bundled, strict JSON-Schema makes it a self-contained **format
reference**: you can author and validate lessons without the app that originated
the format ([Adaptive Learner](https://github.com/astrapi69/adaptive-learner),
EXP-042). Tracks the lesson schema at **v1.5**.

## Install

```bash
npm install learn-content-engine
```

ESM, ships TypeScript declarations, Node >= 18.

### As a git dependency

For development loops against an unreleased revision, or when consuming a fork,
install straight from GitHub, pinned to a commit or tag for reproducibility:

```jsonc
// package.json of the host app
{
  "dependencies": {
    "learn-content-engine": "github:astrapi69/learn-content-engine#<commit-or-tag>"
  }
}
```

`dist/` is not committed, so on install npm runs the package's `prepare` script
(`npm run build`) to compile `dist/` (JS + `.d.ts`) from source in the checkout.
No extra step is needed in the host - a plain `npm install` builds the engine.

## Quick example

```ts
import { parseLesson, validateLesson, type LessonSetContext } from "learn-content-engine";

const context: LessonSetContext = {
  language: "fr", target_language: "fr", source_language: "en", domain: "language",
};
const raw = `{ "id": "01", "title": "Greetings", "steps": [
  { "id": "s1", "type": "exercise",
    "exercise": { "id": "e1", "type": "free_text", "prompt": "Say hello.", "accept": ["bonjour"] } }
] }`;

const lesson = parseLesson(raw, context);        // canonical ContentLesson (set context injected)
const result = validateLesson(JSON.parse(raw));  // explicit, opt-in validation
if (!result.valid) console.error(result.errors); // [{ path, message }, …]
```

## Documentation

- [**Getting started**](docs/getting-started.md) - install, the 5-minute pipeline example.
- [**Concepts**](docs/concepts.md) - the pipeline, context inheritance, the legacy alias, schema policy.
- [**Lesson format reference**](docs/lesson-format.md) - every field and exercise type, with tested examples.
- [**Validation**](docs/validation.md) - the strict schema, the semantic rules, the error model.
- [**Architecture**](docs/architecture.md) - the engine boundary, parity with the app, roadmap.
- [**Contributing**](CONTRIBUTING.md) - TDD workflow, release gate, adding an exercise type.

## Public API

| Export | Kind | Purpose |
|---|---|---|
| `parseLesson` | fn | raw source + context → canonical `ContentLesson` (via an adapter) |
| `singleJsonLessonAdapter` | fn | the built-in single-JSON source adapter |
| `parseManifest` | fn | raw `manifest.yaml` text → `ParsedManifest` |
| `asContentSetEntry` | fn | raw parsed set → canonical `ContentSetEntry` |
| `resolveLanguagePair` | fn | language-pair resolution (legacy alias + `en` default) |
| `setBasePath` | fn | repo-relative base dir for a set |
| `asContentSetBook` | fn | project a manifest book block → `ContentSetBook \| null` |
| `validateLesson` | fn | validate a lesson against the bundled schema + semantic rules → `ValidationResult` |
| `validateManifest` | fn | validate a manifest against the bundled schema (legacy alias normalized) |
| `ContentLesson`, `ContentSetEntry`, `ContentSetBook`, `ContentSetSource`, … | types | the canonical internal format |
| `ContentLessonInlineExample` | type | one inline worked example (schema v1.5) on a theory step or exercise |
| `ValidationResult`, `ValidationIssue` | types | the `validate*` return shape (`{ valid, errors[] }`) |
| `LessonSetContext`, `LessonSourceAdapter`, `ParsedManifest`, `ParsedSet` | types | adapter + manifest surface |

The bundled JSON-Schema ships too, so a content repo can mirror against it
directly: `import schema from "learn-content-engine/schema/lesson.schema.json"`.

## Scope

Per the EXP-042 boundary, this package contains **only** parse / transform /
validate / types + the single-JSON source adapter - **no** fetch, storage, or
UI; those stay in the host. See [architecture.md](docs/architecture.md). The
[adaptive-learner](https://github.com/astrapi69/adaptive-learner) app **consumes
this library** (pinned in its `frontend/package.json`), so parse/validate/types
live here once. As of **v0.6.0 this engine is the canonical source of the lesson
schema** (schema authority moved here, [roadmap](docs/architecture.md#roadmap)
stage 4); the app and content repos consume it. See
[Schema authority](#schema-authority).

## Schema authority

The **canonical source** of the lesson schema is this engine's
[`schema/lesson.schema.json`](schema/lesson.schema.json) (+
`content-manifest.schema.json`, `quality-rules.json`). It is an **authored**
artifact here; consumers mirror the schema shipped in each pinned engine release:

- **The app** ([adaptive-learner](https://github.com/astrapi69/adaptive-learner))
  keeps its Pydantic models as an *editorial tool* for its own runtime types, but
  its generated schema must be **byte-identical** to the engine's - its parity
  gate now treats the engine as the reference (the app conforms to the engine,
  not the reverse).
- **Content repos** mirror the schema from the pinned engine release via their
  drift tool (`schema/engine-version.txt`).

The lesson schema's `$id` is engine-owned:
`https://astrapi69.github.io/learn-content-engine/schema/lesson.schema.json`.

To evolve the schema, edit the artifact here (the frozen byte baseline in
`src/schema-baseline.test.ts` guards against accidental content drift), run
`make sync-types` to regenerate `src/types/lesson-schema.generated.ts` from it,
mirror any new cross-field rule in `src/validate.ts`, extend the fixtures + rule
catalog, and bump the version; consumers then re-pin. The TypeScript types are
generated here (in-engine, `scripts/generate-lesson-types.mjs`), so they cannot
drift from the schema; the drift gate runs in `release-check` + CI.

## Changelog

- **0.8.2** - Schema annotation: the list/map fields that are always present at
  runtime (`Card.tags`, `Exercise.card_ids`, `Exercise.distractors`,
  `Lesson.cards`; manifest `ContentSet.tags`/`assets`, `sets`, `metadata`) now
  carry an explicit `"default": []` / `{}`. Validation-neutral (ajv ignores
  `default`; TS types unchanged) - it makes the existing "absent = empty"
  contract machine-readable so downstream code generators (the app's D3b
  Pydantic generator) can reproduce it. 8 added lines, nothing else.
- **0.8.1** - Fix: the manifest schema's `schema_version` field `default` now
  also says `1.6` (0.8.0 bumped only the `x-schema-version` stamp; the app
  generator renders the field default from the same constant, so the byte-parity
  gate caught the inconsistency). No other change.
- **0.8.0** - Feature (Bucket B): native **`multiple_choice`** exercise type
  (schema **v1.6** - a new type is a minor schema bump per the ExerciseType
  policy; 1.x content stays valid). At least two `options` (`{text, correct?}`,
  texts unique); `multiple: false` = single choice (exactly one correct),
  `multiple: true` = select-all (exact-set grading, no partial credit).
  Coexists with the `cloze` select/multiselect vehicle - nothing deprecated.
  New rules `E-MC-OPTIONS` / `E-MC-ONE-CORRECT` / `E-MC-MIN-CORRECT` /
  `E-MC-DUP-OPTION`. **Not yet rendered by the app** - the app-side renderer +
  grader (part 2) makes it a complete feature; the app re-pins then.
- **0.7.0** - Feature (Bucket B): matching `from_cards`. A `matching` exercise
  can derive its `pairs` from the referenced cards (left = `front`,
  right = `back`) instead of duplicating them - set `"from_cards": true` with
  `card_ids` and omit `pairs`. The engine resolves it to concrete pairs at parse
  time, so no renderer changes. Additive + optional; `x-schema-version` stays
  `1.5`. New rules `E-MATCH-FROMCARDS-CARDS` / `E-MATCH-FROMCARDS-PAIRS`. First
  schema feature authored in the engine post-flip.
- **0.6.1** - Tooling: the lesson TypeScript types are now regenerated from
  `schema/lesson.schema.json` by an in-engine generator
  (`scripts/generate-lesson-types.mjs`, `make sync-types`), gated in
  `release-check` + CI (`--check`). Completes the D1b follow-up (type generation
  moved here). Types are byte-identical; only the generator banner changed. No
  API or schema change.
- **0.6.0** - **Schema authority moved to the engine** (roadmap stage 4). The
  lesson schema is now the authored canonical source here; the app and content
  repos consume it (source-of-truth chain: engine → app + content). The flip is
  **byte-equivalent** - only the `$id` changed (now engine-owned,
  `https://astrapi69.github.io/learn-content-engine/schema/...`); same types,
  fields, enums and constraints, and `x-schema-version` stays `1.5`. A frozen byte
  baseline (`src/schema-baseline.test.ts`) guards against content drift. No
  behavior change; consumers re-pin to 0.6.0.
- **0.5.0** - Author ergonomics (additive, back-compat): `validate*` gains a
  non-blocking `warnings[]` layer and every issue carries a stable `id`,
  `severity` and `docAnchor` (`valid` stays errors-only). New author lints -
  unused cards, ambiguous matching, duplicate word tiles, answer-as-distractor,
  duplicate picture labels, length-revealing hints. A `learn-content-engine lint`
  CLI runs the full gate (errors + warnings) offline with `--json`. A rule
  catalog + editor-setup section in the docs (catalog completeness is tested).
  The app-side items (a `multiple_choice` type, word_tiles grade-by-string) are
  co-designed in [a proposal](docs/proposals/author-ergonomics-app-track.md).
- **0.4.0** - Distribution: `schema/quality-rules.json` ships as a package
  artifact (the shared quality minimums generated by the app, new exports
  subpath, sync-procedure step - closes issue #1, content repos can mirror the
  numbers from the pinned release), and a `prepare` script builds `dist/` on
  git installs (`npm install github:astrapi69/learn-content-engine#<rev>`),
  documented as an Install subsection. Additive; no API change.
- **0.3.1** — Documentation: a self-contained `docs/` set (getting-started,
  concepts, lesson-format reference, validation, architecture) + `CONTRIBUTING`,
  README trimmed to an entry point. Every `json` example in the format reference
  is extracted and validated by a test (one per exercise type + cloze mode).
  Docs-only; no API change.
- **0.3.0** — Conformance suite: an explicit, opt-in `validateLesson` /
  `validateManifest` API (`ajv` against the bundled, strict
  `schema/lesson.schema.json` + semantic rules mirroring the app's
  `model_validator`s), the schema shipped as a package artifact, a vendored
  fixture per `ExerciseType`/mode with round-trip + negative suites, and a
  `make conformance-real` target that runs the full pipeline over both content
  repos (513 lessons, 100% parse). Additive; 1.4/1.5 lessons stay valid.
- **0.2.0** — Schema nachzug 1.4 → 1.5: additive `examples`
  (`ContentLessonInlineExample`: `content` + optional `language` / `title`) on
  theory steps and exercises, coexisting with the v1.4 `example_url`. Parity
  with adaptive-learner `develop` @ `7287b045`. 1.4 lessons stay valid.
- **0.1.0** — Initial extraction of the content engine (schema v1.4).

## License

MIT © Asterios Raptis
