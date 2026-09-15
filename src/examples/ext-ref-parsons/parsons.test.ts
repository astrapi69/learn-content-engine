import { describe, it, expect } from "vitest";

import { refParsonsExtension, renderRefParsons, gradeRefParsons } from "./parsons-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof of the extension seam with the reference extension
 * ext:ref-parsons: a lesson declares + carries the ext type, the engine half
 * validates it through validateLesson's registry, and the consumer half
 * grades an arrangement (order + indentation). Nothing here touches core
 * exercise types.
 */

const parsonsExercise = (lines: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-parsons",
    prompt: "Arrange the lines into a working function",
    ext_payload: { lines, language: "python" },
  }) as Exercise;

const lessonWith = (exercise: Exercise, requires: string[] = ["ext:ref-parsons@1"]) => ({
  id: "l1",
  title: "Parsons lesson",
  requires_extensions: requires,
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const greetLines = [
  { code: "def greet(name):", indent: 0 },
  { code: "if name:", indent: 1 },
  { code: 'return f"Hi {name}"', indent: 2 },
  { code: 'return "Hi"', indent: 1 },
];

describe("ext:ref-parsons end-to-end", () => {
  it("validates a declared + registered parsons exercise", () => {
    const result = validateLesson(lessonWith(parsonsExercise(greetLines)), {
      extensions: [refParsonsExtension],
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const result = validateLesson(lessonWith(parsonsExercise(greetLines)));
    expect(result.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("surfaces the extension's own payload errors", () => {
    const registry = { extensions: [refParsonsExtension] };

    const notArray = validateLesson(lessonWith(parsonsExercise("nope")), registry);
    expect(notArray.errors.some((issue) => issue.id === "E-EXT-REFPARSONS-SHAPE")).toBe(true);

    const missingIndent = validateLesson(lessonWith(parsonsExercise([{ code: "x = 1" }, { code: "y = 2" }])), registry);
    expect(missingIndent.errors.some((issue) => issue.id === "E-EXT-REFPARSONS-SHAPE")).toBe(true);

    const tooFew = validateLesson(lessonWith(parsonsExercise([greetLines[0]])), registry);
    expect(tooFew.errors.some((issue) => issue.id === "E-EXT-REFPARSONS-MIN")).toBe(true);

    const emptyCode = validateLesson(
      lessonWith(parsonsExercise([{ code: "   ", indent: 0 }, greetLines[1]])),
      registry,
    );
    expect(emptyCode.errors.some((issue) => issue.id === "E-EXT-REFPARSONS-CODE")).toBe(true);

    const negativeIndent = validateLesson(
      lessonWith(parsonsExercise([{ code: "x = 1", indent: -1 }, greetLines[1]])),
      registry,
    );
    expect(negativeIndent.errors.some((issue) => issue.id === "E-EXT-REFPARSONS-INDENT")).toBe(true);

    const fractionalIndent = validateLesson(
      lessonWith(parsonsExercise([{ code: "x = 1", indent: 1.5 }, greetLines[1]])),
      registry,
    );
    expect(fractionalIndent.errors.some((issue) => issue.id === "E-EXT-REFPARSONS-INDENT")).toBe(true);
  });

  it("accepts repeated code lines (a real program may contain the same statement twice)", () => {
    const result = validateLesson(
      lessonWith(
        parsonsExercise([
          { code: "for i in range(3):", indent: 0 },
          { code: "print(i)", indent: 1 },
          { code: "print(i)", indent: 1 },
        ]),
      ),
      { extensions: [refParsonsExtension] },
    );
    expect(result.errors).toEqual([]);
  });

  it("renders (consumer half) the prompt over the lines indented four spaces per level", () => {
    const rendered = renderRefParsons(parsonsExercise(greetLines));
    expect(rendered).toBe(
      [
        "Arrange the lines into a working function",
        "def greet(name):",
        "    if name:",
        '        return f"Hi {name}"',
        '    return "Hi"',
      ].join("\n"),
    );
  });

  it("grades (consumer half) order AND indentation, both must match", () => {
    const exercise = parsonsExercise(greetLines);
    expect(gradeRefParsons(exercise, { order: [0, 1, 2, 3], indents: [0, 1, 2, 1] })).toBe(true);
    expect(gradeRefParsons(exercise, { order: [0, 1, 2, 3], indents: [0, 1, 1, 1] })).toBe(false);
    expect(gradeRefParsons(exercise, { order: [0, 1, 3, 2], indents: [0, 1, 1, 2] })).toBe(false);
    expect(gradeRefParsons(exercise, { order: [0, 1, 2], indents: [0, 1, 2] })).toBe(false);
  });

  it("grades a malformed payload as incorrect rather than throwing", () => {
    expect(gradeRefParsons(parsonsExercise("nope"), { order: [0], indents: [0] })).toBe(false);
  });
});
