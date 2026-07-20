import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { declaredExtensionRegistry } from "./declared-extensions.js";
import { validateLesson } from "./validate.js";

/**
 * Doc-example gate for the extension tier (the sibling of
 * ``docs-examples.test.ts``, which deliberately does NOT cover
 * ``docs/extensions.md``: without a registry the core validator refuses a
 * ``requires_extensions`` lesson - correctly). Here every lesson example is
 * validated WITH a registry synthesised from its own declarations, so the doc
 * can keep illustrating hypothetical vendors (``ext:acme-ordering``) without
 * being chained to the shipped reference extension - while still proving:
 *
 * 1. the example is internally consistent (declaration pattern, namespace
 *    pattern, ``ext_payload`` shape, undeclared-type rule), and
 * 2. the loud-refusal contract holds on the example itself: a consumer
 *    WITHOUT the declared extension gets ``E-EXT-UNSUPPORTED``.
 */

const EXTENSIONS_DOC = "../docs/extensions.md";

interface JsonExample {
  index: number;
  value: unknown;
}

function extractJsonExamples(relativePath: string): JsonExample[] {
  const markdown = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
  const blocks = [...markdown.matchAll(/```json\n([\s\S]*?)```/g)];
  return blocks.map((match, index) => ({ index, value: JSON.parse(match[1]!) }));
}

const isLesson = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "steps" in value;

const declaredExtensions = (value: unknown): string[] => {
  const declared = (value as { requires_extensions?: unknown }).requires_extensions;
  return Array.isArray(declared) ? declared.filter((entry): entry is string => typeof entry === "string") : [];
};

const examples = extractJsonExamples(EXTENSIONS_DOC);
const lessonExamples = examples.filter((example) => isLesson(example.value));
const extensionLessons = lessonExamples.filter((example) => declaredExtensions(example.value).length > 0);

describe("docs/extensions.md - every lesson example validates with its declared registry", () => {
  it("contains at least one lesson example that declares an extension", () => {
    expect(extensionLessons.length).toBeGreaterThanOrEqual(1);
  });

  for (const example of lessonExamples) {
    it(`example #${example.index} validates with the synthesised registry`, () => {
      const result = validateLesson(example.value, { extensions: declaredExtensionRegistry(example.value) });
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }

  for (const example of extensionLessons) {
    it(`example #${example.index} is refused loudly by a consumer without the extension`, () => {
      const refused = validateLesson(example.value);
      expect(refused.valid).toBe(false);
      expect(refused.errors.map((issue) => issue.id)).toContain("E-EXT-UNSUPPORTED");
    });
  }
});
