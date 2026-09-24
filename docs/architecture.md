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
published release, which is a value that moves. The content repos run that
comparison nightly since 2026-09-23 (`engine-currency.yml`, owned by the content
template): it compares `schema/engine-version.txt` against the npm dist-tag the
repo tracks, opens or updates one issue while they differ, and closes it once
the pin catches up. It never moves the pin itself; moving it stays a deliberate
change that refreshes the mirror in the same commit. An application consumer
has no such job: its parity test compares its generated layer with the release
it pins, which answers the consistency question again, not the currency one.
There, "is this pin current" is still only answered by someone asking.

## Rule ownership: which layer owns which rule

State as of 2026-09-24.

### Why this section exists

A rule about content can live in three places: in this engine, in the
authoring tooling of the content template (mirrored into every content repo),
and in the reference app. Until now nothing recorded which place owns a rule,
and nothing compared the versions with each other.

The result is not theoretical. The quality minimums exist in three
implementations that differ in substance, and the hint-length rule existed in
two that differed even in severity. A set could pass its repo's gate and fail
to be shared in the app, and the author could not see while writing which of
the two counts applied.

### The guideline

**The engine owns every rule about the content itself.** Lessons, exercises,
cards, manifests: what is valid, what is counted, what is warned about. The
engine is the only place that knows the whole schema, and it exists exactly
once.

**The content template's tooling owns what the engine cannot see.** The prose
of repo files, pins, mirrors, workflow wiring, the directory layout. Everything
about a repo's environment rather than its content.

**The app owns render-time decisions.** What it renders, which extensions it
has adopted, how a run is graded. It may be stricter than the engine where it
cannot display something, but it may not define the same term differently.

#### The assignment test

A rule belongs in the engine when it can be answered from a lesson and a
manifest alone. When it needs the file system, CI, a pin or another repo, it
belongs in the template. When it needs a renderer or a running learner, it
belongs in the app.

By this test the quality minimums, the hint length, the language-pair checks
and every rule about `domain`, `stable_id` or exercise types belong in the
engine. The directory layout (`sets/<source>/<target-level>`) stays in the
template: it needs the file system.

#### What is not a reason

