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

  it("W-CARD-UNUSED aggregates a lesson's unused cards into ONE warning", () => {
    const result = validateLesson(
      lesson(
        [ex({ id: "e1", type: "free_text", prompt: "?", card_ids: ["c1"], accept: ["a"] })],
        [
          { id: "c1", front: "x", back: "y" },
          { id: "o1", front: "a", back: "b" },
          { id: "o2", front: "c", back: "d" },
          { id: "o3", front: "e", back: "f" },
        ],
      ),
    );
    // One aggregated warning per lesson, not one per orphan card: a card-rich
    // set (cards as knowledge base, exercises a curated subset) must not bury
    // the rare real author mistake under dozens of lines (alert fatigue).
    const cardWarnings = result.warnings.filter((warning) => warning.id === "W-CARD-UNUSED");
    expect(cardWarnings).toHaveLength(1);
    const message = cardWarnings[0]!.message;
    expect(message).toContain("3");
    for (const id of ["o1", "o2", "o3"]) expect(message).toContain(id);
  });

  it("W-MATCH-AMBIG warns on a duplicated RIGHT value (ambiguous, never blocks)", () => {
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
    expect(dupRight.valid).toBe(true);
  });

  const matchLefts = (a: string, b: string): ValidationResult =>
    validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "matching",
          prompt: "?",
          pairs: [
            { left: a, right: "1" },
            { left: "Ohne Grenzen", right: "2" },
            { left: b, right: "3" },
          ],
        }),
      ]),
    );

  it("E-MATCH-DUP-LEFT: a repeated left term is a HARD error, naming the term and positions", () => {
    const exact = matchLefts("Empathie", "Empathie");
    expect(exact.valid).toBe(false);
    const issue = byId(exact.errors, "E-MATCH-DUP-LEFT");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("Empathie");
    expect(issue?.message).toContain("1");
    expect(issue?.message).toContain("3");
    // the hard error replaces the softer warning for the left case (no double report)
    expect(hasWarning(exact, "W-MATCH-AMBIG")).toBe(false);
  });

  it("E-MATCH-DUP-LEFT: comparison is case-insensitive and whitespace-trimmed", () => {
    expect(byId(matchLefts("Empathie", "empathie").errors, "E-MATCH-DUP-LEFT")).toBeDefined();
    expect(byId(matchLefts("Empathie", " Empathie ").errors, "E-MATCH-DUP-LEFT")).toBeDefined();
  });

  it("E-MATCH-DUP-LEFT: unique left terms produce no error", () => {
    const unique = matchLefts("Empathie", "Gelebtes Mitgefühl");
    expect(byId(unique.errors, "E-MATCH-DUP-LEFT")).toBeUndefined();
    expect(unique.valid).toBe(true);
  });

  it("E-MATCH-DUP-LEFT: the three alc#27 fixtures would have failed before the fix", () => {
    // Reconstructed from alc-die-waehrung-des-geistes#27 (the "alt (doppelt)" column):
    // the same left term appeared twice for two different definitions.
    for (const term of ["Empathie", "Präsenz", "Integration"]) {
      const result = validateLesson(
        lesson([
          ex({
            id: "e-bilder",
            type: "matching",
            prompt: "Ordne jeder Aussage den Begriff zu.",
            pairs: [
              { left: term, right: "Definition A" },
              { left: "Ohne Grenzen", right: "Definition B" },
              { left: term, right: "Definition C" },
            ],
          }),
        ]),
      );
      expect(result.valid).toBe(false);
      expect(byId(result.errors, "E-MATCH-DUP-LEFT")?.message).toContain(term);
    }
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

  it("W-TILES-DUP message is engine-neutral: rule + index-grading consequence, no consumer tickets", () => {
    const result = validateLesson(
      lesson([ex({ id: "e1", type: "word_tiles", prompt: "?", tiles: ["und", "kurz", "und", "oft"] })]),
    );
    const message = byId(result.warnings, "W-TILES-DUP")?.message ?? "";
    expect(message).toContain("accept_orderings");
    expect(message).toContain("tile index");
    // engine-neutral: no consumer names, no consumer-internal ticket references
    expect(message).not.toMatch(/adaptive-learner|#\d+|\bapp\b/i);
  });

  it("W-HINT-LENGTH message is engine-neutral (no consumer internals)", () => {
    const result = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["tree"], hint: "It is 4 letters long." })]),
    );
    const message = byId(result.warnings, "W-HINT-LENGTH")?.message ?? "";
    expect(message).toContain("answer length");
    expect(message).not.toMatch(/adaptive-learner|#\d+|\bapp\b/i);
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

  it("W-PIC-DATA-URI when an image src is an inline data URI", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "picture_choice",
          prompt: "?",
          images: [
            { src: `data:image/png;base64,${"A".repeat(800)}`, label: "Cat", is_correct: "true" },
            { src: "b.png", label: "Dog" },
          ],
        }),
      ]),
    );
    expect(hasWarning(result, "W-PIC-DATA-URI")).toBe(true);
  });

  it("no W-PIC-DATA-URI for repo-path srcs", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "picture_choice",
          prompt: "?",
          images: [
            { src: "assets/img/cat.png", label: "Cat", is_correct: "true" },
            { src: "assets/img/dog.png", label: "Dog" },
          ],
        }),
      ]),
    );
    expect(hasWarning(result, "W-PIC-DATA-URI")).toBe(false);
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
