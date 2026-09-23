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
layout) plugs in as another adapter with the same signature, without changing
the caller's fetch or storage. `parseLesson(raw, context, adapter?)` is the seam.

### Why no network, no storage, no UI

The library imports only content *types* and a YAML/JSON parser: never a
fetcher, a database, or a UI framework. That import boundary **is** the
extraction seam: dependencies flow consumer -> engine, never the reverse. Fetch
and persistence stay in the consumer because they are environment-specific
(browser vs. server vs. CLI); keeping them out is what makes the engine reusable
across any host. The boundary is stated without any consumer internals.

## The author CLI (lint / migrate / suggest-wiring / qti)

The CLI subcommands share one architecture, split along the same boundary as
the library itself:

- **A filesystem-free core per command** (`src/cli.ts`, `src/migrate.ts`,
  `src/suggest-wiring.ts`, `src/qti-command.ts`, shared plumbing in
  `src/file-command.ts`): pure
  functions from raw JSON text to a typed report: fully unit-tested, no I/O.
  Rule *definitions* stay where they live (the validator: `suggest-wiring`
  reuses the `W-CARD-UNUSED` core instead of re-deriving it); the command core
  only *applies* them and shapes the report.
- **One thin shim** (`bin/learn-content-engine.mjs`) that owns all file I/O
  and dispatches through a command table: adding a subcommand is a table
  entry, not another copy of the read/format/exit block.
- **A governance ladder** that gets stricter as commands get more powerful:
  `lint` only reports; `migrate` is dry-run by default and writes only what
  re-passes `validateLesson`; `suggest-wiring` additionally requires an
  explicit `--accept <id>` per suggestion: there is no bulk apply, because
  `card_ids` drives consumer-side SRS scheduling.

## Schema authority (this engine)

As of v0.6.0 the lesson schema's **canonical source is this engine**: the
authored `schema/*.json` artifacts, which ship in the package. Consumers mirror
them; the source-of-truth chain is **engine → consumers** (adaptive-learner +
content repos).

- **[adaptive-learner](https://github.com/astrapi69/adaptive-learner)** (the
  reference consumer) keeps its Pydantic models as an editorial tool for its own
  runtime types, but its generated schema must be byte-identical to the
  engine's; its parity gate treats the engine as the reference (the consumer
  conforms to the engine).
- **Content repos** mirror the engine's schema from the pinned release.

One boundary is worth naming, because it decides where enforcement lives: the
engine validates ONE document. It can therefore demand that a `stable_id`
(schema v1.9) is present, well-formed and unique inside a lesson, and it
exports `collectStableIds` so a caller can check set-wide uniqueness across
several lessons. It can NEVER check that an id stayed the same across
versions: that needs the previous version, which only the content repo has.
So the version-stability half of the promise lives in a comparison against the
last published state, not in the schema. A schema rule without that comparison
would be a promise without enforcement.

That comparison still SHIPS from here, as the `check-stable-ids` command
(`compareStableIdInventories` is its pure core; git history and files stay in
the bin shim). The reason is reach, not convenience: the schema claims stable
identity in all ten consuming repos, so enforcement that lives in one of them
leaves nine claiming a promise nobody checks. A vendored copy drifts ten ways;
a command that travels with the pinned release arrives everywhere the schema
does.

