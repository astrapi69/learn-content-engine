import { describe, it, expect } from "vitest";

import { refOrderingExtension, renderRefOrdering } from "./ordering-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof of the extension seam with the reference extension
 * ext:ref-ordering: a lesson declares + carries the ext type, the engine half
 * validates it through validateLesson's registry, and the consumer half renders
 * it. Nothing here touches core exercise types.
 */

const orderingExercise = (items: unknown): Exercise =>
  ({ id: "e1", type: "ext:ref-ordering", prompt: "Order the planets by distance", ext_payload: { items } }) as Exercise;

const lessonWith = (exercise: Exercise, requires: string[] = ["ext:ref-ordering@1"]) => ({
  id: "l1",
  title: "Ordering lesson",
  requires_extensions: requires,
  steps: [{ id: "s1", type: "exercise", exercise }],
});

describe("ext:ref-ordering end-to-end", () => {
  it("validates a declared + registered ordering exercise", () => {
    const result = validateLesson(lessonWith(orderingExercise(["Mercury", "Venus", "Earth"])), {
      extensions: [refOrderingExtension],
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const result = validateLesson(lessonWith(orderingExercise(["Mercury", "Venus"])));
    expect(result.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("surfaces the extension's own payload errors (too few / duplicate items)", () => {
    const tooFew = validateLesson(lessonWith(orderingExercise(["only"])), { extensions: [refOrderingExtension] });
    expect(tooFew.errors.some((issue) => issue.id === "E-EXT-REFORDER-MIN")).toBe(true);

    const dup = validateLesson(lessonWith(orderingExercise(["a", "a"])), { extensions: [refOrderingExtension] });
    expect(dup.errors.some((issue) => issue.id === "E-EXT-REFORDER-DUP")).toBe(true);
  });

  it("renders (consumer half) to a numbered list under the prompt", () => {
    const rendered = renderRefOrdering(orderingExercise(["Mercury", "Venus", "Earth"]));
    expect(rendered).toBe("Order the planets by distance\n1. Mercury\n2. Venus\n3. Earth");
  });
});
