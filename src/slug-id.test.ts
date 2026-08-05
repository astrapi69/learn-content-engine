import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { validateLesson, type ValidationResult } from "./validate.js";

/**
 * Slug-id enforcement suite (engine#105). Written RED-first.
 *
 * The app-side import (adaptive-learner, the reference consumer) checks
 * lesson.id, step.id, exercise.id, card.id and card.tags against SLUG_RE and
 * silently skips any lesson that fails. Before this suite, the engine schema
 * stated "Slug-safe id" only in prose - validateLesson() accepted ids with
 * spaces, uppercase, underscores and punctuation, so an engine-conforming
 * generator could produce content the app throws away.
 *
 * Canonical rule: the app regex, centralised in the schema as $defs/SlugId
 * and hard-enforced on the four id fields (the published corpus has zero
 * violations there). card.tags gets the W-ID-NOT-SLUG warning only: the
 * published corpus still carries 11 violating tags, so a hard pattern there
 * is a follow-up after the content cleanup.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue | undefined;
}

const readJson = (relativePath: string): JsonObject =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")) as JsonObject;

const fixtureDir = (relativePath: string): string => fileURLToPath(new URL(relativePath, import.meta.url));

/** Minimal structurally-valid lesson whose ids the tests vary. */
const probeLesson = (lessonId: string): JsonObject => ({
  id: lessonId,
  title: "Probe",
  steps: [{ id: "theory-1", type: "theory", title: "T", body: "Text" }],
});

/** Lesson with one card carrying the given tags (ids all slug-clean). */
const taggedLesson = (tags: string[]): JsonObject => ({
  id: "01-tags",
  title: "Tag probe",
  steps: [{ id: "theory-1", type: "theory", title: "T", body: "der Begriff" }],
  cards: [{ id: "card-1", front: "front", back: "back", tags }],
});

const errorPaths = (validation: ValidationResult): string[] => validation.errors.map((issue) => issue.path);

// The app-side rule, duplicated on purpose because the app is not importable
// from this framework-agnostic library. Source of truth on the consumer side:
// adaptive-learner frontend/src/lib/content/analysis/analysis-to-lesson.ts
// (SLUG_RE). The parity test below pins the schema pattern to this literal so
// the two definitions cannot drift apart silently.
const APP_SLUG_RE = /^[\p{Ll}\p{Nd}]+(-[\p{Ll}\p{Nd}]+)*$/u;

describe("slug ids - reproduction: the lesson the app silently skipped (engine#105)", () => {
  // Verbatim the probe from the issue: engine said valid, app import skipped it.
  const skippedByApp: JsonObject = {
    id: "kapitel_2_ZWEI codes!!",
    title: "Probe",
    steps: [
      { id: "theory_1 ÄÖÜ", type: "theory", title: "T", body: "Text" },
      {
        id: "step-ex-5-ai-ex-5-free_text",
        type: "exercise",
        title: null,
        body: null,
        exercise: {
          type: "free_text",
          prompt: "Frage",
          card_ids: [],
          accept: ["Antwort"],
          distractors: [],
          id: "ai-ex-5-free_text",
        },
        theory_ref: "theory_1 ÄÖÜ",
      },
    ],
  };

  it("rejects the probe lesson instead of passing it through to a consumer that drops it", () => {
    const validation = validateLesson(skippedByApp);
    expect(validation.valid).toBe(false);
  });

  it("names every violating id with its path", () => {
    const paths = errorPaths(validateLesson(skippedByApp));
    expect(paths).toContain("/id");
    expect(paths).toContain("/steps/0/id");
    expect(paths).toContain("/steps/1/id");
    expect(paths).toContain("/steps/1/exercise/id");
  });
});

describe("slug ids - boundary values on lesson.id", () => {
  const VALID_IDS = ["01-einleitung", "a", "kapitel-9-2-2-millionen-dollar"];
  const INVALID_IDS = ["-a", "a-", "a--b", "A-b", "a_b", "a b"];

  for (const lessonId of VALID_IDS) {
    it(`accepts '${lessonId}'`, () => {
      expect(validateLesson(probeLesson(lessonId)).valid).toBe(true);
    });
  }

  for (const lessonId of INVALID_IDS) {
    it(`rejects '${lessonId}'`, () => {
      const validation = validateLesson(probeLesson(lessonId));
      expect(validation.valid).toBe(false);
      expect(errorPaths(validation)).toContain("/id");
    });
  }

  it("accepts non-ASCII lowercase letters, matching the app rule (\\p{Ll})", () => {
    expect(validateLesson(probeLesson("fünf-wörter")).valid).toBe(true);
  });
});