The same argument produced a second command, `check-stable-id-coverage`
(engine#103). Stability and coverage are two different questions, and the first
cannot stand in for the second: an unminted set publishes no ids, so it
violates no stability rule while still being uncovered. Coverage first lived as
a per-repo script and drifted exactly as predicted, not in its wording but in
its reach: it judged the covered COUNT against a baseline and never consulted
the total, so a new unminted set passed. What legitimately stays repo-local is
the baseline NUMBER, a property of the individual repository. The RULE is
universal and therefore ships.

The JSON-Schema `$id` is engine-owned
(`https://astrapi69.github.io/learn-content-engine/schema/…`). The
TypeScript types (`src/types/lesson-schema.generated.ts`) are generated from the
schema in-engine (`make sync-types`, drift-gated in CI since v0.6.1).
Evolving the schema is a defined step here: see the README
([Schema authority](../README.md#schema-authority)); a frozen byte baseline
(`src/schema-baseline.test.ts`) guards against accidental content drift.

Parity is verified two ways: the conformance fixtures and doc examples (offline,
in CI) and `make conformance-real` (on-demand, over the real content repos).

## Pinning and currency

A consumer does not follow this engine, it pins it. There are two ways to do
that, and they differ in what travels with the pin:

- **An application consumer** pins the package as an exact dependency version
  and imports the parse, projection and validation code. The schema artifacts
  ship inside that package, so the code and the schema it enforces arrive
  together by construction. A consumer that also generates its own schema layer
  proves the two are identical with a parity test against the pinned release.
- **A content repo** pins a release number in `schema/engine-version.txt` and
  commits a byte-identical mirror of that release's bundled `schema/*.json`
  next to it. The validator is not vendored: the repo installs the pinned
  release to run it. What the mirror buys is a reviewable diff at the moment
  the pin moves, and a schema that a non-Node tool (a Python authoring script,
  an editor) can read without installing anything. Nothing else is mirrored -
  not the rules in `src/validate.ts`, not the CLI.

A pin is a guarantee about the rule set, not about its age. It guarantees that
every lesson in the repo was judged against ONE known, immutable set of rules,
the same one every author and every CI run sees. It does not guarantee that the
set is the current one. That difference is the point of this section: a repo can
be perfectly consistent and several releases behind at the same time, and every
gate it owns stays green throughout.

### When the pin has to move

Three classes, and they are not equally urgent:

- **New schema fields.** Opt-in, no pressure. The schema evolves additively
  (see [schema-version policy](concepts.md#schema-version-policy-additive)), so
  content authored against an older version stays valid under a newer one: a
  manifest that declares `schema_version: "1.2"` keeps validating although the
  manifest schema_version field currently defaults to 1.7. A repo that does not
  want the new field does not need the release.
- **New error rules.** These move the pin, because content that was valid
  before can be invalid after. Rare under the additive policy, but not
  excluded: a rule that closes a hole the schema left open is an error by
  nature, and the repo learns about it when it re-pins, not before.
- **New author lints.** These move the pin although nothing in the content
  changes. This is the class nobody has on their radar. A lint applies to
  lessons written long before it existed, needs no migration, no manifest bump
  and no schema change, and it reaches exactly nobody until the pin moves.
  `W-PROMPT-DUP` is one such rule; the [rule catalog](lesson-format.md#rule-catalog)
  marks every warning as such.

A lint needs a second thing after the pin, and this is where it usually stalls:
warnings are opt-in in the consumer pipelines (see
[layer 3](validation.md#layer-3-author-lints-warnings)). A pin bump on its own
changes a version number and nothing on screen.

### Currency is nobody's job until somebody owns it

A content repo's drift gate compares its committed mirror against the published
artifact of the release it pins. That answers one question: has anyone
hand-edited the mirror away from the release it claims to be? It is the right
question for that gate, and the reason it is right is exactly why it never
reports lag. An immutable pin compared against itself is stable forever, so the
gate is green by construction, including on the day the engine is several
releases ahead. Green there means consistent, not current.

Finding lag needs a different comparison: the pinned number against the current
published release, which is a value that moves. Nothing in this engine and
nothing in a consumer performs that comparison today. A release announces
itself in the changelog and in the GitHub release page, and no automated reader
consumes either. This is a named gap, not a planned feature: the owner of a
consumer decides when its pin moves, and until some job compares the pin
against a moving value, the answer to "is this pin current" is only ever
reached by someone asking.

## Roadmap

The engine is moving from "extracted copy" to "the format authority":

1. **Conformance (done).** `validate*`, a fixture per exercise type/mode, a
   negative suite, and a real-content run: the engine provably carries the
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
   content repos) consume it. The flip was byte-equivalent: only `$id` changed.
   TypeScript-type generation also lives here (v0.6.1, `make sync-types`, gated
   in CI), and since engine 0.8.2 adaptive-learner **generates** its structural
   Pydantic layer from this engine's schema mirror too (adaptive-learner
   PR #1529). Only its semantic cross-field validators stay hand-written,
   mirroring this engine's own split between the authored schema and
   `src/validate.ts`. New schema features (e.g. `multiple_choice`, `from_cards`)
   originate here; consumers re-pin and regenerate.

Each stage is independent and additive; none requires a consumer to know
anything about any other consumer.
