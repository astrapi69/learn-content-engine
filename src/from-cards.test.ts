import { describe, it, expect } from "vitest";

import { parseLesson, type LessonSetContext, type LessonSourceAdapter } from "./content-engine.js";
import type { ContentLesson } from "./types/index.js";
import { validateLesson } from "./validate.js";

/**
 * Feature: matching `from_cards` (Bucket B). A matching exercise can derive its
 * `pairs` from the referenced cards (left = front, right = back) instead of
 * duplicating the definitions. Additive + optional; explicit `pairs` stay valid.
 * The engine RESOLVES `from_cards` at parse time, so the canonical object always
 * carries concrete `pairs` and no renderer needs to change.
 */

const CTX: LessonSetContext = {
  language: "fr",
  target_language: "fr",
  source_language: "en",
  domain: "language",
};

const fromCardsLesson = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "l1",
  title: "Match colours",
  cards: [
    { id: "rouge", front: "rouge", back: "red" },
    { id: "bleu", front: "bleu", back: "blue" },
  ],
  steps: [
    {
      id: "s1",
      type: "exercise",
      exercise: {
        id: "m1",
        type: "matching",
        prompt: "Match each colour to its translation.",
        card_ids: ["rouge", "bleu"],
        from_cards: true,
        ...extra,
      },
    },
  ],
});

describe("from_cards - validation", () => {
  it("accepts a matching exercise that derives pairs from cards", () => {
    const result = validateLesson(fromCardsLesson());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects from_cards with an empty card_ids list", () => {
    const lesson = fromCardsLesson();
    (((lesson.steps as Record<string, unknown>[])[0]!.exercise) as Record<string, unknown>).card_ids = [];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MATCH-FROMCARDS-CARDS")).toBe(true);
  });

  it("rejects from_cards combined with explicit pairs", () => {
    const result = validateLesson(fromCardsLesson({ pairs: [{ left: "rouge", right: "red" }] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MATCH-FROMCARDS-PAIRS")).toBe(true);
  });

  it("still requires pairs for a plain matching exercise (no from_cards)", () => {
    const lesson = fromCardsLesson();
    const exercise = ((lesson.steps as Record<string, unknown>[])[0]!.exercise) as Record<string, unknown>;
    delete exercise.from_cards;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MATCH-PAIRS")).toBe(true);
  });
});

describe("from_cards - parse resolution", () => {
  it("resolves pairs from the cards (front -> left, back -> right) on the canonical object", () => {
    const lesson = parseLesson(JSON.stringify(fromCardsLesson()), CTX);
    const exercise = lesson.steps[0]!.exercise!;
    expect(exercise.pairs).toEqual([
      { left: "rouge", right: "red" },
      { left: "bleu", right: "blue" },
    ]);
  });

  it("skips a from_cards reference to a card that does not exist", () => {
    const lesson = fromCardsLesson();
    const exercise = ((lesson.steps as Record<string, unknown>[])[0]!.exercise) as Record<string, unknown>;
    exercise.card_ids = ["rouge", "ghost"]; // "ghost" is not a card
    const parsed = parseLesson(JSON.stringify(lesson), CTX);
    expect(parsed.steps[0]!.exercise!.pairs).toEqual([{ left: "rouge", right: "red" }]);
  });

  it("resolves from_cards with the card_ids key absent to empty pairs (permissive parse)", () => {
    const lesson = {
      id: "l4",
      title: "No card_ids",
      cards: [{ id: "rouge", front: "rouge", back: "red" }],
      steps: [
        { id: "s1", type: "exercise", exercise: { id: "m1", type: "matching", prompt: "?", from_cards: true } },
      ],
    };
    const parsed = parseLesson(JSON.stringify(lesson), CTX);
    expect(parsed.steps[0]!.exercise!.pairs).toEqual([]);
  });

  it("parses a lesson that omits the cards key without error", () => {
    const noCards = {
      id: "l3",
      title: "Theory only",
      steps: [{ id: "s1", type: "theory", body: "Just reading." }],
    };
    const lesson = parseLesson(JSON.stringify(noCards), CTX);
    expect(lesson.id).toBe("l3");
  });

  it("does not mutate the object returned by the source adapter (purity, #24)", () => {
    // A custom adapter may return a cached / shared object; parseLesson must not
    // write `pairs` or delete `from_cards` on it. Mirrors migrateLesson's
    // "input is never mutated" contract on the neighbouring path.
    const shared = {
      id: "l1",
      title: "Match colours",
      cards: [{ id: "rouge", front: "rouge", back: "red" }],
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: { id: "m1", type: "matching", prompt: "?", card_ids: ["rouge"], from_cards: true },
        },
      ],
    };
    const sharedAdapter: LessonSourceAdapter = () => shared as unknown as ContentLesson;

    const canonical = parseLesson("{}", CTX, sharedAdapter);

    // The canonical object still gets resolved pairs and no from_cards flag.
    expect(canonical.steps[0]!.exercise!.pairs).toEqual([{ left: "rouge", right: "red" }]);
    expect((canonical.steps[0]!.exercise as Record<string, unknown>).from_cards).toBeUndefined();

    // ...but the adapter's own object is left exactly as it was.
    const sharedExercise = shared.steps[0]!.exercise as Record<string, unknown>;
    expect(sharedExercise.from_cards).toBe(true);
    expect(sharedExercise.pairs).toBeUndefined();
  });

  it("leaves an explicit-pairs matching exercise untouched", () => {
    const explicit = {
      id: "l2",
      title: "Explicit",
      cards: [],
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "m1",
            type: "matching",
            prompt: "?",
            card_ids: [],
            pairs: [{ left: "a", right: "1" }],
          },
        },
      ],
    };
    const lesson = parseLesson(JSON.stringify(explicit), CTX);
    expect(lesson.steps[0]!.exercise!.pairs).toEqual([{ left: "a", right: "1" }]);
  });
});
