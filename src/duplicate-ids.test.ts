import { describe, it, expect } from "vitest";

import { validateLessonRules } from "./rules.js";
import type { Lesson } from "./types/lesson-schema.generated.js";
import { validateLesson, type ValidationIssue } from "./validate.js";

/**
 * engine#202: card, step and exercise ids are unique within a lesson, as the
 * schema's descriptions have always said, and no engine rule checked it. The
 * reference app rejects such a lesson at error level; the content repos' gate
 * (the engine) passed it, and a duplicated card silently dropped out of a
 * `from_cards` matching. Three namespaces, not one: a step and its exercise
 * sharing an id is the norm in the corpus (4,766 of 5,063 exercise steps).
 */

const DUP_IDS = ["E-CARD-ID-DUP", "E-STEP-ID-DUP", "E-EXERCISE-ID-DUP"];

const card = (id: string, front = id): Record<string, unknown> => ({ id, front, back: `${front}-back` });
const theory = (id: string): Record<string, unknown> => ({ id, type: "theory", body: "Read this." });
const freeText = (stepId: string, exerciseId: string, cardIds: string[] = []): Record<string, unknown> => ({
  id: stepId,
  type: "exercise",
  exercise: { id: exerciseId, type: "free_text", prompt: "?", accept: ["a"], ...(cardIds.length ? { card_ids: cardIds } : {}) },
});

const lessonOf = (steps: Record<string, unknown>[], cards?: Record<string, unknown>[]): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps,
  ...(cards ? { cards } : {}),
});

const dupIssues = (lesson: Record<string, unknown>): ValidationIssue[] =>
  validateLesson(lesson).errors.filter((issue) => DUP_IDS.includes(issue.id));

describe("reproductions (engine#202): each namespace fails for its own reason", () => {
  it("two cards with one id", () => {
    const lesson = lessonOf([freeText("s1", "e1", ["hund"])], [card("hund", "Hund"), card("hund", "Katze")]);
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(dupIssues(lesson)).toEqual([
      expect.objectContaining({ id: "E-CARD-ID-DUP", path: "/cards", params: { cardId: "hund", positions: [1, 2] } }),
    ]);
  });

  it("two steps with one id", () => {
    const lesson = lessonOf([theory("s1"), freeText("s1", "e1")]);
    expect(validateLesson(lesson).valid).toBe(false);
    expect(dupIssues(lesson)).toEqual([
      expect.objectContaining({ id: "E-STEP-ID-DUP", path: "/steps", params: { stepId: "s1", positions: [1, 2] } }),
    ]);
  });

  it("two exercises with one id", () => {
    const lesson = lessonOf([freeText("s1", "ex-a"), freeText("s2", "ex-a")]);
    expect(validateLesson(lesson).valid).toBe(false);
    expect(dupIssues(lesson)).toEqual([
      expect.objectContaining({ id: "E-EXERCISE-ID-DUP", path: "/steps", params: { exerciseId: "ex-a", positions: [1, 2] } }),
    ]);
  });
});

describe("happy path", () => {
  it("distinct ids report none of the three", () => {
    const lesson = lessonOf([theory("t1"), freeText("s1", "e1", ["hund"]), freeText("s2", "e2", ["katze"])], [card("hund"), card("katze")]);
    expect(validateLesson(lesson)).toMatchObject({ valid: true, errors: [] });
  });

  it("names the id and its positions in the message", () => {
    const [issue] = dupIssues(lessonOf([freeText("s1", "e1", ["hund"])], [card("hund"), card("hund")]));
    expect(issue!.message).toBe("card id 'hund' is used at positions 1, 2; card ids must be unique within the lesson");
    expect(issue!.docAnchor).toBe("docs/lesson-format.md#cards");
  });
});

describe("edge cases", () => {
  it("a step whose id equals its exercise's id stays valid (the corpus norm)", () => {
    expect(validateLesson(lessonOf([freeText("ex-1", "ex-1"), freeText("ex-2", "ex-2")])).valid).toBe(true);
  });

  it("a card id equal to a step id stays valid (separate namespaces)", () => {
    expect(validateLesson(lessonOf([freeText("hund", "e1", ["hund"])], [card("hund")])).valid).toBe(true);
  });

  it("a lesson without cards and a theory-only lesson report nothing", () => {
    expect(dupIssues(lessonOf([freeText("s1", "e1")]))).toEqual([]);
    expect(dupIssues(lessonOf([theory("t1"), theory("t2")]))).toEqual([]);
  });

  it("an ext: exercise's id counts", () => {
    const extStep = {
      id: "s2",
      type: "exercise",
      exercise: { id: "e1", type: "ext:acme-order", prompt: "?", ext_payload: {} },
    };
    const lesson = { ...lessonOf([freeText("s1", "e1"), extStep]), requires_extensions: ["ext:acme-order@1"] };
    expect(validateLessonRules(lesson as unknown as Lesson).errors.filter((issue) => DUP_IDS.includes(issue.id))).toEqual([
      expect.objectContaining({ id: "E-EXERCISE-ID-DUP", params: { exerciseId: "e1", positions: [1, 2] } }),
    ]);
  });

  it("validateLessonRules alone reports the same error", () => {
    const lesson = lessonOf([freeText("s1", "e1", ["hund"])], [card("hund"), card("hund")]);
    const fromRules = validateLessonRules(lesson as unknown as Lesson).errors.filter((issue) => DUP_IDS.includes(issue.id));
    expect(fromRules).toEqual(dupIssues(lesson));
  });
});

describe("boundaries", () => {
  it("three occurrences give one error naming all three positions", () => {
    const lesson = lessonOf([freeText("s1", "e1"), freeText("s1", "e2"), freeText("s1", "e3")]);
    expect(dupIssues(lesson)).toEqual([
      expect.objectContaining({ id: "E-STEP-ID-DUP", params: { stepId: "s1", positions: [1, 2, 3] } }),
    ]);
  });

  it("two duplicated ids give one error each, in order of first occurrence", () => {
    const cards = [card("a"), card("b"), card("a"), card("b")];
    expect(dupIssues(lessonOf([freeText("s1", "e1", ["a", "b"])], cards)).map((issue) => issue.params)).toEqual([
      { cardId: "a", positions: [1, 3] },
      { cardId: "b", positions: [2, 4] },
    ]);
  });

  it("a duplicate at the first and the last position is found", () => {
    const cards = [card("x"), card("m1"), card("m2"), card("x")];
    expect(dupIssues(lessonOf([freeText("s1", "e1", ["x", "m1", "m2"])], cards)).map((issue) => issue.params)).toEqual([
      { cardId: "x", positions: [1, 4] },
    ]);
  });

  it("an NFD-decomposed id never reaches the rule: the slug pattern rejects it first", () => {
    const nfd = "fünf";
    const result = validateLesson(lessonOf([freeText("s1", "e1", ["fünf"])], [card("fünf"), card(nfd)]));
    expect(result.errors.map((issue) => issue.id)).toContain("E-SCHEMA");
    expect(result.errors.filter((issue) => DUP_IDS.includes(issue.id))).toEqual([]);
  });
});
