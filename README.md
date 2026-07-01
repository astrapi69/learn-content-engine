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
UI; those stay in the host. See [architecture.md](docs/architecture.md). The app
does **not** consume this library yet (EXP-042 section 7); until then the logic
lives in two places, kept in parity by the
[schema-sync procedure](#schema-sync-from-adaptive-learner).

## Schema sync from adaptive-learner

The lesson schema's **source of truth** is the Pydantic model in the
[adaptive-learner](https://github.com/astrapi69/adaptive-learner) app
(`adaptive_learner_content_loader.schema`, EXP-039). It generates
`schema/lesson.schema.json` and, from it, the TypeScript types this engine
vendors as `src/types/lesson-schema.generated.ts`. Every app schema bump (the
`x-schema-version` field) **triggers an engine follow-up** — otherwise the two
drift silently. Keep drift a visible, defined step:

1. Get the app's current `develop`:
   `git clone --depth 1 https://github.com/astrapi69/adaptive-learner`.
2. Copy its **generated** types verbatim into this repo (no hand-edits to the
   generated file — it is `GENERATED … DO NOT EDIT`):
   `cp adaptive-learner/frontend/src/storage/types/content/lesson-schema.generated.ts src/types/lesson-schema.generated.ts`
   (the app regenerates it via `make sync-schema`).
3. Copy the **bundled JSON-Schema artifacts** verbatim (these ship in the
   package and are what `validate*` and the content repos mirror against):
   `cp adaptive-learner/schema/lesson.schema.json schema/lesson.schema.json` and
   `cp adaptive-learner/schema/content-manifest.schema.json schema/content-manifest.schema.json`.
   If a bump adds a semantic (cross-field) rule, mirror it in `src/validate.ts`.
4. If the bump adds a field, surface it on the canonical `Content*` types in
   `src/types/content.ts` (a thin alias / doc note; the field usually flows in
   automatically because the aliases derive from the generated shape) and export
   it through `src/types/index.ts` + `src/index.ts`.
5. Bump the `schema_version` doc in `src/content-engine.ts`, extend the fixtures
   under `src/__fixtures__/` with the new field, and add round-trip +
   backward-compatibility tests.
6. Version-bump the library (additive field → minor) and record it in the
   changelog below.

## Changelog

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
