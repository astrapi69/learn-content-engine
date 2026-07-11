import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { importQti, exportQti, qtiLessonAdapter, QtiImportError } from "./index.js";
import { parseLesson, type LessonSetContext } from "../content-engine.js";
import { validateLesson } from "../validate.js";
import type { ContentLesson } from "../types/index.js";
import type { Lesson } from "../types/lesson-schema.generated.js";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

const firstExercise = (lesson: ContentLesson) => lesson.steps[0]!.exercise!;

describe("importQti - choiceInteraction -> multiple_choice", () => {
  it("maps single cardinality to a single multiple_choice (no 'multiple' flag)", () => {
    const lesson = importQti(fixture("choice_single.xml"));
    const exercise = firstExercise(lesson);
    expect(exercise.type).toBe("multiple_choice");
    expect(exercise.prompt).toBe("What is the capital of France?");
    expect(exercise.multiple).toBeUndefined();
    expect(exercise.options).toEqual([
      { text: "Paris", correct: true },
      { text: "London" },
      { text: "Berlin" },
    ]);
  });

  it("maps multiple cardinality to multiple_choice with multiple: true and every correct option", () => {
    const lesson = importQti(fixture("choice_multiple.xml"));
    const exercise = firstExercise(lesson);
    expect(exercise.multiple).toBe(true);
    expect(exercise.options).toEqual([
      { text: "2", correct: true },
      { text: "4" },
      { text: "3", correct: true },
    ]);
  });
});

describe("importQti - textEntryInteraction -> free_text", () => {
  it("maps the correct response plus mapping entries to accept[]", () => {
    const lesson = importQti(fixture("text_entry.xml"));
    const exercise = firstExercise(lesson);
    expect(exercise.type).toBe("free_text");
    expect(exercise.prompt).toBe("Say hello in French.");
    expect(exercise.accept).toEqual(["bonjour", "salut"]);
  });
});

describe("importQti - matchInteraction -> matching", () => {
  it("maps directed pairs to {left, right} against both match sets", () => {
    const lesson = importQti(fixture("match.xml"));
    const exercise = firstExercise(lesson);
    expect(exercise.type).toBe("matching");
    expect(exercise.prompt).toBe("Match each colour to its translation.");
    expect(exercise.pairs).toEqual([
      { left: "rouge", right: "red" },
      { left: "bleu", right: "blue" },
    ]);
  });
});

describe("importQti - assessmentTest with multiple items", () => {
  it("maps each assessmentItem to one exercise step and keeps lesson identity", () => {
    const lesson = importQti(fixture("assessment_test.xml"));
    expect(lesson.id).toBe("lesson-de");
    expect(lesson.title).toBe("Deutsch Quiz");
    expect(lesson.steps).toHaveLength(2);
    expect(lesson.steps[0]!.exercise!.type).toBe("multiple_choice");
    expect(lesson.steps[1]!.exercise!.type).toBe("free_text");
  });

  it("preserves UTF-8 umlauts verbatim (no entity mangling)", () => {
    const lesson = importQti(fixture("assessment_test.xml"));
    expect(lesson.steps[0]!.exercise!.options![0]!.text).toBe("Kärnten");
    expect(lesson.steps[1]!.exercise!.accept).toEqual(["Grüße"]);
  });
});

describe("importQti - validation gate + loud failure", () => {
  it("every imported lesson passes validateLesson", () => {
    for (const name of ["choice_single.xml", "choice_multiple.xml", "text_entry.xml", "match.xml", "assessment_test.xml"]) {
      const lesson = importQti(fixture(name));
      const result = validateLesson(lesson);
      expect(result.errors, `${name} should validate`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("throws a QtiImportError that names the item and the unsupported interaction", () => {
    let thrown: unknown;
    try {
      importQti(fixture("unsupported_order.xml"));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(QtiImportError);
    const issues = (thrown as QtiImportError).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.itemIdentifier).toBe("q-order");
    expect(issues[0]!.interaction).toBe("orderInteraction");
  });

  it("throws when the assessment contains no items", () => {
    expect(() => importQti(fixture("empty_test.xml"))).toThrow(QtiImportError);
  });
});

describe("qtiLessonAdapter at the parseLesson seam", () => {
  const context: LessonSetContext = {
    language: "de",
    target_language: "de",
    source_language: "en",
    domain: "language",
  };

  it("plugs into parseLesson and injects the set context language pair", () => {
    const lesson = parseLesson(fixture("choice_single.xml"), context, qtiLessonAdapter);
    expect(lesson.steps[0]!.exercise!.type).toBe("multiple_choice");
    expect(lesson.target_language).toBe("de");
    expect(lesson.source_language).toBe("en");
    expect(lesson.domain).toBe("language");
  });
});

describe("exportQti", () => {
  it("emits a choiceInteraction with the right cardinality and correct response", () => {
    const lesson = importQti(fixture("choice_single.xml"));
    const xml = exportQti(lesson);
    expect(xml).toContain('cardinality="single"');
    expect(xml).toContain("<choiceInteraction");
    expect(xml).toContain("Paris");
  });

  it("XML-escapes markup characters but leaves umlauts as real UTF-8", () => {
    const lesson = importQti(fixture("assessment_test.xml"));
    const xml = exportQti(lesson);
    expect(xml).toContain("Kärnten");
    expect(xml).not.toContain("K&#");
  });
});

describe("round-trip import(export(lesson))", () => {
  const build = (steps: Lesson["steps"]): Lesson => ({ id: "rt", title: "Round trip", cards: [], steps });

  const cases: Record<string, Lesson> = {
    "multiple_choice single": build([
      { id: "e1", type: "exercise", exercise: { id: "e1", type: "multiple_choice", prompt: "Pick one", options: [{ text: "a", correct: true }, { text: "b" }] } },
    ]),
    "multiple_choice multiple": build([
      { id: "e1", type: "exercise", exercise: { id: "e1", type: "multiple_choice", prompt: "Pick many", multiple: true, options: [{ text: "a", correct: true }, { text: "b", correct: true }, { text: "c" }] } },
    ]),
    "free_text": build([
      { id: "e1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "Say hi", accept: ["hi", "hello"] } },
    ]),
    "matching": build([
      { id: "e1", type: "exercise", exercise: { id: "e1", type: "matching", prompt: "Match", pairs: [{ left: "rouge", right: "red" }, { left: "bleu", right: "blue" }] } },
    ]),
    "mixed lesson": build([
      { id: "e1", type: "exercise", exercise: { id: "e1", type: "multiple_choice", prompt: "One", options: [{ text: "a", correct: true }, { text: "b" }] } },
      { id: "e2", type: "exercise", exercise: { id: "e2", type: "free_text", prompt: "Two", accept: ["x"] } },
    ]),
  };

  for (const [name, lesson] of Object.entries(cases)) {
    it(`preserves content for ${name}`, () => {
      const round = importQti(exportQti(lesson));
      expect(round.id).toBe(lesson.id);
      expect(round.title).toBe(lesson.title);
      expect(round.steps.map((s) => s.exercise)).toEqual(lesson.steps.map((s) => s.exercise));
    });
  }
});
