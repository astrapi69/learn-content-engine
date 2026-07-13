import { describe, it, expect } from "vitest";

import {
  canonicalCorrection,
  refErrorCorrectionExtension,
  renderRefErrorCorrection,
  gradeRefErrorCorrection,
} from "./error-correction-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-error-correction ("mark
 * the wrong token and correct it") - the second adoption candidate from the
 * external review (adaptive-learner#1579). Mirrors the ref-ordering test:
 * declared + registered validates, undeclared is refused loudly, payload
 * errors surface, and the consumer half renders and grades.
 */

const errorCorrectionExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-error-correction",
    prompt: "Ein Wort ist falsch - tippe es an und korrigiere es",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Error-correction lesson",
  requires_extensions: ["ext:ref-error-correction@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const DATIVE_SLIP = {
  tokens: ["Der", "Hund", "folgt", "das", "Kommando"],
  error_index: 3,
  accept: ["dem", "einem"],
};

describe("ext:ref-error-correction end-to-end", () => {
  it("validates a declared + registered error-correction exercise", () => {
    const validated = validateLesson(lessonWith(errorCorrectionExercise(DATIVE_SLIP)), {
      extensions: [refErrorCorrectionExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(errorCorrectionExercise(DATIVE_SLIP)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("requires tokens as a string array with at least two non-empty entries", () => {
    const tooFew = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, tokens: ["Hund"] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(tooFew.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-TOKENS")).toBe(true);

    const blankToken = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, tokens: ["Der", " ", "folgt"] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(blankToken.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-EMPTY")).toBe(true);
  });

  it("requires error_index to be an integer inside the token range", () => {
    const outOfRange = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, error_index: 5 })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(outOfRange.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-INDEX")).toBe(true);

    const fractional = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, error_index: 1.5 })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(fractional.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-INDEX")).toBe(true);
  });

  it("requires a non-empty accept list of non-empty corrections", () => {
    const emptyList = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, accept: [] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(emptyList.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-CORRECTION")).toBe(true);

    const blankEntry = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, accept: ["dem", " "] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(blankEntry.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-CORRECTION")).toBe(true);
  });

  it("rejects an accept entry equal to the marked token (no error to fix)", () => {
    const noop = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, accept: ["dem", "das"] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(noop.errors.some((issue) => issue.id === "E-EXT-REFERRCORR-NOOP")).toBe(true);
  });

  it("boundary: the first and the last token are valid error positions", () => {
    const firstToken = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, error_index: 0, accept: ["Die"] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(firstToken.valid).toBe(true);

    const lastToken = validateLesson(
      lessonWith(errorCorrectionExercise({ ...DATIVE_SLIP, error_index: 4, accept: ["Signal"] })),
      { extensions: [refErrorCorrectionExtension] },
    );
    expect(lastToken.valid).toBe(true);
  });

  it("renders (consumer half) the prompt over the numbered token row", () => {
    const rendered = renderRefErrorCorrection(errorCorrectionExercise(DATIVE_SLIP));
    expect(rendered).toBe(
      "Ein Wort ist falsch - tippe es an und korrigiere es\n1. Der\n2. Hund\n3. folgt\n4. das\n5. Kommando",
    );
  });

  it("grades (consumer half): right token + ANY accepted correction, tolerant of case and padding", () => {
    const exercise = errorCorrectionExercise(DATIVE_SLIP);
    expect(gradeRefErrorCorrection(exercise, 3, "dem")).toBe(true);
    expect(gradeRefErrorCorrection(exercise, 3, "einem")).toBe(true); // second accept entry
    expect(gradeRefErrorCorrection(exercise, 3, "  Dem ")).toBe(true);
    expect(gradeRefErrorCorrection(exercise, 3, "den")).toBe(false);
    expect(gradeRefErrorCorrection(exercise, 2, "dem")).toBe(false);
  });

  it("exposes the canonical correction (accept[0]) for the solution display", () => {
    const exercise = errorCorrectionExercise(DATIVE_SLIP);
    expect(canonicalCorrection(exercise)).toBe("dem");
    expect(canonicalCorrection(errorCorrectionExercise({ tokens: ["a", "b"] }))).toBeNull();
  });
});
