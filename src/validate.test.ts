import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { parseManifest } from "./content-engine.js";
import { validateLesson, validateManifest, type ValidationResult } from "./validate.js";

/**
 * validate() negative + positive suite (TEIL B). Written RED-first: the
 * rejection behaviour IS part of the format contract. The engine's schema
 * artifact is strict (additionalProperties:false, parity with adaptive-learner,
 * the reference consumer), so unknown fields are rejected, and the semantic
 * cross-field rules mirror that consumer's Pydantic model_validators.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue | undefined;
}

const readJson = (relativePath: string): JsonObject =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")) as JsonObject;

const conf = (name: string): JsonObject => readJson(`./__fixtures__/conformance/${name}.json`);
const lessonFixture = (path: string): JsonObject => readJson(`./__fixtures__/lessons/${path}.json`);

/** Deep clone so a per-test mutation cannot leak into the shared fixture. */
const clone = (value: JsonObject): JsonObject => JSON.parse(JSON.stringify(value)) as JsonObject;

/** The exercise object of the first step (all conformance exercise fixtures put it there). */
const exerciseOf = (lesson: JsonObject): JsonObject =>
  (lesson.steps as JsonObject[])[0]!.exercise as JsonObject;
const firstStep = (lesson: JsonObject): JsonObject => (lesson.steps as JsonObject[])[0]!;

/** True when at least one issue message mentions the keyword (case-insensitive). */
const mentions = (result: ValidationResult, keyword: string): boolean =>
  result.errors.some((issue) => `${issue.path} ${issue.message}`.toLowerCase().includes(keyword.toLowerCase()));

const EXERCISE_TYPES = [
  "matching",
  "picture_choice",
  "free_text",
  "word_tiles",
  "cloze_type",
  "cloze_select",
  "cloze_multiselect",
  "multiple_choice_single",
  "multiple_choice_multi",
] as const;

