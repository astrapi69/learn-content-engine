import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { parseLesson } from "./content-engine.js";
import { QUALITY_MINIMUMS, validateLessonQuality } from "./quality.js";
import * as rulesEntry from "./rules.js";
import type { Lesson } from "./types/lesson-schema.generated.js";
import { validateLesson, type ValidationIssue } from "./validate.js";

/**
 * engine#185: the quality minimums in the engine, keyed to what a lesson is
 * for. Three versions (the content template's gate, alc-books' copy, the app's
 * share check) applied the numbers of schema/quality-rules.json with different
 * exemptions and a different count for `from_cards`. The engine writes the one
 * version: a lesson declares its `purpose`, and the minimums follow from it.
 * The minimums are a publication threshold, not validity: validateLesson never
 * reports them.
 */

type StepInput = Record<string, unknown>;

const theory = (id = "t1"): StepInput => ({ id, type: "theory", body: "Read this." });
const exerciseStep = (id: string, exercise: Record<string, unknown>): StepInput => ({ id, type: "exercise", exercise });
const freeText = (id: string, accept: string[] = ["a", "b"]): StepInput =>
  exerciseStep(`s-${id}`, { id, type: "free_text", prompt: "?", accept });
const multipleChoice = (id: string): StepInput =>
  exerciseStep(`s-${id}`, {
    id,
    type: "multiple_choice",
    prompt: "?",
    options: [
      { text: "yes", correct: true },
      { text: "no", correct: false },
    ],
  });
const pairsOf = (count: number): Array<{ left: string; right: string }> =>
  Array.from({ length: count }, (_, i) => ({ left: `l${i}`, right: `r${i}` }));
const matching = (id: string, pairCount = 3): StepInput =>
  exerciseStep(`s-${id}`, { id, type: "matching", prompt: "?", pairs: pairsOf(pairCount) });

const lessonOf = (steps: StepInput[], extra: Record<string, unknown> = {}): Lesson =>
  ({ id: "l1", title: "Lesson", steps, ...extra }) as unknown as Lesson;

/** Theory plus five exercises of two types: meets every minimum. */
const passingSteps = (): StepInput[] => [
  theory(),
  freeText("f1"),
  freeText("f2"),
  freeText("f3"),
  matching("m1"),
  matching("m2"),
];

const ids = (issues: ValidationIssue[]): string[] => issues.map((issue) => issue.id);
const qualityIssues = (lesson: Lesson): ValidationIssue[] => validateLessonQuality(lesson).errors;
const withId = (issues: ValidationIssue[], id: string): ValidationIssue[] => issues.filter((issue) => issue.id === id);

