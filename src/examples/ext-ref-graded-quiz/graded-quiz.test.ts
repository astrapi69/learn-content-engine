import { describe, it, expect } from "vitest";

import {
  refGradedQuizExtension,
  renderRefGradedQuiz,
  gradeRefGradedQuiz,
} from "./graded-quiz-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-graded-quiz - the
 * school-test decision basis (engine#46): a self-contained scored question
 * set where each question carries ``points``, multi-select questions can award
 * ``partial_credit``, and an optional ``pass_threshold`` decides pass/fail.
 * This demonstrates that the points / partial-credit / pass-threshold concern
 * fits the extension tier without a core-schema change; grading POLICY lives
 * in the consumer half, the payload only carries the metadata.
 */

const QUIZ = {
  pass_threshold: 60,
  questions: [
    {
      prompt: "Was ist 2 + 2?",
      type: "multiple_choice",
      options: [{ text: "4", correct: true }, { text: "5" }],
      points: 2,
    },
    {
      prompt: "Hauptstadt von Frankreich?",
      type: "free_text",
      accept: ["Paris"],
      points: 3,
    },
    {
      prompt: "Welche sind Primzahlen?",
      type: "multiple_choice",
      options: [
        { text: "2", correct: true },
        { text: "3", correct: true },
        { text: "4" },
      ],
      points: 4,
      partial_credit: true,
    },
  ],
};

const quizExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-graded-quiz",
    prompt: "Beantworte alle Fragen.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Graded quiz lesson",
  requires_extensions: ["ext:ref-graded-quiz@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

describe("ext:ref-graded-quiz validation (engine half)", () => {
  it("validates a declared + registered graded quiz", () => {
    const validated = validateLesson(lessonWith(quizExercise(QUIZ)), {
      extensions: [refGradedQuizExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(quizExercise(QUIZ)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a malformed shape with a single error", () => {
    const malformed = validateLesson(lessonWith(quizExercise({ pass_threshold: 60 })), {
      extensions: [refGradedQuizExtension],
    });
    expect(malformed.errors.some((issue) => issue.id === "E-EXT-REFGQ-SHAPE")).toBe(true);
  });

  it("requires at least one question, a prompt, and a known type", () => {
    const noQuestions = validateLesson(lessonWith(quizExercise({ questions: [] })), {
      extensions: [refGradedQuizExtension],
    });
    expect(noQuestions.errors.some((issue) => issue.id === "E-EXT-REFGQ-QUESTIONS")).toBe(true);

    const blankPrompt = validateLesson(
      lessonWith(quizExercise({ questions: [{ prompt: " ", type: "free_text", accept: ["x"], points: 1 }] })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(blankPrompt.errors.some((issue) => issue.id === "E-EXT-REFGQ-PROMPT")).toBe(true);

    const badType = validateLesson(
      lessonWith(quizExercise({ questions: [{ prompt: "x", type: "essay", accept: ["x"], points: 1 }] })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(badType.errors.some((issue) => issue.id === "E-EXT-REFGQ-QTYPE")).toBe(true);
  });

  it("enforces multiple_choice / free_text sub-question shape", () => {
    const badMc = validateLesson(
      lessonWith(quizExercise({ questions: [{ prompt: "x", type: "multiple_choice", options: [{ text: "a", correct: true }], points: 1 }] })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(badMc.errors.some((issue) => issue.id === "E-EXT-REFGQ-MC")).toBe(true);

    const badFt = validateLesson(
      lessonWith(quizExercise({ questions: [{ prompt: "x", type: "free_text", accept: [], points: 1 }] })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(badFt.errors.some((issue) => issue.id === "E-EXT-REFGQ-FT")).toBe(true);
  });

  it("requires positive points on every question", () => {
    const zeroPoints = validateLesson(
      lessonWith(quizExercise({ questions: [{ prompt: "x", type: "free_text", accept: ["x"], points: 0 }] })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(zeroPoints.errors.some((issue) => issue.id === "E-EXT-REFGQ-POINTS")).toBe(true);
  });

  it("rejects a pass_threshold outside 0..100", () => {
    const tooHigh = validateLesson(
      lessonWith(quizExercise({ ...QUIZ, pass_threshold: 120 })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(tooHigh.errors.some((issue) => issue.id === "E-EXT-REFGQ-THRESHOLD")).toBe(true);
  });

  it("boundary: a single-question quiz with no pass_threshold is valid", () => {
    const minimal = validateLesson(
      lessonWith(quizExercise({ questions: [{ prompt: "x", type: "free_text", accept: ["x"], points: 1 }] })),
      { extensions: [refGradedQuizExtension] },
    );
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });
});

describe("ext:ref-graded-quiz consumer half", () => {
  it("renders the questions with their point values and pass threshold", () => {
    const rendered = renderRefGradedQuiz(quizExercise(QUIZ));
    expect(rendered).toContain("Beantworte alle Fragen.");
    expect(rendered).toContain("1. Was ist 2 + 2? (2 P.)");
    expect(rendered).toContain("2. Hauptstadt von Frankreich? (3 P.)");
    expect(rendered).toContain("Bestehensschwelle: 60%");
  });

  it("grades full marks and passes", () => {
    const result = gradeRefGradedQuiz(quizExercise(QUIZ), [["4"], ["Paris"], ["2", "3"]]);
    expect(result.earned).toBe(9);
    expect(result.total).toBe(9);
    expect(result.passed).toBe(true);
  });

  it("awards partial credit on a multi-select question (proportional)", () => {
    // Q3: one of two correct picked -> 0.5 * 4 = 2 points; total 2+3+2 = 7 -> pass
    const result = gradeRefGradedQuiz(quizExercise(QUIZ), [["4"], ["Paris"], ["2"]]);
    expect(result.earned).toBe(7);
    expect(result.passed).toBe(true);
  });

  it("penalises a wrong pick under partial credit, and can drop below the threshold", () => {
    // Q3: one correct + one wrong -> max(0, 1-1)/2 * 4 = 0; total 2+3+0 = 5 -> 55.5% < 60 -> fail
    const result = gradeRefGradedQuiz(quizExercise(QUIZ), [["4"], ["Paris"], ["2", "4"]]);
    expect(result.earned).toBe(5);
    expect(result.passed).toBe(false);
  });

  it("grades free_text tolerantly (trim + case-fold) and fails a wrong quiz", () => {
    const tolerant = gradeRefGradedQuiz(quizExercise(QUIZ), [["4"], ["  paris "], ["2", "3"]]);
    expect(tolerant.earned).toBe(9);

    const failing = gradeRefGradedQuiz(quizExercise(QUIZ), [["5"], ["Berlin"], ["4"]]);
    expect(failing.earned).toBe(0);
    expect(failing.passed).toBe(false);
  });

  it("passes any non-zero score when no pass_threshold is set", () => {
    const noThreshold = quizExercise({
      questions: [{ prompt: "x", type: "free_text", accept: ["ok"], points: 1 }],
    });
    expect(gradeRefGradedQuiz(noThreshold, [["ok"]]).passed).toBe(true);
    expect(gradeRefGradedQuiz(noThreshold, [["nope"]]).passed).toBe(true); // no threshold -> always "passed"
  });
});
