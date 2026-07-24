---
title: "One Source, Many Outputs"
description: "Write a lesson once and derive every output from it (an interactive app exercise, a printable test with answer key, and an LMS import) from a single validated source, without keeping copies in sync."
date: 2026-07-14
tags: [content-pipeline, education, validation, authoring, qti]
---

# One Source, Many Outputs

*Write a lesson once. Ship it as an interactive app exercise, a printable test with an answer key, and an LMS import: all from a single validated source, without keeping three copies in sync.*

`learn-content-engine` · for authors, technical writers, tooling & product

## The same lesson, three destinations

A single piece of learning content rarely has one home. A graded quiz on the passive voice needs to become an **interactive exercise** in the learning app, with spaced repetition tracking how each learner does. The same quiz needs to become a **printable test** a teacher hands out on paper, plus a separate answer key with the points. And it may need to become an **LMS import** so it can live in Moodle or Canvas alongside everything else.

The naive way is to author each one by hand. Three copies, three formats, and the moment you fix a typo in one, the other two are wrong. That is content drift, and it is the default state of most education content the moment it leaves a single tool.

The pipeline built around `learn-content-engine` takes the other path: **author once, in a canonical form, then derive every output from it.** The source is the thing you maintain; the app render, the PDF, and the LMS export are all downstream projections of it. This guide walks that pipeline from the author's keyboard to the printed page, and is honest about where each output stops.

## What you actually write

An author writes two kinds of file, both plain text and reviewable in a pull request.

A **lesson** is JSON: cards (the vocabulary or facts) and steps (theory and exercises). A **manifest** (`manifest.yaml`) groups lessons into *sets* and declares what each set is:

```yaml
sets:
  - id: passiv-b1
    title: "Passive voice (B1)"
    target_language: de
    source_language: en
    level: B1
    path: sets/en/de-b1
    version: "1.2.0"
    lesson_count: 8
```

The engine turns this into canonical objects at exactly one boundary (raw source to canonical model) and nothing more. The manifest's `sets[]` become `ContentSetEntry` projections; each lesson's JSON becomes a `ContentLesson`. The set is authoritative for the things a lesson shouldn't have to repeat: a lesson inherits its set's `target_language`, `source_language`, and domain unless it says otherwise. Author the pair once; the context flows down.

Three things stay deliberately separate in what you write: the **content** (the prompt, the cards), the **correct answer** (which options are right, which text is accepted), and everything about **presentation and grading policy**: how it's rendered, how points are computed, how partial credit works. You author the first two. The third is decided downstream, by whichever output is consuming the lesson. That separation is what makes one source able to feed several outputs without contradicting itself.

You don't have to write that JSON by hand. The reference app ships a **lesson creator** that has outgrown the word "simple": the classic four-step wizard (metadata, cards, exercises, save & share), a book path that turns pasted or uploaded textbook chapters into knowledge lessons, an extension branch that makes even graded quizzes and dictation authorable without JSON, and an edit mode. All of it produces lessons in this same canonical schema and can even open a pull request against a content repository directly from the app; part 3 of the series walks through every path. What is **planned** beyond it is a richer, teacher-facing editor for the heavier cases (larger sets). Neither changes the model: the source stays the contract, and every editor (simple or rich) is just one more tool that reads and writes it.

> **Additive by policy.** The schema is versioned (currently 1.7) and only grows additively: new fields are optional, so a lesson written last year still validates today. You are never forced to migrate content just because the schema moved.

## Validation is spell-check for test logic

Before any output is generated, the source is validated. This is the single most useful thing the engine does for an author, and it is worth thinking of it exactly the way you think of a spell-checker: it catches the mistakes you can't see by rereading.

One command does it, wired into each content repo as `make lint`, or run directly on a file:

```shell
make lint                                        # the whole repo, same rules as CI
npx learn-content-engine lint sets/en/de-b1/lessons/*.json
```

What it checks is not spelling but *coherence of the test itself*: that a cloze's blanks line up with its `___` markers, that every `card_ids` reference resolves to a real card, that a picture-choice has exactly one correct image, that a multi-select's accepted answers and distractors don't overlap. These are the errors that silently produce an ungradeable exercise, and they never leave the author's machine.

Alongside hard errors, the engine emits **author lints**: warnings that never block but flag likely mistakes: a card no exercise ever uses, a hint that gives away the answer's length, an ambiguous match. And in the content repos, a **quality floor** asks for a real lesson, not a fragment: at least five exercises, two exercise types, and one theory step. None of it is about taste; all of it is about a test that grades correctly for whoever runs it.

When a warning does point at real work (an unreferenced card that should be drilled), the CLI can help wire it:

