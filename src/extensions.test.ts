import { describe, it, expect } from "vitest";

import type { ExerciseExtension } from "./extensions.js";
import { parseLesson, type LessonSetContext } from "./content-engine.js";
import { validateLesson } from "./validate.js";
import type { ContentLesson } from "./types/index.js";

/**
 * Extension contract (schema 1.7). Core content behaves byte-identically with
 * or without a registry; ext content is portable only when declared and
 * registered, else refused loudly.
 */

const CTX: LessonSetContext = { language: "de", target_language: "de", source_language: "en", domain: "language" };

const coreLesson = () => ({
  id: "core",
  title: "Core",
  steps: [
    { id: "s1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "Say hi", accept: ["hi"] } },
  ],
});

const extLesson = (overrides: Record<string, unknown> = {}) => ({
  id: "ext",
  title: "Ext",
  requires_extensions: ["ext:test-order@1"],
  steps: [
    {
      id: "s1",
      type: "exercise",
      exercise: { id: "e1", type: "ext:test-order", prompt: "Order these", ext_payload: { items: ["a", "b"] } },
    },
  ],
  ...overrides,
});

const testOrder: ExerciseExtension = {
  type: "ext:test-order",
  major: 1,
  validate(exercise) {
    const items = (exercise.ext_payload as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(items) || items.length < 2) {
      return [
        {
          path: "/ext_payload",
          message: "ext:test-order requires at least 2 items",
          id: "E-EXT-TEST-ITEMS",
          severity: "error",
          docAnchor: "docs/lesson-format.md#extensions",
        },
      ];
    }
    return [];
  },
};

describe("core content is registry-independent (byte-identical)", () => {
  it("validates identically with and without a registry", () => {
    const without = validateLesson(coreLesson());
    const with_ = validateLesson(coreLesson(), { extensions: [testOrder] });
    expect(without).toEqual(with_);
    expect(without.valid).toBe(true);
  });
});

describe("ext exercise declaration + registry contract", () => {
  it("errors when an ext type is used but not declared in requires_extensions", () => {
    const result = validateLesson(extLesson({ requires_extensions: [] }), { extensions: [testOrder] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === "E-EXT-UNDECLARED")).toBe(true);
  });

  it("refuses loudly (E-EXT-UNSUPPORTED) when declared but no extension is registered", () => {
    const result = validateLesson(extLesson());
    expect(result.valid).toBe(false);
    const unsupported = result.errors.find((issue) => issue.id === "E-EXT-UNSUPPORTED");
    expect(unsupported).toBeDefined();
    expect(unsupported!.message).toContain("ext:test-order@1");
  });

  it("runs the registered extension validator when declared + registered", () => {
    const result = validateLesson(extLesson(), { extensions: [testOrder] });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("surfaces the extension's own errors on an invalid payload", () => {
    const bad = extLesson();
    (((bad.steps[0]!.exercise) as Record<string, unknown>).ext_payload) = { items: ["only-one"] };
    const result = validateLesson(bad, { extensions: [testOrder] });
    expect(result.errors.some((issue) => issue.id === "E-EXT-TEST-ITEMS")).toBe(true);
  });

  it("refuses on a major mismatch (declared @2, registry has major 1)", () => {
    const result = validateLesson(extLesson({ requires_extensions: ["ext:test-order@2"] }), { extensions: [testOrder] });
    expect(result.valid).toBe(false);
    const unsupported = result.errors.find((issue) => issue.id === "E-EXT-UNSUPPORTED");
    expect(unsupported).toBeDefined();
    expect(unsupported!.message).toContain("ext:test-order@2");
  });
});

describe("pre-1.7 core content under the 1.7 schema", () => {
  it("a core lesson still validates unchanged", () => {
    const result = validateLesson(coreLesson());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("parseLesson extension seam", () => {
  it("core content parses identically with and without extensions", () => {
    const raw = JSON.stringify(coreLesson());
    expect(parseLesson(raw, CTX)).toEqual(parseLesson(raw, CTX, undefined, { extensions: [testOrder] }));
  });

  it("applies a registered extension's resolve hook", () => {
    const tagging: ExerciseExtension = {
      type: "ext:test-order",
      major: 1,
      validate: () => [],
      resolve: (lesson) => ({ ...lesson, description: "resolved-by-ext" }) as ContentLesson,
    };
    const parsed = parseLesson(JSON.stringify(coreLesson()), CTX, undefined, { extensions: [tagging] });
    expect(parsed.description).toBe("resolved-by-ext");
  });
});
