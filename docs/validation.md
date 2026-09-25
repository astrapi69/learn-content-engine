# Validation

`parse` is permissive; **`validate` is the explicit step that enforces the
format**. You choose when to run it:

```ts
import { validateLesson, validateManifest } from "learn-content-engine";

const result = validateLesson(JSON.parse(rawLessonJson));
// result: { valid, errors[], warnings[] }
// each issue: { path, message, id, severity: "error" | "warning", docAnchor, params? }
if (!result.valid) console.error(result.errors);
if (result.warnings.length) console.warn(result.warnings);
```

Neither function throws; both return a `ValidationResult`. `valid` is
**errors-only**: warnings never block. Every issue carries a stable `id` and a
`docAnchor`; the complete list of ids is the
[rule catalog](lesson-format.md#rule-catalog). An issue whose message names a
value (a term, a card id, a count) also carries it in `params`, so a consumer
can word the problem in its own language
([issue parameters](lesson-format.md#issue-parameters)). For an offline author workflow
that surfaces both errors and warnings, use the
[`learn-content-engine lint` CLI](lesson-format.md#linting).

Validation runs in two layers (field checks before cross-field checks):

## Layer 1: structural (ajv, strict)

The input is checked against the bundled JSON-Schema
([`schema/lesson.schema.json`](../schema/lesson.schema.json) /
[`schema/content-manifest.schema.json`](../schema/content-manifest.schema.json),
draft 2020-12) with [ajv](https://ajv.js.org/). This enforces required fields,
field types and lengths, enum values (`type`, `cloze_mode`, `direction`,
`media_type`, ...), and nested shapes (`Pair`, `PictureImage`, `ClozeBlank`).

The schema is **strict**: `additionalProperties: false` everywhere, so **unknown
fields are rejected**.

> **Why strict?** This engine is a format *reference*: content authored against
> it must load in any consumer: for example
> [adaptive-learner](https://github.com/astrapi69/adaptive-learner), the
> reference consumer, whose schema is itself strict. Tolerating unknown fields
> here would let content pass the engine yet fail a strict consumer, the
> opposite of a reliable reference. Strict rejection keeps parity: if it
> validates here, it is shape-valid there.

If any structural error is found, validation stops and returns those errors
(the semantic layer assumes a well-formed shape).

## Layer 2: semantic (cross-field rules)

These rules cannot be expressed in JSON-Schema; they mirror the reference
consumer's (adaptive-learner) Pydantic `model_validator`s one-for-one:

| Rule | Message contains |
|---|---|
| Theory step requires `body`, no `exercise`; exercise step requires `exercise`, no `body` | `THEORY step ...` / `EXERCISE step ...` |
| `matching` requires non-empty `pairs` (unless `from_cards`) | `MATCHING exercise requires non-empty 'pairs'` |
| `matching` with `from_cards` requires non-empty `card_ids` and must not also list explicit `pairs` | `MATCHING with 'from_cards'` |
| `multiple_choice` requires >= 2 `options` with unique texts | `MULTIPLE_CHOICE requires at least 2 'options'` / `option texts must be unique` |
| `multiple_choice` (single) requires exactly one option marked `correct`; with `multiple` at least one | `exactly one option marked 'correct'` / `at least one option marked 'correct'` |
| `picture_choice` requires >= 2 images, exactly one `is_correct: "true"` | `exactly one image marked` |
| `free_text` requires non-empty `accept` | `FREE_TEXT exercise requires non-empty 'accept'` |
| `word_tiles` requires >= 2 `tiles`; each `accept_orderings` entry is a permutation | `permutation of [0..n-1]` |
| `cloze` (`type`/`select`) requires `sentence` + `blanks` with `markers == blanks.length`; `select` also needs `distractors` | `CLOZE marker count mismatch` |
| `cloze` (`multiselect`) requires `sentence`, non-empty `accept` + `distractors`, and the two must be **disjoint** | `must be disjoint` |
| Every `card_ids` entry must resolve to a card in the lesson | `references unknown card` |
| A `stable_id` is unique within the lesson (exercises and cards share one namespace) | `is used more than once in this lesson` |

### Set-wide stable_id uniqueness lives outside validateLesson

`validateLesson` sees ONE lesson, so it can only enforce that a `stable_id`
is unique inside that document. The set-wide half of the promise (schema v1.9,
engine#90) is exported as a helper the caller drives over the lessons of a set:

```ts
import { collectStableIds } from "learn-content-engine";

const report = collectStableIds(lessonsOfOneSet);
// report.total      -> how many stable_ids were checked (the checked quantity)
// report.duplicates -> [{ stableId, locations: [{ lessonId, kind, elementId }] }]
```

Version STABILITY (an id still pointing at the same element after an update)
is not checkable here at all: it needs the previous version. That is the
content repos' stability gate, which diffs the set against its last published
state. See the [scope and limit](lesson-format.md#stable-identity-stable_id)
of the stage.

## Layer 3: author lints (warnings)

Warnings never affect `valid` or appear in `errors`; they live in `warnings` and
flag likely authoring mistakes: an unused card (`W-CARD-UNUSED`), an ambiguous
`matching` (`W-MATCH-AMBIG`), duplicate word tiles without `accept_orderings`
(`W-TILES-DUP`), a distractor equal to the answer (`W-DISTRACTOR-ANSWER`), a
distractor image sharing the correct label (`W-PIC-DUP-LABEL`), an exercise or
blank hint that reveals the answer length (`W-HINT-LENGTH`), a cloze whose sentence is nothing
but its blanks and is therefore a `multiple_choice` or a `free_text`
(`W-CLOZE-NO-CARRIER`), a lesson `domain` outside the known vocabulary
(`W-DOMAIN-UNKNOWN`, the same lint `validateManifest` applies to a set), or a
prompt that repeats the
exercise's `sentence` or the step `title` verbatim, so the question is read
twice on screen (`W-PROMPT-DUP`). Full list + descriptions:
[rule catalog](lesson-format.md#rule-catalog).

Warnings are opt-in downstream, and that is easy to miss here. In this engine a
lint is effective the moment it merges: `validateLesson` returns it and the
author CLI prints it. In a consumer it is effective only if two things happen -
the pin moves to the release that carries it, and the wrapper that runs the
validation actually reads `warnings` instead of `errors` alone. A gate invoked
without its warnings switch reports nothing about any lint in the release it
pins, however old that lint is. See
[pinning and currency](architecture.md#pinning-and-currency).

## The rules without the structural layer (`learn-content-engine/rules`)

Layers 2 and 3 are also a package subpath of their own, for a consumer that
has already checked the shape of its input and must not carry the structural
layer, typically a browser app:

```ts
import { validateLessonRules, validateManifestRules, isSlugId } from "learn-content-engine/rules";

const { valid, errors, warnings } = validateLessonRules(lesson); // same result as validateLesson for a shape-valid lesson
```

- `validateLessonRules(lesson, { extensions })` and
  `validateManifestRules(manifest)` return exactly what `validateLesson` /
  `validateManifest` return for input that passes the structural layer: those
  two check the shape with ajv and then call these functions, so the two can
  never disagree. For input that does not have the schema's shape the result is
  unspecified; check the shape first.
- `validateLessonQuality(lesson)` and `QUALITY_MINIMUMS` are the
  [quality minimums](#quality-minimums), the same functions as on the package
  root.
- `isSlugId(value)` is the schema's `$defs/SlugId` (lowercase Unicode letters
  and digits in hyphen-separated runs, at most `SLUG_ID_MAX_LENGTH`
  characters), for a consumer that needs the slug rule without a schema
  validator. `SLUG_ID_PATTERN` is the pattern string itself.
- The entry imports neither ajv nor `node:*`; `src/rules.test.ts` keeps it that
  way. Measured with esbuild on 2026-09-25 (`dist/rules.js` bundled, minified,
  browser): 24.0 kB, 9.2 kB gzip. The quality minimums of engine#185 added
  1.1 kB to it (22.9 kB, 8.8 kB gzip before), the issue parameters of
  engine#201 1.2 kB (21.7 kB, 8.4 kB gzip before that), both measured the
  same way.
  `validateLesson` alone is about 145 kB (measured on 2026-09-24 from an entry
  importing only `validateLesson`), most of it ajv, and it reads the
  schema from the file system, which a browser does not have (engine#191).

Why it exists: a consumer that re-implements a rule instead of calling it ends
up with a copy that drifts (see
[rule ownership](architecture.md#rule-ownership-which-layer-owns-which-rule)).

## The error model

Each issue is `{ path, message, id, severity, docAnchor, params? }` (the shape
at the top of this page):

- `path` is a JSON-pointer-ish location, e.g. `/steps/2/exercise` or
  `/steps/2/exercise/card_ids/0`, or `/` for a root-level problem.
- `message` is a human-readable reason. For a rejected unknown field the
  offending key is named, e.g. `must NOT have additional properties (surprise)`.
- `params`, when present, holds the values the message names
  ([issue parameters](lesson-format.md#issue-parameters)).

## Typical failures

A cloze whose marker count does not match its blanks (invalid input):

```jsonc
// INVALID: sentence has 2 '___' markers but only 1 blank
{
  "type": "cloze", "cloze_mode": "type", "id": "c1", "prompt": "...",
  "sentence": "Je ___ ___ ici.",
  "blanks": [ { "accept": ["suis"] } ]
}
// -> /steps/0/exercise:
//    CLOZE marker count mismatch: sentence has 2 '___' markers but blanks has 1 entries
```

An exercise referencing a card that does not exist (invalid input):

```jsonc
// INVALID: no card with id "keopi" in the lesson's cards
{ "type": "word_tiles", "id": "w1", "prompt": "...",
  "card_ids": ["keopi"], "tiles": ["a", "b"] }
// -> /steps/0/exercise/card_ids/0:
//    exercise references unknown card 'keopi'
```

An unknown field (strict rejection):

```jsonc
// INVALID: "surprise" is not a known lesson field
{ "id": "x", "title": "t", "steps": [ ... ], "surprise": true }
// -> /: must NOT have additional properties (surprise)
```

## Manifests

`validateManifest` normalizes the legacy `language` alias to `target_language`
before structural checking (the pre-v1.2 alias, see
[concepts.md](concepts.md#the-legacy-language-alias)), then applies the strict
manifest schema. A set missing a required field (`id`, `title`,
`target_language`, `level`, `version`, `lesson_count`) is rejected; a set with
neither `language` nor `target_language` fails on the missing `target_language`.

Since 0.20.0 `validateManifest` also carries two author lints in `warnings`
(never blocking, like the lesson lints in Layer 3): `W-DOMAIN-UNKNOWN` for a
`domain` outside the known vocabulary (`KNOWN_CONTENT_DOMAINS`), and
`W-LEVEL-UNKNOWN` for a `level` that is neither a CEFR band (`A1`..`C2`,
case-insensitive) nor, for a non-language set, the explicit `none` sentinel.
The contract lives in
[content domains](lesson-format.md#content-domains).

Since 0.21.0 a manifest may declare `metadata.retired_ids` (deliberate
retirement, unlocked in engine#131). The validator checks what one manifest
can prove: `E-RETIRED-IDS-TYPE` rejects a list that is not made of strings,
and `W-RETIRED-IDS-DUP` flags duplicate entries (never blocks). Everything
that needs the lesson inventory - an undeclared disappearance, un-declaring
a published retirement, retired-yet-alive - lives in the stability gate
(`V1`/`V5`/`V6`, see
[stable identity](lesson-format.md#stable-identity-stable_id)).

## Quality minimums

Validity is not the only question a consumer asks before it publishes or
shares a lesson. `validateLessonQuality(lesson)` (engine#185) asks the second:
is the lesson substantial enough (enough exercises, of enough types, a theory
step, enough accepted answers and pairs)? The minimums follow from the lesson's
`purpose` (`practice` by default, `bridge`, `quiz`); the details are in
[quality minimums](lesson-format.md#quality-minimums).

```ts
import { validateLesson, validateLessonQuality } from "learn-content-engine";

if (validateLesson(lesson).valid) {
  const quality = validateLessonQuality(lesson); // { valid, errors: E-QUALITY-*, warnings: [] }
}
```

It is a separate call on purpose. `validateLesson` never reports the
minimums: a consumer that generates short lessons of its own (the reference
app's adaptive lessons have fewer than five exercises) must still accept them.
Each consumer gives a shortfall the weight of its gate: the content
repositories' gate blocks, the reference app blocks sharing. The function is
also on the `learn-content-engine/rules` entry.

The numbers live in
[`schema/quality-rules.json`](../schema/quality-rules.json)
(`minExercisesPerLesson`, `minExerciseTypes`, `minTheorySteps`,
`minFreeTextAccepts`, `minMatchingPairs`), exported as `QUALITY_MINIMUMS`.
Like the two schemas, the file's canonical home is this engine (since the
v0.6.0 authority flip); a consumer that needs the numbers reads them from the
pinned release (`import qualityRules from
"learn-content-engine/schema/quality-rules.json"`). A consumer that needs the
rule calls `validateLessonQuality` instead of applying the numbers itself:
three separate versions of that rule, with different exemptions and a different
count for `from_cards`, are why the function exists.

## Real-content conformance

`make conformance-real` runs the full pipeline (parse + validate) over both
public content repos on demand. It is not part of the mandatory CI: the CI
truth is the vendored fixtures and the doc examples, which run offline. See
[architecture.md](architecture.md#roadmap).
