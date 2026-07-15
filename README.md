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
- [**Authoring patterns**](docs/authoring-patterns.md) - expressing common exercise ideas (true/false, conjugation, synonyms, collocations, word order) with the existing types.
- [**Validation**](docs/validation.md) - the strict schema, the semantic rules, the error model.
- [**Extensions**](docs/extensions.md) - opt-in `ext:` exercise types, the portability contract, the registry.
- [**QTI interop**](docs/qti.md) - the optional QTI 2.x import/export adapter, mapping table, fidelity limits.
- [**Architecture**](docs/architecture.md) - the engine boundary, consumer parity, roadmap.
- [**API reference**](https://astrapi69.github.io/learn-content-engine/api/) - generated TypeDoc for the core and `/qti` entry points.
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
(see [concepts.md](docs/concepts.md)). The shape carries more than languages,
though - a free-form `domain` field (`language`, `programming`, `psychology`,
...) lets the same format hold knowledge-domain sets (tech courses,
driving-test prep, dog training in the dedicated domain repos below); there,
`target_language` is simply the language the content is written in. It is
deliberately **not**:

- **a general assessment standard** - the CORE schema covers the exercise types
  its consumers render and grows additively when a consumer needs a new core
  type. A consumer needing a bespoke type can add one via the opt-in
  [extension tier](docs/extensions.md) (`ext:` types) without touching the core
  enum; the core stays the portable authority.
- **a runtime** - no rendering, grading, scheduling/SRS, persistence, or
  networking; consumers own all of that.
- **a content repository** - it ships the format, the validator, and the
  author tooling, not lessons.

### Example repositories

The engine is used in the wild - these repos show the full consumer setup
(pinned engine version, byte-mirrored schema artifacts, `make lint` running
the same validator locally that CI enforces):

- [**adaptive-learner-content-template**](https://github.com/astrapi69/adaptive-learner-content-template) -
  fork-and-go scaffold with one example set, the validator wiring, CI gates
  and docs; the fastest way to see the engine used end to end.
- [**adaptive-learner-content-test**](https://github.com/astrapi69/adaptive-learner-content-test) -
  the test/starter repo and a conformance target of the engine's
  `make conformance-real`, plus the full author-tooling setup.
- [**adaptive-learner-content**](https://github.com/astrapi69/adaptive-learner-content) -
  the production content repo: the language sets plus the app tutorial
  (28 sets and counting).
- **the `alc-*` domain repos** - one repo per knowledge domain, all created
  from the template and registered in the app's repo registry:
  [psychology](https://github.com/astrapi69/alc-psychology),
  [programming](https://github.com/astrapi69/alc-programming),
  [technology](https://github.com/astrapi69/alc-technology),
  [ai](https://github.com/astrapi69/alc-ai),
  [traffic-knowledge](https://github.com/astrapi69/alc-traffic-knowledge),
  [dog-training](https://github.com/astrapi69/alc-dog-training) and
  [die-waehrung-des-geistes](https://github.com/astrapi69/alc-die-waehrung-des-geistes).

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

See [CHANGELOG.md](CHANGELOG.md) - one dated section per release, from the
current release back to 0.1.0.

## License

MIT © Asterios Raptis
