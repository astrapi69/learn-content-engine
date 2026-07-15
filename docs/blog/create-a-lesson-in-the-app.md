---
title: "Create a Lesson in the App, Step by Step"
description: "A hands-on walkthrough of the adaptive-learner lesson creator: four wizard steps from an empty form to a saved, schema-valid lesson, with real screenshots from the running app."
date: 2026-07-15
tags: [tutorial, authoring, adaptive-learner, walkthrough]
---

# Create a Lesson in the App, Step by Step

*A hands-on walkthrough of the lesson creator in adaptive-learner: four wizard steps from an empty form to a saved, schema-valid lesson. Every screenshot in this guide comes from the running app, captured during the exact flow described.*

`adaptive-learner` · for teachers and content authors · part 3 of the series

The [previous article](one-source-many-outputs.md) made a promise: you don't have to write lesson JSON by hand. This one keeps it. We build a small real lesson ("Ordering coffee", English for German speakers) in the app's lesson creator and end with a lesson that passes the same quality checks every other lesson in the ecosystem passes. No editor, no terminal, no JSON.

## Where the creator lives

The creator is a page in the app: open `/create-lesson` (or follow the create action from the Content area). It is a four-step wizard, and the steps mirror exactly what a lesson *is* in the canonical schema: metadata, cards, exercises, and a final review. You can go back at any step; nothing is saved until you say so.

## Step 1: Lesson details

The first step collects the metadata that every lesson carries: a title, an optional title in the target language, the language pair, a level, and an optional topic and author name.

![Step 1: the lesson details form with title, languages, level, topic, and author](assets/create-lesson/s1-metadata.png)

For our example:

| Field | Value |
|---|---|
| Title | Ordering coffee |
| Title in target language | Kaffee bestellen |
| Language learned | English |
| Your language | German |
| Level | A1 |

Two things are worth noticing. First, the language pair here is the same `target_language` / `source_language` pair the schema records; the wizard just gives it friendlier names ("Language learned" and "Your language"). Second, there are starter templates (blank, vocabulary, grammar, conversation) if you'd rather not begin from an empty form; for this walkthrough we simply fill the fields and press **Next**.

## Step 2: Add vocabulary cards

Cards are the raw material of a lesson: the words and phrases the exercises will drill. Each card has a front (in the language being learned) and a back (in your language), plus optional notes and an image reference.

![Step 2: the card editor with four cards added to the list](assets/create-lesson/s2-cards.png)

We add four:

| Front (learned) | Back (your language) |
|---|---|
| coffee | der Kaffee |
| please | bitte |
| the bill | die Rechnung |
| milk | die Milch |

Type front and back, press **Add card**, repeat. The list below the form grows as you go, and each entry can be edited, deleted, or reordered. If you already have vocabulary in a spreadsheet, **Import CSV** takes it in one step instead of four.

## Step 3: Generate exercises

This is the step that would be tedious by hand, and the wizard does it for you. Pick how many exercises you want, which types are allowed (matching, free text, cloze, word tiles, picture choice), and a direction preference (receptive, productive, or balanced). Then press **Auto-generate exercises**.

![Step 3: the exercise generator with type checkboxes and five generated exercises](assets/create-lesson/s3-exercises.png)

For our four cards the generator produced five exercises: one matching exercise over all four pairs, and one translation prompt per card. Two details matter here:

- **The generation is deterministic and local.** It derives exercises from your cards by rule, not by a language model, so it needs no API key and produces the same kind of result every time. Don't like the mix? **Regenerate**, adjust the type checkboxes, or delete individual exercises from the list.
- **The exercises are real schema exercises.** What the generator emits are the same `matching` and `free_text` structures a hand-written lesson JSON would contain. The wizard is writing the canonical format for you, one form at a time.

## Step 4: Review and save

The last step shows the lesson summary and, more importantly, a checklist:

![Step 4: the review screen with the quality checklist, all green](assets/create-lesson/s4-review.png)

- Has a title
- Language pair is valid
- At least 4 cards
- At least 5 exercises
- At least 2 exercise types
- Valid lesson structure

If that list looks familiar, it should: these are the same quality minima the content repositories enforce in CI (the quality floor from the previous article). The wizard runs them *before* you save, so a lesson that leaves this screen green is already the kind of lesson the rest of the pipeline accepts. A red item blocks nothing silently; it tells you exactly what is missing.

Then, two ways out:

- **Save locally** stores the lesson in the app itself. It shows up alongside your other content and can be played immediately, with spaced repetition tracking it like any other lesson.
- **Save and share** goes further: it walks you through contributing the lesson to a content repository on GitHub. With a token configured, the app forks the repository, creates a branch, commits the lesson, and opens the pull request for you; without one, it prepares a pre-filled URL you can complete by hand. Either way the destination is the same reviewable, versioned home the rest of the content lives in.

## What you just made

The output of those four steps is not a proprietary in-app object. It is a lesson in the same canonical schema this whole series is about: cards, steps, exercises, metadata, all validated. That means everything from the previous article applies to it. It renders as an interactive exercise with spaced repetition. It can travel to a content repository through a pull request, where the same validator gates it in CI. One source, and you never opened a text editor.

## Honest limits

The creator is deliberately the *simple* path, and it has edges:

- It covers the core exercise types. Extension types (the graded quiz from the school-test use case, categorization, and friends) are not authorable here yet; those still start life as JSON, or wait for the richer teacher-facing editor that is planned.
- The generator is rule-based on purpose. It produces solid drill exercises from your cards; it does not invent theory steps or creative exercise prose. For a lesson with rich theory sections, the JSON path (or that future editor) is still the way.

For the everyday case (a teacher or learner who wants a small, clean vocabulary lesson that plays immediately and can be shared properly) the four steps above are the whole job.

---

*Four steps, no JSON: metadata, cards, generated exercises, and a review that runs the same quality floor as CI.*
