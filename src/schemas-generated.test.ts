import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import { describe, it, expect } from "vitest";

import { stripAnnotations } from "../scripts/schema-module-lib.mjs";
import { CONTENT_MANIFEST_SCHEMA, LESSON_SCHEMA } from "./schemas.generated.js";

/**
 * engine#203: the structural layer takes the two schemas from a generated
 * module instead of reading schema/*.json at run time. The JSON files stay the
 * authored source; the module is each file without its annotation keywords
 * (description, title, $comment), which never change what a schema accepts.
 * This pins the module to the files, and proves the "never changes" part on
 * real input instead of assuming it.
 */
const readSchema = (fileName: string): Record<string, unknown> =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../schema/${fileName}`, import.meta.url)), "utf8")) as Record<string, unknown>;

const lessonFile = readSchema("lesson.schema.json");
const manifestFile = readSchema("content-manifest.schema.json");

describe("schemas.generated.ts matches schema/", () => {
  it("LESSON_SCHEMA is schema/lesson.schema.json without its annotations", () => {
    expect(LESSON_SCHEMA).toEqual(stripAnnotations(lessonFile));
  });

  it("CONTENT_MANIFEST_SCHEMA is schema/content-manifest.schema.json without its annotations", () => {
    expect(CONTENT_MANIFEST_SCHEMA).toEqual(stripAnnotations(manifestFile));
  });

  it("drops the annotation keywords and is much smaller than the file", () => {
    const lesson = LESSON_SCHEMA as { description?: unknown; title?: unknown; properties: Record<string, { description?: unknown }> };
    expect(lessonFile.description).toBeDefined();
    expect(lesson.description).toBeUndefined();
    expect(lesson.title).toBeUndefined();
    expect(lesson.properties.id!.description).toBeUndefined();
    expect(JSON.stringify(LESSON_SCHEMA).length).toBeLessThan(JSON.stringify(lessonFile).length / 2);
  });

  it("keeps properties that are NAMED like an annotation (a lesson's title and description)", () => {
    const properties = (LESSON_SCHEMA as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties)).toEqual(Object.keys(lessonFile.properties as object));
    expect(properties.title).toMatchObject({ type: "string", minLength: 1 });
    expect(properties.description).toBeDefined();
  });
});

describe("the stripped schema accepts and rejects exactly what the file does", () => {
  // One ajv instance per schema: both carry the same $id.
  const full = new Ajv2020({ allErrors: true, strict: false }).compile(lessonFile);
  const stripped = new Ajv2020({ allErrors: true, strict: false }).compile(LESSON_SCHEMA);
  const outcome = (validate: typeof full, input: unknown): string[] =>
    validate(input) ? [] : (validate.errors as ErrorObject[]).map((error) => `${error.instancePath} ${error.keyword} ${error.message}`).sort();

  const fixtureDir = fileURLToPath(new URL("./__fixtures__/conformance/", import.meta.url));
  const fixtures = readdirSync(fixtureDir).filter((file) => file.endsWith(".json"));
  const probes: Array<[string, unknown]> = [
    ["an empty object", {}],
    ["a wrong type", { id: "l1", title: 7, steps: [] }],
    ["an unknown field", { id: "l1", title: "L", steps: [{ id: "t1", type: "theory", body: "x" }], colour: "blue" }],
    ["a bad purpose", { id: "l1", title: "L", steps: [{ id: "t1", type: "theory", body: "x" }], purpose: "exam" }],
    ["a bad slug", { id: "Not A Slug", title: "L", steps: [{ id: "t1", type: "theory", body: "x" }] }],
  ];

  it("has fixtures to compare", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures)("conformance fixture %s", (file) => {
    const input = JSON.parse(readFileSync(`${fixtureDir}${file}`, "utf8"));
    expect(outcome(stripped, input)).toEqual(outcome(full, input));
  });

  it.each(probes)("negative probe: %s", (_label, input) => {
    const expected = outcome(full, input);
    expect(expected.length).toBeGreaterThan(0);
    expect(outcome(stripped, input)).toEqual(expected);
  });
});
