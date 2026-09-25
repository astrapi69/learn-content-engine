import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { SLUG_ID_MAX_LENGTH, SLUG_ID_PATTERN, isSlugId, validateLessonRules, validateManifestRules } from "./rules.js";
import { validateLesson, validateManifest } from "./validate.js";

/**
 * engine#191: the semantic rules as their own entry, without the structural
 * layer (ajv) and without the file system. A browser consumer that has
 * already shape-checked its input calls these instead of re-implementing the
 * rules; validateLesson / validateManifest compose the structural layer with
 * exactly these functions, so the two can never disagree.
 */

type JsonObject = Record<string, unknown>;

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (path: string): JsonObject => JSON.parse(readFileSync(join(here, path), "utf8")) as JsonObject;
const conformance = readdirSync(join(here, "__fixtures__/conformance")).filter((name) => name.endsWith(".json"));

const clone = (value: JsonObject): JsonObject => JSON.parse(JSON.stringify(value)) as JsonObject;
const firstExercise = (lesson: JsonObject): JsonObject =>
  ((lesson.steps as JsonObject[])[0]!.exercise as JsonObject);

describe("validateLessonRules: the semantic layer of validateLesson (engine#191)", () => {
  it.each(conformance)("agrees with validateLesson on %s", (name) => {
    const lesson = readJson(`__fixtures__/conformance/${name}`);
    expect(validateLessonRules(lesson as never)).toEqual(validateLesson(lesson));
  });

  it("reports a semantic error exactly as validateLesson does", () => {
    const lesson = clone(readJson("__fixtures__/conformance/cloze_type.json"));
    firstExercise(lesson).blanks = [{ accept: ["only-one"] }];
    const viaRules = validateLessonRules(lesson as never);
    expect(viaRules.valid).toBe(false);
    expect(viaRules).toEqual(validateLesson(lesson));
  });

  it("reports the author lints as validateLesson does", () => {
    const lesson = clone(readJson("__fixtures__/conformance/free_text.json"));
    firstExercise(lesson).hint = "Vier Buchstaben.";
    lesson.domain = "imported";
    const viaRules = validateLessonRules(lesson as never);
    expect(viaRules.warnings.map((issue) => issue.id).sort()).toEqual(["W-DOMAIN-UNKNOWN", "W-HINT-LENGTH"]);
    expect(viaRules).toEqual(validateLesson(lesson));
  });
});

describe("validateManifestRules: the semantic layer of validateManifest (engine#191)", () => {
  // Parity holds for input with the schema's shape: the structural layer
  // decides the rest, and the rules entry assumes it passed.
  const manifest = (setExtras: JsonObject = {}, metadata?: JsonObject): JsonObject => ({
    schema_version: "1.2",
    name: "M",
    ...(metadata ? { metadata } : {}),
    sets: [
      { id: "fr-a1", title: "X", target_language: "fr", level: "A1", version: "1.0.0", lesson_count: 1, ...setExtras },
    ],
  });

  it.each([
    ["a plain manifest", manifest()],
    ["an unknown domain", manifest({ domain: "gardening" })],
    ["a grade table with a duplicate row", manifest({ evaluation: { scheme: "grades", grades: [{ min_percent: 50, label: "A" }, { min_percent: 50, label: "B" }] } })],
    ["retired_ids that are not strings", manifest({}, { retired_ids: [1, 2] })],
    ["the legacy language alias", { schema_version: "1.2", name: "M", sets: [{ id: "fr-a1", title: "X", language: "fr", level: "A1", version: "1.0.0", lesson_count: 1 }] }],
  ])("agrees with validateManifest on %s", (_label, input) => {
    const viaValidator = validateManifest(input);
    // guard: a fixture the structural layer rejects would test nothing here
    expect(viaValidator.errors.filter((issue) => issue.id === "E-SCHEMA" || issue.id === "E-UNKNOWN-FIELD")).toEqual([]);
    expect(validateManifestRules(input)).toEqual(viaValidator);
  });
});

