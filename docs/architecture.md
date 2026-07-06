# Architecture

## The engine boundary

`learn-content-engine` is one thing: the **source-to-canonical boundary**. It
takes raw content (today a single-JSON lesson, plus a `manifest.yaml`) and a set
context, and produces the canonical internal objects (`ContentLesson`,
`ContentSetEntry`). That is the whole job.

```
          consumer (your app)                 engine (this library)
   ┌───────────────────────────┐        ┌───────────────────────────┐
   │ fetch bytes (GitHub, disk)│  raw   │ parseManifest              │
   │ cache / persist           │ ─────▶ │ asContentSetEntry          │
   │ render UI                 │        │ parseLesson (via adapter)  │
   │                           │ ◀───── │ validateLesson/Manifest    │
   └───────────────────────────┘ canon. └───────────────────────────┘
```

### Canonical single-JSON + source adapters

The canonical internal format is the single-JSON lesson object. A
**source adapter** (`rawText + context -> ContentLesson`) turns a raw source
shape into that canonical object. The only built-in is
`singleJsonLessonAdapter`; a different source format (say a future multi-file
layout) plugs in as another adapter with the same signature - without changing
the caller's fetch or storage. `parseLesson(raw, context, adapter?)` is the seam.

### Why no network, no storage, no UI

The library imports only content *types* and a YAML/JSON parser - never a
fetcher, a database, or a UI framework. That import boundary **is** the
extraction seam: dependencies flow consumer -> engine, never the reverse. Fetch
and persistence stay in the consumer because they are environment-specific
(browser vs. server vs. CLI); keeping them out is what makes the engine reusable
across any host. This is the EXP-042 boundary, stated without any app internals.

## Staying in parity with the app

The lesson schema's source of truth is the Adaptive Learner app's Pydantic model
(EXP-039). This engine does not depend on the app at runtime; instead it
**vendors** two artifacts and keeps them in parity through a documented,
repeatable procedure:

- the generated TypeScript types (`src/types/lesson-schema.generated.ts`), and
- the JSON-Schema artifacts (`schema/*.json`), which ship in the package.

Every app schema bump (`x-schema-version`) triggers an engine follow-up:
re-vendor the generated types and the schema, and - the load-bearing reminder -
**if the bump adds a cross-field (semantic) rule, mirror it in
`src/validate.ts`**, since those rules live in code, not in the JSON-Schema. The
full step-by-step lives in the README
([Schema sync from adaptive-learner](../README.md#schema-sync-from-adaptive-learner)).

Parity is verified two ways: the vendored conformance fixtures and doc examples
(offline, in CI) and `make conformance-real` (on-demand, over the real content
repos).

## Roadmap

The engine is moving from "extracted copy" to "the format authority":

1. **Conformance (done).** `validate*`, a fixture per exercise type/mode, a
   negative suite, and a real-content run - the engine provably carries the
   whole format.
2. **Mirror decoupling.** The content repos switch their shape-parity source
   from the app to this engine's bundled `schema/lesson.schema.json`. Parity
   becomes engine-vs-content.
3. **App as a consumer.** The app migrates to import this library instead of its
   in-tree copy (EXP-042 section 7); app-vs-engine becomes the new parity test.
4. **Schema authority.** Once the app consumes the engine, schema ownership can
   move here, and the sync direction flips.

Each stage is independent and additive; none requires a consumer to know
anything about the app.
