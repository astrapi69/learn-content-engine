import { describe, it, expect } from "vitest";

import {
  refReadingComprehensionExtension,
  renderRefReadingComprehension,
  gradeRefReadingComprehension,
} from "./reading-comprehension-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-reading-comprehension:
 * a shared passage (stimulus) bound to N sub-questions. This is the shape the
 * flat core schema (one step = one exercise) cannot express; modelled here as
 * a single ext exercise whose ext_payload carries the passage + questions,
 * so no core-schema change is needed (adaptive-learner#1579, engine#43).
 *
 * Sub-questions reuse the core question shapes (multiple_choice / free_text)
 * inside the opaque payload; a consumer renders each with its existing
 * renderer.
 */

const PASSAGE = "Rex lief in den Garten und bellte den Briefträger an.";

const QUESTIONS = [
  {
    prompt: "Wohin lief Rex?",
    type: "multiple_choice",
    options: [
      { text: "In den Garten", correct: true },
      { text: "Auf die Straße" },
    ],
  },
  {
    prompt: "Wie hieß der Hund?",
    type: "free_text",
    accept: ["Rex"],
  },
];

const rcExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-reading-comprehension",
    prompt: "Lies den Text und beantworte die Fragen.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Reading lesson",
  requires_extensions: ["ext:ref-reading-comprehension@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const wellFormed = { passage: PASSAGE, questions: QUESTIONS };

describe("ext:ref-reading-comprehension end-to-end", () => {
  it("validates a declared + registered reading-comprehension exercise", () => {
    const validated = validateLesson(lessonWith(rcExercise(wellFormed)), {
      extensions: [refReadingComprehensionExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(rcExercise(wellFormed)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a malformed payload shape with a single error", () => {
    const malformed = validateLesson(lessonWith(rcExercise({ passage: PASSAGE })), {
      extensions: [refReadingComprehensionExtension],
    });
    expect(malformed.errors.some((issue) => issue.id === "E-EXT-REFRC-SHAPE")).toBe(true);
  });

  it("requires a non-empty passage", () => {
    const emptyPassage = validateLesson(
      lessonWith(rcExercise({ passage: "  ", questions: QUESTIONS })),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(emptyPassage.errors.some((issue) => issue.id === "E-EXT-REFRC-PASSAGE")).toBe(true);
  });

  it("requires at least one question", () => {
    const noQuestions = validateLesson(
      lessonWith(rcExercise({ passage: PASSAGE, questions: [] })),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(noQuestions.errors.some((issue) => issue.id === "E-EXT-REFRC-QUESTIONS")).toBe(true);
  });

  it("requires every question to carry a non-empty prompt", () => {
    const blankPrompt = validateLesson(
      lessonWith(
        rcExercise({
          passage: PASSAGE,
          questions: [{ prompt: "  ", type: "free_text", accept: ["Rex"] }],
        }),
      ),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(blankPrompt.errors.some((issue) => issue.id === "E-EXT-REFRC-PROMPT")).toBe(true);
  });

  it("rejects an unknown question type", () => {
    const badType = validateLesson(
      lessonWith(
        rcExercise({
          passage: PASSAGE,
          questions: [{ prompt: "Was?", type: "essay", accept: ["x"] }],
        }),
      ),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(badType.errors.some((issue) => issue.id === "E-EXT-REFRC-QTYPE")).toBe(true);
  });

  it("requires a multiple_choice sub-question to have >=2 options and >=1 correct", () => {
    const tooFew = validateLesson(
      lessonWith(
        rcExercise({
          passage: PASSAGE,
          questions: [{ prompt: "Wo?", type: "multiple_choice", options: [{ text: "A", correct: true }] }],
        }),
      ),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(tooFew.errors.some((issue) => issue.id === "E-EXT-REFRC-MC")).toBe(true);

    const noCorrect = validateLesson(
      lessonWith(
        rcExercise({
          passage: PASSAGE,
          questions: [{ prompt: "Wo?", type: "multiple_choice", options: [{ text: "A" }, { text: "B" }] }],
        }),
      ),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(noCorrect.errors.some((issue) => issue.id === "E-EXT-REFRC-MC")).toBe(true);
  });

  it("requires a free_text sub-question to have a non-empty accept list", () => {
    const emptyAccept = validateLesson(
      lessonWith(
        rcExercise({
          passage: PASSAGE,
          questions: [{ prompt: "Wer?", type: "free_text", accept: [] }],
        }),
      ),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(emptyAccept.errors.some((issue) => issue.id === "E-EXT-REFRC-FT")).toBe(true);
  });

  it("boundary: a passage with a single multiple_choice question is the smallest valid payload", () => {
    const minimal = validateLesson(
      lessonWith(
        rcExercise({
          passage: PASSAGE,
          questions: [
            { prompt: "Wo?", type: "multiple_choice", options: [{ text: "Garten", correct: true }, { text: "Strasse" }] },
          ],
        }),
      ),
      { extensions: [refReadingComprehensionExtension] },
    );
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("renders (consumer half) the passage over the numbered questions", () => {
    const rendered = renderRefReadingComprehension(rcExercise(wellFormed));
    expect(rendered).toBe(
      [
        "Lies den Text und beantworte die Fragen.",
        PASSAGE,
        "1. Wohin lief Rex?",
        "2. Wie hieß der Hund?",
      ].join("\n"),
    );
  });

  it("grades (consumer half): per-question, tolerant free_text, exact multiple_choice", () => {
    const exercise = rcExercise(wellFormed);
    expect(gradeRefReadingComprehension(exercise, ["In den Garten", "rex"])).toEqual({
      correct: 2,
      total: 2,
    });
    expect(gradeRefReadingComprehension(exercise, ["Auf die Straße", "Rex"])).toEqual({
      correct: 1,
      total: 2,
    });
    expect(gradeRefReadingComprehension(exercise, ["In den Garten", "Bello"])).toEqual({
      correct: 1,
      total: 2,
    });
  });
});
