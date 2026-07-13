# Extensions

Extension exercise types let a consumer add a NON-core exercise type in the
`ext:<vendor>-<name>` namespace (schema 1.7) **without** widening the core
`ExerciseType` enum. The core enum stays the single, portable authority; every
extension is opt-in and honestly declared, so core content keeps its guarantee
that "validates here => loads in any consumer".

## The portability contract

- **Core is guaranteed.** A lesson using only core exercise types
  (`matching`, `picture_choice`, `free_text`, `word_tiles`, `cloze`,
  `multiple_choice`) validates and parses exactly as before - the registry is
  irrelevant to it.
- **Extensions are opt-in and declared.** A lesson that uses an `ext:` type MUST
  list it in the top-level `requires_extensions` array, each entry pinned to a
  major (`ext:<vendor>-<name>@<major>`).
- **Missing extensions are refused loudly.** A consumer that has not registered
  a declared extension refuses the lesson with `E-EXT-UNSUPPORTED` instead of
  silently mis-rendering it. This is what keeps portability honest: content that
  needs an extension either runs on a consumer that has it, or is rejected
  clearly everywhere else.

## Shape

An extension exercise carries the `ext:` type and an opaque `ext_payload` the
core engine never interprets:

```json
{
  "id": "l1",
  "title": "Ordering lesson",
  "requires_extensions": ["ext:acme-ordering@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:acme-ordering",
        "prompt": "Put the steps in order",
        "ext_payload": { "items": ["First", "Second", "Third"] }
      }
    }
  ]
}
```

The schema validates the namespace pattern, the declaration pattern, and that
`ext_payload` is an object; everything inside `ext_payload` is validated by the
registered extension, not the core schema.

## Registering an extension

Both `validateLesson` and `parseLesson` take an optional `{ extensions }`
registry. Without it, behaviour is identical to core-only:

```ts
import { validateLesson, parseLesson, type ExerciseExtension } from "learn-content-engine";

const acmeOrdering: ExerciseExtension = {
  type: "ext:acme-ordering",
  major: 1,
  validate(exercise) {
    const items = (exercise.ext_payload as { items?: unknown }).items;
    return Array.isArray(items) && items.length >= 2
      ? []
      : [{ path: "/ext_payload", message: "needs >= 2 items", id: "E-EXT-ACME-ITEMS", severity: "error", docAnchor: "..." }];
  },
};

validateLesson(lesson, { extensions: [acmeOrdering] });   // runs the extension validator
parseLesson(raw, context, undefined, { extensions: [acmeOrdering] }); // applies any resolve() hook
```

The `ExerciseExtension` interface (exported from the package) is the engine
half; the consumer half (renderer / grader) lives in the consumer and is
registered there. Shipping the two together is what makes "validated =>
renderable" hold. adaptive-learner is one such consumer, but nothing in the
contract is app-specific.

## Errors

| Rule | When |
|---|---|
| `E-EXT-UNDECLARED` | An exercise uses an `ext:` type the lesson does not list in `requires_extensions`. |
| `E-EXT-UNSUPPORTED` | A declared extension (at its pinned major) is not in the registry - a major mismatch counts. The consumer cannot render the lesson. |

An extension's own `validate` may return any additional issues (its own ids).

## Reference extension: `ext:ref-ordering`

`src/examples/ext-ref-ordering/` is a deliberately trivial worked example -
"put these items in the correct order" - that proves the seam end-to-end. It
ships both halves in one folder: the engine-half `refOrderingExtension` (an
`ExerciseExtension` validating `ext_payload.items`) and the consumer-half
`renderRefOrdering` (a minimal renderer). It is excluded from the published
build; a real extension would ship as its own package importing the engine's
`ExerciseExtension` type.

## Example extension: `ext:ref-categorization`

