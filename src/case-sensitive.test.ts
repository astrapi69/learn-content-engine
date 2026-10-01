import { describe, it, expect } from "vitest";

import { exportQti, importQti } from "./qti/index.js";
import type { Lesson } from "./types/lesson-schema.generated.js";
import { validateLesson, type ValidationIssue } from "./validate.js";

/**
 * engine#242: case is not an error unless the exercise says so. A
 * `free_text` exercise declares `case_sensitive: true` where it teaches case
 * (capitalisation); without it, a consumer grades without case. The rules
 * follow the declaration: `E-FREETEXT-DISJOINT` compares without case by
 * default, so a distractor that differs from an answer only in case is a
 * contradiction unless the exercise declares case-sensitive grading.
 */

const freeText = (exercise: Record<string, unknown>): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps: [{ id: "s1", type: "exercise", exercise: { id: "f1", type: "free_text", prompt: "?", ...exercise } }],
});

const disjoint = (lesson: Record<string, unknown>): ValidationIssue[] =>
  validateLesson(lesson).errors.filter((issue) => issue.id === "E-FREETEXT-DISJOINT");

describe("reproduction (engine#242)", () => {
  it("a distractor that differs only in case contradicts an exercise graded without case", () => {
    const lesson = freeText({ accept: ["I am Anna"], distractors: ["i am Anna"] });
    expect(validateLesson(lesson).valid).toBe(false);
    expect(disjoint(lesson)).toEqual([
      expect.objectContaining({ path: "/steps/0/exercise", params: { shared: ["I am Anna"] } }),
    ]);
  });
});

describe("happy path", () => {
  it("the exercise that teaches capitalisation declares it and is valid", () => {
    const lesson = freeText({ accept: ["I am Anna"], distractors: ["i am Anna"], case_sensitive: true });
    expect(validateLesson(lesson)).toMatchObject({ valid: true, errors: [] });
  });

  it("the schema accepts the declaration on free_text", () => {
    expect(validateLesson(freeText({ accept: ["dog"], case_sensitive: false })).valid).toBe(true);
  });
});

describe("edge cases", () => {
  it("a declaration that is not a boolean is a schema error", () => {
    const result = validateLesson(freeText({ accept: ["dog"], case_sensitive: "yes" }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.id)).toContain("E-SCHEMA");
  });

  it("an exact overlap is reported even where case matters", () => {
    expect(disjoint(freeText({ accept: ["dog"], distractors: ["dog"], case_sensitive: true }))).toHaveLength(1);
  });

  it("an explicit false behaves like the default", () => {
    expect(disjoint(freeText({ accept: ["Dog"], distractors: ["dog"], case_sensitive: false }))).toEqual([
      expect.objectContaining({ params: { shared: ["Dog"] } }),
    ]);
  });
});

describe("boundaries", () => {
  it("case and surrounding whitespace together still make one answer", () => {
    expect(disjoint(freeText({ accept: [" Gracias"], distractors: ["gracias "] }))).toEqual([
      expect.objectContaining({ params: { shared: ["Gracias"] } }),
    ]);
  });

  it("answers that differ only in case are one shared answer, named once in the accept form", () => {
    expect(disjoint(freeText({ accept: ["Dog", "dog"], distractors: ["DOG"] }))).toEqual([
      expect.objectContaining({ params: { shared: ["Dog"] } }),
    ]);
  });
});

const lessonWith = (exercise: Record<string, unknown>): Lesson => freeText(exercise) as unknown as Lesson;

describe("QTI keeps the declaration", () => {
  it("export writes caseSensitive on every mapEntry from the declaration", () => {
    const xml = exportQti(lessonWith({ accept: ["Paris", "paris"], case_sensitive: true }));
    expect(xml).toContain('mapKey="paris" mappedValue="1" caseSensitive="true"');
    const plain = exportQti(lessonWith({ accept: ["Paris", "Paris, France"] }));
    expect(plain).toContain('mapKey="Paris, France" mappedValue="1" caseSensitive="false"');
  });

  it("export keeps a case-sensitive answer without alternates in the mapping", () => {
    const xml = exportQti(lessonWith({ accept: ["Paris"], case_sensitive: true }));
    expect(xml).toContain('mapKey="Paris" mappedValue="1" caseSensitive="true"');
  });

  it("import reads it back, and an answer is listed once", () => {
    for (const exercise of [{ accept: ["Paris", "paris"], case_sensitive: true }, { accept: ["Paris"], case_sensitive: true }]) {
      const imported = importQti(exportQti(lessonWith(exercise))).steps[0]!.exercise!;
      expect(imported).toMatchObject({ accept: exercise.accept, case_sensitive: true });
    }
  });

  it("import leaves the declaration out unless every mapEntry is case-sensitive", () => {
    const imported = importQti(exportQti(lessonWith({ accept: ["Paris", "paris"] }))).steps[0]!.exercise!;
    expect(imported.case_sensitive).toBeUndefined();
    expect(imported.accept).toEqual(["Paris", "paris"]);
  });
});
