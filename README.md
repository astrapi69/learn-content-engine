# learn-content-engine

Framework-agnostic TypeScript engine that parses lesson content from pluggable
sources into a canonical lesson object.

This is the extracted **content engine** of
[Adaptive Learner](https://github.com/astrapi69/adaptive-learner) (EXP-042): the
`source → canonical` boundary. It takes raw content (today a **single-JSON**
lesson, plus a `manifest.yaml`) and a set context, and produces the canonical
internal lesson / set-entry objects. It contains **no** network, storage, or UI
code — the host supplies the bytes and keeps fetch + persistence.

Tracks the app lesson schema at **v1.5** (EXP-039). The canonical types are
thin aliases of the generated schema types, so the engine stays in parity with
the Pydantic source of truth — see [Schema sync from adaptive-learner](#schema-sync-from-adaptive-learner).

## Install

```bash
npm install learn-content-engine
```

## Usage

Parse a raw single-JSON lesson into the canonical `ContentLesson`:

```ts
import { parseLesson, type LessonSetContext } from "learn-content-engine";

const setContext: LessonSetContext = {
  language: "fr",
  target_language: "fr",
  source_language: "de",
  domain: "language",
};

const rawJson = '{ "id": "01-greetings", "title": "Begrüßungen", "cards": [], "steps": [] }';

const lesson = parseLesson(rawJson, setContext);
// → canonical ContentLesson; the set's language pair + domain are injected
//   when the lesson file omits them.
lesson.target_language; // "fr"
lesson.source_language; // "de"
```

Project a raw `manifest.yaml` set into a canonical `ContentSetEntry`:

```ts
import { parseManifest, asContentSetEntry } from "learn-content-engine";

const manifest = parseManifest(rawManifestYaml);
const entry = asContentSetEntry(
  { source: "astrapi69/adaptive-learner-content", branch: "main" },
  manifest!.sets![0],
  /* cachedVersion */ null,
);
```

### Custom source adapters (the extension seam)

`parseLesson` delegates to a **source adapter** (`rawText + context →
ContentLesson`). The only built-in is `singleJsonLessonAdapter`. A future
multi-file source format plugs in as another adapter with the same signature —
no change to the caller's fetch or storage:

```ts
import { parseLesson, type LessonSourceAdapter } from "learn-content-engine";

const myAdapter: LessonSourceAdapter = (rawText, context) => {
  /* build a canonical ContentLesson from your own source format */
};

const lesson = parseLesson(rawText, setContext, myAdapter);
```

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

The bundled JSON-Schema artifact ships too, so a content repo can mirror against
it directly: `import schema from "learn-content-engine/schema/lesson.schema.json"`.

## Conformance

The engine proves it carries the **whole** lesson format, so third parties can
build their own apps (and content repos) on it without depending on the app.

- **`parse` is permissive** (`JSON.parse` + set-context injection); **`validate`
  is an explicit, opt-in step**. The consumer decides when to enforce the format:

  ```ts
  import { validateLesson } from "learn-content-engine";

  const result = validateLesson(JSON.parse(rawLessonJson));
  if (!result.valid) console.error(result.errors); // [{ path, message }, …]
  ```

- **Strict, by design.** `validate` runs the bundled `schema/lesson.schema.json`
  (draft 2020-12, `additionalProperties: false`) **plus** the cross-field
  semantic rules that mirror the app's Pydantic `model_validator`s (per-type
  required fields, cloze marker/blank count, `multiselect` disjointness, picture
  "exactly one correct", card referential integrity). Unknown fields are
  **rejected** — deliberate parity with the app, which is what makes this a
  trustworthy format reference.
- **CI truth = vendored fixtures.** The suite carries a valid fixture for every
  `ExerciseType` and mode (`matching`, `picture_choice`, `free_text`,
  `word_tiles`, `cloze` `type` / `select` / `multiselect`) plus a field-variant
  fixture, each asserted to round-trip typed **and** validate; a negative suite
  asserts every rejection class. These run offline in `npm test`.
- **Ultimate proof = real content.** `make conformance-real` clones both public
  content repos (read-only, depth 1) and drives every set and lesson through the
  full pipeline, counting exercises by type. On-demand (needs network), not part
  of the mandatory CI.

  ```bash
  make conformance-real
  ```

## Scope (what this library deliberately is NOT)

Per the EXP-042 lib boundary, this package contains **only** parse / transform /
types + the single-JSON source adapter. It does **not** include:

- **Fetch** (GitHub fetcher, raw base URLs) — stays in the host.
- **Storage** (IndexedDB / Dexie cache, DB keys) — stays in the host.
- **UI** — no React or any renderer.

That is why the engine imports only content *types* and a YAML parser. The
import boundary is the extraction seam: consumer → engine, never the reverse.

## Status — migration pending

This library is the **extracted** engine, published to npm. The Adaptive Learner
app does **not** consume it yet; that migration is follow-up work (EXP-042
section 7). Until then the parse/transform logic exists in **two** places — the
original in the app repo (`frontend/src/lib/content/engine/`) and this library —
kept in sync by the [schema-sync procedure](#schema-sync-from-adaptive-learner).
A further follow-up decouples the content repos: they mirror their shape-parity
source against this engine's bundled `schema/lesson.schema.json` instead of the
app (app-vs-engine then becomes the new parity test).

## Develop

```bash
npm install
npm run build      # tsc → dist/ (JS + .d.ts declarations)
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

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
