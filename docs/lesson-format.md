# Lesson format reference

This is the complete, self-contained reference for the content format
`learn-content-engine` parses and validates. You do **not** need the Adaptive
Learner app to author or validate a lesson: everything the format allows is
described here, and every `json` example below is extracted by a test and run
through `validateLesson` / `validateManifest`, so no example can drift from the
engine.

The canonical schema ships in the package at
[`schema/lesson.schema.json`](../schema/lesson.schema.json) (lessons) and
[`schema/content-manifest.schema.json`](../schema/content-manifest.schema.json)
(manifests). The schema is **strict**: unknown fields are rejected. See
[validation.md](validation.md) for the rules and error model.

- [A lesson at a glance](#a-lesson-at-a-glance)
- [Lesson meta fields](#lesson-meta-fields)
- [Cards](#cards)
- [Steps](#steps)
  - [Theory steps](#theory-steps)
  - [Inline examples and example links](#inline-examples-and-example-links)
- [Exercises](#exercises)
  - [matching](#matching)
  - [picture_choice](#picture_choice)
  - [free_text](#free_text)
  - [word_tiles](#word_tiles)
  - [cloze](#cloze) (`type`, `select`, `multiselect`)
  - [multiple_choice](#multiple_choice)
  - [direction](#direction)
- [Manifest format](#manifest-format)

## A lesson at a glance

A lesson is a single JSON object: some meta fields, an optional list of `cards`
(the facts it teaches), and an ordered list of `steps` (theory to read and
exercises to do). This example is a complete, valid lesson that shows most of
the shape at once:

```json
{
  "id": "01-greetings",
  "title": "Greetings",
  "description": "Say hello in French.",
  "target_language": "fr",
  "source_language": "en",
  "domain": "language",
  "estimated_minutes": 8,
  "cards": [
    { "id": "bonjour", "front": "bonjour", "back": "hello", "tags": ["greeting"] }
  ],
  "steps": [
    {
      "id": "intro",
      "type": "theory",
      "title": "Saying hello",
      "body": "**Bonjour** is the standard daytime greeting.",
      "example_url": "https://example.com/bonjour",
      "example_label": "Watch a clip",
      "examples": [
        { "title": "In a sentence", "content": "Bonjour, comment ca va ?" },
        { "title": "As code", "language": "python", "content": "print('bonjour')" }
      ]
    },
    {
      "id": "drill",
      "type": "exercise",
      "exercise": {
        "id": "drill-1",
        "type": "free_text",
        "prompt": "How do you greet someone during the day?",
        "direction": "source_to_target",
        "card_ids": ["bonjour"],
        "accept": ["bonjour", "Bonjour"]
      }
    }
  ]
}
```

The required lesson fields are `id`, `title`, and a non-empty `steps` array.
Everything else is optional.

## Lesson meta fields

| Field | Type | Notes |
|---|---|---|
| `id` | string, required | Slug-safe, unique within the set. Convention `NN-slug` (e.g. `01-greetings`). |
| `title` | string, required | Human-readable lesson title. |
| `steps` | array, required | Ordered theory + exercise steps; at least one. |
| `cards` | array | The facts the lesson teaches (see [Cards](#cards)). |
| `description` | string \| null | One or two sentence summary. |
| `target_language` | string \| null | BCP-47 code of the language taught. Usually inherited from the set; a standalone export may carry its own. |
| `source_language` | string \| null | BCP-47 code of the language the learner already speaks. |
| `domain` | string \| null | Content domain (`language`, `psychology`, `programming`, ...). Inherited from the set when absent. |
| `estimated_minutes` | integer | 1-240, default 10. |
| `resources` | array \| null | Optional supplementary media ({`type`, `title`, `url`, ...}). |
| `contributed_by`, `contributed_at` | string \| null | Optional author credit. |
| `variation_of`, `variation_note` | string \| null | Marks a lesson as a variation of another. |

`target_language` / `source_language` / `domain` are normally supplied by the
parent set and injected during parsing; a lesson that declares its own keeps
them. See [concepts.md](concepts.md#context-inheritance-vs-standalone).

## Cards

A card is the smallest learnable unit: one term / concept / fact. Exercises
reference cards by `id` (see `card_ids`), and every referenced id must exist in
the lesson's `cards` (referential integrity is enforced).

| Field | Type | Notes |
|---|---|---|
| `id` | string, required | Slug-safe, unique within the lesson. |
| `front` | string, required | What the learner sees first (usually the target term). |
| `back` | string, required | What they recall (translation / definition). |
| `tags` | string[] | Slug-safe tags for filtering. |
| `hint`, `notes` | string \| null | Optional help / footnote. |
| `difficulty` | 1-5 \| null | Optional difficulty. |
| `media_type` | `text` \| `code` \| `formula` \| `diagram` \| null | Content kind; drives code-aware rendering. |
| `code_snippet`, `code_language`, `expected_output` | string \| null | For code cards. |
| `image`, `audio` | string \| null | Relative paths inside the set's `assets/`. |
| `token_roles` | array \| null | Optional `{token, role}` grammatical annotations. |

## Steps

A step is either a **theory** step (`type: "theory"`) or an **exercise** step
(`type: "exercise"`). The rules are strict:

- A theory step **requires** a non-empty `body` and must **not** carry an
  `exercise`.
- An exercise step **requires** an `exercise` payload and must **not** carry a
  `body`.

Common step fields: `id` (required, slug-safe), `type` (required), `title`.

### Theory steps

A theory step carries Markdown in `body`. It may additionally link out to an
external illustration (`example_url` + optional `example_label`) and/or carry
inline worked examples (`examples`). The two are complementary and may coexist,
as the [glance example](#a-lesson-at-a-glance) shows.

### Inline examples and example links

`examples` is an array of `InlineExample` objects (schema v1.5, additive):

| Field | Type | Notes |
|---|---|---|
| `content` | string, required | The example text, or source code when `language` is set. |
| `language` | string \| null | Highlighter hint (`python`, `sql`, ...). When set, `content` is rendered as a code block; when absent, as plain text. |
| `title` | string \| null | Optional short heading. |

`example_url` (schema v1.4) links **out** to an external article/video;
`examples` carries the example content **inline**. A theory step can use either,
both, or neither. Both are shown together in the glance example above.

## Exercises

An exercise lives inside an exercise step. Every exercise requires `id`, `type`,
and `prompt`. `type` is one of `matching`, `picture_choice`, `free_text`,
`word_tiles`, `cloze`. Each type reads a specific set of fields; the wrong-field-
for-type combinations are rejected (see [validation.md](validation.md)).

Common optional exercise fields: `card_ids` (the cards drilled; each must exist),
`distractors`, `hint`, `direction`, `examples`.

### matching

Match left items to right items. Requires a non-empty `pairs` list of
`{left, right}`.

```json
{
  "id": "match-colors",
  "title": "Match colors",
  "cards": [
    { "id": "rouge", "front": "rouge", "back": "red" },
    { "id": "bleu", "front": "bleu", "back": "blue" }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "m1",
        "type": "matching",
        "prompt": "Match each color to its translation.",
        "card_ids": ["rouge", "bleu"],
        "pairs": [
          { "left": "rouge", "right": "red" },
          { "left": "bleu", "right": "blue" }
        ]
      }
    }
  ]
}
```

**`from_cards`.** To avoid repeating a definition that already lives in the
cards, set `"from_cards": true` and omit `pairs`: the engine builds the pairs
from the referenced cards (left = `front`, right = `back`) at parse time. It
requires non-empty `card_ids` and forbids an explicit `pairs` list.

```json
{
  "id": "match-colors-from-cards",
  "title": "Match colors (from cards)",
  "cards": [
    { "id": "rouge", "front": "rouge", "back": "red" },
    { "id": "bleu", "front": "bleu", "back": "blue" }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "m1",
        "type": "matching",
        "prompt": "Match each color to its translation.",
        "card_ids": ["rouge", "bleu"],
        "from_cards": true
      }
    }
  ]
}
```

### picture_choice

Pick the correct image. Requires at least two `images` (`{src, label,
is_correct?}`), exactly one marked `"is_correct": "true"`. `src` is a relative
path inside the set's `assets/`. Do **not** use this for text-only multiple
choice - use `cloze` `select` mode for that.

```json
{
  "id": "pick-cat",
  "title": "Pick the cat",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "p1",
        "type": "picture_choice",
        "prompt": "Which picture shows a cat?",
        "images": [
          { "src": "assets/img/cat.png", "label": "A cat", "is_correct": "true" },
          { "src": "assets/img/dog.png", "label": "A dog" }
        ]
      }
    }
  ]
}
```

### free_text

Type a short answer. Requires a non-empty `accept` list; the first entry is the
canonical answer, the rest are accepted variants (matching is exact, then
Levenshtein-tolerant).

```json
{
  "id": "greeting-drill",
  "title": "Greeting drill",
  "cards": [
    { "id": "bonjour", "front": "bonjour", "back": "hello" }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "f1",
        "type": "free_text",
        "prompt": "How do you say 'hello' in French?",
        "card_ids": ["bonjour"],
        "accept": ["bonjour", "Bonjour"]
      }
    }
  ]
}
```

### word_tiles

Arrange shuffled tiles into the correct order. Requires at least two `tiles`.
`accept_orderings` is optional; each entry must be a permutation of the tile
indices `[0..n-1]`. Reserve this for sentences with a genuinely unique word
order.

```json
{
  "id": "order-sentence",
  "title": "Build a sentence",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "w1",
        "type": "word_tiles",
        "prompt": "Put the words in order to say 'I am here'.",
        "tiles": ["je", "suis", "ici"],
        "accept_orderings": [[0, 1, 2]]
      }
    }
  ]
}
```

### cloze

Cloze has three modes, selected by `cloze_mode` (defaults to `type`).

**`type`** - one `<input>` per blank. Requires a `sentence` with visible `___`
markers and a `blanks` array. The **blanks rule**: the number of `___` markers
in `sentence` must equal `blanks.length` (each blank's `accept` list carries its
answers).

```json
{
  "id": "cloze-verbs",
  "title": "Fill in the verb",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "c1",
        "type": "cloze",
        "cloze_mode": "type",
        "prompt": "Complete the sentence.",
        "sentence": "Je ___ etudiant et je ___ ici.",
        "blanks": [
          { "accept": ["suis"] },
          { "accept": ["reste"], "hint": "to stay" }
        ]
      }
    }
  ]
}
```

**`select`** - the single-multiple-choice vehicle: a `<select>` per blank drawn
from `distractors`. Requires `sentence` + `blanks` (same marker rule) **and** a
non-empty `distractors` pool. `accept[0]` of the blank is the correct option.

```json
{
  "id": "cloze-capital",
  "title": "Capital city",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "c1",
        "type": "cloze",
        "cloze_mode": "select",
        "prompt": "Choose the correct completion.",
        "sentence": "Paris is the capital of ___.",
        "blanks": [ { "accept": ["France"] } ],
        "distractors": ["Germany", "Spain"]
      }
    }
  ]
}
```

**`multiselect`** - "select all that apply". Here `sentence` is the question
stem (no `___` markers, no `blanks`); `accept` lists **every** correct option
and `distractors` the wrong ones. The two lists must be non-empty and
**disjoint**.

```json
{
  "id": "cloze-primes",
  "title": "Select all primes",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "c1",
        "type": "cloze",
        "cloze_mode": "multiselect",
        "prompt": "Select all that apply.",
        "sentence": "Which of these are prime numbers?",
        "accept": ["2", "3", "5"],
        "distractors": ["4", "6"]
      }
    }
  ]
}
```

### multiple_choice

First-class text multiple choice (schema v1.6). Requires at least two `options`
(`{text, correct?}`); option texts must be unique (the text IS the option).
`multiple` selects the mode:

**`multiple: false`** (default) - single choice: exactly **one** option carries
`"correct": true`, the learner picks one.

```json
{
  "id": "right-of-way",
  "title": "Vorfahrt",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "mc1",
        "type": "multiple_choice",
        "prompt": "Wer hat an einer Kreuzung ohne Zeichen Vorfahrt?",
        "options": [
          { "text": "Wer von rechts kommt", "correct": true },
          { "text": "Wer von links kommt" },
          { "text": "Das groessere Fahrzeug" }
        ]
      }
    }
  ]
}
```

**`multiple: true`** - "select all that apply": **at least one** option is
correct; the learner must select the exact set of correct options (graded by
exact-set match, no partial credit - the same contract as `cloze` `multiselect`).

```json
{
  "id": "primes",
  "title": "Primzahlen",
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "mc1",
        "type": "multiple_choice",
        "multiple": true,
        "prompt": "Welche dieser Zahlen sind Primzahlen?",
        "options": [
          { "text": "2", "correct": true },
          { "text": "3", "correct": true },
          { "text": "4" },
          { "text": "5", "correct": true }
        ]
      }
    }
  ]
}
```

Correctness is a per-option flag, so there are no separate accept/distractor
lists and no disjointness rule - the structure makes that authoring error
impossible. `multiple_choice` **coexists** with the [`cloze`](#cloze)
`select`/`multiselect` forms; existing cloze-based multiple choice stays valid.

### direction

Any exercise may set `direction` to control which way a card is drilled:
`target_to_source` (default, receptive), `source_to_target` (productive),
`both`, or `random`. It is additive and optional; cloze ignores it. See the
`free_text` drill in the [glance example](#a-lesson-at-a-glance).

## Manifest format

A content repo publishes a root `manifest.yaml` (or JSON) that lists its sets.
The engine parses it and projects each set into a canonical entry. Required
top-level field: `name`. Each set requires `id`, `title`, `target_language`
(the pre-v1.2 `language` alias is accepted), `level`, `version`, `lesson_count`.

```json
{
  "schema_version": "1.5",
  "name": "My French Content",
  "description": "A small repo of French lessons.",
  "sets": [
    {
      "id": "fr-a1",
      "title": "French A1",
      "title_native": "Francais A1",
      "target_language": "fr",
      "source_language": "en",
      "domain": "language",
      "level": "A1",
      "version": "1.0.0",
      "lesson_count": 15,
      "path": "sets/en/fr-a1",
      "tags": ["french", "a1"],
      "book": {
        "title": "Assimil French",
        "author": "Anthony Bulger"
      }
    }
  ]
}
```

The set's `path` is the repo-relative directory holding its `lessons/` folder;
it defaults to `sets/{id}` when omitted. See
[concepts.md](concepts.md) for how set context flows into each lesson.

## Rule catalog

`validateLesson` returns `{ valid, errors, warnings }`. **Errors** block (`valid`
is false); **warnings** never block - they flag likely authoring mistakes. Every
issue carries a stable `id`, a `severity`, and a `docAnchor`. IDs are stable API:
a downstream (e.g. a content-repo) validator can mirror a rule by its id without
drifting.

### Errors (block)

| ID | Rule |
|---|---|
| `E-SCHEMA` | Structural schema violation (missing required field, wrong type, bad enum value). |
| `E-UNKNOWN-FIELD` | An unknown field is present (the schema is strict, `additionalProperties: false`). |
| `E-STEP-THEORY-BODY` | A [theory step](#steps) has no `body`. |
| `E-STEP-THEORY-EXERCISE` | A theory step also carries an `exercise`. |
| `E-STEP-EXERCISE-PAYLOAD` | An exercise step has no `exercise` payload. |
| `E-STEP-EXERCISE-BODY` | An exercise step also carries a `body`. |
| `E-MATCH-PAIRS` | [`matching`](#matching) has empty/missing `pairs`. |
| `E-MATCH-FROMCARDS-CARDS` | `matching` with `from_cards` has empty/missing `card_ids`. |
| `E-MATCH-FROMCARDS-PAIRS` | `matching` with `from_cards` also lists explicit `pairs`. |
| `E-PIC-MIN` | [`picture_choice`](#picture_choice) has fewer than 2 `images`. |
| `E-PIC-ONE-CORRECT` | `picture_choice` does not have exactly one `is_correct: "true"`. |
| `E-FREETEXT-ACCEPT` | [`free_text`](#free_text) has empty/missing `accept`. |
| `E-TILES-MIN` | [`word_tiles`](#word_tiles) has fewer than 2 `tiles`. |
| `E-TILES-ORDERING` | An `accept_orderings` entry is not a permutation of the tile indices. |
| `E-CLOZE-SENTENCE` | [`cloze`](#cloze) (`type`/`select`) has no `sentence`. |
| `E-CLOZE-BLANKS` | `cloze` (`type`/`select`) has no `blanks`. |
| `E-CLOZE-MARKERS` | `cloze` `___` marker count does not equal `blanks.length`. |
| `E-CLOZE-SELECT-DISTRACTORS` | `cloze` `select` has no `distractors`. |
| `E-CLOZE-MS-SENTENCE` | `cloze` `multiselect` has no `sentence` (question stem). |
| `E-CLOZE-MS-ACCEPT` | `cloze` `multiselect` has empty `accept`. |
| `E-CLOZE-MS-DISTRACTORS` | `cloze` `multiselect` has empty `distractors`. |
| `E-CLOZE-MS-DISJOINT` | `cloze` `multiselect` `accept` and `distractors` overlap. |
| `E-MC-OPTIONS` | [`multiple_choice`](#multiple_choice) has fewer than 2 `options`. |
| `E-MC-ONE-CORRECT` | `multiple_choice` (single) does not have exactly one option marked `correct`. |
| `E-MC-MIN-CORRECT` | `multiple_choice` with `multiple` has no option marked `correct`. |
| `E-MC-DUP-OPTION` | `multiple_choice` option texts are not unique. |
| `E-CARD-REF` | An exercise `card_ids` entry does not resolve to a [card](#cards). |

### Warnings (advise, never block)

| ID | Rule |
|---|---|
| `W-CARD-UNUSED` | A card is defined but no exercise ever drills it (dead material). |
| `W-MATCH-AMBIG` | A `matching` has duplicate `left` or `right` values (ambiguous pairing). |
| `W-TILES-DUP` | A `word_tiles` has duplicate tiles but no `accept_orderings` (swapping identical tiles yields the same sentence yet may grade as wrong). |
| `W-DISTRACTOR-ANSWER` | A `cloze` `select` distractor equals an accepted answer. |
| `W-PIC-DUP-LABEL` | A `picture_choice` distractor shares its `label` with the correct image. |
| `W-HINT-LENGTH` | A hint reveals the answer length (e.g. "four letters") - redundant with the app's automatic length display. |

## Linting

The package ships a CLI so you get these errors **and** warnings offline, in
seconds, without a CI round-trip:

```bash
npx learn-content-engine lint sets/en/fr-a1/lessons/*.json
# ERROR sets/.../03.json
#   [E-CARD-REF] /steps/2/exercise/card_ids exercise references unknown card 'keopi'  (see docs/lesson-format.md#cards)
# WARN  sets/.../05.json
#   [W-TILES-DUP] /steps/1/exercise WORD_TILES has duplicate tiles ...  (see docs/lesson-format.md#word_tiles)
# OK    sets/.../01.json
```

Exit code is 1 when any file has errors (warnings alone exit 0). Add `--json`
for machine-readable output (editor integration).

## Editor setup

Bind the bundled schema in your editor for autocomplete and inline errors while
typing. **Do not** add a `"$schema"` key inside a lesson file - the schema is
strict (`additionalProperties: false`) and would reject it. Instead map it
externally. In VS Code (`.vscode/settings.json`):

```jsonc
{
  "json.schemas": [
    {
      "fileMatch": ["**/lessons/*.json"],
      "url": "./node_modules/learn-content-engine/schema/lesson.schema.json"
    },
    {
      "fileMatch": ["**/manifest.json"],
      "url": "./node_modules/learn-content-engine/schema/content-manifest.schema.json"
    }
  ]
}
```

This gives field/enum completion and catches structural mistakes (typos in
`type`, missing required fields) as you type. The semantic rules and warnings
above are not expressible in JSON-Schema - run `learn-content-engine lint` for
those.