describe("card.tags - hard SlugId pattern (engine#108, stage 2 after the content cleanup)", () => {
  // Reproduction: the two published violation classes from the engine#108
  // measurement (apostrophe, underscore) now fail structurally, per tag, with
  // the exact array path - no longer a warning a generator can ignore.
  it("rejects violating tags with their paths", () => {
    const validation = validateLesson(taggedLesson(["mustn't", "a_b", "verb-present"]));
    expect(validation.valid).toBe(false);
    const paths = errorPaths(validation);
    expect(paths).toContain("/cards/0/tags/0");
    expect(paths).toContain("/cards/0/tags/1");
    expect(paths).not.toContain("/cards/0/tags/2");
  });

  it("accepts slug-clean tags", () => {
    const validation = validateLesson(taggedLesson(["greeting", "verb-present", "irregular"]));
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("accepts an empty tags array and a card without tags", () => {
    expect(validateLesson(taggedLesson([])).valid).toBe(true);
    const untagged = taggedLesson([]);
    delete ((untagged.cards as JsonObject[])[0] as JsonObject).tags;
    expect(validateLesson(untagged).valid).toBe(true);
  });

  it("boundary: single-character tag valid, uppercase and leading hyphen invalid", () => {
    expect(validateLesson(taggedLesson(["a"])).valid).toBe(true);
    expect(validateLesson(taggedLesson(["typ-III"])).valid).toBe(false);
    expect(validateLesson(taggedLesson(["-er-verb"])).valid).toBe(false);
  });

  // The warning tier is retired WITH the hardening: semantic lints only run on
  // structurally valid input, so after the pattern lands W-ID-NOT-SLUG could
  // never fire again - a rule that cannot fail is worse than no rule.
  it("W-ID-NOT-SLUG is gone: no result carries it", () => {
    for (const tags of [["mustn't"], ["greeting"]]) {
      const validation = validateLesson(taggedLesson(tags));
      const allIssues = [...validation.errors, ...validation.warnings];
      expect(allIssues.filter((issue) => issue.id === "W-ID-NOT-SLUG")).toEqual([]);
    }
  });
});

describe("engine rule === app rule (parity pin)", () => {
  const schema = readJson("../schema/lesson.schema.json");

  it("centralises the rule as $defs/SlugId with exactly the app regex", () => {
    const defs = schema.$defs as JsonObject;
    const slugId = defs.SlugId as JsonObject;
    expect(slugId).toBeDefined();
    expect(new RegExp(slugId.pattern as string, "u").source).toBe(APP_SLUG_RE.source);
  });

  for (const [container, field] of [
    ["Card", "id"],
    ["LessonStep", "id"],
    ["Exercise", "id"],
  ] as const) {
    it(`${container}.${field} references $defs/SlugId`, () => {
      const defs = schema.$defs as JsonObject;
      const properties = (defs[container] as JsonObject).properties as JsonObject;
      const idField = properties[field] as JsonObject;
      expect(idField.$ref).toBe("#/$defs/SlugId");
    });
  }

  it("lesson.id references $defs/SlugId", () => {
    const properties = schema.properties as JsonObject;
    const idField = properties.id as JsonObject;
    expect(idField.$ref).toBe("#/$defs/SlugId");
  });

  it("Card.tags items reference $defs/SlugId (engine#108)", () => {
    const defs = schema.$defs as JsonObject;
    const properties = (defs.Card as JsonObject).properties as JsonObject;
    const tagsField = properties.tags as JsonObject;
    expect((tagsField.items as JsonObject).$ref).toBe("#/$defs/SlugId");
  });
});

describe("regression - every shipped fixture stays valid under the hard pattern", () => {
  // minimal.json is a parser fixture, invalid on main long before this suite
  // (empty steps trips the schema's minItems). The slug pattern must not add
  // to that: no id path may appear among its errors.
  const PRE_EXISTING_INVALID = new Set(["minimal.json"]);

  for (const dir of ["conformance", "lessons"] as const) {
    for (const name of readdirSync(fixtureDir(`./__fixtures__/${dir}`)).filter((entry) => entry.endsWith(".json"))) {
      if (PRE_EXISTING_INVALID.has(name)) {
        it(`${dir}/${name} gains no id error from the pattern`, () => {
          const paths = errorPaths(validateLesson(readJson(`./__fixtures__/${dir}/${name}`)));
          expect(paths.filter((errorPath) => errorPath.endsWith("/id"))).toEqual([]);
        });
        continue;
      }
      it(`${dir}/${name} still validates`, () => {
        const validation = validateLesson(readJson(`./__fixtures__/${dir}/${name}`));
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      });
    }
  }
});
