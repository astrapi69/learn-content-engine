import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";

import { validateLessonStructure, validateManifestStructure } from "./schema-validators.generated.js";
import { CONTENT_MANIFEST_SCHEMA, LESSON_SCHEMA } from "./schemas.generated.js";

/**
 * engine#261: the structural layer runs validators precompiled at build time
 * (ajv standalone) instead of compiling the schemas at run time, so the core
 * bundle no longer ships the ajv compiler. The promise is that nothing a
 * consumer sees changes: for every input, the precompiled validator returns
 * exactly the errors the run-time compiler returned, with the same options.
 *
 * Valid content shows no error path, so the corpus is the fixtures plus
 * systematic mutations of them: at every node an unknown field, a missing
 * required field, a wrong type, an empty and an overlong string, an unknown
 * enum value.
 */

const runtime = new Ajv2020({ allErrors: true, strict: false });
const runtimeLesson = runtime.compile(LESSON_SCHEMA);
const runtimeManifest = runtime.compile(CONTENT_MANIFEST_SCHEMA);

const fixtureDir = new URL("./__fixtures__/", import.meta.url);
const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, fixtureDir)), "utf8");

const lessonFixtures = (): unknown[] =>
  ["conformance/", "lessons/"].flatMap((dir) =>
    readdirSync(fileURLToPath(new URL(dir, fixtureDir)))
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(read(`${dir}${name}`)) as unknown),
  );

const manifestFixture = (): unknown => parseYaml(read("manifest.yaml")) as unknown;

const clone = <T>(value: T): T => structuredClone(value);

/** Every mutation of `root`: one change at one node per variant. */
function mutations(root: unknown): unknown[] {
  const variants: unknown[] = [];
  const visit = (node: unknown, apply: (change: (target: unknown) => unknown) => void): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) =>
        visit(child, (change) => apply((target) => { const copy = [...(target as unknown[])]; copy[index] = change(copy[index]); return copy; })),
      );
      apply(() => "not an array");
      return;
    }
    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      apply((target) => ({ ...(target as object), zz_unknown_field: 1 }));
      for (const [key] of entries) {
        apply((target) => { const copy = { ...(target as Record<string, unknown>) }; delete copy[key]; return copy; });
      }
      for (const [key, child] of entries) {
        visit(child, (change) =>
          apply((target) => ({ ...(target as Record<string, unknown>), [key]: change((target as Record<string, unknown>)[key]) })),
        );
      }
      return;
    }
    if (typeof node === "string") {
      apply(() => "");
      apply(() => "x".repeat(5001));
      apply(() => "bogus-enum-value");
      apply(() => 42);
      apply(() => null);
      return;
    }
    if (typeof node === "number") {
      apply(() => "7");
      apply(() => -1);
      apply(() => 1.5);
      return;
    }
    if (typeof node === "boolean") {
      apply(() => "true");
      return;
    }
  };
  visit(root, (change) => variants.push(change(clone(root))));
  return variants;
}

const errorsOf = (validator: ValidateFunction, input: unknown): ErrorObject[] | null => {
  validator(input);
  return validator.errors ? clone(validator.errors) : null;
};

const compare = (runtimeValidator: ValidateFunction, precompiled: ValidateFunction, inputs: unknown[]): number => {
  let failing = 0;
  for (const input of inputs) {
    const expected = errorsOf(runtimeValidator, input);
    const actual = errorsOf(precompiled, input);
    expect(actual).toEqual(expected);
    if (expected) failing++;
  }
  return failing;
};

describe("precompiled schema validators match the run-time compiler (engine#261)", () => {
  it("lessons: the fixtures and every single-node mutation of them", () => {
    const fixtures = lessonFixtures();
    const inputs = [...fixtures, ...fixtures.flatMap(mutations)];
    const failing = compare(runtimeLesson, validateLessonStructure, inputs);
    // The corpus exercises the error paths, not just valid content.
    expect(inputs.length).toBeGreaterThan(1000);
    expect(failing).toBeGreaterThan(500);
  });

  it("manifests: the fixture and every single-node mutation of it", () => {
    const fixture = manifestFixture();
    const inputs = [fixture, ...mutations(fixture)];
    const failing = compare(runtimeManifest, validateManifestStructure, inputs);
    expect(failing).toBeGreaterThan(20);
  });

  it("inputs that are not objects at all", () => {
    for (const input of [null, 42, "lesson", [], true]) {
      expect(errorsOf(validateLessonStructure, input)).toEqual(errorsOf(runtimeLesson, input));
      expect(errorsOf(validateManifestStructure, input)).toEqual(errorsOf(runtimeManifest, input));
    }
  });
});
