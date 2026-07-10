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

## Schema authority (this engine)

As of v0.6.0 the lesson schema's **canonical source is this engine** - the
authored `schema/*.json` artifacts, which ship in the package. Consumers mirror
them; the source-of-truth chain is **engine → app + content repos**.

- **The app** keeps its Pydantic models as an editorial tool for its own runtime
  types, but its generated schema must be byte-identical to the engine's; its
  parity gate now treats the engine as the reference (app conforms to engine).
- **Content repos** mirror the engine's schema from the pinned release.

The JSON-Schema `$id` is engine-owned
(`https://astrapi69.github.io/learn-content-engine/schema/…`). The generated
TypeScript types (`src/types/lesson-schema.generated.ts`) still derive from the
schema; moving that generation into the engine is the remaining follow-up (D1b).
Evolving the schema is a defined step here - see the README
([Schema authority](../README.md#schema-authority)); a frozen byte baseline
(`src/schema-baseline.test.ts`) guards against accidental content drift.

Parity is verified two ways: the conformance fixtures and doc examples (offline,
in CI) and `make conformance-real` (on-demand, over the real content repos).

## Roadmap

The engine is moving from "extracted copy" to "the format authority":

1. **Conformance (done).** `validate*`, a fixture per exercise type/mode, a
   negative suite, and a real-content run - the engine provably carries the
   whole format.
2. **Mirror decoupling (done).** The content repos switch their shape-parity
   source from the app to this engine's bundled `schema/lesson.schema.json`,
   pinned in `schema/engine-version.txt`. Parity is engine-vs-content.
3. **App as a consumer (done).** The app imports this library (pinned in its
   `frontend/package.json`) instead of an in-tree copy; app-vs-engine is the
   parity test.
4. **Schema authority (done, v0.6.0).** The lesson schema is now authored in this
   engine and carries an engine-owned `$id`; the app and content repos consume it
   (the app's Pydantic became a conforming editorial tool, its parity gate
   reversed to engine-as-reference). The flip was byte-equivalent - only `$id`
   changed. TypeScript-type generation now also lives here (v0.6.1,
   `make sync-types`, gated in CI). Remaining follow-up: let the app generate its
   Pydantic from the engine schema (D3b). New schema features (e.g.
   `multiple_choice`, `from_cards`) now originate here.

Each stage is independent and additive; none requires a consumer to know
anything about the app.
