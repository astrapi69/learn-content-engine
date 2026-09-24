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

  // picture_choice ``src`` formats (schema 1.8): a repo path (<= 500 chars,
  // the original contract) OR an inline base64 data URI with its own,
  // larger cap. The cap covers the reference consumer's 150-KiB upload
  // compression limit (153600 bytes -> 204800 base64 chars + header).
  describe("picture_choice src formats (schema 1.8)", () => {
    const dataUriSrc = (base64Length: number): string => `data:image/jpeg;base64,${"A".repeat(base64Length)}`;

    it("accepts a base64 data-URI src longer than the 500-char path cap", () => {
      const lesson = clone(conf("picture_choice"));
      (exerciseOf(lesson).images as JsonObject[])[0]!.src = dataUriSrc(10_000);
      const result = validateLesson(lesson);
      expect(result.valid).toBe(true);
    });

    it("accepts a data-URI src at the reference consumer's compression ceiling", () => {
      const lesson = clone(conf("picture_choice"));
      (exerciseOf(lesson).images as JsonObject[])[0]!.src = dataUriSrc(204_800);
      const result = validateLesson(lesson);
      expect(result.valid).toBe(true);
    });

    it("rejects a data-URI src beyond the 250000-char cap", () => {
      const lesson = clone(conf("picture_choice"));
      (exerciseOf(lesson).images as JsonObject[])[0]!.src = dataUriSrc(250_001);
      const result = validateLesson(lesson);
      expect(result.valid).toBe(false);
    });

    it("still rejects a non-data-URI src longer than 500 chars", () => {
      const lesson = clone(conf("picture_choice"));
      (exerciseOf(lesson).images as JsonObject[])[0]!.src = `assets/img/${"x".repeat(600)}.png`;
      const result = validateLesson(lesson);
      expect(result.valid).toBe(false);
    });

    it("accepts a path src at exactly 500 chars (unchanged boundary)", () => {
      const lesson = clone(conf("picture_choice"));
      const pathPrefix = "assets/img/";
      (exerciseOf(lesson).images as JsonObject[])[0]!.src = pathPrefix + "x".repeat(500 - pathPrefix.length);
      const result = validateLesson(lesson);
      expect(result.valid).toBe(true);
    });
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

describe("schema 1.9 — stable_id on exercises and cards (engine#90)", () => {
  const lessonWithStableIds = (exerciseSid?: string, cardSid?: string) => ({
    id: "l1",
    title: "Stable ids",
    steps: [
      {
        id: "s1",
        type: "exercise",
        exercise: {
          id: "e1",
          type: "free_text",
          prompt: "p",
          accept: ["a"],
          ...(exerciseSid ? { stable_id: exerciseSid } : {}),
        },
      },
    ],
    cards: [{ id: "c1", front: "f", back: "b", ...(cardSid ? { stable_id: cardSid } : {}) }],
  });

  it("accepts a lesson whose exercise and card carry well-formed stable_ids", () => {
    const checked = validateLesson(lessonWithStableIds("ex-m5k2p8qa", "card-m5k2p8qb"));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("stays optional: a lesson without stable_ids validates unchanged (pre-1.9 content)", () => {
    expect(validateLesson(lessonWithStableIds()).valid).toBe(true);
  });

  it("rejects a malformed stable_id (uppercase) via the schema pattern", () => {
    expect(validateLesson(lessonWithStableIds("EX-M5K2P8QA")).valid).toBe(false);
  });

  it("boundary: rejects a stable_id shorter than 8 characters", () => {
    expect(validateLesson(lessonWithStableIds("ex-a1")).valid).toBe(false);
  });

  it("rejects a duplicate stable_id within one lesson (E-STABLE-ID-DUP)", () => {
    const duplicated = lessonWithStableIds("dup-m5k2p8qa", "dup-m5k2p8qa");
    const checked = validateLesson(duplicated);
    expect(checked.valid).toBe(false);
    expect(checked.errors.some((issue) => issue.id === "E-STABLE-ID-DUP")).toBe(true);
  });
});

describe("schema 1.12 — stable_id on pairs/blanks/options (engine#91 Phase 2)", () => {
  const matchingWith = (pairStableId?: string) => {
    const lesson = clone(conf("matching"));
    const pairs = ((lesson.steps as JsonObject[])[0]!.exercise as JsonObject).pairs as JsonObject[];
    if (pairStableId) pairs[0]!.stable_id = pairStableId;
    return lesson;
  };

  const clozeWith = (blankStableId?: string) => {
    const lesson = clone(conf("cloze_type"));
    const blanks = ((lesson.steps as JsonObject[])[0]!.exercise as JsonObject).blanks as JsonObject[];
    if (blankStableId !== undefined) blanks[0]!.stable_id = blankStableId;
    return lesson;
  };

  const multipleChoiceWith = (optionStableId?: string) => {
    const lesson = clone(conf("multiple_choice_single"));
    const options = ((lesson.steps as JsonObject[])[0]!.exercise as JsonObject).options as JsonObject[];
    if (optionStableId) options[0]!.stable_id = optionStableId;
    return lesson;
  };

  it("accepts a well-formed stable_id on a matching pair, a cloze blank and a multiple_choice option", () => {
    expect(validateLesson(matchingWith("pair-m5k2p8qa")).valid).toBe(true);
    expect(validateLesson(clozeWith("blank-m5k2p8qa")).valid).toBe(true);
    expect(validateLesson(multipleChoiceWith("opt-m5k2p8qa")).valid).toBe(true);
  });

  it("stays optional: pairs/blanks/options without stable_id validate unchanged", () => {
    expect(validateLesson(matchingWith()).valid).toBe(true);
    expect(validateLesson(clozeWith()).valid).toBe(true);
    expect(validateLesson(multipleChoiceWith()).valid).toBe(true);
  });

  it("rejects a malformed sub-element stable_id (underscore - the strict SlugId shape, hyphens only)", () => {
    expect(validateLesson(matchingWith("pair_m5k2p8qa")).valid).toBe(false);
  });

  it("boundary: rejects an empty-string sub-element stable_id", () => {
    expect(validateLesson(clozeWith("")).valid).toBe(false);
  });

  it("rejects a duplicate stable_id shared between a pair and a blank in one lesson (E-STABLE-ID-DUP)", () => {
    const lesson = matchingWith("dup-m5k2p8qa");
    const pairs = ((lesson.steps as JsonObject[])[0]!.exercise as JsonObject).pairs as JsonObject[];
    pairs[1]!.stable_id = "dup-m5k2p8qa";
    const checked = validateLesson(lesson);
    expect(checked.valid).toBe(false);
    expect(checked.errors.some((issue) => issue.id === "E-STABLE-ID-DUP")).toBe(true);
  });
});

describe("schema 1.13 — explanation on exercises (idea 5: post-answer 'why')", () => {
  const lessonWithExplanation = (explanation?: string | null) => ({
    id: "l1",
    title: "Explanation",
    steps: [
      {
        id: "s1",
        type: "exercise",
        exercise: {
          id: "e1",
          type: "free_text",
          prompt: "p",
          accept: ["a"],
          ...(explanation !== undefined ? { explanation } : {}),
        },
      },
    ],
  });

  it("accepts an exercise with a Markdown explanation", () => {
    const checked = validateLesson(lessonWithExplanation("Il s'agit du subjonctif car..."));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("stays optional: an exercise without explanation validates unchanged (pre-1.13 content)", () => {
    expect(validateLesson(lessonWithExplanation()).valid).toBe(true);
  });

  it("accepts an explicit null (the documented default)", () => {
    expect(validateLesson(lessonWithExplanation(null)).valid).toBe(true);
  });

  it("boundary: rejects an explanation longer than 2000 characters", () => {
    expect(validateLesson(lessonWithExplanation("x".repeat(2001))).valid).toBe(false);
  });

  it("boundary: accepts an explanation at exactly 2000 characters", () => {
    expect(validateLesson(lessonWithExplanation("x".repeat(2000))).valid).toBe(true);
  });

  it("is not restricted to one exercise type: a matching exercise may carry it too", () => {
    const lesson = clone(conf("matching"));
    exerciseOf(lesson).explanation = "Diese Zuordnung folgt der grammatischen Regel...";
    expect(validateLesson(lesson).valid).toBe(true);
  });
});

describe("schema 1.14 — variables on exercises (engine#151: parametric exercises)", () => {
  const sum = [
    { name: "a", min: 1, max: 20 },
    { name: "b", min: 1, max: 20, step: 0.5 },
    { name: "sum", expression: "a + b", tolerance: 0.01 },
  ];

  const parametric = (variables: unknown, exercise: Record<string, unknown> = {}) => ({
    id: "l1",
    title: "Parametric",
    steps: [
      {
        id: "s1",
        type: "exercise",
        exercise: {
          id: "e1",
          type: "free_text",
          prompt: "What is {{a}} + {{b}}?",
          accept: ["{{sum}}"],
          ...(variables !== undefined ? { variables } : {}),
          ...exercise,
        },
      },
    ],
  });

  const ids = (lesson: unknown) => {
    const checked = validateLesson(lesson);
    return [...checked.errors, ...checked.warnings].map((issue) => issue.id);
  };

  it("accepts sampled variables plus a computed one, referenced from prompt and accept", () => {
    const checked = validateLesson(parametric(sum));
    expect(checked.errors).toEqual([]);
    expect(checked.warnings).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("stays optional: an exercise without variables validates unchanged (pre-1.14 content), null too", () => {
    const plain = { prompt: "p", accept: ["a"] };
    expect(validateLesson(parametric(undefined, plain)).valid).toBe(true);
    expect(validateLesson(parametric(null, plain)).valid).toBe(true);
  });

  it("structural: a variable name must be a lowercase identifier; step must be positive; tolerance non-negative", () => {
    expect(ids(parametric([{ name: "1a", min: 1, max: 2 }]))).toContain("E-SCHEMA");
    expect(ids(parametric([{ name: "A", min: 1, max: 2 }]))).toContain("E-SCHEMA");
    expect(ids(parametric([{ name: "a", min: 1, max: 2, step: 0 }]))).toContain("E-SCHEMA");
    expect(ids(parametric([{ name: "a", expression: "1", tolerance: -1 }]))).toContain("E-SCHEMA");
  });

  it("E-VAR-KIND: a variable is a range (min and max) or an expression, never neither, never both", () => {
    expect(ids(parametric([{ name: "a" }]))).toContain("E-VAR-KIND");
    expect(ids(parametric([{ name: "a", min: 1 }]))).toContain("E-VAR-KIND");
    expect(ids(parametric([{ name: "a", min: 1, max: 2, expression: "1" }]))).toContain("E-VAR-KIND");
    expect(ids(parametric([{ name: "a", expression: "1", step: 1 }]))).toContain("E-VAR-KIND");
  });

  it("E-VAR-DUP: variable names are unique within the exercise", () => {
    expect(ids(parametric([{ name: "a", min: 1, max: 2 }, { name: "a", min: 3, max: 4 }]))).toContain("E-VAR-DUP");
  });

  it("E-VAR-RANGE: min must be below max", () => {
    expect(ids(parametric([{ name: "a", min: 5, max: 5 }]))).toContain("E-VAR-RANGE");
    expect(ids(parametric([{ name: "a", min: 6, max: 5 }]))).toContain("E-VAR-RANGE");
  });

  it("E-VAR-EXPR: an expression must parse (arithmetic, parentheses, unary minus, names, numbers)", () => {
    expect(ids(parametric([{ name: "a", min: 1, max: 2 }, { name: "s", expression: "a +" }]))).toContain("E-VAR-EXPR");
    expect(ids(parametric([{ name: "a", min: 1, max: 2 }, { name: "s", expression: "sqrt(a)" }]))).toContain("E-VAR-EXPR");
  });

  it("E-VAR-UNDEFINED: expressions and {{references}} may only name variables declared earlier in the exercise", () => {
    expect(ids(parametric([{ name: "a", min: 1, max: 2 }, { name: "s", expression: "a + b" }]))).toContain("E-VAR-UNDEFINED");
    expect(ids(parametric([{ name: "s", expression: "a + 1" }, { name: "a", min: 1, max: 2 }]))).toContain("E-VAR-UNDEFINED");
    expect(ids(parametric([{ name: "s", expression: "s + 1" }]))).toContain("E-VAR-UNDEFINED");
    expect(ids(parametric([{ name: "a", min: 1, max: 2 }], { prompt: "{{a}} and {{zz}}", accept: ["{{a}}"] }))).toContain(
      "E-VAR-UNDEFINED",
    );
  });

  it("without a variables block, double braces are ordinary text (a Jinja2 lesson is not parametric)", () => {
    const jinja = {
      prompt: "Wie referenziert Jinja2 die Variable server im Template? {{ ... }}",
      accept: ["{{ server }}", "{{server}}"],
      hint: "Doppelte geschweifte Klammern: {{}}",
    };
    const checked = validateLesson(parametric(undefined, jinja));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
    expect(ids(parametric(undefined, jinja)).filter((id) => id.includes("-VAR-"))).toEqual([]);
    expect(ids(parametric(null, jinja)).filter((id) => id.includes("-VAR-"))).toEqual([]);
  });

  it("E-VAR-REF: a {{reference}} carries a plain name, never an expression", () => {
    expect(ids(parametric(sum, { prompt: "{{a + b}}", accept: ["{{sum}}"] }))).toContain("E-VAR-REF");
  });

  it("W-VAR-UNUSED: a declared variable no field and no later expression uses is flagged, but does not block", () => {
    const checked = validateLesson(parametric([...sum, { name: "c", min: 1, max: 2 }]));
    expect(checked.valid).toBe(true);
    expect(checked.warnings.map((issue) => issue.id)).toContain("W-VAR-UNUSED");
  });

  it("a variable used only by a later expression counts as used", () => {
    const checked = validateLesson(
      parametric([{ name: "a", min: 1, max: 2 }, { name: "twice", expression: "a * 2" }], { prompt: "p", accept: ["{{twice}}"] }),
    );
    expect(checked.warnings).toEqual([]);
  });

  it("is not restricted to one exercise type: a multiple_choice option may carry a reference", () => {
    const lesson = {
      id: "l1",
      title: "Parametric choice",
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "e1",
            type: "multiple_choice",
            prompt: "Which option equals {{n}} doubled?",
            variables: [
              { name: "n", min: 2, max: 9 },
              { name: "twice", expression: "n * 2" },
              { name: "wrong", expression: "n * 2 + 1" },
            ],
            options: [
              { text: "{{twice}}", correct: true },
              { text: "{{wrong}}" },
            ],
          },
        },
      ],
    };
    const checked = validateLesson(lesson);
    expect(checked.errors).toEqual([]);
    expect(checked.warnings).toEqual([]);
    expect(checked.valid).toBe(true);
  });
});

describe("manifest schema 1.15 — evaluation on the set entry (engine#171)", () => {
  const setWith = (evaluation: unknown) => ({
    schema_version: "1.7",
    name: "M",
    sets: [
      {
        id: "x",
        title: "X",
        target_language: "de",
        level: "none",
        version: "1.0.0",
        lesson_count: 5,
        ...(evaluation !== undefined ? { evaluation } : {}),
      },
    ],
  });
  const ids = (manifest: unknown) => {
    const checked = validateManifest(manifest);
    return [...checked.errors, ...checked.warnings].map((issue) => issue.id);
  };

  it("stays optional: a set without evaluation validates exactly as before", () => {
    const checked = validateManifest(setWith(undefined));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("accepts the percent scheme with a pass threshold, a title and a report depth", () => {
    const checked = validateManifest(
      setWith({ scheme: "percent", pass_percent: 70, basis: "elements", report: "detailed", title: "Theorieprüfung" }),
    );
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("accepts a grade table with native labels", () => {
    const checked = validateManifest(
      setWith({
        scheme: "grades",
        grades: [
          { min_percent: 90, label: "A", label_native: "Sehr gut" },
          { min_percent: 75, label: "B" },
          { min_percent: 0, label: "F", label_native: "Ungenügend" },
        ],
      }),
    );
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("accepts pass_fail with a threshold, and an empty block (every field optional)", () => {
    expect(validateManifest(setWith({ scheme: "pass_fail", pass_percent: 70 })).valid).toBe(true);
    expect(validateManifest(setWith({})).valid).toBe(true);
  });

  it("structural: rejects an unknown key, an unknown scheme, an unknown basis and an unknown report", () => {
    expect(ids(setWith({ scheme: "percent", stars: [50, 75, 90] }))).toContain("E-UNKNOWN-FIELD");
    expect(ids(setWith({ scheme: "points" }))).toContain("E-SCHEMA");
    expect(ids(setWith({ basis: "steps" }))).toContain("E-SCHEMA");
    expect(ids(setWith({ report: "verbose" }))).toContain("E-SCHEMA");
  });

  it("structural: pass_percent is an integer within 0 to 100, boundaries included", () => {
    expect(validateManifest(setWith({ pass_percent: 0 })).valid).toBe(true);
    expect(validateManifest(setWith({ pass_percent: 100 })).valid).toBe(true);
    expect(validateManifest(setWith({ pass_percent: 101 })).valid).toBe(false);
    expect(validateManifest(setWith({ pass_percent: -1 })).valid).toBe(false);
    expect(validateManifest(setWith({ pass_percent: 70.5 })).valid).toBe(false);
  });

  it("structural: a grade table needs at least two rows, each with a non-empty label and a percent in range", () => {
    expect(validateManifest(setWith({ scheme: "grades", grades: [{ min_percent: 50, label: "Pass" }] })).valid).toBe(false);
    expect(
      validateManifest(setWith({ scheme: "grades", grades: [{ min_percent: 50 }, { min_percent: 0, label: "F" }] })).valid,
    ).toBe(false);
    expect(
      validateManifest(setWith({ scheme: "grades", grades: [{ min_percent: 50, label: "" }, { min_percent: 0, label: "F" }] })).valid,
    ).toBe(false);
    expect(
      validateManifest(setWith({ scheme: "grades", grades: [{ min_percent: 101, label: "A" }, { min_percent: 0, label: "F" }] })).valid,
    ).toBe(false);
    expect(
      validateManifest(setWith({ scheme: "grades", grades: [{ min_percent: 50, label: "P", note: "x" }, { min_percent: 0, label: "F" }] })).valid,
    ).toBe(false);
  });

  it("E-EVAL-GRADES-MISSING: the grades scheme needs its table", () => {
    const checked = validateManifest(setWith({ scheme: "grades" }));
    expect(checked.errors.map((issue) => issue.id)).toContain("E-EVAL-GRADES-MISSING");
    expect(checked.valid).toBe(false);
    expect(checked.errors[0]!.path).toBe("/sets/0/evaluation");
  });

  it("E-EVAL-PASS-MISSING: the pass_fail scheme needs its threshold", () => {
    expect(ids(setWith({ scheme: "pass_fail" }))).toContain("E-EVAL-PASS-MISSING");
    expect(ids(setWith({ scheme: "pass_fail", pass_percent: 60 }))).not.toContain("E-EVAL-PASS-MISSING");
  });

  it("E-EVAL-GRADES-DUP: two rows at the same threshold leave the grade ambiguous", () => {
    expect(
      ids(
        setWith({
          scheme: "grades",
          grades: [
            { min_percent: 50, label: "C" },
            { min_percent: 50, label: "D" },
            { min_percent: 0, label: "F" },
          ],
        }),
      ),
    ).toContain("E-EVAL-GRADES-DUP");
  });

  it("W-EVAL-GRADES-NO-FLOOR: a table whose lowest row starts above 0 leaves a run below it without a grade", () => {
    const checked = validateManifest(
      setWith({
        scheme: "grades",
        grades: [
          { min_percent: 90, label: "A" },
          { min_percent: 50, label: "C" },
        ],
      }),
    );
    expect(checked.warnings.map((issue) => issue.id)).toContain("W-EVAL-GRADES-NO-FLOOR");
    expect(checked.warnings[0]!.message).toContain("50");
    expect(checked.valid).toBe(true);
    expect(checked.errors).toEqual([]);
  });

  it("W-EVAL-GRADES-NO-FLOOR stays silent when a row starts at 0, whatever the row order", () => {
    const rows = [
      { min_percent: 0, label: "F" },
      { min_percent: 60, label: "C" },
    ];
    expect(ids(setWith({ scheme: "grades", grades: rows }))).not.toContain("W-EVAL-GRADES-NO-FLOOR");
    expect(ids(setWith({ scheme: "grades", grades: [...rows].reverse() }))).not.toContain("W-EVAL-GRADES-NO-FLOOR");
  });

  it("carries no rule when the scheme is absent or percent (the default needs nothing)", () => {
    expect(ids(setWith({ pass_percent: 70 })).filter((id) => id.startsWith("E-EVAL"))).toEqual([]);
    expect(ids(setWith({ scheme: "percent" })).filter((id) => id.startsWith("E-EVAL"))).toEqual([]);
  });

  it("reserves the name on the lesson: an evaluation inside a lesson is still refused", () => {
    const lesson = {
      id: "l1",
      title: "L",
      evaluation: { scheme: "percent" },
      steps: [{ id: "s1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "p", accept: ["a"] } }],
    };
    const checked = validateLesson(lesson);
    expect(checked.errors.map((issue) => issue.id)).toContain("E-UNKNOWN-FIELD");
  });
});

describe("schema 1.9 — attribution and review_status on the set entry (engine#90/#94)", () => {
  const manifestWith = (setExtras: Record<string, unknown>) => ({
    schema_version: "1.2",
    name: "M",
    sets: [
      {
        id: "x",
        title: "X",
        target_language: "fr",
        level: "A1",
        version: "1.0.0",
        lesson_count: 1,
        ...setExtras,
      },
    ],
  });

  it("accepts attribution with author and a bounded derivation chain", () => {
    const checked = validateManifest(
      manifestWith({
        attribution: { author: "Asterios Raptis", derived_from: [{ author: "Jane Doe" }] },
      }),
    );
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("rejects attribution without an author (attribution is a claim, not a container)", () => {
    expect(validateManifest(manifestWith({ attribution: { derived_from: [] } })).valid).toBe(false);
  });

  it("boundary: rejects a derivation chain longer than 8 entries", () => {
    const chain = Array.from({ length: 9 }, (_, index) => ({ author: `Autor ${index}` }));
    expect(
      validateManifest(manifestWith({ attribution: { author: "A", derived_from: chain } })).valid,
    ).toBe(false);
  });

  it("boundary: a derivation chain of exactly 8 entries validates", () => {
    const chain = Array.from({ length: 8 }, (_, index) => ({ author: `Autor ${index}` }));
    expect(
      validateManifest(manifestWith({ attribution: { author: "A", derived_from: chain } })).valid,
    ).toBe(true);
  });

  it("rejects unknown fields inside attribution (strict object)", () => {
    expect(
      validateManifest(manifestWith({ attribution: { author: "A", email: "x@y.z" } })).valid,
    ).toBe(false);
  });

  it("accepts every review_status value and rejects an out-of-enum one", () => {
    for (const status of ["authored", "generated", "reviewed"]) {
      expect(validateManifest(manifestWith({ review_status: status })).valid).toBe(true);
    }
    expect(validateManifest(manifestWith({ review_status: "verified" })).valid).toBe(false);
  });
});

describe("engine#127 — domain vocabulary + level lints (warnings, never block)", () => {
  const manifestWith = (setExtras: Record<string, unknown>) => ({
    schema_version: "1.2",
    name: "M",
    sets: [
      {
        id: "x",
        title: "X",
        target_language: "fr",
        level: "A1",
        version: "1.0.0",
        lesson_count: 1,
        ...setExtras,
      },
    ],
  });
  const warningIds = (checked: ValidationResult): string[] =>
    checked.warnings.map((issue) => issue.id);

  it("flags an unknown domain with W-DOMAIN-UNKNOWN and stays valid ('other' contract)", () => {
    const checked = validateManifest(manifestWith({ domain: "gardening" }));
    expect(checked.valid).toBe(true);
    const unknownDomain = checked.warnings.find((issue) => issue.id === "W-DOMAIN-UNKNOWN");
    expect(unknownDomain).toBeDefined();
    expect(unknownDomain?.path).toBe("/sets/0/domain");
    expect(unknownDomain?.severity).toBe("warning");
    expect(unknownDomain?.message).toContain("gardening");
  });

  it("draws no domain warning for known domains or the absent default", () => {
    expect(warningIds(validateManifest(manifestWith({ domain: "psychology" })))).not.toContain(
      "W-DOMAIN-UNKNOWN",
    );
    expect(warningIds(validateManifest(manifestWith({})))).not.toContain("W-DOMAIN-UNKNOWN");
  });

  it("flags the live junk level values with W-LEVEL-UNKNOWN and stays valid", () => {
    const checked = validateManifest(manifestWith({ level: "a0" }));
    expect(checked.valid).toBe(true);
    const unknownLevel = checked.warnings.find((issue) => issue.id === "W-LEVEL-UNKNOWN");
    expect(unknownLevel).toBeDefined();
    expect(unknownLevel?.path).toBe("/sets/0/level");
    expect(unknownLevel?.message).toContain("a0");
  });

  it("accepts the explicit no-level sentinel for a non-language set only", () => {
    expect(
      warningIds(validateManifest(manifestWith({ domain: "psychology", level: "none" }))),
    ).not.toContain("W-LEVEL-UNKNOWN");
    expect(warningIds(validateManifest(manifestWith({ level: "none" })))).toContain(
      "W-LEVEL-UNKNOWN",
    );
  });

  it("accepts CEFR case-insensitively (a lowercase a1 is not junk)", () => {
    expect(warningIds(validateManifest(manifestWith({ level: "a1" })))).not.toContain(
      "W-LEVEL-UNKNOWN",
    );
  });

  // engine#183: a lesson may carry its own ``domain`` (schema 1.3; absent or
  // null inherits the set's). The real case sat on the lessons, not the set:
  // alc-books#3, both book sets exported with ``"domain": "imported"`` on
  // every lesson (adaptive-learner#2376).
  const lessonWithDomain = (domain: string | null): JsonObject => ({
    ...clone(conf("free_text")),
    domain,
  });

  it("flags an unknown lesson domain with W-DOMAIN-UNKNOWN and stays valid", () => {
    const checked = validateLesson(lessonWithDomain("imported"));
    expect(checked.valid).toBe(true);
    const unknownDomain = checked.warnings.find((issue) => issue.id === "W-DOMAIN-UNKNOWN");
    expect(unknownDomain).toBeDefined();
    expect(unknownDomain?.path).toBe("/domain");
    expect(unknownDomain?.severity).toBe("warning");
    expect(unknownDomain?.message).toContain("imported");
  });

  it("says the same about an unknown value on a lesson as on a set", () => {
    const onLesson = validateLesson(lessonWithDomain("gardening")).warnings.find(
      (issue) => issue.id === "W-DOMAIN-UNKNOWN",
    );
    const onSet = validateManifest(manifestWith({ domain: "gardening" })).warnings.find(
      (issue) => issue.id === "W-DOMAIN-UNKNOWN",
    );
    expect(onLesson?.message).toBe(onSet?.message);
  });

  it("draws no domain warning for a known lesson domain, in any case", () => {
    expect(warningIds(validateLesson(lessonWithDomain("psychology")))).not.toContain("W-DOMAIN-UNKNOWN");
    expect(warningIds(validateLesson(lessonWithDomain("AI")))).not.toContain("W-DOMAIN-UNKNOWN");
  });

  it("draws no domain warning when the lesson inherits the set's domain", () => {
    expect(warningIds(validateLesson(clone(conf("free_text"))))).not.toContain("W-DOMAIN-UNKNOWN");
    expect(warningIds(validateLesson(lessonWithDomain(null)))).not.toContain("W-DOMAIN-UNKNOWN");
    expect(warningIds(validateLesson(lessonWithDomain("")))).not.toContain("W-DOMAIN-UNKNOWN");
  });
});

describe("validateManifest — retired_ids unlocked (engine#131; adaptive-learner#2188 decided AND shipped)", () => {
  const validSet = {
    id: "x",
    title: "X",
    target_language: "fr",
    level: "A1",
    version: "1.0.0",
    lesson_count: 1,
  };

  it("accepts a manifest whose metadata declares retired_ids (deliberate retirement)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Retiring",
      sets: [validSet],
      metadata: { retired_ids: ["old-card-1"] },
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("boundary: an EMPTY retired_ids list is valid too (presence no longer signals anything)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Retiring",
      sets: [validSet],
      metadata: { retired_ids: [] },
    };
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("keeps other free-form metadata untouched, as before the unlock", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Fine",
      sets: [validSet],
      metadata: { author: "Asterios Raptis", license: "CC-BY-SA-4.0" },
    };
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("E-RETIRED-IDS-TYPE: a retired_ids that is not a list is rejected (type error)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Broken",
      sets: [validSet],
      metadata: { retired_ids: "old-card-1" },
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === "E-RETIRED-IDS-TYPE")).toBe(true);
  });

  it("E-RETIRED-IDS-TYPE: a list with a non-string entry is rejected (multi-element fixture)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Broken",
      sets: [validSet],
      metadata: { retired_ids: ["old-card-1", 3] },
    };
    expect(validateManifest(manifest).valid).toBe(false);
  });

  it("W-RETIRED-IDS-DUP: duplicates inside the list draw an author lint, never block", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Duplicated",
      sets: [validSet],
      metadata: { retired_ids: ["old-card-1", "old-exercise-2", "old-card-1"] },
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    const duplicateLint = result.warnings.find((issue) => issue.id === "W-RETIRED-IDS-DUP");
    expect(duplicateLint?.message).toContain("old-card-1");
  });

  it("boundary: a clean multi-entry list draws neither the type error nor the duplicate lint", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Clean",
      sets: [validSet],
      metadata: { retired_ids: ["old-card-1", "old-exercise-2"] },
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.warnings.filter((issue) => issue.id === "W-RETIRED-IDS-DUP")).toEqual([]);
  });

  it("regression guard: E-RETIRED-IDS-LOCKED never comes back, even amid mixed metadata", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Retiring",
      sets: [validSet],
      metadata: {
        author: "Asterios Raptis",
        retired_ids: ["old-card-1", "old-exercise-2"],
        lessons: ["01-intro.json"],
      },
    };
    const validation = validateManifest(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.errors.some((issue) => issue.id === "E-RETIRED-IDS-LOCKED")).toBe(false);
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

  it("accepts a set with visibility: hidden (additive consumer-display hint, #83)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Fixtures",
      sets: [
        {
          id: "graded-quiz-demo-from-de",
          title: "Graded Quiz Demo",
          target_language: "de",
          level: "A1",
          version: "1.0.0",
          lesson_count: 1,
          visibility: "hidden",
        },
      ],
    };
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("accepts an explicit visibility: visible", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Fixtures",
      sets: [
        { id: "x", title: "X", target_language: "de", level: "A1", version: "1.0.0", lesson_count: 1, visibility: "visible" },
      ],
    };
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it("rejects an unknown visibility value (closed enum)", () => {
    const manifest = {
      schema_version: "1.2",
      name: "Fixtures",
      sets: [
        { id: "x", title: "X", target_language: "de", level: "A1", version: "1.0.0", lesson_count: 1, visibility: "secret" },
      ],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(mentions(result, "visibility")).toBe(true);
  });
});
