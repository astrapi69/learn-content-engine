---
title: "Schema-First Content Engineering"
description: "How learn-content-engine keeps a stable core schema and still leaves room for pedagogical invention: by drawing a hard line between the contract it owns and the rules its consumers own."
date: 2026-07-14
tags: [architecture, schema-design, typescript, content-engineering]
---

# Schema-First Content Engineering

*How `learn-content-engine` keeps a stable core schema and still leaves room for pedagogical invention: by drawing a hard line between the contract it owns and the rules its consumers own.*

`learn-content-engine` · schema v1.7 · framework-agnostic TypeScript

## The content-schema dilemma

`learn-content-engine` is a framework-agnostic TypeScript library that parses and validates learning content: language courses foremost, though a free-form `domain` field lets the same shape carry other knowledge domains (tech courses, driving-test prep, psychology). It turns raw sources (lesson JSON plus a `manifest.yaml`) into a canonical internal shape, and it is the single source of truth for the lesson schema, currently version 1.7.

The core is deliberately small. No rendering, no persistence, no networking; its only runtime dependency is a YAML parser. What it offers is pure validation and transformation. That minimalism is the point, and it forces one hard question: *how do you evolve a content schema without breaking every consumer that depends on it?*

Language-learning content does not hold still. New exercise types keep appearing (categorization, error-correction, graded quizzes), old ones fade, and edge cases surface in production that no one designed for. A content schema has to be stable enough to version content across several repositories, yet loose enough to absorb pedagogical ideas that weren't imagined when it was written. Stability versus evolution: that tension is the whole design problem, and the rest of this note is how we resolved it.

## The schema is the source of truth, not the types

The first decision was to make the JSON Schema authoritative and treat the TypeScript types as an artifact of it, never the reverse. The loop is:

- Define the shape in `lesson.schema.json`.
- Generate the TypeScript types from it via `scripts/generate-lesson-types.mjs`.
- Validate content against the schema in `validate.ts`.
- Expose validation to authors through a CLI: `learn-content-engine lint <file>`, wired into each content repo's `make lint`.

This closes the door on schema drift: the familiar failure where documentation, code, and validation quietly diverge until no one is sure which is right. Change the schema and the types regenerate, the validation follows, and the CLI reports the new rules. One place to look, one place to edit.

The schema describes the canonical structure and nothing beyond it: lessons hold steps, steps hold exercises, each exercise has a type with its own payload shape, and the engine checks that content conforms. Which sets up the harder question it doesn't yet answer: what do you do when you need a type the schema has never seen?

## What a core type actually costs

Adding a new *core* `ExerciseType` is not a small change. It is a product commitment with a high barrier to reversal, and the cost is mostly paid outside the engine.

Trace what a single core type touches:

- **Schema.** `lesson.schema.json` gains an enum value and a payload definition (an additive minor bump, 1.7 to 1.8).
- **Types.** `generate-lesson-types.mjs` regenerates the interfaces; every consumer picks up the new shape.
- **Mirrors.** Ten content repositories mirror the schema - the official repo, the test/starter repo, the template, and seven `alc-*` domain repos (plus the app's own generated copy) - and byte-parity gates keep them honest.
- **Dispatcher & renderer.** The app's exercise dispatcher needs a new branch and a new renderer component.
- **i18n.** Eleven language catalogs need instruction keys, feedback, and error strings.
- **Validation.** `validate.ts` needs rules for the new shape: well-formedness, cross-field integrity.
- **Migration & docs.** Existing content may need migrating; architecture and contributor docs need updating.

None of that is exotic on its own. The cost is the coordination: synchronized releases across repositories, backward-compatibility guarantees, and testing that spans the whole content ecosystem. And it is a one-way door. Once content in the wild uses a core type, removing it means a deprecation cycle, a migration path, and a breaking change for every consumer. A core type is permanent in a way most code is not, which is exactly why it should never be a casual decision.

## The extension tier

The way out is the *extension tier*: a mechanism for adding exercise types without touching the core schema at all. Three schema fields make it work.

```json
// the exercise's type: a namespaced ext id
"type": { "pattern": "^ext:[a-z0-9]+-[a-z0-9-]+$" }

// its payload, opaque to the core engine
"ext_payload": { "type": "object", "additionalProperties": true }

// declared at the lesson level, versioned by major
"requires_extensions": {
  "items": { "pattern": "^ext:[a-z0-9]+-[a-z0-9-]+@\\d+$" }
}
```

An extension type carries a namespaced name (`ext:<vendor>-<name>`, for example `ext:al-graded-quiz`), puts its data in the opaque `ext_payload`, and is declared by the lesson in `requires_extensions` with a pinned major version (`ext:al-graded-quiz@1`). That version pin is the portability guarantee: a consumer that hasn't registered a declared extension refuses the lesson loudly with `E-EXT-UNSUPPORTED` rather than mis-rendering it.

The split of responsibility is the whole idea:

| The engine owns | The consumer owns |
|---|---|
| Parsing the type and payload from JSON/YAML | Payload validation: the shape inside `ext_payload` |
| Structural validation: the type pattern, the version pin | Rendering: the UI for the exercise |
| The load guard: is the extension registered? | Business logic: scoring, SRS, feedback |

The engine owns the contract; the consumer owns the rules. Nothing in the extension namespace is app-specific: the engine picks no vendor. Its own reference implementations live under `src/examples/ext-ref-*` and use the neutral vendor `ref` (`ext:ref-categorization`, `ext:ref-graded-quiz`); a real consumer picks its own vendor and registers its own validators. The reference app, `adaptive-learner`, adopts them under the `al` vendor.

What this buys is room to move: experiment without destabilizing the core, change a payload shape without breaking other consumers, and let each consumer adopt on its own schedule instead of on the engine's. The trade-off is honest: extensions are not portable by default. A consumer that has never heard of `ext:al-categorization` shows a placeholder and says so. That refusal is the feature: portability becomes an explicit adoption decision instead of a silent assumption.

## Four adoptions, one recipe

Four extension types have gone through this path end to end. Each stressed a different part of the design.

### `ext:al-categorization`: sorting into buckets

Learners sort items into fixed categories. The payload is as plain as it looks:

```json
{
  "categories": [
    { "name": "Nouns", "items": ["Haus", "Auto", "Buch"] },
    { "name": "Verbs", "items": ["gehen", "laufen"] }
  ]
}
```

Simple payload, direct renderer. The interesting part was the recipe it established, repeated for every adoption since: a `ref` example in the engine, then a `SUPPORTED_EXTENSIONS` entry and a renderer in the app, then an allowlist entry in the content gate (`validate_with_engine.mjs`). The extension tier did exactly what it promised.

### `ext:al-error-correction`: marking the wrong token

Learners see a tokenized sentence with one wrong token and correct it.

```json
{
  "tokens": ["Ich", "gehe", "nach", "Hausee"],
  "error_index": 3,
  "accept": ["Hause"]
}
```

Note the shape: the sentence is a `tokens` array, not a string; `error_index` is 0-based, inside the token range; and the accepted answers are *corrections*. The contract requires every entry to differ from the marked token, so the wrong token itself can't sneak into the accept list. The `accept` array arrived as a contract refinement *during* adoption, not in the engine. That's the tier working as intended: the engine never inspected the payload, so the shape could sharpen without a schema change or a coordinated release.

### `ext:al-reading-comprehension`: a shared stimulus with sub-questions

A passage followed by several bound questions. This one *could* have been core: it needs a genuinely new structure (a shared stimulus with sub-questions) that breaks the schema's "one step, one exercise" model. We built it as an extension anyway.

```json
{
  "passage": "Berlin ist die Hauptstadt von Deutschland...",
  "questions": [
    { "prompt": "Was ist Berlin?", "type": "free_text", "accept": ["die Hauptstadt"] },
    { "prompt": "In welchem Land liegt Berlin?", "type": "free_text", "accept": ["Deutschland"] }
  ]
}
```

Sub-questions carry their own `type` and can be multiple-choice (with an `options` array) as easily as free-text; the renderer reuses the app's existing graders. Why not core? The data model wasn't proven, and we wanted to try the interaction before committing the schema to it. You can always promote an extension to core later; you can't cheaply demote one. When the shape is uncertain, the extension is the safe first move.

### `ext:al-graded-quiz`: scoring with partial credit

A self-contained scored question set: points per question, proportional partial credit on multi-select, an optional pass threshold.

```json
{
  "pass_threshold": 60,
  "questions": [
    {
      "prompt": "What is the capital of France?",
      "type": "multiple_choice",
      "options": [
        { "text": "Paris", "correct": true },
        { "text": "London" },
        { "text": "Berlin" }
      ],
      "points": 2
    }
  ]
}
```

Correctness is marked *inline* on each option (`{ text, correct }`), never as an index into the options array. That's not incidental: index-based answers are a known trap in this system (an index-graded renderer is what the `W-TILES-DUP` lint and issue engine#19 exist to guard against), so the payload avoids them by construction. On the consumer side, the design kept two scores apart: the SRS score (correct questions, for XP) and the test score (points and pass/fail, for grading), so learning progress and formal grading never contaminate each other. The engine, as ever, took no position on any of it.

## Core or extension?

After four adoptions and several rounds of arguing the question, it compresses to one test:

> **Core:** Does it need a fundamentally new data form that *every* consumer must understand? Then it's a core change, after careful consideration.
>
> **Extension:** Is it an existing form plus specific consumer behavior or rendering? Then it's an extension.

Against that test, the four line up cleanly, and the surprising case is the one we deliberately did not promote:

| Type | Reading | Verdict |
|---|---|---|
| categorization | An existing form (matching) with a specific bucket UI | **Extension** |
| error-correction | Tokens plus a marked index and accepted corrections | **Extension** |
| graded-quiz | Multiple-choice plus scoring and pass/fail logic | **Extension** |
| reading-comprehension | A genuinely new form: shared stimulus, bound sub-questions | *Could be core, chose extension* |

Before any of that, a prior question is worth asking, because it often dissolves the whole thing: *can you express the idea with existing types plus metadata?* If yes, add nothing at all. Only when the answer is genuinely no does the core-or-extension choice even begin, and even then, the extension is the right default for most of what remains. Core types are for the small set of shapes that truly require universal understanding.

## Where this leaves us

A content schema can be both stable and evolvable, but only if you separate the contract from the rules. The engine owns the contract: structure, validation, the load guard. The consumer owns the rules: payload shape, rendering, business logic. Hold that line and the rest follows.

Four things this earned in practice:

- **Schema-first kills drift.** One source of truth for types, validation, and docs.
- **Core types are expensive.** The ripple is real and the door only opens one way. Don't add them casually.
- **Extensions are the right default.** They let you experiment without putting the core at risk.
- **The contract is the product.** A clean split between engine and consumer is what keeps the whole thing maintainable.

A few things are deliberately unfinished, and tracked as issues rather than carried as quiet debt:

- **Publishing the extension validators.** Today the content gate is permissive: it checks that a declared extension is on the allowlist but does not validate the payload; that correctness stays the consumer's job. Publishing the consumer's payload validators so the gate can reuse them would tighten this. It's an improvement, not a blocker; deliberately deferred for now.
- **Pure test-only sets.** Content repos enforce quality minima (at least five exercises, two exercise types, one theory step per lesson) which a pure graded-quiz "test" set can't meet. Whether to relax those minima for test-only lessons is an open, conscious quality-floor decision.

> **A note on honesty.** These are decisions postponed on purpose, each with a reason written down, not oversights discovered later. The difference matters: tracked "later" is a plan; untracked "later" is debt wearing a disguise.

The engine is small on purpose, and most of what it's careful about is what it refuses to do. Content schemas are hard and evolution is inevitable; the extension tier is how this one builds for both without pretending the tension away. If you're building a content engine of your own, the question worth answering early is simply: *what is your extension strategy?* The seam is easier to design in than to retrofit.

---

*Core owns the contract. Consumers own the rules.*