describe("reproductions (engine#185)", () => {
  it("a bridge lesson with two exercises passes: alc-books' id heuristic becomes a declared purpose", () => {
    const bridge = lessonOf([theory(), freeText("f1"), matching("m1")], { id: "01-einleitung", purpose: "bridge" });
    expect(validateLessonQuality(bridge)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("the same lesson without a purpose is below the exercise minimum", () => {
    const practice = lessonOf([theory(), freeText("f1"), matching("m1")], { id: "01-einleitung" });
    expect(ids(qualityIssues(practice))).toEqual(["E-QUALITY-EXERCISES"]);
  });

  it("a quiz of one exercise type passes: the template's multiple-choice exemption becomes a declared purpose", () => {
    const quiz = lessonOf([theory(), ...["q1", "q2", "q3", "q4", "q5"].map(multipleChoice)], { purpose: "quiz" });
    expect(validateLessonQuality(quiz).valid).toBe(true);
  });

  it("matching with from_cards counts the derived pairs, as the app's raw pairs count did not", () => {
    const cards = ["c1", "c2", "c3"].map((id) => ({ id, front: id, back: id.toUpperCase() }));
    const steps = [
      ...passingSteps().slice(0, 5),
      exerciseStep("s-m2", { id: "m2", type: "matching", prompt: "?", from_cards: true, card_ids: ["c1", "c2", "c3"] }),
    ];
    expect(qualityIssues(lessonOf(steps, { cards }))).toEqual([]);
  });

  it("free_text and picture_choice need no distractors any more", () => {
    const pictureChoice = exerciseStep("s-p1", {
      id: "p1",
      type: "picture_choice",
      prompt: "?",
      images: [
        { src: "assets/a.png", label: "a", is_correct: "true" },
        { src: "assets/b.png", label: "b" },
      ],
    });
    const steps = [theory(), freeText("f1"), freeText("f2"), freeText("f3"), matching("m1"), pictureChoice];
    expect(qualityIssues(lessonOf(steps))).toEqual([]);
  });
});

describe("happy path", () => {
  it("a lesson that meets every minimum is valid and carries no issues", () => {
    expect(validateLessonQuality(lessonOf(passingSteps()))).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("an explicit practice purpose is the same as none", () => {
    expect(validateLessonQuality(lessonOf(passingSteps(), { purpose: "practice" })).valid).toBe(true);
  });

  it("the numbers are those of schema/quality-rules.json", () => {
    const file = JSON.parse(
      readFileSync(fileURLToPath(new URL("../schema/quality-rules.json", import.meta.url)), "utf8"),
    ) as { rules: Record<string, number> };
    expect(QUALITY_MINIMUMS).toEqual(file.rules);
  });

  it("is reachable through the rules entry, next to validateLessonRules", () => {
    expect(rulesEntry.validateLessonQuality).toBe(validateLessonQuality);
    expect(rulesEntry.QUALITY_MINIMUMS).toBe(QUALITY_MINIMUMS);
  });
});

describe("each minimum, with its params", () => {
  it("too few exercises: count and minimum at /steps", () => {
    const [issue] = qualityIssues(lessonOf([theory(), freeText("f1"), matching("m1")]));
    expect(issue).toMatchObject({ id: "E-QUALITY-EXERCISES", path: "/steps", severity: "error", params: { count: 2, min: 5 } });
    expect(issue!.docAnchor).toBe("docs/lesson-format.md#quality-minimums");
  });

  it("too few exercise types: count, minimum and the types found", () => {
    const steps = [theory(), ...["f1", "f2", "f3", "f4", "f5"].map((id) => freeText(id))];
    const [issue] = qualityIssues(lessonOf(steps));
    expect(issue).toMatchObject({ id: "E-QUALITY-TYPES", path: "/steps", params: { count: 1, min: 2, types: ["free_text"] } });
  });

  it("no theory step", () => {
    const [issue] = qualityIssues(lessonOf(passingSteps().slice(1)));
    expect(issue).toMatchObject({ id: "E-QUALITY-THEORY", path: "/steps", params: { count: 0, min: 1 } });
  });

  it("a free_text with one accepted answer, at its exercise", () => {
    const steps = [...passingSteps().slice(0, 5), freeText("f9", ["only"])];
    const [issue] = qualityIssues(lessonOf(steps));
    expect(issue).toMatchObject({
      id: "E-QUALITY-FREETEXT-ACCEPTS",
      path: "/steps/5/exercise",
      params: { count: 1, min: 2 },
    });
  });

  it("a matching with two pairs, at its exercise", () => {
    const steps = [...passingSteps().slice(0, 5), matching("m9", 2)];
    const [issue] = qualityIssues(lessonOf(steps));
    expect(issue).toMatchObject({ id: "E-QUALITY-MATCHING-PAIRS", path: "/steps/5/exercise", params: { count: 2, min: 3 } });
  });

  it("reports every shortfall at once", () => {
    const steps = [freeText("f1", ["only"])];
    expect(ids(qualityIssues(lessonOf(steps))).sort()).toEqual([
      "E-QUALITY-EXERCISES",
      "E-QUALITY-FREETEXT-ACCEPTS",
      "E-QUALITY-THEORY",
      "E-QUALITY-TYPES",
    ]);
  });
});

describe("edge cases", () => {
  it("a bridge lesson keeps every other minimum", () => {
    const bridge = lessonOf([freeText("f1"), freeText("f2", ["only"])], { purpose: "bridge" });
    expect(ids(qualityIssues(bridge)).sort()).toEqual(["E-QUALITY-FREETEXT-ACCEPTS", "E-QUALITY-THEORY", "E-QUALITY-TYPES"]);
  });

  it("a quiz keeps the exercise minimum", () => {
    const quiz = lessonOf([theory(), multipleChoice("q1"), multipleChoice("q2")], { purpose: "quiz" });
    expect(ids(qualityIssues(quiz))).toEqual(["E-QUALITY-EXERCISES"]);
  });

  it("from_cards counts only the card_ids that resolve to a card, as parsing does", () => {
    const cards = ["c1", "c2"].map((id) => ({ id, front: id, back: id.toUpperCase() }));
    const steps = [
      ...passingSteps().slice(0, 5),
      exerciseStep("s-m2", { id: "m2", type: "matching", prompt: "?", from_cards: true, card_ids: ["c1", "c2", "missing"] }),
    ];
    const issues = withId(qualityIssues(lessonOf(steps, { cards })), "E-QUALITY-MATCHING-PAIRS");
    expect(issues.map((issue) => issue.params)).toEqual([{ count: 2, min: 3 }]);
  });

  it("gives a parsed lesson (from_cards resolved to pairs) the same answer as its source", () => {
    const cards = ["c1", "c2", "c3"].map((id) => ({ id, front: id, back: id.toUpperCase() }));
    const steps = [
      ...passingSteps().slice(0, 5),
      exerciseStep("s-m2", { id: "m2", type: "matching", prompt: "?", from_cards: true, card_ids: ["c1", "c2", "c3"] }),
    ];
    const source = lessonOf(steps, { cards });
    const parsed = parseLesson(JSON.stringify(source), { language: "fr", target_language: "fr", source_language: "en", domain: "language" });
    expect(validateLessonQuality(parsed as unknown as Lesson)).toEqual(validateLessonQuality(source));
  });

  it("an extension exercise counts as an exercise and its type as a type", () => {
    const steps = [
      theory(),
      ...["f1", "f2", "f3", "f4"].map((id) => freeText(id)),
      exerciseStep("s-x1", { id: "x1", type: "ext:acme-order", prompt: "?", ext_payload: {} }),
    ];
    expect(qualityIssues(lessonOf(steps, { requires_extensions: ["ext:acme-order@1"] }))).toEqual([]);
  });

  it("an exercise step without its payload is not counted (validateLesson reports it)", () => {
    const steps = [...passingSteps().slice(0, 5), { id: "s-empty", type: "exercise" }];
    expect(withId(qualityIssues(lessonOf(steps)), "E-QUALITY-EXERCISES")[0]?.params).toEqual({ count: 4, min: 5 });
  });
});

describe("boundaries", () => {
  it("exactly the exercise minimum passes, one below does not", () => {
    expect(qualityIssues(lessonOf(passingSteps()))).toEqual([]);
    expect(ids(qualityIssues(lessonOf(passingSteps().slice(0, 5))))).toEqual(["E-QUALITY-EXERCISES"]);
  });

  it("exactly two accepted answers and exactly three pairs pass", () => {
    const steps = [theory(), freeText("f1", ["a", "b"]), freeText("f2"), freeText("f3"), matching("m1", 3), matching("m2", 3)];
    expect(qualityIssues(lessonOf(steps))).toEqual([]);
  });
});

describe("the purpose field in the schema (1.17)", () => {
  const validLesson = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "l1",
    title: "Lesson",
    steps: [{ id: "t1", type: "theory", body: "Read this." }],
    ...extra,
  });

  it.each(["practice", "bridge", "quiz"])("accepts purpose %s", (purpose) => {
    expect(validateLesson(validLesson({ purpose })).valid).toBe(true);
  });

  it("stays optional: a lesson without it validates unchanged", () => {
    expect(validateLesson(validLesson()).valid).toBe(true);
  });

  it("rejects a value outside the three", () => {
    const result = validateLesson(validLesson({ purpose: "exam" }));
    expect(result.valid).toBe(false);
    expect(ids(result.errors)).toContain("E-SCHEMA");
  });

  it("does not make the minimums a validity rule: a one-step lesson stays valid", () => {
    const result = validateLesson(validLesson());
    expect([...result.errors, ...result.warnings].filter((issue) => issue.id.startsWith("E-QUALITY-"))).toEqual([]);
  });
});