describe("isSlugId: the schema's $defs/SlugId without a schema validator (engine#191)", () => {
  const schema = readJson("../schema/lesson.schema.json") as { $defs: { SlugId: { pattern: string; maxLength: number } } };

  it("carries exactly the schema's pattern and length", () => {
    expect(SLUG_ID_PATTERN).toBe(schema.$defs.SlugId.pattern);
    expect(SLUG_ID_MAX_LENGTH).toBe(schema.$defs.SlugId.maxLength);
  });

  it.each(["a", "01-einleitung", "fr-a1", "über-uns", "ελληνικά-1"])("accepts %j", (value) => {
    expect(isSlugId(value)).toBe(true);
  });

  it.each(["", "A1", "a_b", "-a", "a-", "a--b", "a b", "ä".repeat(121)])("rejects %j", (value) => {
    expect(isSlugId(value)).toBe(false);
  });

  it("rejects what is not a string", () => {
    expect(isSlugId(5)).toBe(false);
    expect(isSlugId(null)).toBe(false);
  });

  it("accepts the longest slug the schema allows", () => {
    expect(isSlugId("a".repeat(SLUG_ID_MAX_LENGTH))).toBe(true);
  });

  // engine#205: the limit counts characters (code points), as JSON Schema's
  // maxLength does; `.length` counted UTF-16 code units, so a slug of letters
  // outside the BMP (two units each) failed isSlugId from 61 letters on while
  // the schema accepted it up to 120.
  const astral = "\u{1D41A}"; // MATHEMATICAL BOLD SMALL A, \p{Ll}, two UTF-16 units

  it("counts characters, not UTF-16 units: 61 letters outside the BMP pass, as in the schema", () => {
    const id = astral.repeat(61);
    expect(id.length).toBe(122);
    expect(validateLesson({ id, title: "L", steps: [{ id: "t1", type: "theory", body: "x" }] }).valid).toBe(true);
    expect(isSlugId(id)).toBe(true);
  });

  it("agrees with the schema at the limit for letters outside the BMP: 120 pass, 121 fail", () => {
    const lessonWithId = (id: string): Record<string, unknown> => ({ id, title: "L", steps: [{ id: "t1", type: "theory", body: "x" }] });
    for (const count of [120, 121]) {
      const id = astral.repeat(count);
      expect(isSlugId(id)).toBe(validateLesson(lessonWithId(id)).valid);
    }
    expect(isSlugId(astral.repeat(120))).toBe(true);
    expect(isSlugId(astral.repeat(121))).toBe(false);
  });
});

describe("the rules entry stays free of ajv and the file system (engine#191)", () => {
  // Follow the relative imports of src/rules.ts transitively and collect every
  // bare specifier. A consumer bundling this entry for a browser must get
  // neither ajv (most of validateLesson's bundle size) nor node:* (the
  // schema is read with node:fs, which a browser does not have).
  // Every way a module can pull another in: import/export ... from "x", a
  // side-effect import "x", and a dynamic import("x").
  const IMPORT_FORMS = [
    /^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gms,
    /^\s*import\s+"([^"]+)"/gm,
    /\bimport\(\s*"([^"]+)"\s*\)/g,
  ];
  const importsOf = (file: string): string[] => {
    const source = readFileSync(file, "utf8");
    return IMPORT_FORMS.flatMap((form) => [...source.matchAll(form)].map((match) => match[1]!));
  };

  const closure = (entry: string): { files: Set<string>; external: Set<string> } => {
    const files = new Set<string>();
    const external = new Set<string>();
    const pending = [entry];
    while (pending.length > 0) {
      const file = pending.pop()!;
      if (files.has(file)) continue;
      files.add(file);
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")));
        else external.add(specifier);
      }
    }
    return { files, external };
  };

  it("imports neither ajv nor node:* anywhere in its module graph", () => {
    const { external } = closure(join(here, "rules.ts"));
    const forbidden = [...external].filter((specifier) => specifier.startsWith("ajv") || specifier.startsWith("node:"));
    expect(forbidden).toEqual([]);
  });

  it("does not reach validate.ts, the module that holds the structural layer", () => {
    const { files } = closure(join(here, "rules.ts"));
    expect([...files].some((file) => file.endsWith("/validate.ts"))).toBe(false);
  });

  it("is exported as the package subpath ./rules", () => {
    const pkg = readJson("../package.json") as { exports: Record<string, { types: string; import: string }> };
    expect(pkg.exports["./rules"]).toEqual({ types: "./dist/rules.d.ts", import: "./dist/rules.js" });
  });
});
