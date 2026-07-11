import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Every exercise type in the schema enum must have its own section in the
 * lesson-format docs. Keeps the docs from drifting behind the schema - the
 * "five exercise types while the schema had six" lag can not recur: a new
 * type without a `### <type>` section turns CI red.
 */

const read = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const exerciseTypesInSchema = (): string[] => {
  const schema = JSON.parse(read("../schema/lesson.schema.json")) as {
    $defs: Record<string, { enum?: string[] }>;
  };
  const typeEnum = schema.$defs["ExerciseType"]?.enum;
  if (!typeEnum || typeEnum.length === 0) {
    throw new Error("ExerciseType enum not found in schema/lesson.schema.json");
  }
  return typeEnum;
};

describe("exercise type docs completeness", () => {
  const lessonFormatDoc = read("../docs/lesson-format.md");
  const exerciseTypes = exerciseTypesInSchema();

  it("finds the exercise type enum in the schema", () => {
    expect(exerciseTypes.length).toBeGreaterThanOrEqual(6);
  });

  for (const exerciseType of exerciseTypesInSchema()) {
    it(`documents ${exerciseType} with its own lesson-format section`, () => {
      expect(lessonFormatDoc).toContain(`### ${exerciseType}`);
    });
  }
});
