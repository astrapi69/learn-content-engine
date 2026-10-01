import { describe, it, expect } from "vitest";

import { validateLessonRules } from "./rules.js";
import type { Lesson } from "./types/lesson-schema.generated.js";
import { validateLesson, type ValidationIssue } from "./validate.js";

/**
 * engine#237: a free_text answer that is also a distractor. The schema calls
 * `distractors` the renderer's fallback pool of wrong options, so a shared
 * entry offers a correct answer as a wrong one. The content template's
 * advisory audit held this rule; cloze multiselect already blocks the same
 * contradiction (E-CLOZE-MS-DISJOINT). Compared after trimming; case counts
 * only where the exercise declares `case_sensitive: true` (engine#242, see
 * case-sensitive.test.ts).
 */

const freeText = (exercise: Record<string, unknown>): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps: [{ id: "s1", type: "exercise", exercise: { id: "f1", type: "free_text", prompt: "?", ...exercise } }],
});

const disjointIssues = (lesson: Record<string, unknown>): ValidationIssue[] =>
  validateLesson(lesson).errors.filter((issue) => issue.id === "E-FREETEXT-DISJOINT");

describe("reproduction (engine#237)", () => {
  it("an accepted answer that is also a distractor fails", () => {
    const lesson = freeText({ accept: ["gracias", "Gracias"], distractors: ["gracias", "de nada"] });
    expect(validateLesson(lesson).valid).toBe(false);
    expect(disjointIssues(lesson)).toEqual([
      expect.objectContaining({ id: "E-FREETEXT-DISJOINT", path: "/steps/0/exercise", params: { shared: ["gracias"] } }),
    ]);
  });
});

describe("happy path", () => {
  it("disjoint lists report nothing", () => {
    expect(validateLesson(freeText({ accept: ["gracias", "Gracias"], distractors: ["de nada"] }))).toMatchObject({ valid: true, errors: [] });
  });

  it("names the shared entries in the message and points at free_text", () => {
    const [issue] = disjointIssues(freeText({ accept: ["dog", "cat"], distractors: ["cat", "dog", "bird"] }));
    expect(issue!.message).toBe(`FREE_TEXT 'accept' and 'distractors' must be disjoint; shared answer(s): ["dog","cat"]`);
    expect(issue!.docAnchor).toBe("docs/lesson-format.md#free_text");
  });

  it("the /rules entry reports it too", () => {
    const result = validateLessonRules(freeText({ accept: ["dog"], distractors: ["dog"] }) as unknown as Lesson);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.id)).toContain("E-FREETEXT-DISJOINT");
  });
});

describe("edge cases", () => {
  it("no distractors at all report nothing", () => {
    expect(disjointIssues(freeText({ accept: ["dog"] }))).toEqual([]);
  });

  it("an empty distractor list reports nothing", () => {
    expect(disjointIssues(freeText({ accept: ["dog"], distractors: [] }))).toEqual([]);
  });

  it("an entry repeated in accept is named once", () => {
    const [issue] = disjointIssues(freeText({ accept: ["dog", "dog"], distractors: ["dog"] }));
    expect(issue!.params).toEqual({ shared: ["dog"] });
  });
});

describe("boundaries", () => {
  it("surrounding whitespace does not make two entries different", () => {
    expect(disjointIssues(freeText({ accept: [" gracias"], distractors: ["gracias "] }))).toEqual([
      expect.objectContaining({ params: { shared: ["gracias"] } }),
    ]);
  });

  it("a distractor that differs only in case is a legitimate wrong answer where case is declared", () => {
    expect(disjointIssues(freeText({ accept: ["I am Anna"], distractors: ["i am Anna"], case_sensitive: true }))).toEqual([]);
  });
});