```shell
npx learn-content-engine suggest-wiring sets/en/de-b1/lessons/03.json
# proposes a wiring only when a card's text appears verbatim in exactly
# one exercise; anything ambiguous goes to "manual review", never auto-applied
```

For the tooling-minded: a content repo runs this as two gates in CI, and both must be green. A structural gate checks shape and the quality floor against a mirrored copy of the schema; a semantic gate runs the engine's own validator (the same one every downstream consumer runs), so a green build means the content is valid for *everyone* who reads it, not just the author's setup.

## One source, many outputs

Once the source is canonical and valid, each output is a projection of it. None of the three below re-authors the content; each renders the one source into its own shape.

```
                                     +- app   : interactive exercise + spaced repetition
  lesson JSON  -->  validate    -->  +- print : student test PDF + teacher answer key
  + manifest.yaml   canonicalize     +- LMS   : QTI 2.x import / export (mappable subset)
```

### The app: interactive, with memory

The reference consumer, a learning app, renders each exercise type for the screen and drives spaced repetition: it tracks how a learner does on each card and schedules reviews accordingly. The lesson carries the content and the correct answers; the app owns the rendering and the scheduling policy. The same lesson that becomes a printed test also becomes a tap-through exercise here, with no second copy.

### The printed test: for the classroom

For the school-test case, a small teacher-facing tool reads a graded-quiz lesson and renders **two** PDFs from it:

- a **student test**: the question paper, with blank checkboxes and answer lines and the points per question, but no answers shown;
- a **teacher answer key**: the same questions with the correct answers, the points, any partial-credit note, and the pass threshold.

Notably, this tool is *standalone*: it reads the canonical lesson and renders a presentation of it, but it doesn't invoke the engine at all, so it isn't tied to any particular engine version. That is the boundary working in your favor: a new output can be built as an independent tool against the same source, without becoming entangled in the core.

### The LMS export: honest about its limits

To move content in and out of an LMS, the engine ships an optional **QTI 2.x adapter** behind a subpath import (`learn-content-engine/qti`), so its XML dependency never touches the dependency-free core. It maps the subset that maps *faithfully*:

| QTI interaction | Engine type |
|---|---|
| choiceInteraction (single / multiple) | multiple_choice |
| textEntryInteraction | free_text |
| matchInteraction | matching |

Everything outside that table (ordering, association, gap-match, hotspot, an item with no interaction or with more than one) is **refused, loudly**. Import collects every unmappable item and throws a single error listing each one, with its identifier and the reason. There is no silent skip: you never get a QTI import that looks complete but quietly dropped half the questions. And an import that would produce an invalid lesson is rejected rather than returned: the same discipline the whole pipeline runs on.

## What the engine refuses to do, and why that helps you

It is worth being explicit about the line, because it is what keeps the pipeline maintainable rather than a monolith. The engine validates and canonicalizes. That is all. It does not render, does not store, does not print, does not talk to an LMS.

| The engine does | Consumer tooling does |
|---|---|
| Parse source into a canonical lesson | Render for a screen and schedule reviews |
| Validate structure, semantics, and quality | Print a test and an answer key |
| Map the QTI subset, both directions | Persist progress, sync, deliver to an LMS |

Two honest limits fall out of this, and naming them is the point:

- The QTI adapter is a **mappable-subset bridge**, not a turnkey "export the whole test to Moodle" button. It moves what maps cleanly and refuses the rest: a lossy export that silently degrades a test is worse than no export.
- The PDF tool is **one presentation** of a lesson, not part of the engine. A richer layout, a different LMS format, a visual authoring editor: all of those are consumer tools someone builds against the same source, on their own schedule.

For a product manager weighing "one source, many outputs", that boundary is the whole answer to why it works: the source is the contract, and every output is a project that reads the contract. Add an output and you touch none of the others. Change the source and validation tells you, before anything ships, exactly which lessons broke.

## Author once, validate everywhere, derive the rest

The shape of the whole thing is small enough to hold in your head. You write a lesson and a manifest. You run one validator that catches the mistakes a reread can't. From that single validated source, the app renders an interactive exercise, a tool prints a test and its answer key, and an adapter carries what maps into an LMS. Nothing is authored twice.

The discipline underneath it is a single habit, applied everywhere: **refuse rather than guess.** Validation refuses a broken lesson instead of shipping it. The QTI adapter refuses an unmappable question instead of dropping it. Each output is honest about what it can and can't carry. That honesty is not a limitation of the pipeline: it is the reason you can trust its outputs at all.

---

*Author once. Validate everywhere. Refuse rather than guess.*
