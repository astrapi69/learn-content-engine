import { describe, it, expect } from "vitest";

import { parseLesson, type LessonSetContext } from "./content-engine.js";
import { validateLesson } from "./validate.js";

/**
 * Feature: native `multiple_choice` exercise type (Bucket B). Coexists with the
 * `cloze` select/multiselect vehicle (no deprecation): a first-class type with
 * `options` ({text, correct?}) and `multiple` (false = exactly one correct,
 * true = "select all that apply"). Structure makes the accept/distractor
 * disjointness rule unnecessary - correctness is a per-option flag.
 * Schema bump 1.5 -> 1.6 (new type = minor bump per the ExerciseType policy).
 */

const CTX: LessonSetContext = {
  language: "de",
  target_language: "de",
  source_language: "de",
  domain: "knowledge",
};

const mcLesson = (exercise: Record<string, unknown>): Record<string, unknown> => ({
  id: "l1",
  title: "Vorfahrt",
  steps: [
    {
      id: "s1",
      type: "exercise",
      exercise: {
        id: "mc1",
        type: "multiple_choice",
        prompt: "Wer hat an einer Kreuzung ohne Zeichen Vorfahrt?",
        ...exercise,
      },
    },
  ],
  cards: [],
});

const SINGLE = mcLesson({
  options: [
    { text: "Wer von rechts kommt", correct: true },
    { text: "Wer von links kommt" },
    { text: "Das groessere Fahrzeug" },
  ],
});

const MULTI = mcLesson({
  multiple: true,
  options: [
    { text: "2", correct: true },
    { text: "3", correct: true },
    { text: "4" },
  ],
});

describe("multiple_choice - validation (positive)", () => {
  it("accepts a single-answer multiple_choice (exactly one correct)", () => {
    const result = validateLesson(SINGLE);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a select-all multiple_choice (multiple: true, >= 1 correct)", () => {
    const result = validateLesson(MULTI);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("multiple_choice - validation (negative)", () => {
  it("rejects fewer than two options", () => {
    const result = validateLesson(mcLesson({ options: [{ text: "only one", correct: true }] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MC-OPTIONS")).toBe(true);
  });

  it("rejects missing options entirely", () => {
    const result = validateLesson(mcLesson({}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MC-OPTIONS")).toBe(true);
  });

  it("rejects single-answer mode without exactly one correct (zero correct)", () => {
    const result = validateLesson(
      mcLesson({ options: [{ text: "a" }, { text: "b" }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MC-ONE-CORRECT")).toBe(true);
  });

  it("rejects single-answer mode with two corrects", () => {
    const result = validateLesson(
      mcLesson({ options: [{ text: "a", correct: true }, { text: "b", correct: true }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MC-ONE-CORRECT")).toBe(true);
  });

  it("rejects select-all mode with zero correct options", () => {
    const result = validateLesson(
      mcLesson({ multiple: true, options: [{ text: "a" }, { text: "b" }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MC-MIN-CORRECT")).toBe(true);
  });

  it("rejects an option with an unknown extra field (strict)", () => {
    const result = validateLesson(
      mcLesson({ options: [{ text: "a", correct: true, hint: "no" }, { text: "b" }] }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate option texts (the text IS the option - genuinely ambiguous)", () => {
    const result = validateLesson(
      mcLesson({ options: [{ text: "same", correct: true }, { text: "same" }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.id === "E-MC-DUP-OPTION")).toBe(true);
  });
});

describe("multiple_choice - schema version + round-trip", () => {
  it("x-schema-version is at least the 1.6 multiple_choice bump (currently 1.7)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const schema = JSON.parse(
      readFileSync(fileURLToPath(new URL("../schema/lesson.schema.json", import.meta.url)), "utf8"),
    ) as Record<string, unknown>;
    // multiple_choice shipped in 1.6; later additive bumps (e.g. 1.7 extensions)
    // keep it valid, so pin the floor rather than the exact version.
    expect(Number(schema["x-schema-version"])).toBeGreaterThanOrEqual(1.6);
  });

  it("round-trips typed onto the canonical object", () => {
    const lesson = parseLesson(JSON.stringify(SINGLE), CTX);
    const exercise = lesson.steps[0]!.exercise!;
    expect(exercise.type).toBe("multiple_choice");
    expect(exercise.multiple ?? false).toBe(false);
    expect(exercise.options).toEqual([
      { text: "Wer von rechts kommt", correct: true },
      { text: "Wer von links kommt" },
      { text: "Das groessere Fahrzeug" },
    ]);
  });

  it("existing cloze select/multiselect stay valid (coexistence, no deprecation)", () => {
    const clozeSelect = {
      id: "l2",
      title: "Capital",
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "c1",
            type: "cloze",
            cloze_mode: "select",
            prompt: "Choose.",
            sentence: "Paris is the capital of ___.",
            blanks: [{ accept: ["France"] }],
            distractors: ["Germany", "Spain"],
          },
        },
      ],
    };
    expect(validateLesson(clozeSelect).valid).toBe(true);
  });
});
