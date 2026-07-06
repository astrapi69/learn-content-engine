import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { parseLesson, type LessonSetContext } from "./content-engine.js";
import { validateLesson } from "./validate.js";
import type { ContentLessonInlineExample } from "./types/index.js";

/**
 * Conformance round-trip (TEIL A). For every exercise type / mode and the
 * field-variant fixture, this proves TWO things at once:
 *   1. The field survives the parse unchanged and typed on the canonical object
 *      (typed access, not a cast).
 *   2. The parsed canonical object is itself schema-valid (validateLesson).
 * Together: the engine carries the whole exercise-type catalog end to end.
 */

const CTX: LessonSetContext = {
  language: "fr",
  target_language: "fr",
  source_language: "de",
  domain: "language",
};

const raw = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/conformance/${name}.json`, import.meta.url)), "utf8");
const parseConformance = (name: string) => parseLesson(raw(name), CTX);
const exerciseOf = (name: string) => parseConformance(name).steps[0]!.exercise!;

describe("Conformance round-trip — every exercise type parses + validates", () => {
  it("matching: pairs arrive typed and the lesson validates", () => {
    const exercise = exerciseOf("matching");
    expect(exercise.type).toBe("matching");
    expect(exercise.pairs).toEqual([
      { left: "bonjour", right: "hallo" },
      { left: "merci", right: "danke" },
    ]);
    expect(validateLesson(JSON.parse(raw("matching"))).valid).toBe(true);
  });

  it("picture_choice: images arrive with exactly one correct", () => {
    const exercise = exerciseOf("picture_choice");
    expect(exercise.type).toBe("picture_choice");
    expect(exercise.images?.filter((image) => image.is_correct === "true")).toHaveLength(1);
    expect(validateLesson(JSON.parse(raw("picture_choice"))).valid).toBe(true);
  });

  it("free_text: accept list arrives typed", () => {
    const exercise = exerciseOf("free_text");
    expect(exercise.type).toBe("free_text");
    expect(exercise.accept).toEqual(["bonjour", "Bonjour"]);
    expect(validateLesson(JSON.parse(raw("free_text"))).valid).toBe(true);
  });

  it("word_tiles: tiles + accept_orderings arrive typed", () => {
    const exercise = exerciseOf("word_tiles");
    expect(exercise.type).toBe("word_tiles");
    expect(exercise.tiles).toEqual(["je", "suis", "ici"]);
    expect(exercise.accept_orderings).toEqual([[0, 1, 2]]);
    expect(validateLesson(JSON.parse(raw("word_tiles"))).valid).toBe(true);
  });

  it("cloze (type): sentence markers match blanks", () => {
    const exercise = exerciseOf("cloze_type");
    expect(exercise.cloze_mode).toBe("type");
    expect((exercise.sentence ?? "").split("___").length - 1).toBe(exercise.blanks?.length);
    expect(validateLesson(JSON.parse(raw("cloze_type"))).valid).toBe(true);
  });

  it("cloze (select): single multiple choice with a distractor pool", () => {
    const exercise = exerciseOf("cloze_select");
    expect(exercise.cloze_mode).toBe("select");
    expect(exercise.distractors).toEqual(["Germany", "Spain"]);
    expect(validateLesson(JSON.parse(raw("cloze_select"))).valid).toBe(true);
  });

  it("cloze (multiselect): disjoint accept + distractors, no blanks", () => {
    const exercise = exerciseOf("cloze_multiselect");
    expect(exercise.cloze_mode).toBe("multiselect");
    expect(exercise.accept).toEqual(["2", "3", "5"]);
    expect(exercise.distractors).toEqual(["4", "6"]);
    expect(exercise.blanks ?? null).toBeNull();
    expect(validateLesson(JSON.parse(raw("cloze_multiselect"))).valid).toBe(true);
  });
});

describe("Conformance round-trip — field variants arrive typed", () => {
  const lesson = parseConformance("field-variants");

  it("1.5 inline examples on a theory step (text + code), typed", () => {
    const examples: ContentLessonInlineExample[] = lesson.steps[0]!.examples ?? [];
    expect(examples).toHaveLength(2);
    expect(examples[0]!.language).toBeUndefined();
    expect(examples[1]!.language).toBe("python");
  });

  it("1.4 example_url + example_label coexist with the 1.5 examples", () => {
    const theory = lesson.steps[0]!;
    expect(theory.example_url).toBe("https://example.test/greetings");
    expect(theory.example_label).toBe("See a worked example");
  });

  it("1.5 inline examples on an exercise + the 1.2 direction field", () => {
    const exercise = lesson.steps[1]!.exercise!;
    expect(exercise.direction).toBe("source_to_target");
    expect(exercise.examples).toEqual([{ language: "python", content: "greeting = 'bonjour'" }]);
  });

  it("card token_roles, a code media_type card and lesson resources arrive typed", () => {
    expect(lesson.cards[0]!.token_roles).toEqual([{ token: "bonjour", role: "noun" }]);
    expect(lesson.cards[1]!.media_type).toBe("code");
    expect(lesson.cards[1]!.code_snippet).toBe("[n * n for n in range(5)]");
    expect(lesson.resources?.[0]).toEqual({
      type: "article",
      title: "Further reading",
      url: "https://example.test/reading",
    });
  });

  it("the whole field-variants lesson is schema-valid", () => {
    expect(validateLesson(JSON.parse(raw("field-variants"))).valid).toBe(true);
  });
});
