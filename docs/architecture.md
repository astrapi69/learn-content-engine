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
  not the rules in `src/rules.ts`, not the CLI.

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

A lint needs a second thing after the pin: warnings are opt-in in a consumer
pipeline (see [layer 3](validation.md#layer-3-author-lints-warnings)). The
content repos opted in on 2026-09-23 with a non-blocking warning step in the
template's `engine-validate.yml`; in a pipeline without such a step, a pin bump
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
published release, which is a value that moves. The content repos have had that
comparison since 2026-09-23 and run it nightly from 2026-09-24
(`engine-currency.yml`, owned by the content template): it compares
`schema/engine-version.txt` against the npm dist-tag the repo tracks, opens or
updates one issue while they differ, and closes it once the pin catches up. It
never moves the pin itself; moving it stays a deliberate change that refreshes
the mirror in the same commit.

Its record so far (adaptive-learner-content-template#70, 2026-09-24): dispatched
runs opened an issue and closed it again in all ten repos. The first scheduled
runs, one per repo, found the pin current in seven and the lag in three, where
they updated the issue a dispatch had opened 21 to 32 minutes earlier. No
scheduled run has opened an issue yet. That case is deliberately not staged:
both triggers run the same steps and differ only in an optional input that
falls back to the tracked tag. The first scheduled run that meets a lag with no
issue open decides it: it opens the issue or it does not, and if it does not,
that is a finding. Until then it is an open point, not a defect.

That run needs two things at once: a release still unpinned when the scheduled
run fires (which, with cron running hours late, is the next morning around
10:15 UTC rather than 05:30), and no issue a dispatch opened before it. Neither
held so far. 0.29.0 was pinned in all ten repos about ten minutes after it was
published. 0.28.0 did stand unpinned overnight in three repos, and the
scheduled runs did meet that lag, but a dispatch had opened their issues 21 to
32 minutes earlier. As long as re-pins follow a release within hours and the
release routine dispatches the check by hand, the case may never occur. That is
a side effect of the discipline, not a gap; nobody should wait for this proof
as if it were due.

An application consumer has no engine-specific job: its parity test compares
its generated layer with the release it pins, which answers the consistency
question again, not the currency one. In the reference app the only automatic
signal is Dependabot's weekly grouped update for `/frontend`, and it arrives
late and red. A release has to age past Dependabot's cooldown (between 2.2 and
3.4 days, measured from its skipped runs) and then wait for the weekly run, so
the PR comes 3 to 10 days after the release; and since it moves only
`package.json` and the lockfile, it fails the app's pin and schema parity tests
every time. Of 73 Dependabot PRs up to 2026-09-24, three touched the engine:
two were closed unmerged in favour of a manual re-pin, one was merged after a
manual repair, as one of 36 updates (adaptive-learner#2923). Manual re-pins
reached 38 of 39 releases first, with a median lag of about three hours. The
signal exists; in practice the re-pin by hand is the signal.

## Rule ownership: which layer owns which rule

State as of 2026-09-24.

### Why this section exists

A rule about content can live in three places: in this engine, in the
authoring tooling of the content template (mirrored into the content repos),
and in the reference app. The app holds three versions, not one: the
frontend's share check (`validateSetForSharing`), the frontend's check for
generated and imported lessons (`validateGeneratedLesson`), and the Pydantic
models of the backend's content loader (`schema.py`, `models.py`), which
validate every manifest the app's API mode lists or downloads and every lesson
it serves or saves. Until now nothing recorded which place owns a rule, and
nothing compared the versions with each other.

The result is not theoretical. The quality minimums exist in three
implementations that differ in substance (the template's, alc-books' and the
app frontend's; the app's backend applies none), and the hint-length rule existed in
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

**What the guideline promises, and what it does not.** One rule in the engine
replaces several versions with one, so every consumer on the same release gives
a set the same answer. It does not make that one version better than the copies
it replaces. A unification can let the worse version win: the version with the
widest reach is not automatically the precise one, and the version in the
engine is not either. In the hint-length case (below) the template's copy, a
blocking error in every content repo's gate, was right on the real content, and
the engine's version, the one the guideline gives the rule to, was wrong there. That is why every
existing version is measured per repo before a move
([Moving a rule](#moving-a-rule-the-conditions)).

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
  block has only one way, a second implementation at error level. That gap is
  why the switch matters: without it this guideline asks a repo to give up a
  capability with nothing in its place.
  A second implementation of the same rule at another severity is not a
  tightening, it is a fork.
- **"The engine does not check it yet."** Then an engine rule is missing.
  Rebuilding it in the template moves the gap instead of closing it, and the
  copy lands in ten repos through the mirror.
- **"It is only one line."** The hint-length rule was one line too, and its
  two versions, written separately four days apart, differed from the start in
  several ways (below).

### Known violations, as of 2026-09-24

#### Quality minimums: three versions

The engine ships `schema/quality-rules.json` as data and applies none of the
minimums. They are applied in the template's `validate_content.py`, in a
diverging copy in alc-books, and in the app's `validateSetForSharing`. The
template's copy is byte-identical in the template and eight content repos.

| | Template | alc-books | App (frontend) |
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

The app carries these checks as well, in two shapes. The frontend's share check
repeats all three with the template's two-letter cut. The backend's models
apply a third shape to the language fields of a set and of a lesson,
`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$`: it accepts `gsw`, which the template
rejects, and rejects `zh-Hant-TW` and `EN`, which the template and the frontend
accept after cutting them to `zh` and `en` and the engine accepts as they are.
The canonical version in engine#190 is decided between all of these.

Three more rules in the same validator are content rules too. `free_text` and
`picture_choice` need a non-empty `distractors` list; alc-books and the app's
share check have the same two rules, and `quality-rules.json` does not name
them, so moving that file does not move them. The `accept_orderings`
permutation check repeats the engine's `E-TILES-ORDERING` at the same severity.

#### Hint length: two versions, closed (engine#186, 0.29.0)

Before 0.29.0:

| | Engine `W-HINT-LENGTH` (0.28.0) | Template |
|---|---|---|
| Severity | warning | error |
| "vier Leerzeichen pro Ebene" | reported, falsely | not reported |
| "Anzahl der Buchstaben: vier." | reported | not reported |
| "ein einzelnes Zeichen", "a single character" | missed | reported |
| `blanks[].hint` | not checked | checked |

The template's version came first: adaptive-learner-content#100/#101 introduced
it on 2026-07-06 as an error in the hub's validator, #102/#103 widened it the
same day (English count words, the single-character forms), and the content
template's scaffold took the narrow first version on 2026-07-07. The engine's
followed on 2026-07-10 with its own pattern, unchanged through 0.28.0. It
matched a number word and a length noun anywhere in the hint, without word
boundaries. Measured over the ten content repos it reported 44 warnings, all
false (42 in adaptive-learner-content, 2 in alc-psychology: "Achte" read as
"acht", "bestimmten" as "ten", "Fragezeichen" as a length noun), and every one
of those hints was older than the rule. The template's version reported none.
Each side also caught forms the other missed (the table). engine#186 merged
them into the engine from one table of both sides' test cases plus probe cases
(word boundaries, the template's count forms, `blanks[].hint`, the engine's
reversed colon form) and kept the warning.

Closed on 2026-09-24: all ten content repos pin 0.29.0, the engine rule reports
**0** there (the 44 false warnings are gone), and the template's copy is gone
from `validate_content.py` in all of them (adaptive-learner-content-template#87
and the wave after it). The fixture repo adaptive-learner-content-test, outside
the ten, still pins 0.23.0 and carries the copy.

What the case shows: the guideline still holds, but the case is not evidence
that one rule in the engine is the better rule. It shows two versions nobody
compared, which is why this section exists, and it marks the guideline's limit.
The engine's version, the one the guideline keeps and the package ships to
every consumer that calls it, was the wrong one on the real content. The other
sat in the template's Python validator, mirrored into every content repo, and
nobody had compared the two. In practice both ran in the same ten repos: the
template's as a blocking error (in the hub since 2026-07-06, in the repos built
from the template since their first commit), the engine's as a non-blocking
warning, in CI only since 2026-09-23 and before that only for whoever ran
`make lint-warnings`.

What made the difference was not the severity in operation: after its first
day the template's rule had no hit at all (below). It lay in how each version
started, and in where a false hit went.

- The template's rule was introduced against the hub's real content, and every
  hit was settled: it reported 56 exercise and blank hints, all real, and
  adaptive-learner-content#101 rewrote them. The one false hit the scan found, a card hint
  where a character count is teaching content ("s[0:3] liefert 3 Zeichen"),
  changed the rule: card hints are exempt.
- The engine's rule shipped with four unit cases and no run over real content;
  on its release day it would have reported 45 hits over the content of the
  time, all false. It was looked at once: adaptive-learner-content-test#70
  (2026-07-14), working towards zero warnings, diagnosed a false hit with the
  cause engine#186 later fixed ("ten" in "verboten", "zeichen" in
  "Leerzeichen") and reworded the hint. No engine issue followed, and the rule
  stayed as it was for 72 more days.

The false warnings were not hidden either: anyone who ran the lint by hand could
read them for about 75 days, and the 42 in the hub stood as ordinary findings in
adaptive-learner-content#222 on 2026-09-23. They were recognized as the rule's
defect only when both versions were measured per repo side by side
(engine#186). Had the template's copy been deleted first, the engine's version
would have been the only one left, the comparison that exposed it could not
have been made, and the forms only the template caught would have gone
unchecked. The case is the evidence for the measurement under
[Moving a rule](#moving-a-rule-the-conditions), in the opposite direction from
the one it was set up for: it was meant to keep a move from turning repos red,
and here it showed that the engine's version was the imprecise one.

#### The app's frontend repeats engine errors

The app's share check (`validateSetForSharing`) re-implements `E-MATCH-DUP-LEFT` so that an author
sees it before an export or a share. The intent is right; the means is a second
implementation of a rule the engine already reports, and the copy already
differs: it compares left terms case-sensitively, the engine does not, so
"Empathie" next to "empathie" passes the app and fails the repo gate
(adaptive-learner#3222). The app kept the engine's validators out of its
bundle to avoid the structural ajv layer. Since 0.29.0 the engine offers the
semantic rules alone, `learn-content-engine/rules` (engine#191): no ajv, no
`node:*`, about 21.6 kB minified. That figure counts the entry's JavaScript; a
consumer that still imports parse functions from the package root gets 146 kB
of schema files copied into a Vite build that nothing reads (engine#203). The
entry removes the reason for the frontend's copies; the app has not switched
yet. It does not reach the backend's copy (next subsection).

A second frontend copy sits in `validateGeneratedLesson` (`analysis-to-lesson.ts`),
which checks every generated lesson and every imported lesson file. It repeats
twelve engine errors by meaning (the four step rules, `E-CARD-REF`,
`E-MATCH-PAIRS`, `E-FREETEXT-ACCEPT`, `E-TILES-MIN`, `E-TILES-ORDERING`,
`E-PIC-ONE-CORRECT`, `E-CLOZE-SENTENCE`, `E-CLOZE-MARKERS`) and differs in both
directions: a `matching` with `from_cards` and no `pairs`, valid in the engine,
fails the import ("needs pairs"); a `picture_choice` with one image, a
single-answer `multiple_choice` without a correct option and a `select` cloze
without distractors pass it, where the engine reports `E-PIC-MIN`,
`E-MC-ONE-CORRECT` and `E-CLOZE-SELECT-DISTRACTORS`.

#### The app's backend repeats the engine's semantic rules

The content loader in the app's backend (`plugins/adaptive-learner-plugin-content-loader`)
validates every manifest the API mode lists or downloads and every lesson it
serves or saves. Its structural layer is generated from this engine's schema;
its semantic layer is hand-written in `schema.py` and `models.py`
([Roadmap](#roadmap), stage 4). It repeats 25 of the 35 lesson-level errors in
`src/rules.ts` and `src/variables.ts`: the per-type rules of the six core
exercise types, the four step rules and `E-CARD-REF`. On one seeded negative
per rule both reject (25 of 25). The differences sit next to them
(adaptive-learner#3245, measured against engine 0.26.0 and 0.29.0):

| Rule | Engine id | Backend |
|---|---|---|
| A `left` term repeated in a `matching` | `E-MATCH-DUP-LEFT` | not checked: "a" next to "a" passes |
| A `stable_id` twice in one lesson | `E-STABLE-ID-DUP` | not checked |
| An `ext:` type not declared, or not registered | `E-EXT-UNDECLARED`, `E-EXT-UNSUPPORTED` | not checked: any `ext:` exercise passes |
| Parametric `variables` | `E-VAR-*` | not checked, deliberately: the backend only accepts the field |
| `metadata.retired_ids` not a list of strings | `E-RETIRED-IDS-TYPE` | not checked |
| A card id or a step id twice in one lesson | none (engine#202) | error |
| `example_url` is an http(s) URL | none | error, case-sensitive: `HTTPS://` fails |
| Shape of a language code, on the set and on the lesson | none | error unless `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$` |
| A set's `id` and `tags` | none; plain strings in the manifest schema | error unless an ASCII slug: `währung-a1` and the tag `präsenz` fail |
| A set's `version` semver-shaped; set ids unique in a manifest | none | error |

The first five rows are engine errors the backend does not apply; it saves and
serves lessons that carry them. The other rows are rules the engine does not
have. Each can be answered from a lesson or a manifest alone, so by the
assignment test it belongs in the engine, and the backend's version is one of
the versions to measure when it moves. No real content hits a row today: the
backend's models accept all 63 manifests and 631 lessons of the ten content
repos.

`learn-content-engine/rules` does not reach this copy: the backend is Python
and cannot import the package. The schema reaches it through generation; the
semantic rules do not, and no gate compares the two (the app's
`check_engine_schema_parity.py` compares the schema files only).

### Fixed: a lesson's `domain`

Until engine#184, `W-DOMAIN-UNKNOWN` checked only `sets[].domain` in a
manifest, not a lesson's own `domain`. A content repo had a local rule for it,
and the advice to drop that rule would have been a step back without the
engine change: the real case sat exactly in the gap, `"domain": "imported"` on
every lesson of an exported set.

The outcome is the regular case for this class, with one gap. The gap in the
rule was closed in the engine, the local rule went with the 0.29.0 pin
(alc-books#24), and a consumer's origin marker is **not** added to the engine's
vocabulary: the engine knows no consumers, and the existing warning already
says the right thing. The severity did not move with it: alc-books'
`validate_domain` was an error, `W-DOMAIN-UNKNOWN` is a warning, so the third
part under [Moving a rule](#moving-a-rule-the-conditions) is not met here
either, until adaptive-learner-content-template#83.

The origin of the value is fixed only in part. adaptive-learner#2425 (closing
adaptive-learner#2376 on 2026-08-05) filters the `domain` in the set-level files
of the app's repo export: manifest, search index and README. The lesson files are written as the app holds them, and a
lesson without its own `domain` inherits the set's (`parseLesson`), which for a
user set is its origin marker. A test through the same reads the export makes
reproduces it on the app's develop branch: the manifest says `language`, the
lesson file says `imported` (adaptive-learner#3242). No content repo holds such
a lesson today.

### Moving a rule: the conditions

**Decide the canonical version first.** Where several versions exist, that is
a decision with a reason, not a pick of the best copy. Otherwise the
reconciliation between the hub repo and the template repeats on a smaller
scale.

**Measure before building, in three parts.** A move changes what turns red, and
it can let the worse version win. The first two parts are the input to deciding
the canonical version; the third checks the decided version before the move is
built.

1. **Every version, per repo, over the real content.** Every existing version,
   the engine's included where it has one, runs over the content of every repo,
   and the findings are compared. The template's version shrinks, but the
   engine then reports things nobody reported before; without this, a clean-up
   release becomes the day every content repo turns red at once. Where a
   version lives does not pick the winner.
2. **Precision and completeness, separately.** Different means test them, and
   neither replaces the other.
   - *Precision*, are the hits right: blocking makes a false hit costly and
     therefore visible. That is a guarantee about what would happen, not a
     claim about what did. Whether it ever acted is measurable, per version:
     the severity and whether anything enforces it (a required check, or a
     recorded target such as "zero warnings"); how many hits it produced on
     real content, since a rule without hits was never observed at any
     severity; how each hit was settled; and where a false hit went. A false
     hit that changes the rule closes the loop; one that is worded around in
     the content hides the defect and leaves the rule as it was.
   - *Completeness*, are the cases complete: a miss stops nobody at any
     severity, so pressure says nothing about it. Only a deliberate search
     finds it: a re-scan of the content, one version's tests run against the
     other's code, or both sides' test cases plus probe cases in one table,
     next to the comparison over the real content in the first part.
3. **The severity at the new place.** A move has to carry the severity along,
   not only the pattern. Check whether the canonical version can reach, at its
   new place, the severity of the version it replaces. When the engine only
   warns and a repo cannot make that warning block, the move switches off the
   cost that made a false hit visible. That is a finding, not a detail. Today a
   repo cannot make a warning block (adaptive-learner-content-template#83), so
   that switch is the missing half of this guideline, not a convenience:
   without it, unifying tells a repo to give up its blocking rule and take a
   warning back. The switch restores the cost, not the way back: a false hit
   that stops a repo has to reach the engine as a report, or it gets worded
   around in the content, as in adaptive-learner-content-test#70.

**The hint length, measured this way.**

- *Every version over the content*: the engine's version reported 44 warnings,
  all false; the template's none.
- *Precision*: the template's rule was enforced by convention only: no content
  repo protects its main branch, and red validation runs reached main four
  times. It settled all its hits once, at its introduction (above), and its one
  false hit changed its scope. After that it had no hit at all: about 900
  validation runs over about 80 days, with about 286 hand-written hints, none
  within its reach. After its first day it was never observed; its record is
  clean because it was empty. The engine's version had a cost once, under a
  zero-warnings target in adaptive-learner-content-test, and the one false hit
  it met there was worded around instead of reported. Nowhere else did its hits
  cost anyone anything.
- *Completeness*: pressure found no miss on either side. The template's
  scaffold carried the narrow first pattern of #100, so in the nine repos
  built from it the English count words and the single-character forms that
  #102 had found in real hub content on day one went unchecked from 2026-07-07
  to 2026-09-23. Running the hub's tests against the template's code found that
  (adaptive-learner-content-template#79), and the engine's warning, the
  imprecise one, caught three of those real forms ("Two letters." among them).
  The reversed colon form ("Anzahl der Buchstaben: vier.") occurred in no
  content; only the case table in engine#186 showed the gap.
- *Severity*: since 0.29.0 the merged rule is a warning in all ten content
  repos, and the blocking copy is gone. The third part was not met; it stays a
  finding until adaptive-learner-content-template#83 lets a repo make the
  warning block.

### Open items

- **engine#185**: the quality minimums move into the engine, tied to the
  question of what a lesson is for. A bridge lesson is not a special type but a
  lesson without an assessment intent; a field the author declares, instead of
  one heuristic per exemption, and the same field answers the
  multiple-choice-only exemption.
- **engine#186** (closed, 0.29.0): one hint-length rule, kept as a warning; the
  template's copy is gone in all ten content repos. Its severity dropped with
  the move (above).
- **adaptive-learner-content-template#83**: a switch in
  `.github/quality-state.json` that makes selected warning ids blocking for one
  repo, without duplicating the rule or editing the shared workflow. The
  missing half of this guideline: the way a moved rule gets its severity back.
- **engine#190**: the language-pair and set-metadata checks move from the
  template into the engine; the three-letter primary subtags decide the
  canonical version.
- **adaptive-learner#3222**: the app stops re-implementing engine rules, in
  the frontend: the share check's `E-MATCH-DUP-LEFT`, `SLUG_RE`, and the
  per-type checks in `validateGeneratedLesson`; the quality minimums wait for
  engine#185. The PR sequence is in the plan comment there.
- **adaptive-learner#3245**: the backend's semantic layer, which the `/rules`
  entry cannot reach.
- **engine#201**: parameters on validation issues, so a consumer can keep its
  own wording; a precondition for the app's switch.
- **alc-books' domain rule** (moved with 0.29.0): now the engine's
  `W-DOMAIN-UNKNOWN`; its severity dropped with the move (above).
- **adaptive-learner#3242**: the app's repo export writes a user set's origin
  marker as the `domain` of every lesson file (above); adaptive-learner#2376
  fixed the set-level files only.

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
   the semantic rules in `src/rules.ts`. New schema features (e.g. `multiple_choice`, `from_cards`)
   originate here; consumers re-pin and regenerate.

Each stage is independent and additive; none requires a consumer to know
anything about any other consumer.
