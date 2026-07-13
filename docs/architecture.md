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
across any host. The boundary is stated without any consumer internals.

## The author CLI (lint / migrate / suggest-wiring)

The CLI subcommands share one architecture, split along the same boundary as
the library itself:

- **A filesystem-free core per command** (`src/cli.ts`, `src/migrate.ts`,
  `src/suggest-wiring.ts`, shared plumbing in `src/file-command.ts`): pure
  functions from raw JSON text to a typed report - fully unit-tested, no I/O.
  Rule *definitions* stay where they live (the validator: `suggest-wiring`
  reuses the `W-CARD-UNUSED` core instead of re-deriving it); the command core
  only *applies* them and shapes the report.
- **One thin shim** (`bin/learn-content-engine.mjs`) that owns all file I/O
  and dispatches through a command table - adding a subcommand is a table
  entry, not another copy of the read/format/exit block.
- **A governance ladder** that gets stricter as commands get more powerful:
  `lint` only reports; `migrate` is dry-run by default and writes only what
  re-passes `validateLesson`; `suggest-wiring` additionally requires an
  explicit `--accept <id>` per suggestion - there is no bulk apply, because
  `card_ids` drives consumer-side SRS scheduling.

## Schema authority (this engine)

As of v0.6.0 the lesson schema's **canonical source is this engine** - the
authored `schema/*.json` artifacts, which ship in the package. Consumers mirror
them; the source-of-truth chain is **engine → consumers** (adaptive-learner +
content repos).

- **[adaptive-learner](https://github.com/astrapi69/adaptive-learner)** (the
  reference consumer) keeps its Pydantic models as an editorial tool for its own
  runtime types, but its generated schema must be byte-identical to the
  engine's; its parity gate treats the engine as the reference (the consumer
  conforms to the engine).
- **Content repos** mirror the engine's schema from the pinned release.

The JSON-Schema `$id` is engine-owned
(`https://astrapi69.github.io/learn-content-engine/schema/…`). The
TypeScript types (`src/types/lesson-schema.generated.ts`) are generated from the
schema in-engine (`make sync-types`, drift-gated in CI since v0.6.1).
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
   source from adaptive-learner to this engine's bundled
   `schema/lesson.schema.json`, pinned in `schema/engine-version.txt`. Parity is
   engine-vs-content.
3. **adaptive-learner as a consumer (done).** The reference consumer imports
   this library (pinned in its `frontend/package.json`) instead of an in-tree
   copy; consumer-vs-engine is the parity test.
4. **Schema authority (done, v0.6.0).** The lesson schema is now authored in this
   engine and carries an engine-owned `$id`; consumers (adaptive-learner, the
   content repos) consume it. The flip was byte-equivalent - only `$id` changed.
   TypeScript-type generation also lives here (v0.6.1, `make sync-types`, gated
   in CI), and since engine 0.8.2 adaptive-learner **generates** its structural
   Pydantic layer from this engine's schema mirror too (adaptive-learner
   PR #1529) - only its semantic cross-field validators stay hand-written,
   mirroring this engine's own split between the authored schema and
   `src/validate.ts`. New schema features (e.g. `multiple_choice`, `from_cards`)
   originate here; consumers re-pin and regenerate.

Each stage is independent and additive; none requires a consumer to know
anything about any other consumer.