- **"The engine only warns, we need an error."** Severity is a property of the
  check, not of the rule, and a repo sets it in its own state, not in a second
  copy of the rule. The content template's workflows are byte-identical in every
  repo, and a repo's own decisions live in `.github/quality-state.json`
  (today: a prose-gate backlog and accepted warnings). A switch there that makes
  a named warning block does not exist yet (adaptive-learner-content-template#83),
  and removing `continue-on-error` from the warnings step does not replace it:
  the engine runner exits 0 when it only finds warnings, so that surfaces a
  crash, not a warning. Until the switch exists, a repo that needs a warning to
  block has only one way, a second implementation at error level, which is how
  the hint-length rule forked. That gap is why the switch matters: without it
  this guideline asks a repo to give up a capability with nothing in its place.
  A second implementation of the same rule at another severity is not a
  tightening, it is a fork.
- **"The engine does not check it yet."** Then an engine rule is missing.
  Rebuilding it in the template moves the gap instead of closing it, and the
  copy lands in ten repos through the mirror.
- **"It is only one line."** The hint-length rule was one line too, and
  drifted from the engine's version in several ways (below).

### Known violations, as of 2026-09-24

#### Quality minimums: three versions

The engine ships `schema/quality-rules.json` as data and applies none of the
minimums. They are applied in the template's `validate_content.py`, in a
diverging copy in alc-books, and in the app's `validateSetForSharing`.

| | Template (mirrored into ten repos) | alc-books | App |
|---|---|---|---|
| Exemption for a multiple-choice-only lesson | yes | yes | no |
| Exemption for a bridge lesson | no | yes | no |
| `matching` with `from_cards` | counts `card_ids` | counts `card_ids` | counts `pairs` only |

The third row weighs most: the same exercise counts or does not count
depending on the checker, so a set can pass its repo gate and fail when
shared in the app.

It also settles the question of the canonical version: **none of the three
is canonical.** Template and alc-books differ in an exemption, the app in the
counting, and the engine does not have the rule at all. The canonical version
is written during the move, not selected. For `from_cards` in particular only
the engine knows the field and what it means, so it is the one place that can
decide whether a derived pairing counts as an exercise.

#### Further content rules in the template's validator

The template's `validate_content.py` also checks the language pair, requires
`title_native`, and, for a source language with a non-Latin script, checks
that card backs are written in that script. All of it can be answered from the
manifest and the lesson alone, so by the assignment test it belongs in the
engine (engine#190). The language check cuts a tag down to its primary subtag
and requires two letters: `de-AT`, `pt-BR` and `zh-Hant` pass, but the
three-letter primary subtags BCP-47 uses for languages without an ISO 639-1
code (`gsw` Swiss German, `yue` Cantonese, `fil` Filipino) fail. The schema
allows them, so such a set is schema-valid and fails in its repository; here the
stricter version is the wrong one.

#### Hint length: two versions, merged (engine#186)

| | Engine `W-HINT-LENGTH` (0.28.0) | Template |
|---|---|---|
| Severity | warning | error |
| "vier Leerzeichen pro Ebene" | reported | not reported |
| "ein einzelnes Zeichen", "a single character" | missed | reported |
| Hints of a single blank | not checked | checked |

The engine's version matched a number word and a length noun anywhere in the
hint, without word boundaries. Measured over the ten content repos it reported
44 warnings, all false ("Achte" read as "acht", "bestimmten" as "ten",
"Fragezeichen" as a length noun); the template's version reported none. The two
sides together made the complete rule. engine#186 merged them into the engine
(word boundaries, the template's count forms, blank hints) and kept the
warning; the template's copy is dropped after the next pin.

#### The app repeats an engine error

The app's content validator re-implements `E-MATCH-DUP-LEFT` so that an author
sees it before an export or a share. The intent is right; the means is a second
implementation of a rule the engine already reports, and the copy already
differs: it compares left terms case-sensitively, the engine does not, so
"Empathie" next to "empathie" passes the app and fails the repo gate
(adaptive-learner#3222). The app keeps the engine's validators out of its
bundle to avoid the structural ajv layer; an engine entry point for the
semantic rules alone would remove the reason for the copy.

### Fixed: a lesson's `domain`

Until engine#184, `W-DOMAIN-UNKNOWN` checked only `sets[].domain` in a
manifest, not a lesson's own `domain`. A content repo had a local rule for it,
and the advice to drop that rule would have been a step back without the
engine change: the real case sat exactly in the gap, `"domain": "imported"` on
every lesson of an exported set.

The outcome is the regular case for this class. The gap was closed in the
engine, the local rule goes after the next pin, and the value that triggered
the warning is fixed at its origin, the app's export (adaptive-learner#2376). A
consumer's origin marker is **not** added to the engine's vocabulary: the engine
knows no consumers, and the existing warning already says the right thing.

### Moving a rule: two conditions

**Decide the canonical version first.** Where several versions exist, that is
a decision with a reason, not a pick of the best copy. Otherwise the
reconciliation between the hub repo and the template repeats on a smaller
scale.

**Measure per repo before building.** A move changes what turns red. The
template's version shrinks, but the engine then reports things nobody reported
before. Without measuring first, a clean-up release becomes the day nine repos
turn red at once.

### Open items

- **engine#185**: the quality minimums move into the engine, tied to the
  question of what a lesson is for. A bridge lesson is not a special type but a
  lesson without an assessment intent; a field the author declares, instead of
  one heuristic per exemption, and the same field answers the
  multiple-choice-only exemption.
- **engine#186** (fixed): one hint-length rule, kept as a warning; the template
  drops its copy after the next pin.
- **adaptive-learner-content-template#83**: a switch in
  `.github/quality-state.json` that makes selected warning ids blocking for one
  repo, without duplicating the rule or editing the shared workflow.
- **engine#190**: the language-pair and set-metadata checks move from the
  template into the engine; the three-letter primary subtags decide the
  canonical version.
- **adaptive-learner#3222**: the app's copy of `E-MATCH-DUP-LEFT`.
- **adaptive-learner#2376**: the export writes an internal origin marker into a
  published artifact.

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
