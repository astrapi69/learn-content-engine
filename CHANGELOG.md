# Changelog

All notable changes to `learn-content-engine`. The format is inspired by
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/) (schema evolution is additive, see
[docs/concepts.md](docs/concepts.md#schema-version-policy-additive)).

## [Unreleased]

## [0.21.0] - 2026-08-06

### retired_ids unlocked: E-RETIRED-IDS-LOCKED removed (engine#131)

The lock was set with an explicit trigger recorded on
adaptive-learner#2188: it falls when the app-side consequence of
retiring an id is decided AND shipped. Both happened on 2026-08-06:

- **Decided** (architect, 2026-07-31): progress rows for retired ids are
  ARCHIVED - not deleted, not orphaned. They leave review planning and
  due counts; history stays. The user is told once, on update, with a
  count.
- **Shipped** (adaptive-learner PR #2458, after the stable_id key switch
  in PR #2455 closed adaptive-learner#2130): the app consumes
  `metadata.retired_ids` on set update in both storage modes, declared
  retirement is non-breaking in the update guard.

`validateManifest` therefore accepts `metadata.retired_ids` again (empty
or filled); the rule is gone from the catalog, and the stable-identity
contract documents the retirement semantics instead: entries match the
exercise/card identity (`stable_id`, author-slug fallback), add-only
stays the expectation for existing entries. Removal RED-first: the
unlocked tests failed against the lock before the rule was removed; the
regression guard keeps the rule id from coming back.

### Docs

- Three places still described `domain` as free-form after the 0.20.0
  vocabulary contract (README "What this is NOT", the EN and DE
  schema-first blog): fixed, and the docs-claims gate now rejects the
  phrasing in both languages (seeded negative controls, engine#127
  follow-up). `docs/validation.md`'s Manifests section now documents the
  two warning-tier vocabulary lints `validateManifest` carries since
  0.20.0.

## [0.20.0] - 2026-08-06

### Controlled vocabulary for domain and level (engine#127)

The registered consumer need (astrapi69/adaptive-learner#2335): a
controlled vocabulary for `domain` and an explicit level for
non-language sets - additive and optional, like `review_status` in
engine#94. A hard enum would invalidate published content, so the
contract is **known values + other**, carried by the engine:

- New exports: `KNOWN_CONTENT_DOMAINS` (the canonical grouping
  vocabulary: `language` plus the ten registry domains),
  `CEFR_LEVELS`, `LEVEL_NONE` (`"none"`, the explicit no-level
  sentinel for non-language sets), `isKnownContentDomain`,
  `isKnownLevel`. Consumers read these instead of keeping copies.
- Two author lints in `validateManifest`, warning tier, never block:
  `W-DOMAIN-UNKNOWN` (a domain outside the vocabulary - valid, but
  named, so the subject facet does not fragment silently) and
  `W-LEVEL-UNKNOWN` (a level that is neither CEFR, case-insensitive,
  nor - for a non-language set - the `none` sentinel; live junk this
  catches: `a0`, `einsteiger`, `reflexion`).
- The overlapping live domain pairs (`programming`/`software`,
  `ai`/`technology`) are both known; consolidating them stays a
  content-repo decision the engine does not force.
- Schema `domain`/`level` descriptions document the contract (no
  structural change, no schema version bump); docs gain a
  "Content domains" section, the rule catalog the two new rows.

### Docs

- Discoverability (SEO) exploration for the docs site (engine#124).

## [0.19.2] - 2026-08-05

Documentation refresh after the 0.19.x work, plus the gate that would
have caught most of it.

Stale, found by sweeping rather than by reading: `README.md` did not list
`alc-books`, the eleventh content repository; three places (English blog,
German blog, `lesson-format.md`) still said ten content repositories and
seven `alc-*` repos; and the README's public-surface table was missing
two exports, `lessonIdOrderingIssues` (shipped 0.18.0) and
`isBaseCredible` (shipped 0.16.0).

That last one is the reason for the new gate. The surface table is a
second place for the same truth and it drifted exactly the way such
places do: two releases added an export and nobody compared the table to
the module. The docs gates covered version claims, links and examples;
the table sat outside all of them. `src/readme-exports.test.ts` now
checks both directions against the real module namespace - every runtime
export appears in the table, and the table names nothing the package does
not export - so a new export cannot ship undocumented. Type exports stay
out of scope on purpose: they do not exist at runtime, and a hand-kept
parallel list would recreate the problem.

The German blog carried the same repository count as the English one and
would have been missed by fixing only the reported instance.


The three subsections below shipped in 0.19.2 but sat under a stale
`[Unreleased]` header until 0.20.0 - re-headed here, content unchanged.

### Four schema diagrams, two of them generated and drift-gated (engine#117)

`docs/schema-diagrams.md` shows the format as pictures: content
structure, exercise types, a relational THINKING MODEL, and the chain
from repository to learner. Each diagram states which of two kinds it is,
because the third kind - hand-drawn and detailed - is the one that goes
stale without anyone noticing.

The two whose content lives in the schema are generated by
`scripts/generate-schema-diagrams.mjs` and gated by `--check` in CI and
in `make sync-types-check`. The check names the number of exercise types
it saw, so a run over an empty enum cannot read as agreement (the floor
rule from engine#93); a seeded seventh type turns both the gate and three
tests red.

Two findings from drawing, both worth more than the pictures:

- **The schema does not encode which payload belongs to which exercise
  type.** `Exercise` is a flat object with 21 optional properties and no
  `if`/`then`, `oneOf` or discriminator, so a `matching` exercise
  carrying cloze fields and no `pairs` is STRUCTURALLY VALID - verified
  against the schema alone, where it produces zero errors, while
  `validateLesson` rejects it with `E-MATCH-PAIRS`. Diagram 2 therefore
  draws the type list from the enum and names the semantic layer as the
  owner of payload, instead of inventing a mapping that would be a second
  place for the same truth.
- **"Thirteen exercise types" is six plus seven.** The schema's closed
  enum has six core types; the other seven are the reference extensions,
  which the schema knows only as a pattern, never as an enumeration. The
  diagram now makes that split visible.


### Two stale schema-version claims, and the gate that let one through

`README.md` announced "Tracks the lesson schema at v1.7" while the schema
was at 1.11, and `docs/concepts.md` said "currently `1.7`". The second one
is the interesting failure: it is written in exactly the phrasing the
version-claims gate exists to pin, and the gate read past it because its
pattern had no room for the backticks around the version.

Both claims corrected, and both holes closed rather than only their
instances. The patterns now tolerate markdown emphasis around the version
token, and two further phrasings are registered ("Tracks the lesson schema
at ...", "schema at ..."). Every supported phrasing now carries a seeded
stale example as a negative control, so a phrasing added without proof
that it can fire is visible.

The gate's own documented escape hatch was the root cause: it stated that
prose claiming the current version must use one of its forms. That is a
convention, and README.md did not follow it through four schema bumps.

### The generated diagram did not render, and no gate could tell (engine#117 follow-up)

`docs/schema-diagrams.md` shipped with diagram 1 broken: the generated
cardinality label came out as `-->|steps "1..*"|`, and a `"` inside a
flowchart edge label is a parse error, so GitHub rendered an error box
where the diagram should be.

Every gate was green, because the drift check asks whether the committed
page matches the generator and never asks whether the generator emits
Mermaid that parses. Those are different questions, and the difference is
the whole failure: the page was faithfully generated and unreadable.

Fixed at the source (no quotes in edge labels) and closed with a gate that
measures the right thing: `scripts/check-diagram-syntax.mjs` parses every
Mermaid block in `docs/` and `README.md` with the real Mermaid parser, in
CI and in `make sync-types-check`. It refuses to pass on zero blocks, and
it covers hand-written diagrams too, which nothing else would have caught.
Negative control: reintroducing the quoted label turns it red with the
exact parse error.

Cost, stated plainly: `mermaid` and `jsdom` join devDependencies. Mermaid
needs a DOM even to parse, and a DOMPurify stub is not enough (measured).
Neither ships - the package `files` list carries `dist`, `schema`, `bin`
and `python/*.py` only.

## [0.19.1] - 2026-08-05

Packaging fix: 0.19.0 shipped `python/__pycache__/lce_schema.cpython-314.pyc`
- machine-specific bytecode, created by running the test suite before
packing, and never part of the published contract. `files` now names
`python/*.py` instead of the whole directory.

Found by verifying the PUBLISHED tarball rather than the local build, and
the guard that now prevents it measures the same place: the earlier
packaging test asserted the `files` entry in `package.json`, which
describes the intent, not the outcome - and the two disagreed exactly
here.

## [0.19.0] - 2026-08-05

### Ships a Python validator helper so both engines apply the slug rule (engine#115)

Schema 1.10 made the slug rule machine-enforced with `\p{Ll}` - valid
ECMA-262, and not compilable by Python's `re`. The consequence was not a
rule that quietly stopped working but a dead validator: `check_schema`
rejected the whole schema and instance validation raised
`re.PatternError`, so every content repo's `validate_content.py` and its
whole pytest suite would die on a pin bump. All eleven repos still pin
0.17.0, which is why nobody saw it until the first bump attempt.

Measured before deciding (all eleven repos at `origin/main`, 582 lessons,
31 334 identifiers): **158 published identifiers carry non-ASCII lowercase
letters** - 15 `step.id`, 12 `exercise.id`, 29 `card.id`, 102 tags. That
refuted the obvious fix: an ASCII-only pattern would invalidate them, and
repairing it would mean renaming exercise and card ids, moving the very
identity that `stable_id` exists to hold still.

So the canonical rule stays as it is, and the Python side gains what it
needs: `python/lce_schema.py` (shipped in the package, not copied into
eleven repos) swaps the `pattern` keyword for a `regex`-backed
implementation. Measured alternative rejected on the way: disabling the
`format` check alone silences the metaschema rejection while instance
validation still raises - a half fix that looks green until a lesson is
validated. When `regex` is absent the helper exits loudly rather than
falling back to a rule that cannot fail.

The suite runs the real Python against the real schema, because a
TypeScript assertion about a Python file proves nothing about the thing
that broke. `docs/lesson-format.md` now states why diacritics are allowed
and carries the measurement, so the next ASCII proposal meets the number
instead of a bare regex.

### Release parity gate: tag = release page = npm version (engine#111)

The class "version without publication" had three proven occurrences on
the npm axis (0.1.0, 0.3.0, 0.10.0: tag and release page exist, the
package was never published) and one on the release-page axis (v0.17.0
went four days without a page). New gate: the pure comparator
`checkReleaseParity` (src/release-parity.ts, tested RED-first) with the
I/O shim `scripts/check-release-parity.mjs` and a workflow that runs on
every published release, weekly, and on demand. The three historical npm
gaps are allowlisted, not republished - backfilling would create a state
that never existed. Live run at introduction: 31 version tags, 31
release pages, 28 npm versions, OK; failing path proven against a
mismatched repo (exit 1).

### The ordering gate gets a carrier: validateManifest runs it (engine#110)

`lessonIdOrderingIssues` shipped in 0.18.0 with zero callers - the repos'
gates import only `validateLesson` + `validateManifest`, so adopting the
check would have cost two steps per repository, ten times (pin bump plus
an explicit call). Now `validateManifest` runs the check itself over a
per-set manifest's `metadata.lessons` file list (entry minus `.json` is
the lesson id, the same reading the coverage command uses) and attaches
the warnings at `/metadata/lessons`. Repo cost drops to the pure pin
bump; warnings never block, so no gate turns red by surprise.

Proof against the live corpus (58 manifests across all 10 repos): one
real find - `alc-psychology/sets/de/psych-intro` lists two-digit AND
three-digit prefixes (`01-` through `99-` next to `100-` through
`112-`), so lessons 100+ display between `10-` and `11-` today. Filed
as a content issue; the warning is doing exactly its job.

### card.tags joins the hard slug pattern - schema 1.11 (engine#108)

Stage 2 of the slug rule: 0.18.0 hardened the four id fields but left
`card.tags` on the warning tier (`W-ID-NOT-SLUG`) because the published
corpus still carried 11 violating tags. That cleanup landed
(adaptive-learner-content#177), and the re-measurement against fresh
`origin/main` reads 8396 tags, zero violations (predicate proven against
seeded violations). `Card.tags.items` now references `$defs/SlugId`, so a
non-slug tag fails structurally with its exact array path - no longer a
warning a generator can ignore while the reference consumer silently
skips the lesson.

`W-ID-NOT-SLUG` is retired WITH the hardening, not kept alongside it:
semantic lints only run on structurally valid input, so after the
pattern lands the warning could never fire again. A rule that cannot
fail is worse than no rule (the same reasoning that fixed the
`formatMintReports` gate in 0.16.0). The character-naming nicety it
offered is replaced by the schema error's exact `/cards/N/tags/M` path.

`x-schema-version` 1.10 -> 1.11 in both schemas (lesson +
content-manifest move in lockstep). Migration note: content whose tags
already satisfied the documented rule validates unchanged; a tag with
apostrophes, uppercase, underscores or leading hyphens now fails
structurally - which is the point: it failed at the consumer already,
just silently and after distribution.

## [0.18.0] - 2026-08-05

### Lesson ordering: corrects a false schema claim and ships the set-level gate (engine#106)

The `lesson.id` description claimed the `NN-slug` prefix was mere convention
"though the loader does not enforce ordering - it reads the set's manifest
for the lesson sequence". Verified against the app code and all ten content
repos: no loader does. The set manifest's `metadata.lessons` list (present
in all 48 set manifests, riding through the free-form `metadata` block)
steers only which files the downloader fetches; the display order on every
consumer surface is the lexicographic sort of the lesson ids (the reference
consumer sorts `lessons/<lesson.id>.json` filenames on read and on zip
import). The claim arrived with the EXP-039 schema sync (2026-07-06) and was
never checked against the loader. Observed damage: a set without prefixes
displayed as kapitel-1, kapitel-10..17, kapitel-2..9 - unusable, with no
validation firing.

Both descriptions now state the real semantics (`lesson.id` in
`lesson.schema.json`; the `metadata` block in `content-manifest.schema.json`,
which claimed "the loader does not interpret these fields"). Description-only
schema change: no constraint moved, `x-schema-version` stays 1.10.

Because a wrong order is a property of a SET and the engine validates one
lesson at a time, the gate ships as a set-level helper in the
`collectStableIds` style: `lessonIdOrderingIssues(lessonIds)` (new export)
returns warning-tier issues for the three id shapes that guarantee a wrong
display order: mixed `NN-` prefix presence (`W-SET-ORDER-MIXED-PREFIX`),
inconsistent prefix widths (`W-SET-ORDER-PREFIX-WIDTH`), and
lexicographic-vs-numeric divergence (`W-SET-ORDER-NUMERIC`, the damage-case
shape). The rule-catalog completeness test now scans every issue-emitting
module, not just `validate.ts` - the gap that would have let the new codes
escape the catalog.

### Makes "slug-safe id" a machine-enforced rule instead of prose (engine#105, schema 1.10)

Before this change the slug requirement on `lesson.id`, `step.id`,
`exercise.id` and `card.id` existed only in the `description` text -
`validateLesson()` accepted ids with spaces, uppercase, umlauts and
underscores. The reference consumer (adaptive-learner) checks exactly those
fields plus `card.tags` against its import regex and silently skips any
lesson that fails, so an engine-conforming generator could produce content
the app throws away (observed: 2 of 23 lessons of a generated set missing,
the two with `free_text` / `word_tiles` underscores in the id suffix).

The app rule is now canonical and centralised as `$defs/SlugId`:
`^[\p{Ll}\p{Nd}]+(-[\p{Ll}\p{Nd}]+)*$` - lowercase Unicode letters and digits
in hyphen-separated runs. The four id fields reference it as a hard pattern.
Measured against `origin/main` of all ten content repos first (611 lessons,
6333 step ids, 4830 exercise ids, 6437 card ids): zero violations in
published `sets/` content, so the hard pattern invalidates nothing that
ships. (The only lesson-id hits were the `TEMPLATE-...` placeholder files
under `templates/`, which no gate validates; renaming them is a follow-up in
the content repos.)

`card.tags` gets the warning tier instead (`W-ID-NOT-SLUG`, names the
offending characters per tag): the published corpus still carries 11
violating tags (`mustn't`, `-er-verb`, `typ-III`, ...). The tag pattern
hardens in a follow-up once the content is clean. Warnings never block, so
content-repo gates stay green.

`stable_id` keeps its historical `^[a-z0-9][a-z0-9_-]{7,63}$` pattern:
published stable_ids are immutable by definition (engine#90), so the
underscore allowance stays, and the description now names the discrepancy
explicitly. No published stable_id uses an underscore, and the bundled
minter only ever emits `[a-z0-9-]`.

Migration note: content whose ids already satisfied the documented
convention validates unchanged. An id with uppercase, underscores or spaces
now fails structurally - which is the point: it failed at the consumer
already, just silently and after distribution.

Also fixes the schema-version floor test comparing `x-schema-version` as a
decimal number (`Number("1.10")` is `1.1`, reading a legitimate 1.10 as
below the 1.6 floor).

## [0.17.0] - 2026-08-01

Ships the coverage half of the stable_id promise, so a new unminted set can no
longer erode it silently.

`check-stable-ids` answers "does a published id still point at its element?".
It cannot answer "is every set actually minted?", because an unminted set
publishes no ids and therefore violates nothing. That second question lived as
a script vendored into ten content repos, and it drifted in reach rather than
in wording: it compared the covered COUNT against a committed baseline and
never consulted the total. A new unminted set raised the total, left the count
untouched and passed green. In `alc-psychology` that produced
`2 of 3 set(s) fully minted, baseline 2 / OK` - and ecosystem-wide, 47 of 47
would have become 47 of 48 with nothing reporting it.

The new command `check-stable-id-coverage` reads the root manifest, walks each
listed set through its `metadata.lessons` and judges four red paths together
rather than one per run: `NO_SETS`, `REGRESSION`, `UNDECLARED_RAISE`, and the
missing one, `INCOMPLETE`, which names every listed set that is not fully
minted. A set counts as covered only when every card and exercise in every
listed lesson carries a `stable_id`.

New exports: `computeStableIdCoverage`, `gateStableIdCoverage`,
`formatCoverageResult`, plus the `CoverageSet`, `StableIdCoverage`,
`CoverageFailure` and `CoverageVerdict` types. Only the baseline NUMBER stays
repo-local, because that is a property of the individual repository; the rule
is universal and therefore ships.

Verified against `origin/main` of all ten content repos before release: every
one is green under the new rule today, 47 covered of 47 listed.

Structural note, and the third instance of it in two days: a proof answers ONE
question, and it is rarely the one it gets used for. The add-only proof did not
answer "was everything minted?" (0.16.2), and the coverage ratchet did not
answer "is every set minted?" (this release). Both looked like the guarantee
they were standing in for.

## [0.16.2] - 2026-07-31

Makes an incomplete mint a failure instead of a success.

The 0.16.1 fix closed the concrete scanner bug; it did not close the class.
The add-only proof answers "did anything ELSE move?", never "was everything
eligible actually minted?", which is exactly why 2 of 8 could pass as a
success. A future scanner gap minting 7 of 8 would again only show if a
fixture happened to match.

`mintStableIds` now derives the eligible count from the PARSED lesson,
independently of the byte scanner, and refuses to write when the two numbers
disagree: `incomplete mint: the scanner found N of M eligible element(s)`.
The report carries `eligible` next to `minted`, and the human output prints
`N of M eligible`, so an incomplete run cannot look like a clean one.

Structural note behind both fixes: every fixture had exactly one card and one
exercise, and a fixture with one element cannot show a bug in the handling of
several. State that spills between two elements needs two elements to exist
at all.

## [0.16.1] - 2026-07-31

Fixes the `mint-stable-ids` scanner, found by the coverage ratchet on the very
first mint wave.

After consuming a string VALUE the scanner kept the pending key, so the next
`{` took that key instead of its array index; its path stopped matching and
every element after the first was skipped. On the first real lesson it minted
2 of 8 ids and reported success, because the add-only proof only checks that
nothing OTHER than `stable_id` moved, not that everything eligible was minted.
The repo-local coverage ratchet caught it (0 of 1 sets fully minted against a
baseline of 1), which is exactly the job it was added for.

The unit tests missed it because every fixture had a single card and a single
exercise; the regression test now uses a lesson with three cards, a theory
step and two exercise steps, and asserts full coverage plus id uniqueness.

## [0.16.0] - 2026-07-31

The bundled schema stage for content identity (#90) plus the two changes that
were waiting for a carrier. Schema `x-schema-version` moves 1.8 -> 1.9,
additive: every pre-1.9 lesson and manifest validates unchanged.

### Schema 1.9 (additive, three fields in one round)

Three field wishes shared one mirror-and-repin round over ten content repos
instead of three:

- `stable_id` on `Exercise` and `Card` (#90): author-owned, version-stable
  identity for learner-progress and SRS joins. An opaque mint-once lowercase
  slug (`^[a-z0-9][a-z0-9_-]{7,63}$`), deliberately NOT derived from content,
  so correcting an answer never moves it. Uniqueness inside a lesson is
  enforced (`E-STABLE-ID-DUP`; exercises and cards share one namespace); the
  set-wide half ships as the exported `collectStableIds` helper, because the
  schema only ever sees one document. Version stability itself cannot live
  here at all: it needs the previous version, so it lives in the content
  repos' stability gate.
- `attribution` on `ContentSet` (#90): `author` plus a bounded `derived_from`
  chain (oldest first, at most 8 entries). Attribution, not authorization:
  without accounts a name is unverifiable and the field claims nothing more.
  The name travels with the set when it is shared, so a consumer app must say
  so before it becomes visible.
- `review_status` on `ContentSet` (#94): three states derived from ORIGIN,
  because origin is what makes a set review-worthy. `authored` (hand-written
  by a speaker or domain expert, no review needed; also the meaning of an
  absent field), `generated` (machine-generated, review pending), `reviewed`
  (machine-generated and reviewed). A two-valued field would have put
  hand-written sets in the same class as unreviewed machine output.

`ContentSetEntry` projects both set fields: `review_status` normalized (absent
or out-of-enum folds to `authored`), `attribution` verbatim or `null`.

### Scope and limit of the identity stage

This stage closes orphaning caused by slug renames and position shifts on the
exercise and card level. It does NOT close the case that actually occurred
(adaptive-learner#2161): an answer correction inside a surviving exercise
still moves the content-derived element key and orphans exactly that element.
That remainder is reduced, not closed, and is currently covered only by the
app-side update guard (adaptive-learner#2128) until #91 or an app-side
element-key decision closes it.

### Tooling

- New CLI command `mint-stable-ids <file...> [--write] [--json]`: the add-only
  retrofit tool. Byte-offset insertion keeps both lesson formatting styles
  byte-identical apart from the added members, and the core proves the
  add-only property on its own output before returning it. That property is
  what keeps the retrofit a non-event for learner progress: old derived keys
  and new ids coexist in one file, so a consumer computes its remap locally.
- New export `collectStableIds` (+ `StableIdReport`, `StableIdDuplicate`) for
  set-wide uniqueness in the content-repo gates.
- New CLI command `check-stable-ids [--base <ref>]`: the stability gate,
  SHIPPED rather than copied into each content repo. It compares the working
  tree against the merge base with `--base` (default `origin/main`, the
  published state) and reports `V1` a published id disappeared, `V2` a
  set-wide duplicate, `V3` an id pointing at another kind or exercise type,
  `V4` a lesson file gone while its set survives (the filename is the
  lesson's identity). Editing content under a constant id passes, which is
  the entire point. The reason it ships: the schema claims stable identity in
  every consuming repo, so enforcement living in one of them would leave the
  rest claiming a promise nobody checks. `compareStableIdInventories` and
  `buildStableIdInventory` are its pure, exported core; git history and file
  reads stay in the CLI shim, so the library keeps its no-I/O boundary.
  Two floors keep a green run meaningful, since the gate matters most while
  ids are being minted: a base carrying no lessons while the head has them is
  not a plausible predecessor and fails (`--allow-empty-base` states a genuine
  first publication), and a base ref that does not resolve exits 2 instead of
  comparing against nothing. A base WITH lessons and zero `stable_id`s stays
  credible, because that is exactly the state a minting PR starts from. The
  default base `origin/main` fits the ten content repos (all default to
  `main`, checked); `--base` covers a repo whose published state lives
  elsewhere.

### Also in this release

- `E-RETIRED-IDS-LOCKED` (#92): a manifest carrying `metadata.retired_ids` is
  rejected. The deliberate-deletion list of the stability gate stays unusable
  until adaptive-learner#2188 defines what happens to the learner progress of
  a retired element; otherwise the mechanism would create exactly the
  orphaning it exists to prevent. The rule is removed deliberately once that
  decision lands.
- `make conformance-real` no longer reports success over nothing (#93): zero
  lessons in total, or any listed repo contributing zero lessons (the
  renamed/removed/emptied case a hardcoded list ages into), now fails loudly.

### Fixed

- `mint-stable-ids` returned a bare string from its formatter while the CLI
  shim destructures `{ text, exitCode }`, so the command printed `undefined`
  and exited 0 whatever happened. Its unit tests asserted on the string and
  never exercised the shim contract. A contract test now pins the shape for
  every command at once.

## [0.15.0] - 2026-07-28

Adds `ext:ref-image-description`, the SEVENTH reference extension: an image
stimulus bound to a typed answer ("look at the picture, describe it" or answer
a question about it), the visual twin of `ext:ref-dictation`.

The core schema cannot express the shape: `images` is the `picture_choice`
OPTION list (exactly-one-correct contract) and `free_text` carries no media,
so a picture-prompted free-text answer had no home. Modelled as a single ext
exercise with a self-contained `ext_payload` of `src` (image reference: a
relative `assets/` path or an inline data URI, resolution stays with the
consumer) and `accept` (the accepted answers, mirroring the `free_text`
contract). Rules `E-EXT-REFIMGDESC-SHAPE|-SRC|-ACCEPT`. Deliberately no
alt-text field: it would leak the expected answer, so the accessibility
affordance is a consumer decision.

Like every `ref` extension this is a decision basis for adoption, excluded
from the published build; no schema change (`ext_payload` is an open object,
`x-schema-version` stays 1.8). Consumer-half demonstrations
(`renderRefImageDescription`, `gradeRefImageDescription`) show the seam; the
doc gate validates the new reference lesson.

## [0.14.0] - 2026-07-23

Adds an optional `visibility` flag to the content-manifest set entry (#83).

Some sets in a content repo are technical reference or conformance fixtures,
not learner content. The canonical case is the graded-quiz demo in
`adaptive-learner-content-test`, the deliberate `E-EXT-UNSUPPORTED` negative
case in `scripts/conformance-real.mjs`: it must stay on disk for conformance
but should not surface to learners. Until now the consumer app carried a
hardcoded app-side blocklist, the wrong layer for repo-owned metadata, because
the strict set-entry schema (`additionalProperties: false`) rejected any new
field.

`schema/content-manifest.schema.json` now declares an optional
`visibility: "visible" | "hidden"` on `ContentSet` (default `"visible"`). It is
a consumer-display hint only: the engine and the real-content conformance
harness still validate hidden sets and never exclude them from validation; only
consumer apps filter on it. Absent means visible, so every existing manifest
keeps validating unchanged. The flag flows through the canonical projection, so
`asContentSetEntry` exposes it on `ContentSetEntry.visibility` (a new
`SetVisibility` type), normalizing any out-of-enum value back to `"visible"`.

Additive and backward compatible, so `x-schema-version` stays `1.8` (matching
the field-level additive precedent in the lesson schema); the frozen schema
baseline is refreshed in the same commit.

## [0.13.3] - 2026-07-22

Hardens `W-INVISIBLE-CHAR` (#77), the lint shipped one release earlier.

Control characters were the gap. A JSON source escapes them (`\u0007`), so
`JSON.parse` hands back a real control character that every structural check
accepts; verified before fixing, such a lesson validated clean and produced no
warning at all. The rule now covers C0 (except tab, newline and carriage
return), `U+007F` DELETE and the C1 range.

Tab, newline and carriage return stay excluded on purpose: theory bodies are
full of newlines, so flagging them would warn on nearly every knowledge lesson.
A boundary test pins that.

The codepoint table is now keyed by numeric codepoint instead of by the
characters themselves. Keying it by the characters made the source unreadable
in the one file where that is least acceptable: a reviewer saw an empty string
and had to take the label on trust. Matching is also a single regex test per
string now, walking a string only when it actually matches.

Re-measured on the same 528 real lessons across seven content repositories:
still 4 findings, still 0 false positives, with control characters and C1 newly
in scope.

## [0.13.2] - 2026-07-22

New author lint `W-INVISIBLE-CHAR` (#75): warns when a lesson's text carries
characters that render as nothing - zero-width spaces, byte-order marks,
directional marks, soft hyphens. They are legal JSON and survive every
structural check, and no one spots them by reading the file; they arrive by
pasting from a PDF or a web page, which is exactly what the reference app's
book-text wizard asks the author to do. The warning names each codepoint
(`U+200B ZERO WIDTH SPACE`), its Unicode name, the occurrence count and the
paths, aggregated once per lesson (the `W-CARD-UNUSED` precedent from #49).
Every string is walked, including `ext_payload`, so extension text is covered
without the engine knowing its shape.

Deliberately NOT flagged: `U+00A0` NO-BREAK SPACE and `U+202F` NARROW NO-BREAK
SPACE. Both render as whitespace and are legitimate typography, notably in the
French content this ecosystem carries. Measured on 528 real lessons across
seven content repositories: 4 findings, all genuine soft hyphens sitting
mid-word in pasted prose, 0 false positives.

Warning tier, never blocks. Additive: no schema change, no `schema_version`
bump. Content repos pick it up through their existing `make lint` /
`make lint-warnings` without changing anything.

## [0.13.1] - 2026-07-20

Docs/examples: sixth reference extension `ext:ref-dictation` (#68) - an audio
stimulus bound to a typed transcription. The payload is self-contained
(`audio` reference + `accept` transcriptions, no card lookup); the engine
validates only that `audio` is a non-empty string and leaves storage, upload,
resolution and playback to the consumer. New payload rules
`E-EXT-REFDICT-SHAPE`, `E-EXT-REFDICT-AUDIO`, `E-EXT-REFDICT-ACCEPT` on the
extension half. **No schema change and no `schema_version` bump**: a new
`ext:` type never touches `lesson.schema.json` (`ext_payload` is already an
open object), so existing content validates byte-identically. The example
lives under `src/examples/` and is excluded from the published build.

Tooling fix (#70): the real-content conformance harness called `validateLesson`
without a registry, so every lesson declaring `requires_extensions` was
reported as `E-EXT-UNSUPPORTED` forever - a harness artefact, not a content
finding, sitting in a list whose own header says "diagnose per case". New
internal helper `declaredExtensionRegistry` synthesises a permissive registry
from the lesson's OWN declarations, which is the only registry the engine can
honestly build: it drives foreign content and cannot know what any given
consumer adopted, and an adoption allowlist here would point the dependency
Consumer -> Engine. `E-EXT-UNDECLARED` and the schema-level checks are
unaffected (verified against the built artifacts). `make conformance-real` now
reports 0 discrepancies across 10 repos / 553 lessons. The doc gate's
duplicated copy of this logic was folded into the same helper.

## [0.13.0] - 2026-07-17

Feature (schema 1.8, additive): `picture_choice` image `src` now takes one of
two explicit formats - the original relative `assets/` path (unchanged
500-char cap) OR an inline base64 data URI (`data:image/...;base64,...`) with
its own 250000-char cap, sized for the reference consumer's 150-KiB upload
compression (adaptive-learner#1763). The path intent stays documented and
enforced instead of being silently widened; existing content validates
unchanged. New author lint `W-PIC-DATA-URI` (advisory, never blocks) flags
inline data URIs so repo content keeps preferring `assets/` paths over
git-bloating blobs. Decision record: #66 (option B - both formats explicit).

## [0.12.3] - 2026-07-15

Fix: importing the package entry no longer touches the filesystem (#59). The
ajv validators for `lesson.schema.json` and `content-manifest.schema.json`
were compiled eagerly at module load via `readFileSync`, so a browser
consumer whose bundler executes the entry eagerly (e.g. vite dev
pre-bundling, no tree-shaking) crashed on import even when it only used the
parse APIs; production builds were merely masked by tree-shaking. The
compiled validators are now created lazily on the first
`validateLesson` / `validateManifest` call (memoized). No API change;
Node behaviour is identical.

## [0.12.2] - 2026-07-14

Change: new hard rule `E-MATCH-DUP-LEFT` - a `matching` exercise's `left` terms
must be unique within the exercise (compared case-insensitive and
whitespace-trimmed). A repeated left maps to two different rights, which is
objectively unsolvable for the learner; the message names the term and its
positions. The content fix is the author's - there is no safe automatic rename.
The existing `W-MATCH-AMBIG` warning now covers duplicate `right` values only
(left duplicates are the hard error). Origin: three independent occurrences of
the same author mistake (alc-die-waehrung-des-geistes#27). A dry run over all
four content repos (562 lessons) found zero affected lessons, so the rule ships
as a hard error with no migration. Validator-only; `x-schema-version` stays
`1.7` (no schema field added). This tightens validation, so consumers with
duplicate-left content (not present in the audited repos) would newly fail -
bump treated as a patch since no audited content is affected. Closes #54.

## [0.12.1] - 2026-07-14

Change: `W-CARD-UNUSED` is now emitted **once per lesson**, listing every
unused card id, instead of one warning per orphan card (#49). A card-rich set
(cards as a broad knowledge base, exercises a curated subset) is a common,
valid shape - the official content repo carries ~17% unreferenced cards
uniformly across every set - so a line per card buried the rare real author
mistake under noise (alert fatigue). Detection is unchanged: the
`unusedCardIds` core the suggest-wiring CLI shares still returns the full
per-id list; only the lint's emission aggregates. Non-breaking - warnings
stay non-blocking and `validateLesson`'s result shape is unchanged
(`x-schema-version` stays `1.7`).

## [0.12.0] - 2026-07-11

Feature: `learn-content-engine suggest-wiring <file...> [--json]
[--write --accept <id>...]` - a suggest mode for `W-CARD-UNUSED` (#20).
Detection shares the lint's unused-card core; a wiring is proposed only when
the card's `front`/`back` appears verbatim in a text field of exactly one
exercise, printed with its evidence (field + quote). No fuzzy matching: zero
or ambiguous matches land in "manual review" instead of a guess. Dry-run by
default; `--write` applies only explicitly `--accept`ed suggestions (no bulk
apply - `card_ids` drives SRS scheduling) and the rewired lesson must pass
the bundled validator before the file is touched. Schema untouched
(`x-schema-version` stays `1.7`). See
[lesson-format.md](docs/lesson-format.md#suggesting-card-wiring-for-unused-cards).

## [0.11.1] - 2026-07-11

Fix: `schema/lesson.schema.json` is canonically serialized again
(`json.dumps(..., indent=2, sort_keys=True)`); the 1.7 blocks from 0.10.0 had
been inserted hand-formatted. Semantically identical (parsed-equality
proven), but consumers that RE-EMIT the schema canonically (the app's
sync-schema pipeline and its byte-parity gate) need the canonical bytes.
Types regenerated from the sorted artifact; no rule/type change.

## [0.11.0] - 2026-07-11

Feature: optional **QTI 2.x interop adapter** on the subpath
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

## [0.10.0] - 2026-07-11

Feature: **extension exercise types** (schema **1.7**). A consumer
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

## [0.9.0] - 2026-07-11

Feature: `learn-content-engine migrate <file...> [--write] [--json]` -
the cloze `select`/`multiselect` -> native `multiple_choice` conversion every
content repo scripted by hand, as a validated CLI subcommand. Dry-run by
default; the rewritten lesson must pass the bundled validator before
`--write` touches the file; multi-blank selects and `cloze_mode: "type"` are
never converted (no clean MC equivalent). Schema untouched
(`x-schema-version` stays `1.6`). See
[lesson-format.md](docs/lesson-format.md#migrating-cloze-selectmultiselect-to-multiple_choice).

## [0.8.2] - 2026-07-10

Schema annotation: the list/map fields that are always present at
runtime (`Card.tags`, `Exercise.card_ids`, `Exercise.distractors`,
`Lesson.cards`; manifest `ContentSet.tags`/`assets`, `sets`, `metadata`) now
carry an explicit `"default": []` / `{}`. Validation-neutral (ajv ignores
`default`; TS types unchanged) - it makes the existing "absent = empty"
contract machine-readable so downstream code generators (the app's D3b
Pydantic generator) can reproduce it. 8 added lines, nothing else.

## [0.8.1] - 2026-07-10

Fix: the manifest schema's `schema_version` field `default` now
also says `1.6` (0.8.0 bumped only the `x-schema-version` stamp; the app
generator renders the field default from the same constant, so the byte-parity
gate caught the inconsistency). No other change.

## [0.8.0] - 2026-07-10

Feature (Bucket B): native **`multiple_choice`** exercise type
(schema **v1.6** - a new type is a minor schema bump per the ExerciseType
policy; 1.x content stays valid). At least two `options` (`{text, correct?}`,
texts unique); `multiple: false` = single choice (exactly one correct),
`multiple: true` = select-all (exact-set grading, no partial credit).
Coexists with the `cloze` select/multiselect vehicle - nothing deprecated.
New rules `E-MC-OPTIONS` / `E-MC-ONE-CORRECT` / `E-MC-MIN-CORRECT` /
`E-MC-DUP-OPTION`. **Not yet rendered by the app** - the app-side renderer +
grader (part 2) makes it a complete feature; the app re-pins then.

## [0.7.0] - 2026-07-10

Feature (Bucket B): matching `from_cards`. A `matching` exercise
can derive its `pairs` from the referenced cards (left = `front`,
right = `back`) instead of duplicating them - set `"from_cards": true` with
`card_ids` and omit `pairs`. The engine resolves it to concrete pairs at parse
time, so no renderer changes. Additive + optional; `x-schema-version` stays
`1.5`. New rules `E-MATCH-FROMCARDS-CARDS` / `E-MATCH-FROMCARDS-PAIRS`. First
schema feature authored in the engine post-flip.

## [0.6.1] - 2026-07-10

Tooling: the lesson TypeScript types are now regenerated from
`schema/lesson.schema.json` by an in-engine generator
(`scripts/generate-lesson-types.mjs`, `make sync-types`), gated in
`release-check` + CI (`--check`). Completes the D1b follow-up (type generation
moved here). Types are byte-identical; only the generator banner changed. No
API or schema change.

## [0.6.0] - 2026-07-10

**Schema authority moved to the engine** (roadmap stage 4). The
lesson schema is now the authored canonical source here; the app and content
repos consume it (source-of-truth chain: engine → app + content). The flip is
**byte-equivalent** - only the `$id` changed (now engine-owned,
`https://astrapi69.github.io/learn-content-engine/schema/...`); same types,
fields, enums and constraints, and `x-schema-version` stays `1.5`. A frozen byte
baseline (`src/schema-baseline.test.ts`) guards against content drift. No
behavior change; consumers re-pin to 0.6.0.

## [0.5.0] - 2026-07-10

Author ergonomics (additive, back-compat): `validate*` gains a
non-blocking `warnings[]` layer and every issue carries a stable `id`,
`severity` and `docAnchor` (`valid` stays errors-only). New author lints -
unused cards, ambiguous matching, duplicate word tiles, answer-as-distractor,
duplicate picture labels, length-revealing hints. A `learn-content-engine lint`
CLI runs the full gate (errors + warnings) offline with `--json`. A rule
catalog + editor-setup section in the docs (catalog completeness is tested).
The app-side items (a `multiple_choice` type, word_tiles grade-by-string) are
co-designed in [a proposal](docs/proposals/author-ergonomics-app-track.md).

## [0.4.0] - 2026-07-07

Distribution: `schema/quality-rules.json` ships as a package
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
