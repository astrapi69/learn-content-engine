# learn-content-engine

[![npm version](https://img.shields.io/npm/v/learn-content-engine)](https://www.npmjs.com/package/learn-content-engine)
[![CI](https://github.com/astrapi69/learn-content-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/astrapi69/learn-content-engine/actions/workflows/ci.yml)

Framework-agnostic TypeScript engine that parses **and validates** lesson
content from pluggable sources into a canonical lesson object.

It takes raw content (a **single-JSON** lesson plus a `manifest.yaml`) and a set
context, and produces canonical lesson / set-entry objects. It contains **no**
network, storage, or UI code - you supply the bytes and keep fetch +
persistence. The bundled, strict JSON-Schema makes it a self-contained **format
reference**: you can author and validate lessons without the application the
format originated in ([Adaptive Learner](https://github.com/astrapi69/adaptive-learner)).
Tracks the lesson schema at **v1.7**.

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
- [**Extensions**](docs/extensions.md) - opt-in `ext:` exercise types, the portability contract, the registry.
- [**QTI interop**](docs/qti.md) - the optional QTI 2.x import/export adapter, mapping table, fidelity limits.
- [**Architecture**](docs/architecture.md) - the engine boundary, consumer parity, roadmap.
- [**Contributing**](CONTRIBUTING.md) - TDD workflow, release gate, adding an exercise type.
- [**Security policy**](SECURITY.md) - supported versions, private vulnerability reports.
- [**Code of conduct**](CODE_OF_CONDUCT.md) - Contributor Covenant 2.1.

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

By design, this package contains **only** parse / transform /
validate / types + the single-JSON source adapter - **no** fetch, storage, or
UI; those stay in the consumer. See [architecture.md](docs/architecture.md). The
[adaptive-learner](https://github.com/astrapi69/adaptive-learner) app **consumes
this library** (pinned in its `frontend/package.json`) as the reference
consumer, so parse/validate/types live here once. As of **v0.6.0 this engine is
the canonical source of the lesson schema** (schema authority moved here,
[roadmap](docs/architecture.md#roadmap) stage 4); consumers - adaptive-learner
and the content repos - mirror it. See [Schema authority](#schema-authority).

### What this is NOT

This is a **language-learning-shaped lesson engine**: the format is built
around cards, drill-style exercise types, and a target/source language pair
(see [concepts.md](docs/concepts.md)). It is deliberately **not**:

- **a general assessment standard** - the CORE schema covers the exercise types
  its consumers render and grows additively when a consumer needs a new core
  type. A consumer needing a bespoke type can add one via the opt-in
  [extension tier](docs/extensions.md) (`ext:` types) without touching the core
  enum; the core stays the portable authority.
- **a runtime** - no rendering, grading, scheduling/SRS, persistence, or
  networking; consumers own all of that.
- **a content repository** - it ships the format, the validator, and the
  author tooling, not lessons.

## Schema authority

The **canonical source** of the lesson schema is this engine's
[`schema/lesson.schema.json`](schema/lesson.schema.json) (+
`content-manifest.schema.json`, `quality-rules.json`). It is an **authored**
artifact here; consumers mirror the schema shipped in each pinned engine release:

- **[adaptive-learner](https://github.com/astrapi69/adaptive-learner)** (the
  reference consumer) keeps its Pydantic models as an *editorial tool* for its
  own runtime types, but its generated schema must be **byte-identical** to the
  engine's - its parity gate treats the engine as the reference (the consumer
  conforms to the engine, not the reverse).
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

- **0.11.1** - Fix: `schema/lesson.schema.json` is canonically serialized again
  (`json.dumps(..., indent=2, sort_keys=True)`); the 1.7 blocks from 0.10.0 had
  been inserted hand-formatted. Semantically identical (parsed-equality
  proven), but consumers that RE-EMIT the schema canonically (the app's
  sync-schema pipeline and its byte-parity gate) need the canonical bytes.
  Types regenerated from the sorted artifact; no rule/type change.
- **0.11.0** - Feature: optional **QTI 2.x interop adapter** on the subpath
  export `learn-content-engine/qti` (`importQti`, `exportQti`, `qtiLessonAdapter`).
  Maps the mappable subset both ways - `choiceInteraction` <-> `multiple_choice`
  (single / multiple by cardinality), `textEntryInteraction` <-> `free_text`,
  `matchInteraction` <-> `matching` - at the `parseLesson` boundary. Import
  refuses unmappable items loudly (`QtiImportError` with a per-item list, no
  silent skip) and gates the result through `validateLesson`; export covers the
  mappable subset (`QtiExportError` otherwise). The XML parser
  (`@rgrove/parse-xml`, zero transitive deps) is isolated to the subpath so the
  core import stays dependency-free. xAPI stays a consumer responsibility.
  Schema untouched by this feature (the 1.7 stamp comes from 0.10.0). See
  [qti.md](docs/qti.md).
- **0.10.0** - Feature: **extension exercise types** (schema **1.7**). A consumer
  can register a NON-core exercise type in the `ext:<vendor>-<name>` namespace
  without widening the core `ExerciseType` enum. A lesson declares what it needs
  in the new top-level `requires_extensions` (each `@<major>`), carries the
  extension's data in an opaque `ext_payload`, and a consumer that has not
  registered a declared extension refuses it loudly (`E-EXT-UNSUPPORTED`;
  `E-EXT-UNDECLARED` when an `ext:` type is used undeclared). `validateLesson` /
  `parseLesson` gain an additive `{ extensions }` option - core content
  validates and parses byte-identically without it. New public types
  `ExerciseExtension` / `ExtensionRegistry`; a reference extension
  `ext:ref-ordering` (`src/examples/`) proves the seam end-to-end. Additive
  schema bump (`x-schema-version` 1.6 -> 1.7); pre-1.7 content unchanged. See
  [extensions.md](docs/extensions.md).
- **0.9.0** - Feature: `learn-content-engine migrate <file...> [--write] [--json]` -
  the cloze `select`/`multiselect` -> native `multiple_choice` conversion every
  content repo scripted by hand, as a validated CLI subcommand. Dry-run by
  default; the rewritten lesson must pass the bundled validator before
  `--write` touches the file; multi-blank selects and `cloze_mode: "type"` are
  never converted (no clean MC equivalent). Schema untouched
  (`x-schema-version` stays `1.6`). See
  [lesson-format.md](docs/lesson-format.md#migrating-cloze-selectmultiselect-to-multiple_choice).
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
