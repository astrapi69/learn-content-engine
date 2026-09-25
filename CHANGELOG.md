# Changelog

All notable changes to `learn-content-engine`. The format is inspired by
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/) (schema evolution is additive, see
[docs/concepts.md](docs/concepts.md#schema-version-policy-additive)).

## [0.33.0] - 2026-09-25

Schema 1.18, a description-only change (what `bridge` lifts; two line breaks
restored). New checks: language tags as `E-LANG-TAG` (0 hits across the ten
content repositories) and four warnings for language pairs, set titles and
card-back scripts; `isSlugId` counts characters like the schema.

### `isSlugId` counts characters, as the schema does (engine#205)

`isSlugId` (the `/rules` entry) checked the 120 limit with `String.length`,
which counts UTF-16 code units, while the schema's `SlugId` counts characters
(code points, as JSON Schema's `maxLength` does). An id of 61 to 120 letters
outside the Basic Multilingual Plane passed the schema and failed `isSlugId`.
Decided in engine#205: 120 means characters; `isSlugId` now counts code
points. No content is affected (the longest lesson id is 69 bytes, Latin).
The byte limit of a file name (ids become `lessons/<id>.json`) is documented
as a known limit under [slug ids](docs/lesson-format.md#slug-ids).

### Language tags and set metadata are engine rules (engine#190)

The language-pair and set-metadata checks move from the content template's
validator into the engine, in the version decided on 2026-09-25:

- `E-LANG-TAG`: a `target_language` or `source_language`, on a set or a
  lesson, is not a well-formed BCP 47 tag (`en_US`). Checked with
  `Intl.getCanonicalLocales`, no table and no new dependency.
- `W-LANG-TAG-CANONICAL`: well-formed but not canonical (`deu`, `EN`, `iw`);
  the message names the canonical form. Three-letter primary subtags without a
  two-letter code (`gsw`, `yue`, `fil`) are valid, which the template's
  two-letter rule rejected.
- `W-LANG-PAIR-SAME`: a `language` set whose source and target are one
  language (the template: an error).
- `W-SET-TITLE-NATIVE`: a `language` set without `title_native` (the
  template: an error).
- `W-CARD-BACK-SCRIPT`: card backs with letters but none in the script of a
  non-Latin source language, one warning per lesson. The script comes from
  CLDR likely subtags, so every language is covered, not the template's six.
  `validateLesson` and `validateLessonRules` take the set's source language as
  `options.sourceLanguage`; a lesson's own `source_language` wins.

See [language tags](docs/lesson-format.md#language-tags). Measured with this
build over the 53 sets and 631 lessons of the ten content repositories: 0
findings for every rule; seeded faults in a real lesson and a real manifest
are found.

### A bridge lesson has no exercise-type minimum either (engine#185, schema 1.18)

`purpose: "bridge"` lifted only the exercise minimum, so a bridge lesson of
theory alone, or with exercises of one type, still fell short on
`E-QUALITY-TYPES`. Decided (owner, 2026-09-25): a lesson without an
assessment intent needs neither count nor variety, so `bridge` now lifts both.
The theory minimum and the per-exercise minimums still apply. This only
relaxes: nothing that passed before falls short now.

Schema 1.18 changes no field: the description of `purpose` says what `bridge`
lifts, and two descriptions get back the line breaks the em dash rewrite of
1.16 had swallowed (the root `Lesson` and `InlineExample`, engine#182). The
manifest schema, `quality-rules.json` and `grading-presets.json` move their
version in lockstep.

## [0.32.0] - 2026-09-25

No schema change: `x-schema-version` stays 1.17. Three new errors
(`E-CARD-ID-DUP`, `E-STEP-ID-DUP`, `E-EXERCISE-ID-DUP`) can turn content red
that carries a duplicate id; measured over the ten content repositories there
is none. The structural layer no longer reads files, so no schema file lands
in a consumer's build and `validateLesson` runs in a browser.

### Card, step and exercise ids are unique within a lesson (engine#202)

Three new errors check what the schema's descriptions have always said:
`E-CARD-ID-DUP`, `E-STEP-ID-DUP` and `E-EXERCISE-ID-DUP`, one error per
duplicated id, with the id and its 1-based positions in `params`. Card ids,
step ids and exercise ids are three separate namespaces: a step and its own
exercise may share an id, as most content does. `validateLesson` and
`validateLessonRules` (the `/rules` entry) both report them.

Why: no engine rule checked it, while the reference app rejects such a lesson
at error level. A lesson with two cards of one id passed every content
repository's gate, and a `from_cards` matching then silently lost the earlier
card (cards are looked up by id, the later one wins). The template's advisory
audit checked it outside CI only.

A new error can turn valid content red. Measured with this build over the 631
lessons on `origin/main` of the ten content repositories: 0 hits; a seeded
duplicate in a real lesson is found in all three namespaces.

### No schema file in a consumer's build, and `validateLesson` runs in a browser (engine#203)

The structural layer read `schema/*.json` at run time through
`new URL(`../schema/${fileName}`, import.meta.url)` and `node:fs`. Vite turns
such a URL into a lookup over every file in `schema/` and copied all of them
into every build that imported the package root, parse-only builds included,
and a browser could not run `validateLesson` at all (no file system). The two
schemas are now a generated module, `src/schemas.generated.ts` (`make
sync-types` writes it, `sync-types-check` guards it), without their annotation
keywords (`description`, `title`, `$comment`), which never change what a schema
accepts; a test compiles both forms and compares their verdicts on every
conformance fixture and on negative probes. The JSON files stay the authored
source and still ship.

Measured with Vite 8.3.0 (the reference app's version), one import per build:

| Import | JS before | JS after | Schema files before | after |
|---|---|---|---|---|
| `parseLesson` from the root | 30,482 B | 30,482 B | 146,976 B (3 files) | none |
| the root, nothing used | 670 B | 670 B | 146,976 B (3 files) | none |
| `validateLesson` from the root | 151,294 B | 158,704 B | 146,976 B (3 files) | none |
| `validateLessonRules` from `/rules` | 19,334 B | 19,334 B | none | none |

The `node:fs` / `node:url` build warnings are gone (2 before, 0 after), and the
built `validateLesson` now validates in a browser-like run, where it threw a
`TypeError` before.

## [0.31.0] - 2026-09-25

Schema 1.17: one additive lesson field, `purpose`. Every manifest and lesson
valid under 0.30.0 is valid under 0.31.0; `validateLesson` reports nothing new.
The new check is a separate call a consumer opts into.

### Quality minimums in the engine, keyed to what a lesson is for (engine#185)

`validateLessonQuality(lesson)` checks a shape-valid lesson against the quality
minimums of `schema/quality-rules.json` (exported as `QUALITY_MINIMUMS`): at
least five exercises of at least two types, a theory step, two accepted answers
per `free_text`, three pairs per `matching`. Shortfalls come back as errors
with five new ids, `E-QUALITY-EXERCISES`, `E-QUALITY-TYPES`, `E-QUALITY-THEORY`,
`E-QUALITY-FREETEXT-ACCEPTS` and `E-QUALITY-MATCHING-PAIRS`, each with `count`
and `min` in its params. It is also on the `learn-content-engine/rules` entry.
See [quality minimums](docs/lesson-format.md#quality-minimums).

The minimums are a publication threshold, not validity: `validateLesson`
never reports them, so a consumer that generates short lessons (the reference
app's adaptive lessons) still accepts its own output, and each consumer gives
a shortfall the weight of its gate.

Schema 1.17 adds the optional lesson field `purpose`: `practice` (the default,
every minimum), `bridge` (no exercise minimum) and `quiz` (no exercise-type
minimum). Content without it validates unchanged; the manifest schema moves
its `x-schema-version` in lockstep and changes nothing else.

Why: the minimums existed in three versions (the content template's gate,
alc-books' copy, the app's share check) with different exemptions and a
different count for `matching` with `from_cards`, so a set could pass its
repository gate and fail to be shared. The one version here replaces the
template's multiple-choice exemption and alc-books' bridge lessons recognised
by their id with the declared `purpose`, and counts the pairs `from_cards`
derives. The distractor requirement the three versions put on `free_text` and
`picture_choice` has no counterpart. Measured over the 631 lessons of the ten
content repositories on 2026-09-25: 8 fall short today (seven bridge lessons
in alc-books, one quiz in alc-traffic-knowledge), none once those eight
declare their `purpose`.

## [0.30.0] - 2026-09-25

No schema change: `x-schema-version` stays 1.16, and every manifest and lesson
valid under 0.29.0 is valid under 0.30.0. What moves is the shape of a
validation issue (an optional `params`) and three issue paths.

### Issue parameters: the values a message names, as data (engine#201)

A validation issue gains an optional `params`: the values its message
interpolates, unformatted (`E-MATCH-DUP-LEFT` carries `{ term, positions }`,
`E-CARD-REF` carries `{ cardId }`). 27 of the 59 rule ids put a runtime value
into their message; all but `E-SCHEMA` now also pass it as params (its message
and parameters are ajv's, deliberately not engine API). `W-PROMPT-DUP`, whose
two messages are constant, carries its variant (`field`), so 27 ids carry
params in all; `E-VAR-KIND` carries its variant (`reason`) next to the name. A
new test fails when a message can carry a value without params, and when the
params table in the rule catalog disagrees with the code
(`src/issue-params.test.ts`). The
keys per id are in the rule catalog, [issue parameters](docs/lesson-format.md#issue-parameters).
Messages are unchanged.

Why: a consumer that words problems itself, like the reference app with its
own message catalog in eleven languages, could only get the repeated term or
the missing card id out of the English message text (adaptive-learner#3222,
#3247).

No two issues the engine's own rules report are indistinguishable any more
(`E-SCHEMA` and extension issues aside), which changes three paths and one
count:

- `E-CARD-REF` points at the entry, `/card_ids/{i}` (was `/card_ids` for every
  unknown id of an exercise).
- `E-TILES-ORDERING` points at the entry, `/accept_orderings/{i}` (was the
  exercise).
- `W-VAR-UNUSED` points at the variable, `/variables/{i}` (was `/variables`).
- A reference repeated within one field (`{{b}} {{b}}`, `{{a + 1}} {{a + 1}}`)
  is reported once, not once per occurrence (`E-VAR-UNDEFINED`, `E-VAR-REF`).

A problem that is a relation between several elements keeps its path and is
told apart by its params (two `E-MATCH-DUP-LEFT` groups in one exercise, two
duplicated `stable_id`s). Measured before the change: no consumer depends on
the changed part of these paths. The content template maps warnings to an
exercise by the prefix `/steps/N/exercise`, which the new paths keep, and the
app reads no issue paths yet. The ten content repositories carry none of these
issues, so they need no re-pin for this release.

### Correction to 0.28.0: something did compare a pin with the current release

The 0.28.0 entry "Docs: the pin and currency discipline" says that comparing a
pin against the current release is something "nothing performs today". That
did not hold when it was written. The reference app's Dependabot had opened
grouped `/frontend` update PRs that carried engine bumps since 2026-07-11
(adaptive-learner#1562, #1587, #2923), although they arrive 3 to 10 days after
a release and fail the app's pin and schema parity tests every time. And the
content template and the hub had carried `engine-currency.yml`, which compares
the pin with the tracked npm dist-tag, since 11:08 UTC on 2026-09-23, about 90
minutes before 0.28.0 was published. `docs/architecture.md` ("Pinning and
currency") carries the measured account.

### Docs

- `docs/architecture.md`, "Rule ownership": a unification can let the worse
  version win (the hint-length case, measured: the engine's version reported 44
  warnings, all false; the template's copy none). Moving a rule now has three
  conditions: every version measured per repo over the real content, precision
  and completeness recorded separately (and where a false hit went), and the
  severity checked at the new place. The app holds three versions of the
  engine's rules, its backend's Pydantic models among them (engine#197, #198,
  #199, #206).
- "Pinning and currency": the record of the currency check, the condition
  under which a scheduled run can prove the create path at all, and
  Dependabot's engine PRs as a signal that arrives late and red (#198, #204).
- Every subpath export is documented: the `/rules` row names all seven, and
  `docs/qti.md` gains an API table with all ten `/qti` exports; the README
  exports gate covers the subpaths, and a changelog gate fails on a heading
  repeated within one release section (#200).

## [0.29.0] - 2026-09-24

No schema change: `x-schema-version` stays 1.16, and every manifest and
lesson valid under 0.28.0 is valid under 0.29.0. What moves are two author
lints, a new package subpath and a new data file.

### `W-DOMAIN-UNKNOWN` also on a lesson's own `domain` (engine#183)

The lint checked only the `domain` of a manifest's set entries. A lesson may
carry its own `domain` (absent or `null` inherits the set's), and the real
case sat exactly there: two exported book sets with `"domain": "imported"` on
every lesson. `validateLesson` now reports the same warning at `/domain`,
through the helper the manifest check uses, so both say the same thing. No
value is special-cased: the engine does not know the origin markers of
individual consumers. Measured over the ten content repos before shipping:
no lesson draws it today.

### One `W-HINT-LENGTH` rule (engine#186)

The hint-length rule existed twice, as this warning and as an error in the
content template's validator, and the two disagreed. The engine's version
matched a number word and a length noun anywhere in the hint, without word
boundaries: over the ten content repos it reported 44 warnings, all false
("Achte" read as "acht", "bestimmten" as "ten", "Fragezeichen" and
"characteristic" as length nouns). It also missed the article and
single-character forms ("mit einem Buchstaben", "ein einzelnes Zeichen", "a
single character"), eleven and twelve, the "-buchstabig" adjectives, and
every blank hint.

The rule is now a count directly before a length noun, with Unicode-aware
boundaries, plus the reversed colon form ("Buchstaben: 4", plural counts only)
and the "-buchstabig" adjectives. It checks the exercise `hint` and every
`blanks[].hint`, each at its own path; card hints stay unchecked. It stays a
warning. Measured with the build over the ten content repos: 44 warnings
before, 0 after.

### `learn-content-engine/rules`: the semantic rules without ajv or `node:fs` (engine#191)

A browser consumer that has already shape-checked its input can now call the
engine's rules instead of re-implementing them: `validateLessonRules`,
`validateManifestRules`, `isSlugId` (the schema's `$defs/SlugId`),
`SLUG_ID_PATTERN` and `SLUG_ID_MAX_LENGTH`. `validateLesson` and
`validateManifest` check the shape with ajv and then call exactly these
functions, so the two cannot disagree; a test pins the parity on every
conformance fixture. The entry imports neither ajv nor `node:*`, and a test
walks its module graph to keep it that way. Measured with esbuild (minified,
browser): the entry is 21,590 bytes (8,320 gzip); `validateLesson` alone is
144,637 bytes, 114,312 of them ajv, and it reads the schema with `node:fs`.

Internally, `src/validate.ts` is cut along its three layers: `issues.ts`
(issue types and helpers), `rules.ts` (semantic rules and author lints),
`validate.ts` (the structural layer). The public API of the package root is
unchanged.

### `schema/grading-presets.json`: a sourced catalog of grading scales

Exported as `learn-content-engine/schema/grading-presets.json`: grading scales
an author can copy into a set's `evaluation` block instead of typing a table.
23 presets (2 base forms, 12 class A following a primary source, 9 class B
naming their convention), 31 templates that carry a scale's grades and pass
mark but no thresholds, and 3 scales that cannot be expressed as percentages
(ECTS, GCSE/A-level, the German state law examination), each with the reason.
Every entry names its sources. A preset is copied: a later correction does
not reach sets that already carry it. `label` is the grade as written,
`label_native` the official word. Where an official lower bound is not a whole
percent, the row carries the whole percent below it and lists the official
value in `rounded_rows`. Tests hold every preset to `validateManifest` without
an error or a warning. See [Grading presets](docs/lesson-format.md#grading-presets).

### Docs

- `docs/architecture.md`: "Rule ownership: which layer owns which rule". The
  engine owns every rule about the content itself; the content template's
  tooling owns what the engine cannot see; the app owns render-time decisions.
  With the known violations, as of 2026-09-24, and where each is tracked.
- The grading presets explain why flooring a threshold is exact on a point
  scale, and that it maps the national scale, not a consumer's run (a run on
  its own grid can land between two reachable scale points).
- Every guide that pointed at `src/validate.ts` for adding a rule now points at
  `src/rules.ts`; README lists the two subpath entries.
- `CONTRIBUTING.md`: a release now brings every doc up to date first, with the
  audit recorded in the release PR.
- The project language is English: code, comments, docs, commit messages, PR
  and issue texts (`.claude/rules/coding-standards.md`); `tdd.md` is
  translated without a rule change.

## [0.28.0] - 2026-09-23

### `W-CLOZE-NO-CARRIER`: a cloze without a carrier sentence (engine#178)

A `cloze` whose `sentence` is nothing but its blanks has no gap text to read
around: the question sits in the `prompt`, and the blank teaches nothing. That
exercise is a question with an answer, and a native type says so directly -
`multiple_choice` in `select` mode, `free_text` in `type` mode. Both exist
(`multiple_choice` since schema v1.6), so the cloze spelling is a workaround
that outlived its reason.

A warning, not an error: the content is valid and the shape can be deliberate.
The carrier test is deliberately blunt - a sentence carries text when at least
one letter or digit survives the removal of the `___` markers, so blanks,
whitespace and punctuation alone do not count. `multiselect` is exempt by
design: its `sentence` IS the question and carries no markers at all.

Measured before shipping: over the content repos the rule fires on 195 of 1406
cloze exercises (190 `select`, 5 `type`), concentrated in three repositories,
and on nothing else. It also found a real defect in a set being authored at
the time, before that set was merged.

### Schema 1.16: the em dashes leave the descriptions (engine#180)

The authored schema files carried 22 em dashes in their field descriptions,
and every consumer inherited them: the two files are mirrored byte for byte
into ten content repos and into the reference app, where a local fix would
turn that repo's drift gate red. The house style writes a hyphen or a comma,
so they are rewritten here, at the source.

No field moved. `x-schema-version` goes 1.15 to 1.16 in both files because it
counts edits to the schema FILE, description-only ones included, while the
manifest's `schema_version` default stays at `1.7`. This is the purest example
of the two counters parting ways, and it is documented as such in
`docs/lesson-format.md#manifest-format`.

Bundled with the lint on purpose: two releases in a row would mean two re-pin
rounds through ten repositories for one typography fix and one warning.


### Docs: the pin and currency discipline (engine#174)

Every rule, error id and schema decision is documented here; the mechanic in
between was not. `docs/architecture.md` gains a "Pinning and currency" section
covering how a consumer pins (package dependency vs `schema/engine-version.txt`
plus mirror), what a pin guarantees (a known, immutable rule set) and what it
does not (that the set is the current one), when the pin has to move (new
fields: opt-in; new error rules: content can turn invalid; new author lints:
they move the pin although nothing in the content changes, the case nobody has
on the radar), and why a drift gate that compares a pin against itself is green
by construction and therefore never reports lag. Finding lag needs a comparison
against a value that moves; nothing performs it today, and the section names
that as a gap rather than announcing a feature.

`docs/validation.md` layer 3 now says that warnings are opt-in downstream: a
lint is effective on merge here, but in a consumer only once the pin moves AND
the wrapper reads `warnings`. `docs/concepts.md` marks the limit of the
additive policy: it explains why old content stays valid, which makes a re-pin
look never urgent - true for fields, not for error rules and not for lints.

`src/rule-catalog.test.ts` gains the reverse scan: a rule id NAMED in
architecture prose must still be emitted somewhere in `src/`, so a later rename
cannot leave a stale id behind. Proven with a seeded rename plus a permanent
negative control.

## [0.27.0] - 2026-09-23

### Manifest: an optional `evaluation` block on a set entry (engine#171)

A consumer decides how it scores a lesson run, and the reference app's
default (percent correct plus stars at fixed marks) is wrong for exam-like
content, where the pass mark is part of the subject: a driving-theory test
passes at a stated percentage, a certification set has a grade table. A set
entry may now declare `evaluation` with `scheme` (`percent`, `pass_fail`,
`grades`), `pass_percent`, `basis` (`elements`, one value today), a
`grades` table, `report` (`compact`, `detailed`) and a `title`. The block
describes ONE lesson run and never aggregates across the set's lessons; the
engine validates the declaration, while sampling, scoring and rendering
stay consumer-side. Beyond the shape, four rules: `E-EVAL-GRADES-MISSING`,
`E-EVAL-PASS-MISSING`, `E-EVAL-GRADES-DUP` (two rows at one threshold would
earn two grades, and which one wins would depend on the row order) and the
one warning, `W-EVAL-GRADES-NO-FLOOR` (a table whose lowest row starts
above 0 leaves the runs below it to a consumer-invented fallback label;
a warning because "no grade down here" can be the intent). `asContentSetEntry` carries the block into the
canonical entry, so a consumer reads it through the engine API.

Set level only in this version; the lesson schema stays strict, so an
`evaluation` inside a lesson file is rejected as before, and the name is
reserved for a planned per-lesson override. Absent block, unchanged
behaviour. Both manifest counters moved, because the block is a new
set-entry key: `schema_version`'s default `1.6` to `1.7` and
`x-schema-version` `1.14` to `1.15` (the lesson schema follows in lockstep,
as it always has). See `docs/lesson-format.md#evaluation`.

### `W-PROMPT-DUP`: a prompt that repeats the sentence or the step title (engine#169)

A new author lint. An exercise `prompt` that equals its `sentence` (the
cloze sentence, or the question stem in `multiselect` mode) or the step
`title` is reported once per matching field, as a warning that never
blocks. Consumers render the prompt as the heading and the sentence as the
question box (the title in the step list), so the learner reads the same
question twice. The lint is type-independent: any exercise that carries a
`prompt` can trip it. The sample that motivated it happened to be uniform -
10 of 276 exercises in one content repo, all cloze, spread over six lessons -
but that was the sample, not the reach: a later run over a grown corpus found
the same lint on `picture_choice` as well, and there every hit compared
against the step `title` and none against `sentence`. Either way it is a
pattern that arises while authoring, not a one-off. Compared after trimming and Unicode
NFC normalisation (a decomposed umlaut equals its precomposed form); case
is kept. No schema change, `schema/quality-rules.json` untouched.

## [0.26.0] - 2026-09-16

### `qti import` / `qti export` on the command line (engine#164)

The QTI adapter was reachable only from code. `learn-content-engine qti
import <file.xml> [--out <lesson.json>] [--id] [--title]` maps a 2.x or 3.0
item or test (dialect detected) to lesson JSON, on stdout or into a file;
`qti export <lesson.json> [--out <file.xml>] [--version 2.x|3.0]` goes the
other way. Exit codes as for every subcommand: 0 converted, 1 refused with
every unmappable item or exercise listed on stderr, 2 usage. The core
(`src/qti-command.ts`) is filesystem-free and pinned by the bin-shim
contract test; the bin shim owns the I/O. The comparative analysis names
interchange as the engine's entry door for content that lives in QTI; this
turns it into a two-minute try.

## [0.25.1] - 2026-09-16

### Documentation patch

The README shipped with 0.25.0 did not list the comparative analysis under
Documentation; it does now, so the npm page carries the link. Around it,
repository-only changes since 0.25.0: `docs/comparative-analysis.md`
version 1.6 states that the engine side is complete for every row of its
matrix and points its roadmap at the three adaptive-learner issues (#3108
pin, #3109 `variables` consumer half, #3110 hotspot, Parsons and ordering
adoption) instead of quarters; the version-claims gate now also checks
the package version the analysis names (seeded RED first); CONTRIBUTING
publishes to npm before creating the GitHub release, so the release-parity
workflow no longer reports a false red while npm propagates. No code, no
schema change.

## [0.25.0] - 2026-09-16

### QTI 3.0 dialect for the QTI adapter (engine#158)

`learn-content-engine/qti` spoke QTI 2.x only. 1EdTech's current version,
QTI 3.0, keeps the semantics of the mappable subset (choice, text entry,
match) and renames the syntax: `qti-` prefixed kebab-case elements
(`qti-choice-interaction`) and kebab-case attributes (`response-identifier`)
under the `imsqtiasi_v3p0` namespace. The adapter now reads both dialects,
detected from the root element (`importQti` is unchanged for 2.x callers and
refuses a root that is neither), and writes either: `exportQti(lesson)`
stays byte-identical 2.x, `exportQti(lesson, { version: "3.0" })` emits 3.0.
Same mapping table, same loud refusal list (issues report the canonical 2.x
interaction name), same fidelity limits, same round-trip guarantee. The
dialect difference lives in three pure functions in `src/qti/dialect.ts`;
the 3.0 fixtures follow the element and attribute spellings of 1EdTech's
implementation guide (checked verbatim for the choice example). Widening
the mapped subset stays a separate decision (docs/qti.md non-goals).

## [0.24.1] - 2026-09-15

### Variable references are opt-in: `{{` is ordinary text without `variables` (engine#151)

0.24.0 scanned every exercise for `{{name}}` references and reserved double
braces from schema 1.14 on. Re-pinning the content repos showed why that was
wrong: alc-technology's Ansible course teaches Jinja2, and `{{ server }}` in
a prompt, an accepted answer or a matching pair is the lesson, not a
variable. The claim in the 0.24.0 notes that no known content used double
braces was not checked against the content repos before publishing. Now
only an exercise that declares `variables` is scanned; without it, braces
are plain text and no `E-VAR-*` rule fires. Schema text corrected, version
stays 1.14 (no field changed). README no longer lists parametric exercises
as uncovered. Eight mermaid diagrams (tier model, gap map, parametric
flow, extension lifecycle, Bloom mapping, variables graph, portability
contract, engine/consumer seam) join the docs, rendered on the Pages site.

## [0.24.0] - 2026-09-15

### Parametric exercises: `variables` on any exercise, schema 1.14 (engine#151)

The last row of the comparative analysis still marked Missing. An exercise
may declare `variables`: SAMPLED (`min`/`max`, optional `step`) or COMPUTED
(`expression` over earlier variables, optional `tolerance`), and reference
them as `{{name}}` from any of its string fields; the consumer draws,
computes, substitutes and grades per attempt, the engine checks the
contract and never evaluates (rules `E-VAR-KIND`, `E-VAR-DUP`,
`E-VAR-RANGE`, `E-VAR-EXPR`, `E-VAR-UNDEFINED`, `E-VAR-REF`,
`W-VAR-UNUSED`). The expression language is deliberately small (decimal
numbers, names, `+ - * /`, parentheses, unary minus). This could not be an
`ext_payload` extension because the references live in core fields.
`x-schema-version` 1.13 to 1.14 in both schemas (lockstep). Additive:
content without `variables` validates unchanged; from 1.14 on a literal
`{{` in an exercise string field is reserved for references. See
`docs/lesson-format.md#variables-parametric-exercises`.

### Rendered docs on the Pages site (engine#152)

The site published only the schema and the TypeDoc API; the Markdown
documentation under `docs/` was reachable only by browsing the repository,
and an external benchmark that read the site concluded the six core exercise
types were all there is. `npm run docs:site` (`scripts/build-docs-site.mjs`,
`marked` as a dev dependency) now renders the top-level `docs/*.md` to
`/docs` on the site with GitHub-style heading ids, sibling links rewritten
to the rendered pages, links into the repository pointed at GitHub, and
mermaid fences rendered client-side. `docs/blog` and `docs/proposals` stay
repository-only.

### Two new reference extensions: hotspot, parsons (engine#149)

`docs/comparative-analysis.md` benchmarked the engine's exercise types
against Moodle, H5P, QTI 3.0, Canvas and Duolingo and listed six gaps. Three
of them (ordering, categorization, audio input) already had reference
extensions; the doc now says so. The two that were genuinely missing ship
here: `ext:ref-hotspot` (an image with `rect`/`circle` zones in percentage
coordinates, exactly one correct, graded by point-in-zone hit test) and
`ext:ref-parsons` (a program's lines with per-line indent, graded on order
AND indentation; deliberately no uniqueness rule, since real code repeats
statements). Both follow the self-contained-`ext_payload` shape (engine#68).
`ext:ref-ordering` gained the reference lesson it was the only extension
without. See `docs/extensions.md`.

### Author guidance for `explanation` (engine#147)

`docs/lesson-format.md` now says what a good post-answer explanation
CONTAINS, not only when it is shown: a one-sentence rule in the learner's
source language, a word-by-word gloss of the target sentence, two or three
further examples, and an optional typical mistake, with a complete worked
example and notes on the character budget, which exercise types benefit,
and how to avoid repeating one rule across a whole lesson. Documentation
only; the field stays free Markdown. A structured shape is deferred until
content written under the convention shows what authors actually use.

## [0.23.0] - 2026-08-31

### Three new reference extensions: audio-choice, audio-tiles, speak-and-record

Three language-learning exercise ideas surfaced as gaps against the existing
reference extensions (engine#68's audio/image-stimulus precedent): a gapped
sentence with audio options (`ext:ref-audio-choice`), a spoken sentence built
as a translation from word tiles (`ext:ref-audio-tiles`), and an ungraded
speak-and-record activity (`ext:ref-speak-and-record`). All three follow the
established self-contained-`ext_payload` shape (no core-schema change, no
card reference); `ref-speak-and-record` is the first reference extension with
no grade function, since a recording has nothing to check it against. See
`docs/extensions.md` for the payload rules and reference lessons.

### `explanation`: post-answer "why" on any exercise (idea 5)

A fifth language-learning exercise idea surfaced a gap the existing "extra
text" fields do not cover: `hint` is shown on demand before/during answering,
`examples` are worked examples shown before answering that must not spoil it,
and neither fits "explain the French word-order rule AFTER the learner
answers". `Exercise` gains an optional `explanation` (Markdown, max 2000
chars - twice `hint`'s 1000, since Markdown structure eats characters
faster than a single-line nudge) - not restricted to any exercise type,
like `hint` itself.

`x-schema-version` `1.12` -> `1.13` in both schemas (lesson + content-manifest
move in lockstep, established convention). Additive: content without the new
field validates unchanged.

## [0.22.0] - 2026-08-11

### Element-level stable identity: pairs, blanks, options (engine#91 Phase 2)

`stable_id` (engine#90) closed orphaning at the exercise/card level, but not
the case that actually occurred (adaptive-learner#2161): an answer-text
correction inside a surviving exercise still moves the content-derived key
of one MATCHING pair, CLOZE blank or MULTIPLE_CHOICE option, orphaning that
element's learner row. The app's mitigation (adaptive-learner#2308, "Weg C")
covers 186 of 190 measured moved slots (adaptive-learner#2301) by diffing
ordered content-derived key lists at update time; the remaining ambiguous
slots need a real identity, not a better diff.

`Pair`, `ClozeBlank` and `MultipleChoiceOption` gain an optional `stable_id`
(`$defs/SlugId` - hyphens only, no legacy underscore grandfathering, unlike
the exercise/card field). Shares the SAME per-set uniqueness namespace as
exercise/card ids (`E-STABLE-ID-DUP`, `collectStableIds`) - one flat space,
distinct `pair-`/`blank-`/`opt-` minter prefixes for readability, not a
second namespace. The stability gate's V1-V4 rules already cover the new
kinds generically (no new rule numbers): `buildStableIdInventory` just walks
one more level.

`mint-stable-ids` mints these too. They have no `"id"` member to anchor the
insertion on (unlike exercise/card), so it lands as the object's last member
before the closing brace - the same style already used when a card/exercise
`"id"` happens to be last.

`x-schema-version` `1.11` -> `1.12` in both schemas (lesson + content-manifest
move in lockstep, established convention). Additive: content without the new
fields validates unchanged.

Scope: this ships the identity primitive and tooling only. App-side
consumption (`element-keys.ts` preferring the new field, `remap-plan.ts`
using id-based matching) is separate follow-up work, the same split as
engine#90 vs. adaptive-learner#2130/#2455.

### Prose gate: manuscript-tools ms-check over docs/ + README

The sibling library `manuscript-tools` (PyPI, pinned 0.11.0) already
carries the invisible-characters check this engine's lint was seeded
from, plus the em-dash ban the blog STYLE rules demand - so the docs
prose is now gated by it instead of by convention. `make prose-check`
(and CI) runs `ms-check` with two rules active (`no-dashes`,
`no-invisible-chars`; the German-prose and whitespace heuristics are
disabled via `pyproject.toml` because they are wrong for an English
Markdown corpus). Guards learned today, applied here: the gate proves
the file set is non-empty before trusting a green run (`ms-check` exits
0 on an empty set, manuscript-tools#9), `STYLE.md` is excluded because
it SHOWS the banned characters, and the CHANGELOG stays out because old
entries describe a point in time.

The gate earned its keep on its first measured run: a raw U+0000 sat in
a code example of `docs/proposals/author-ergonomics-app-track.md` (a
join separator quoted as the real byte instead of its escape - the same
pattern engine#135 removed from the sources, third instance today). Now
spelled as the escape. Seeded probes: an em-dash and a zero-width space
each turn the gate red; an empty docs set trips the floor.

The comparison also went the other way: manuscript-tools' checker and
sanitizer are both blind to the C1 control range `U+0080-U+009F` (the
cp1252-mojibake class this engine's lint covers); reported as
manuscript-tools#11.

### Source files are text to every tool again (engine#135)

`src/stable-id-stability.ts` carried four RAW NUL bytes as key
separators in template literals - a correct separator choice expressed
the wrong way. A raw control byte flips the file to "binary" for grep
and friends, and a binary file makes every search in it SILENT; silence
is indistinguishable from "no hit", so the engine#131 source inventory
missed exactly the file with the decisive text (fail-open, found by a
read counter-probe). The separator now lives as an escape sequence
(same runtime value, the file is text again), and the raw BEL byte a
doc comment in `invisible-chars.test.ts` carried instead of showing its
escape is spelled `U+0007`.

The gate that keeps it fixed: `src/source-text-purity.test.ts` scans
every source file (`src/**/*.ts`, `bin`, `scripts`) for raw control
bytes outside tab/newline, with a seeded negative control and the
checked quantity asserted - the same character class the engine lints
in content (`W-INVISIBLE-CHAR`), now enforced on its own sources.
RED-first: the gate flagged the known file AND surfaced the BEL byte no
inventory had ever seen; writing the gate itself reproduced the trap (a
raw NUL slipped into the seeded fixture and made the new file silently
unsearchable) - the fixture now constructs the byte from its escape.

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

The unlock is only complete with the stability core (the follow-up cut,
same engine#131 - the first cut left V1 treating every disappearance as
a violation, so a correctly declared retirement would still have gone
red in every content repo's gate):

- **V1 unlock**: a base id missing from the head is legal exactly when
  the head's set declares it in `metadata.retired_ids`; the message now
  names the way out ("declare the retirement or restore the element")
  instead of the old lock.
- **V5 (new)**: a published retirement is never un-declared - an id that
  leaves the `retired_ids` list is a violation (add-only, like the ids
  themselves).
- **V6 (new)**: retired-yet-alive is a contradiction - a consumer
  resolves the id as living and would silently ignore the retirement.
- **Scope cut, named deliberately**: the retired-yet-alive ERROR lives
  in the stability core, not in `validateManifest` - only the core sees
  the lesson inventory. The manifest validator keeps what one manifest
  can prove: `E-RETIRED-IDS-TYPE` (the list must be strings) and
  `W-RETIRED-IDS-DUP` (duplicate entries, warning tier).
- The `check-stable-ids` CLI reads each tree's set manifests (base via
  git, head from the working tree) and feeds the declared retirements to
  the comparison; `checked` now reports base/head retired counts so a
  run that never read the manifests stays visible (test contract).
- Multi-element fixtures throughout (two retired with one alive, two
  removed with one declared): a one-element fixture cannot show a
  multi-element bug.

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
