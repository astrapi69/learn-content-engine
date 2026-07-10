import { describe, it, expect } from "vitest";

import { validateLesson, type ValidationIssue, type ValidationResult } from "./validate.js";

/**
 * Author-ergonomics: the non-blocking warning layer + stable rule IDs.
 * Warnings never change `valid` (errors-only) and never appear in `errors`;
 * they live in `warnings`. Every issue (error or warning) carries a stable
 * `id`, a `severity`, and a `docAnchor`.
 */

interface StepInput {
  id: string;
  type: "theory" | "exercise";
  body?: string;
  exercise?: Record<string, unknown>;
}
const lesson = (steps: StepInput[], cards: Record<string, unknown>[] = []): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps,
  cards,
});
const ex = (exercise: Record<string, unknown>): StepInput => ({ id: "s1", type: "exercise", exercise });

const byId = (issues: ValidationIssue[], id: string): ValidationIssue | undefined =>
  issues.find((issue) => issue.id === id);
const hasWarning = (result: ValidationResult, id: string): boolean => byId(result.warnings, id) !== undefined;

const CLEAN = lesson(
  [ex({ id: "e1", type: "free_text", prompt: "Say hello.", card_ids: ["c1"], accept: ["bonjour"] })],
  [{ id: "c1", front: "bonjour", back: "hello" }],
);

describe("warning layer — shape and severity", () => {
  it("adds an empty warnings array on a clean lesson", () => {
    const result = validateLesson(CLEAN);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("tags every error with a stable id, severity 'error', and a doc anchor", () => {
    const result = validateLesson(lesson([ex({ id: "e1", type: "matching", prompt: "?", pairs: [] })]));
    expect(result.valid).toBe(false);
    const issue = result.errors[0]!;
    expect(issue.id).toMatch(/^E-/);
    expect(issue.severity).toBe("error");
    expect(issue.docAnchor).toContain("docs/lesson-format.md#");
    // errors never leak into warnings and vice-versa
    expect(result.warnings.every((warning) => warning.severity === "warning")).toBe(true);
  });

  it("warnings never flip `valid` or appear as errors", () => {
    const withUnusedCard = lesson(
      [ex({ id: "e1", type: "free_text", prompt: "?", card_ids: ["c1"], accept: ["a"] })],
      [
        { id: "c1", front: "x", back: "y" },
        { id: "c2", front: "orphan", back: "z" },
      ],
    );
    const result = validateLesson(withUnusedCard);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(hasWarning(result, "W-CARD-UNUSED")).toBe(true);
  });
});

describe("analysis warnings", () => {
  it("W-CARD-UNUSED names the unreferenced card", () => {
    const result = validateLesson(
      lesson(
        [ex({ id: "e1", type: "free_text", prompt: "?", card_ids: ["c1"], accept: ["a"] })],
        [
          { id: "c1", front: "x", back: "y" },
          { id: "orphan", front: "o", back: "p" },
        ],
      ),
    );
    expect(byId(result.warnings, "W-CARD-UNUSED")?.message).toContain("orphan");
  });

  it("W-MATCH-AMBIG on a duplicated left or right value", () => {
    const dupLeft = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "matching",
          prompt: "?",
          pairs: [
            { left: "a", right: "1" },
            { left: "a", right: "2" },
          ],
        }),
      ]),
    );
    expect(hasWarning(dupLeft, "W-MATCH-AMBIG")).toBe(true);
    const dupRight = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "matching",
          prompt: "?",
          pairs: [
            { left: "a", right: "1" },
            { left: "b", right: "1" },
          ],
        }),
      ]),
    );
    expect(hasWarning(dupRight, "W-MATCH-AMBIG")).toBe(true);
  });

  it("W-TILES-DUP on duplicate tiles without accept_orderings", () => {
    const result = validateLesson(
      lesson([ex({ id: "e1", type: "word_tiles", prompt: "?", tiles: ["und", "kurz", "und", "oft"] })]),
    );
    expect(hasWarning(result, "W-TILES-DUP")).toBe(true);
    // ...but not when accept_orderings is present (author handled it)
    const handled = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "word_tiles",
          prompt: "?",
          tiles: ["und", "kurz", "und", "oft"],
          accept_orderings: [[0, 1, 2, 3]],
        }),
      ]),
    );
    expect(hasWarning(handled, "W-TILES-DUP")).toBe(false);
  });

  it("W-DISTRACTOR-ANSWER when a select cloze distractor equals the answer", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "select",
          prompt: "?",
          sentence: "Paris is in ___.",
          blanks: [{ accept: ["France"] }],
          distractors: ["France", "Spain"],
        }),
      ]),
    );
    expect(hasWarning(result, "W-DISTRACTOR-ANSWER")).toBe(true);
  });

  it("W-PIC-DUP-LABEL when a distractor image label equals the correct label", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "picture_choice",
          prompt: "?",
          images: [
            { src: "a.png", label: "Cat", is_correct: "true" },
            { src: "b.png", label: "Cat" },
          ],
        }),
      ]),
    );
    expect(hasWarning(result, "W-PIC-DUP-LABEL")).toBe(true);
  });

  it("W-HINT-LENGTH when a hint mentions the answer length", () => {
    const german = validateLesson(
      lesson([
        ex({ id: "e1", type: "free_text", prompt: "?", accept: ["Baum"], hint: "Die Antwort hat vier Buchstaben." }),
      ]),
    );
    expect(hasWarning(german, "W-HINT-LENGTH")).toBe(true);
    const english = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["tree"], hint: "It is 4 letters long." })]),
    );
    expect(hasWarning(english, "W-HINT-LENGTH")).toBe(true);
  });

  it("does not warn on a hint that reveals no length", () => {
    const noNumber = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["Tier"], hint: "Denke an ein Tier." })]),
    );
    expect(hasWarning(noNumber, "W-HINT-LENGTH")).toBe(false);
    const numberButNoLengthNoun = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["a"], hint: "Es gibt drei Optionen." })]),
    );
    expect(hasWarning(numberButNoLengthNoun, "W-HINT-LENGTH")).toBe(false);
  });
});