`src/examples/ext-ref-categorization/` works out the first adoption candidate
from the external review (tracked as adaptive-learner#1579): "sort these items
into their buckets". The payload carries the buckets with their correct items;
the consumer shuffles the combined pool and grades an item-to-bucket
assignment.

Payload rules (engine half `refCategorizationExtension`):

| Id | Rule |
|---|---|
| `E-EXT-REFCATEG-SHAPE` | `ext_payload.categories` must be an array of `{name, items[]}`. |
| `E-EXT-REFCATEG-MIN` | At least 2 categories (one bucket is no categorization). |
| `E-EXT-REFCATEG-ITEMS` | Every category carries at least 1 item. |
| `E-EXT-REFCATEG-EMPTY` | Items are non-empty strings. |
| `E-EXT-REFCATEG-DUPNAME` | Category names are unique. |
| `E-EXT-REFCATEG-DUPITEM` | An item appears in exactly one category (a duplicate makes grading ambiguous). |

A reference lesson on an existing topic (dog training), validated by the doc
gate:

```json
{
  "id": "hunde-signale-einordnen",
  "title": "Hundetraining: Signale einordnen",
  "requires_extensions": ["ext:ref-categorization@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-categorization",
        "prompt": "Ordne jedes Signal der richtigen Kategorie zu",
        "ext_payload": {
          "categories": [
            {
              "name": "Sichtzeichen",
              "items": ["flache Hand senken", "Zeigefinger hoch", "Handflaeche zeigen"]
            },
            {
              "name": "Hoerzeichen",
              "items": ["Sitz", "Platz", "Hier"]
            },
            {
              "name": "Koerpersprache",
              "items": ["sich abwenden", "in die Hocke gehen"]
            }
          ]
        }
      }
    }
  ]
}
```

The consumer half (`renderRefCategorization` + `gradeRefCategorization`)
renders the bucket names over the item pool and grades a learner assignment
(item -> bucket name): every authored item must land in its authored bucket.

## Example extension: `ext:ref-error-correction`

`src/examples/ext-ref-error-correction/` works out the second adoption
candidate from the external review (adaptive-learner#1579): "one token in this
sentence is wrong - mark it and correct it". The payload carries the tokenized
sentence, the wrong token's index, and the accepted corrections as an
`accept` ARRAY - mirroring the core `free_text` contract, because real
sentences often allow more than one defensible fix for the same wrong token
and a single authored string would reproduce the too-narrow-accept-list class
of false negatives (adaptive-learner#1580). `accept[0]` is the canonical
correction a consumer surfaces after a wrong attempt.

Payload rules (engine half `refErrorCorrectionExtension`):

| Id | Rule |
|---|---|
| `E-EXT-REFERRCORR-SHAPE` | `ext_payload` must carry `tokens` (string array), `error_index` (number), `accept` (string array). |
| `E-EXT-REFERRCORR-TOKENS` | At least 2 tokens. |
| `E-EXT-REFERRCORR-EMPTY` | Tokens are non-empty strings. |
| `E-EXT-REFERRCORR-INDEX` | `error_index` is an integer inside the token range. |
| `E-EXT-REFERRCORR-CORRECTION` | `accept` carries at least 1 non-empty correction; `accept[0]` is canonical. |
| `E-EXT-REFERRCORR-NOOP` | No `accept` entry equals the marked token (otherwise there is no error). |

A reference lesson on the same topic, validated by the doc gate:

```json
{
  "id": "hunde-grammatik-fehlerkorrektur",
  "title": "Hundetraining: Finde den Fehler im Satz",
  "requires_extensions": ["ext:ref-error-correction@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-error-correction",
        "prompt": "Ein Wort ist falsch - tippe es an und korrigiere es",
        "ext_payload": {
          "tokens": ["Der", "Hund", "folgt", "das", "Kommando"],
          "error_index": 3,
          "accept": ["dem", "einem"]
        }
      }
    },
    {
      "id": "s2",
      "type": "exercise",
      "exercise": {
        "id": "e2",
        "type": "ext:ref-error-correction",
        "prompt": "Ein Wort ist falsch - tippe es an und korrigiere es",
        "ext_payload": {
          "tokens": ["Die", "Leine", "haengt", "locker", "durch", "wenn", "der", "Hund", "brav", "lauft"],
          "error_index": 9,
          "accept": ["laeuft"]
        }
      }
    }
  ]
}
```

The consumer half (`renderRefErrorCorrection` + `gradeRefErrorCorrection` +
`canonicalCorrection`) renders a numbered token row and grades the tapped
index plus the typed correction against EVERY `accept` entry (trim +
case-fold; a production consumer would reuse its free-text matcher for typo
tolerance) and surfaces `accept[0]` after a wrong attempt.

## Example extension: `ext:ref-reading-comprehension`

`src/examples/ext-ref-reading-comprehension/` works out the shared-passage
case (engine#43): a passage (stimulus) bound to N sub-questions. This is the
one shape the flat core schema cannot express - `LessonStep.exercise` is
singular, there is no passage-with-questions grouping - so instead of a
core-schema change it is modelled as a SINGLE ext exercise whose `ext_payload`
carries the passage plus the questions. Sub-questions reuse the core question
shapes (`multiple_choice` / `free_text`); a consumer renders each with its
existing renderer. The payload is deliberately a first cut: the `@major` pin
lets it evolve (more sub-question types, scoring variants) without migrating
core content - exactly why the shared-passage case is an extension, not a core
type.

Payload rules (engine half `refReadingComprehensionExtension`):

| Id | Rule |
|---|---|
| `E-EXT-REFRC-SHAPE` | `ext_payload` must carry `passage` (string) and `questions` (`[{prompt, type, options?/accept?}]`). |
| `E-EXT-REFRC-PASSAGE` | `passage` is non-empty. |
| `E-EXT-REFRC-QUESTIONS` | At least 1 question. |
| `E-EXT-REFRC-PROMPT` | Every question has a non-empty prompt. |
| `E-EXT-REFRC-QTYPE` | Every question type is `multiple_choice` or `free_text`. |
| `E-EXT-REFRC-MC` | A `multiple_choice` question has at least 2 options and at least 1 correct. |
| `E-EXT-REFRC-FT` | A `free_text` question has a non-empty `accept` list. |

A reference lesson on an existing topic (dog training), validated by the doc
gate:

```json
{
  "id": "hunde-textverstaendnis",
  "title": "Hundetraining: Text verstehen",
  "requires_extensions": ["ext:ref-reading-comprehension@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-reading-comprehension",
        "prompt": "Lies den Text und beantworte die Fragen.",
        "ext_payload": {
          "passage": "Rex lief in den Garten und bellte den Briefträger an. Danach kam er brav zurück, als sein Halter 'Hier' rief.",
          "questions": [
            {
              "prompt": "Wohin lief Rex?",
              "type": "multiple_choice",
              "options": [
                { "text": "In den Garten", "correct": true },
                { "text": "Auf die Straße" },
                { "text": "Ins Haus" }
              ]
            },
            {
              "prompt": "Auf welches Hoerzeichen kam Rex zurueck?",
              "type": "free_text",
              "accept": ["Hier", "hier"]
            }
          ]
        }
      }
    }
  ]
}
```

The consumer half (`renderRefReadingComprehension` +
`gradeRefReadingComprehension`) renders the passage over the numbered
questions and grades per question (multiple_choice by exact option, free_text
tolerantly).

## Example extension: `ext:ref-graded-quiz`

`src/examples/ext-ref-graded-quiz/` works out the school-test case (engine#46):
a self-contained scored question set. Each question carries `points`,
multi-select questions may award `partial_credit` (proportional), and an
optional `pass_threshold` (percent) decides pass/fail. Questions reuse the core
`multiple_choice` / `free_text` shapes.

This demonstrates that the points / partial-credit / pass-threshold concern
fits the extension tier WITHOUT a core-schema change - "points on an exercise"
is a cross-cutting concern, not an interaction type, so it is a bounded
graded-quiz payload rather than a core `points` field on every exercise (which
would be a full core ripple). The payload carries only the grading METADATA;
the grading POLICY (how partial credit is computed, how pass/fail is decided)
lives in the consumer half.

Payload rules (engine half `refGradedQuizExtension`):

| Id | Rule |
|---|---|
| `E-EXT-REFGQ-SHAPE` | `ext_payload` must carry `questions` (`[{prompt, type, points, options?/accept?, partial_credit?}]`) and an optional numeric `pass_threshold`. |
| `E-EXT-REFGQ-QUESTIONS` | At least 1 question. |
| `E-EXT-REFGQ-PROMPT` | Every question has a non-empty prompt. |
| `E-EXT-REFGQ-QTYPE` | Every question type is `multiple_choice` or `free_text`. |
| `E-EXT-REFGQ-MC` | A `multiple_choice` question has at least 2 options and at least 1 correct. |
| `E-EXT-REFGQ-FT` | A `free_text` question has a non-empty `accept` list. |
| `E-EXT-REFGQ-POINTS` | Every question has positive `points`. |
| `E-EXT-REFGQ-THRESHOLD` | `pass_threshold`, when present, is a percentage in 0..100. |

A reference lesson (a short graded quiz), validated by the doc gate:

```json
{
  "id": "hunde-quiz-benotet",
  "title": "Hundetraining: benoteter Test",
  "requires_extensions": ["ext:ref-graded-quiz@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-graded-quiz",
        "prompt": "Beantworte alle Fragen. Bestanden ab 60%.",
        "ext_payload": {
          "pass_threshold": 60,
          "questions": [
            {
              "prompt": "Welches Hoerzeichen ruft den Hund zurueck?",
              "type": "multiple_choice",
              "options": [
                { "text": "Hier", "correct": true },
                { "text": "Sitz" },
                { "text": "Platz" }
              ],
              "points": 2
            },
            {
              "prompt": "Wie heisst das Sichtzeichen fuer 'Platz'?",
              "type": "free_text",
              "accept": ["flache Hand senken", "flache Hand"],
              "points": 3
            },
            {
              "prompt": "Welche gehoeren zu den Grundkommandos?",
              "type": "multiple_choice",
              "options": [
                { "text": "Sitz", "correct": true },
                { "text": "Platz", "correct": true },
                { "text": "Rolle" }
              ],
              "points": 4,
              "partial_credit": true
            }
          ]
        }
      }
    }
  ]
}
```

The consumer half (`renderRefGradedQuiz` + `gradeRefGradedQuiz`) renders the
questions with their point values and the pass threshold, and grades per
question: exact-set `multiple_choice`, proportional `partial_credit`
(`max(0, correct - wrong) / total_correct`), tolerant `free_text`, then decides
pass/fail against the threshold.

The example extensions exist as a DECISION BASIS for adoption - nothing in the
app or the content repos references them until that decision is made
(adaptive-learner#1579 tracked the exercise-type adoptions; engine#46 tracks
the school-test direction). A production adoption would pick its own vendor
namespace (the `ref` vendor marks engine-repo demonstrations).

## What extensions do NOT change

The core schema, the core `ExerciseType` enum, and the schema-authority process
for core types are unchanged. Extensions are a separate, versioned, opt-in tier
that sits AROUND the portable core - they never bypass the core enum, the strict
`additionalProperties: false` on core fields, or the RED-first process for a new
CORE type. Core content authored before 1.7 validates and parses byte-identically.
