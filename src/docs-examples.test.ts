import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { validateLesson, validateManifest } from "./validate.js";

/**
 * Doc-example conformance: every ```json block in the format reference
 * (docs/lesson-format.md) is extracted and run through validate(), and the
 * set of examples must cover every ExerciseType, every cloze mode, and at
 * least one manifest. This is what keeps the documentation from ever drifting
 * from the engine: a stale or wrong example turns CI red.
 */

const FORMAT_REFERENCE = "../docs/lesson-format.md";

interface JsonExample {
  index: number;
  value: unknown;
}

/** Extract every fenced ```json block, parsed. Throws (fails the suite) if the
 *  reference file is missing - the RED state before the docs exist. */
function extractJsonExamples(relativePath: string): JsonExample[] {
  const markdown = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
  const blocks = [...markdown.matchAll(/```json\n([\s\S]*?)```/g)];
  return blocks.map((match, index) => ({ index, value: JSON.parse(match[1]!) }));
}

const isManifest = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "sets" in value && "name" in value;
const isLesson = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "steps" in value;

const examples = extractJsonExamples(FORMAT_REFERENCE);

describe("docs/lesson-format.md — every json example validates", () => {
  it("contains at least a handful of examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(7);
  });

  for (const example of examples) {
    it(`example #${example.index} validates`, () => {
      const result = isManifest(example.value)
        ? validateManifest(example.value)
        : validateLesson(example.value);
      // Surface the offending messages if this ever regresses.
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

describe("docs/lesson-format.md — minimum coverage of the type catalog", () => {
  const exerciseTypes = new Set<string>();
  const clozeModes = new Set<string>();
  let manifestCount = 0;

  for (const example of examples) {
    if (isManifest(example.value)) {
      manifestCount += 1;
      continue;
    }
    if (!isLesson(example.value)) continue;
    const steps = (example.value as { steps?: unknown[] }).steps ?? [];
    for (const rawStep of steps) {
      const exercise = (rawStep as { exercise?: { type?: string; cloze_mode?: string } }).exercise;
      if (!exercise?.type) continue;
      exerciseTypes.add(exercise.type);
      if (exercise.type === "cloze") clozeModes.add(exercise.cloze_mode ?? "type");
    }
  }

  it("covers every ExerciseType", () => {
    expect([...exerciseTypes].sort()).toEqual([
      "cloze",
      "free_text",
      "matching",
      "multiple_choice",
      "picture_choice",
      "word_tiles",
    ]);
  });

  it("covers every cloze mode", () => {
    expect([...clozeModes].sort()).toEqual(["multiselect", "select", "type"]);
  });

  it("includes at least one manifest example", () => {
    expect(manifestCount).toBeGreaterThanOrEqual(1);
  });
});
