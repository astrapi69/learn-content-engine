# Validation

`parse` is permissive; **`validate` is the explicit step that enforces the
format**. You choose when to run it:

```ts
import { validateLesson, validateManifest } from "learn-content-engine";

const result = validateLesson(JSON.parse(rawLessonJson));
// result: { valid, errors[], warnings[] }
// each issue: { path, message, id, severity: "error" | "warning", docAnchor }
if (!result.valid) console.error(result.errors);
if (result.warnings.length) console.warn(result.warnings);
```

Neither function throws; both return a `ValidationResult`. `valid` is
**errors-only** - warnings never block. Every issue carries a stable `id` and a
`docAnchor`; the complete list of ids is the
[rule catalog](lesson-format.md#rule-catalog). For an offline author workflow
that surfaces both errors and warnings, use the
[`learn-content-engine lint` CLI](lesson-format.md#linting).

Validation runs in two layers, mirroring the app's pipeline (field checks before
cross-field checks):

## Layer 1 - structural (ajv, strict)

The input is checked against the bundled JSON-Schema
([`schema/lesson.schema.json`](../schema/lesson.schema.json) /
[`schema/content-manifest.schema.json`](../schema/content-manifest.schema.json),
draft 2020-12) with [ajv](https://ajv.js.org/). This enforces required fields,
field types and lengths, enum values (`type`, `cloze_mode`, `direction`,
`media_type`, ...), and nested shapes (`Pair`, `PictureImage`, `ClozeBlank`).

The schema is **strict**: `additionalProperties: false` everywhere, so **unknown
fields are rejected**.

> **Why strict?** This engine is a format *reference*: content authored against
> it must load in any consumer, including the Adaptive Learner app, whose schema
> is itself strict. Tolerating unknown fields here would let content pass the
> engine yet fail the app - the opposite of a reliable reference. Strict
> rejection keeps parity: if it validates here, it is shape-valid there.

If any structural error is found, validation stops and returns those errors
(the semantic layer assumes a well-formed shape).

## Layer 2 - semantic (cross-field rules)

These rules cannot be expressed in JSON-Schema; they mirror the app's Pydantic
`model_validator`s one-for-one:

| Rule | Message contains |
|---|---|
| Theory step requires `body`, no `exercise`; exercise step requires `exercise`, no `body` | `THEORY step ...` / `EXERCISE step ...` |
| `matching` requires non-empty `pairs` | `MATCHING exercise requires non-empty 'pairs'` |
| `picture_choice` requires >= 2 images, exactly one `is_correct: "true"` | `exactly one image marked` |
| `free_text` requires non-empty `accept` | `FREE_TEXT exercise requires non-empty 'accept'` |
| `word_tiles` requires >= 2 `tiles`; each `accept_orderings` entry is a permutation | `permutation of [0..n-1]` |
| `cloze` (`type`/`select`) requires `sentence` + `blanks` with `markers == blanks.length`; `select` also needs `distractors` | `CLOZE marker count mismatch` |
| `cloze` (`multiselect`) requires `sentence`, non-empty `accept` + `distractors`, and the two must be **disjoint** | `must be disjoint` |
| Every `card_ids` entry must resolve to a card in the lesson | `references unknown card` |

## Layer 3 - author lints (warnings)

Warnings never affect `valid` or appear in `errors`; they live in `warnings` and
flag likely authoring mistakes: an unused card (`W-CARD-UNUSED`), an ambiguous
`matching` (`W-MATCH-AMBIG`), duplicate word tiles without `accept_orderings`
(`W-TILES-DUP`), a distractor equal to the answer (`W-DISTRACTOR-ANSWER`), a
distractor image sharing the correct label (`W-PIC-DUP-LABEL`), or a hint that
reveals the answer length (`W-HINT-LENGTH`). Full list + descriptions:
[rule catalog](lesson-format.md#rule-catalog).

## The error model

Each issue is `{ path, message }`:

- `path` is a JSON-pointer-ish location, e.g. `/steps/2/exercise` or
  `/steps/2/exercise/card_ids`, or `/` for a root-level problem.
- `message` is a human-readable reason. For a rejected unknown field the
  offending key is named, e.g. `must NOT have additional properties (surprise)`.

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
// -> /steps/0/exercise/card_ids:
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
before structural checking (parity with the app), then applies the strict
manifest schema. A set missing a required field (`id`, `title`,
`target_language`, `level`, `version`, `lesson_count`) is rejected; a set with
neither `language` nor `target_language` fails on the missing `target_language`.

## Quality minimums artifact

Besides the two JSON-Schemas the package ships
[`schema/quality-rules.json`](../schema/quality-rules.json) - the shared
quality minimums (`minExercisesPerLesson`, `minExerciseTypes`,
`minFreeTextAccepts`, `minMatchingPairs`, `minTheorySteps`) generated by the
app's `generate_lesson_schema.py`. The engine does **not** evaluate these
rules itself (there is no `validateQuality` API); the artifact exists so
content-repo validators can mirror the numbers from the pinned engine release
instead of owning a repo-local copy - the same app → engine → consumers
channel as the schemas. Consume it via
`import qualityRules from "learn-content-engine/schema/quality-rules.json"`
or read it from the installed package.

## Real-content conformance

`make conformance-real` runs the full pipeline (parse + validate) over both
public content repos on demand. It is not part of the mandatory CI - the CI
truth is the vendored fixtures and the doc examples, which run offline. See
[architecture.md](architecture.md#roadmap).