describe("validateLesson — positive: every conformance fixture is accepted", () => {
  for (const name of EXERCISE_TYPES) {
    it(`accepts the ${name} fixture`, () => {
      const result = validateLesson(conf(name));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  }

  it("accepts the field-variants fixture (1.2 direction + 1.4 example_url + 1.5 examples + resources)", () => {
    expect(validateLesson(conf("field-variants")).valid).toBe(true);
  });

  it("stays backward-compatible: pre-1.5 lessons validate under 1.5", () => {
    expect(validateLesson(lessonFixture("inherits-context")).valid).toBe(true);
    expect(validateLesson(lessonFixture("standalone-export")).valid).toBe(true);
    expect(validateLesson(lessonFixture("with-examples")).valid).toBe(true);
  });
});

describe("validateLesson — negative: rejection is part of the format", () => {
  it("rejects a missing required lesson field (title)", () => {
    const lesson = clone(conf("free_text"));
    delete lesson.title;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "title")).toBe(true);
  });

  it("rejects a missing type-specific field (matching without pairs)", () => {
    const lesson = clone(conf("matching"));
    delete exerciseOf(lesson).pairs;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "pairs")).toBe(true);
  });

  it("rejects an unknown exercise type", () => {
    const lesson = clone(conf("free_text"));
    exerciseOf(lesson).type = "ordering";
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "type")).toBe(true);
  });

  it("rejects an unknown cloze_mode", () => {
    const lesson = clone(conf("cloze_type"));
    exerciseOf(lesson).cloze_mode = "dropdown";
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "cloze_mode")).toBe(true);
  });

  it("rejects a cloze blanks-count / marker-count mismatch", () => {
    const lesson = clone(conf("cloze_type"));
    exerciseOf(lesson).blanks = [{ accept: ["only-one"] }];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "marker")).toBe(true);
  });

  it("rejects a cloze without a sentence", () => {
    const lesson = clone(conf("cloze_type"));
    delete exerciseOf(lesson).sentence;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "sentence")).toBe(true);
  });

  it("rejects a cloze without blanks", () => {
    const lesson = clone(conf("cloze_type"));
    exerciseOf(lesson).sentence = "no markers here";
    delete exerciseOf(lesson).blanks;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "blanks")).toBe(true);
  });

  it("rejects a select-mode cloze without distractors", () => {
    const lesson = clone(conf("cloze_select"));
    exerciseOf(lesson).distractors = [];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "distractors")).toBe(true);
  });

  it("rejects a multiselect where accept and distractors are not disjoint", () => {
    const lesson = clone(conf("cloze_multiselect"));
    exerciseOf(lesson).distractors = ["3", "4"]; // "3" also in accept
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "disjoint")).toBe(true);
  });

  it("rejects a multiselect with a missing/empty accept", () => {
    const lesson = clone(conf("cloze_multiselect"));
    delete exerciseOf(lesson).accept; // exercises the ``accept ?? []`` fallback
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "accept")).toBe(true);
  });

  it("rejects a multiselect without a sentence (the question stem)", () => {
    const lesson = clone(conf("cloze_multiselect"));
    delete exerciseOf(lesson).sentence;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "sentence")).toBe(true);
  });

  it("rejects a multiselect without distractors", () => {
    const lesson = clone(conf("cloze_multiselect"));
    delete exerciseOf(lesson).distractors;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "distractors")).toBe(true);
  });

  it("rejects a broken matching pair structure (missing 'right')", () => {
    const lesson = clone(conf("matching"));
    exerciseOf(lesson).pairs = [{ left: "bonjour" }];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "right")).toBe(true);
  });

  it("rejects free_text with an empty accept list", () => {
    const lesson = clone(conf("free_text"));
    exerciseOf(lesson).accept = [];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "accept")).toBe(true);
  });

  it("rejects word_tiles with too few tiles", () => {
    const lesson = clone(conf("word_tiles"));
    exerciseOf(lesson).tiles = ["only"];
    exerciseOf(lesson).accept_orderings = [[0]];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "tiles")).toBe(true);
  });

  it("rejects word_tiles whose accept_orderings is not a permutation", () => {
    const lesson = clone(conf("word_tiles"));
    exerciseOf(lesson).accept_orderings = [[0, 0, 1]];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "permutation")).toBe(true);
  });

  it("rejects picture_choice with fewer than two images", () => {
    const lesson = clone(conf("picture_choice"));
    exerciseOf(lesson).images = [{ src: "assets/img/cat.png", label: "A cat", is_correct: "true" }];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "images")).toBe(true);
  });

  it("rejects picture_choice without exactly one correct image", () => {
    const lesson = clone(conf("picture_choice"));
    (exerciseOf(lesson).images as JsonObject[])[1]!.is_correct = "true"; // now two correct
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "exactly one")).toBe(true);
  });

  it("rejects a theory step without a body", () => {
    const lesson = clone(conf("field-variants"));
    delete firstStep(lesson).body;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "theory")).toBe(true);
  });

  it("rejects a theory step that also carries an exercise", () => {
    const lesson = clone(conf("field-variants"));
    firstStep(lesson).exercise = { id: "x", type: "free_text", prompt: "?", accept: ["a"] };
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "theory")).toBe(true);
  });

  it("rejects an exercise step without an exercise payload", () => {
    const lesson = clone(conf("free_text"));
    delete firstStep(lesson).exercise;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "exercise")).toBe(true);
  });

  it("rejects an exercise step that also carries a body", () => {
    const lesson = clone(conf("free_text"));
    firstStep(lesson).body = "should not be here";
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "body")).toBe(true);
  });

  it("rejects an exercise referencing an unknown card_id (referential integrity)", () => {
    const lesson = clone(conf("free_text"));
    exerciseOf(lesson).card_ids = ["does-not-exist"];
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "unknown card")).toBe(true);
  });

  it("STRICT: rejects an unknown extra field (parity with the reference consumer's schema)", () => {
    const lesson = clone(conf("free_text"));
    lesson.surprise_field = true;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(mentions(result, "additional")).toBe(true);
  });

  it("accepts a lesson that omits the optional 'cards' key entirely", () => {
    const lesson = clone(conf("cloze_type"));
    delete lesson.cards; // cloze fixture references no cards, so integrity still holds
    expect(validateLesson(lesson).valid).toBe(true);
  });

  it("accepts word_tiles without accept_orderings (canonical order only)", () => {
    const lesson = clone(conf("word_tiles"));
    delete exerciseOf(lesson).accept_orderings; // exercises the early return
    expect(validateLesson(lesson).valid).toBe(true);
  });

  it("accepts an exercise that omits the optional 'card_ids' key", () => {
    const lesson = clone(conf("free_text"));
    delete exerciseOf(lesson).card_ids; // exercises the ``card_ids ?? []`` fallback
    expect(validateLesson(lesson).valid).toBe(true);
  });
});

describe("validateManifest — negative + legacy-alias parity", () => {
  it("accepts a well-formed manifest", () => {
    const manifest = parseManifest(
      readFileSync(fileURLToPath(new URL("./__fixtures__/manifest.yaml", import.meta.url)), "utf8"),
    );
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("rejects a manifest set missing a required field (title)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Broken",
      sets: [{ id: "x", target_language: "fr", level: "A1", version: "1.0.0", lesson_count: 1 }],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(mentions(result, "title")).toBe(true);
  });

  it("rejects a set with an invalid language alias (neither language nor target_language)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Broken",
      sets: [{ id: "x", title: "X", level: "A1", version: "1.0.0", lesson_count: 1 }],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(mentions(result, "target_language")).toBe(true);
  });

  it("accepts the legacy 'language' alias as target_language (pre-v1.2 manifests)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Legacy",
      sets: [{ id: "x", title: "X", language: "es", level: "A1", version: "1.0.0", lesson_count: 1 }],
    };
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("prefers target_language over the legacy alias when a set carries both", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Both",
      sets: [
        {
          id: "x",
          title: "X",
          language: "es",
          target_language: "fr",
          level: "A1",
          version: "1.0.0",
          lesson_count: 1,
        },
      ],
    };
    // The legacy alias is dropped (would otherwise trip additionalProperties);
    // target_language wins, so this validates.
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("rejects a non-object manifest", () => {
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest("nope").valid).toBe(false);
  });

  it("accepts a manifest with no sets (name is the only requirement)", () => {
    expect(validateManifest({ schema_version: "1.2", name: "Empty" }).valid).toBe(true);
  });

  it("rejects a manifest whose set entry is not an object", () => {
    const result = validateManifest({ name: "Broken", sets: [null] });
    expect(result.valid).toBe(false);
  });
});
