# Authoring patterns with existing types

Many exercise "types" you might reach for from other learning apps do not need
a new engine type: they are shapes you can author today with the six core
types (`matching`, `picture_choice`, `free_text`, `word_tiles`, `cloze`,
`multiple_choice`). This page collects the common recipes. Every JSON block
below is validated by the doc-example gate (`src/docs-examples.test.ts`), so
the recipes cannot drift from the engine.

Reach for a new core type (a schema change) or an extension (`ext:` tier, see
[extensions.md](extensions.md)) only when a shape genuinely cannot be
expressed below: the clearest current example is a shared reading passage
bound to several sub-questions, which the flat "one step = one exercise" model
cannot represent.

## True / false -> `multiple_choice` with two options

A true/false question is a two-option `multiple_choice`. Exactly one option is
marked `correct`; the renderer grades by exact-set match.

```json
{
  "id": "pattern-true-false",
  "title": "True/false as multiple_choice",
  "cards": [
    { "id": "der-hund", "front": "der Hund", "back": "the dog (masculine)", "tags": ["article"] }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "tf-1",
        "type": "multiple_choice",
        "prompt": "Richtig oder falsch? 'Hund' ist maskulin: der Hund.",
        "card_ids": ["der-hund"],
        "options": [
          { "text": "Richtig", "correct": true },
          { "text": "Falsch" }
        ]
      }
    }
  ]
}
```

## Conjugation -> `free_text` with a structured prompt

Ask for one inflected form and accept it (plus common variants) via `accept`.
The prompt carries the verb, tense and person; the blank is the answer.

```json
{
  "id": "pattern-conjugation",
  "title": "Conjugation as free_text",
  "cards": [
    { "id": "gehen-ich", "front": "gehen - ich (Präsens)", "back": "gehe", "tags": ["verb"] }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "conj-1",
        "type": "free_text",
        "prompt": "Konjugiere 'gehen' im Präsens: ich ___",
        "card_ids": ["gehen-ich"],
        "accept": ["gehe"]
      }
    }
  ]
}
```

## Synonyms / antonyms -> `matching`

Pair each word with its synonym (or antonym) via `matching`. Keep `left` and
`right` values unique within the exercise to avoid an ambiguous-pairing
warning.

```json
{
  "id": "pattern-synonyms",
  "title": "Synonyms as matching",
  "cards": [
    { "id": "gross", "front": "groß", "back": "big", "tags": ["adjective"] }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "syn-1",
        "type": "matching",
        "prompt": "Ordne jedem Wort sein Synonym zu.",
        "card_ids": ["gross"],
        "pairs": [
          { "left": "groß", "right": "riesig" },
          { "left": "schnell", "right": "rasch" },
          { "left": "schön", "right": "hübsch" }
        ]
      }
    }
  ]
}
```

## Collocations -> `matching`

Same shape as synonyms: pair a base word with the word it naturally combines
with ("eine Entscheidung *treffen*", not "*machen*").

```json
{
  "id": "pattern-collocations",
  "title": "Collocations as matching",
  "cards": [
    { "id": "entscheidung", "front": "eine Entscheidung ___", "back": "treffen", "tags": ["collocation"] }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "col-1",
        "type": "matching",
        "prompt": "Welches Verb passt? Ordne die typische Kombination zu.",
        "card_ids": ["entscheidung"],
        "pairs": [
          { "left": "eine Entscheidung", "right": "treffen" },
          { "left": "eine Frage", "right": "stellen" },
          { "left": "einen Fehler", "right": "machen" }
        ]
      }
    }
  ]
}
```

## Contextual meaning (polysemy) -> `multiple_choice`

Disambiguate a polysemous word by putting it in a sentence and offering the
readings as options.

```json
{
  "id": "pattern-contextual-meaning",
  "title": "Contextual meaning as multiple_choice",
  "cards": [
    { "id": "bank-geld", "front": "Bank (Geld)", "back": "financial institution", "tags": ["polysemy"] }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "ctx-1",
        "type": "multiple_choice",
        "prompt": "Was bedeutet 'Bank' in: 'Ich hebe Geld von der Bank ab'?",
        "card_ids": ["bank-geld"],
        "options": [
          { "text": "Finanzinstitut", "correct": true },
          { "text": "Sitzgelegenheit im Park" }
        ]
      }
    }
  ]
}
```

## Word order -> `word_tiles`

Practising sentence order is exactly what `word_tiles` is: the authored
`tiles` are the correct order, and the renderer shuffles them for the learner.
For sentences whose connectors may legitimately move, add `accept_orderings`
(see [lesson-format.md](lesson-format.md)).

```json
{
  "id": "pattern-word-order",
  "title": "Word order as word_tiles",
  "cards": [
    { "id": "ich-gehe-nach-hause", "front": "I am going home", "back": "Ich gehe nach Hause", "tags": ["syntax"] }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "wo-1",
        "type": "word_tiles",
        "prompt": "Bring die Wörter in die richtige Reihenfolge.",
        "card_ids": ["ich-gehe-nach-hause"],
        "tiles": ["Ich", "gehe", "nach", "Hause"]
      }
    }
  ]
}
```

## Direction (receptive vs productive) is a field, not a type

"Translate L1->L2" and "translate L2->L1" are the same exercise with a
different `direction` (`source_to_target` / `target_to_source` / `both` /
`random`). Set it on any exercise; you do not author two separate types. See
`direction` in [lesson-format.md](lesson-format.md).
