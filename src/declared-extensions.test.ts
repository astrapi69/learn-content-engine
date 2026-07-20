import { describe, it, expect } from "vitest";

import { declaredExtensionRegistry } from "./declared-extensions.js";
import { validateLesson } from "./validate.js";

/**
 * ``declaredExtensionRegistry`` synthesises a permissive registry from a
 * lesson's OWN ``requires_extensions`` (engine#70). It exists for
 * ENGINE-LAYER tooling - the conformance harness and the doc gate - which
 * drives foreign content and therefore cannot know which extensions any given
 * consumer has adopted. A consumer-layer gate registers what IT adopted
 * instead; that is a different, equally correct registry one layer out
 * (adaptive-learner-content-test#71).
 *
 * The contract these tests pin down is what the synthesised registry must
 * still CATCH. Payload correctness is deliberately out of scope (the stubs
 * validate to []): the engine cannot invent rules a foreign vendor never
 * published.
 */

const extLesson = (declared: unknown, exerciseType: string) => ({
  id: "l1",
  title: "Ext lesson",
  ...(declared === undefined ? {} : { requires_extensions: declared }),
  steps: [
    {
      id: "s1",
      type: "exercise",
      exercise: { id: "e1", type: exerciseType, prompt: "Do the thing.", ext_payload: { any: "shape" } },
    },
  ],
});

const validateWithDeclared = (lesson: unknown) =>
  validateLesson(lesson, { extensions: declaredExtensionRegistry(lesson) });

describe("declaredExtensionRegistry", () => {
  it("registers a declared extension so the lesson validates", () => {
    const declared = extLesson(["ext:al-graded-quiz@1"], "ext:al-graded-quiz");
    const result = validateWithDeclared(declared);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("still flags an UNDECLARED ext type - the real content error", () => {
    const undeclared = extLesson(["ext:al-graded-quiz@1"], "ext:al-reading-comprehension");
    const result = validateWithDeclared(undeclared);
    expect(result.errors.map((issue) => issue.id)).toContain("E-EXT-UNDECLARED");
    expect(result.valid).toBe(false);
  });

  it("still flags an ext type when the lesson declares nothing at all", () => {
    const nothingDeclared = extLesson(undefined, "ext:al-graded-quiz");
    const result = validateWithDeclared(nothingDeclared);
    expect(result.errors.map((issue) => issue.id)).toContain("E-EXT-UNDECLARED");
  });

  it("edge: a malformed declaration (no @major) leaves the type unregistered", () => {
    // The registry drops it exactly as the validator's own requiredExtensions()
    // does. The lesson is still refused - earlier, in fact: the schema pattern
    // on requires_extensions rejects the entry structurally (E-SCHEMA), so a
    // permissive registry can never wave a malformed declaration through.
    const malformed = extLesson(["ext:al-graded-quiz"], "ext:al-graded-quiz");
    expect(declaredExtensionRegistry(malformed)).toEqual([]);
    const result = validateWithDeclared(malformed);
    expect(result.errors.map((issue) => issue.id)).toContain("E-SCHEMA");
    expect(result.valid).toBe(false);
  });

  it("edge: a non-integer major is not registered", () => {
    expect(declaredExtensionRegistry(extLesson(["ext:al-graded-quiz@1.5"], "ext:al-graded-quiz"))).toEqual([]);
  });

  it("registers every declared extension, not just the first", () => {
    const many = declaredExtensionRegistry({
      requires_extensions: ["ext:al-graded-quiz@1", "ext:acme-ordering@2"],
    });
    expect(many.map((extension) => [extension.type, extension.major])).toEqual([
      ["ext:al-graded-quiz", 1],
      ["ext:acme-ordering", 2],
    ]);
  });

  it("boundary: the major is taken from the declaration, so the pin always matches", () => {
    const pinnedAtTwo = extLesson(["ext:al-graded-quiz@2"], "ext:al-graded-quiz");
    expect(declaredExtensionRegistry(pinnedAtTwo)[0]?.major).toBe(2);
    expect(validateWithDeclared(pinnedAtTwo).valid).toBe(true);
  });

  it("edge: core lessons and non-object input yield an empty registry", () => {
    expect(declaredExtensionRegistry({ id: "l1", title: "Core", steps: [] })).toEqual([]);
    expect(declaredExtensionRegistry(null)).toEqual([]);
    expect(declaredExtensionRegistry("not a lesson")).toEqual([]);
    expect(declaredExtensionRegistry({ requires_extensions: "not an array" })).toEqual([]);
  });

  it("edge: non-string entries are skipped, valid siblings survive", () => {
    const mixed = declaredExtensionRegistry({ requires_extensions: [42, "ext:al-graded-quiz@1"] });
    expect(mixed.map((extension) => extension.type)).toEqual(["ext:al-graded-quiz"]);
  });

  it("the synthesised stubs are permissive - payload correctness stays consumer-side", () => {
    const registry = declaredExtensionRegistry({ requires_extensions: ["ext:al-graded-quiz@1"] });
    expect(registry[0]?.validate({ id: "e1", type: "ext:al-graded-quiz", prompt: "x" } as never)).toEqual([]);
  });

  it("a core lesson validates identically with and without the synthesised registry", () => {
    const core = {
      id: "l1",
      title: "Core",
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: { id: "e1", type: "free_text", prompt: "Translate.", accept: ["ja"] },
        },
      ],
    };
    expect(validateWithDeclared(core)).toEqual(validateLesson(core));
  });
});
