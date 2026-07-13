import { describe, it, expect } from "vitest";

import {
  refCategorizationExtension,
  renderRefCategorization,
  gradeRefCategorization,
} from "./categorization-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-categorization ("sort
 * these items into their buckets") - one of the two adoption candidates from
 * the external review (adaptive-learner#1579). Mirrors the ref-ordering test:
 * declared + registered validates, undeclared is refused loudly, payload
 * errors surface, and the consumer half renders and grades.
 */

const categorizationExercise = (categories: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-categorization",
    prompt: "Ordne die Signale der richtigen Kategorie zu",
    ext_payload: { categories },
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Categorization lesson",
  requires_extensions: ["ext:ref-categorization@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const SIGNAL_CATEGORIES = [
  { name: "Sichtzeichen", items: ["flache Hand", "Zeigefinger hoch"] },
  { name: "Hoerzeichen", items: ["Sitz", "Platz"] },
];

describe("ext:ref-categorization end-to-end", () => {
  it("validates a declared + registered categorization exercise", () => {
    const validated = validateLesson(lessonWith(categorizationExercise(SIGNAL_CATEGORIES)), {
      extensions: [refCategorizationExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(categorizationExercise(SIGNAL_CATEGORIES)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a malformed payload with a single shape error", () => {
    const malformed = validateLesson(lessonWith(categorizationExercise("not-an-array")), {
      extensions: [refCategorizationExtension],
    });
    expect(malformed.errors.some((issue) => issue.id === "E-EXT-REFCATEG-SHAPE")).toBe(true);
  });

  it("requires at least two categories (one bucket is no categorization)", () => {
    const single = validateLesson(
      lessonWith(categorizationExercise([{ name: "Sichtzeichen", items: ["flache Hand"] }])),
      { extensions: [refCategorizationExtension] },
    );
    expect(single.errors.some((issue) => issue.id === "E-EXT-REFCATEG-MIN")).toBe(true);
  });

  it("requires every category to carry at least one non-empty item", () => {
    const emptyBucket = validateLesson(
      lessonWith(
        categorizationExercise([
          { name: "Sichtzeichen", items: [] },
          { name: "Hoerzeichen", items: ["Sitz"] },
        ]),
      ),
      { extensions: [refCategorizationExtension] },
    );
    expect(emptyBucket.errors.some((issue) => issue.id === "E-EXT-REFCATEG-ITEMS")).toBe(true);

    const blankItem = validateLesson(
      lessonWith(
        categorizationExercise([
          { name: "Sichtzeichen", items: ["  "] },
          { name: "Hoerzeichen", items: ["Sitz"] },
        ]),
      ),
      { extensions: [refCategorizationExtension] },
    );
    expect(blankItem.errors.some((issue) => issue.id === "E-EXT-REFCATEG-EMPTY")).toBe(true);
  });

  it("rejects duplicate category names and items appearing in two buckets (ambiguous)", () => {
    const duplicateName = validateLesson(
      lessonWith(
        categorizationExercise([
          { name: "Sichtzeichen", items: ["flache Hand"] },
          { name: "Sichtzeichen", items: ["Sitz"] },
        ]),
      ),
      { extensions: [refCategorizationExtension] },
    );
    expect(duplicateName.errors.some((issue) => issue.id === "E-EXT-REFCATEG-DUPNAME")).toBe(true);

    const duplicateItem = validateLesson(
      lessonWith(
        categorizationExercise([
          { name: "Sichtzeichen", items: ["Sitz"] },
          { name: "Hoerzeichen", items: ["Sitz"] },
        ]),
      ),
      { extensions: [refCategorizationExtension] },
    );
    expect(duplicateItem.errors.some((issue) => issue.id === "E-EXT-REFCATEG-DUPITEM")).toBe(true);
  });

  it("boundary: two categories with one item each is the smallest valid payload", () => {
    const minimal = validateLesson(
      lessonWith(
        categorizationExercise([
          { name: "Sichtzeichen", items: ["flache Hand"] },
          { name: "Hoerzeichen", items: ["Sitz"] },
        ]),
      ),
      { extensions: [refCategorizationExtension] },
    );
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("renders (consumer half) buckets and the shuffled-together item pool", () => {
    const rendered = renderRefCategorization(categorizationExercise(SIGNAL_CATEGORIES));
    expect(rendered).toBe(
      [
        "Ordne die Signale der richtigen Kategorie zu",
        "Kategorien: Sichtzeichen | Hoerzeichen",
        "Items: flache Hand, Zeigefinger hoch, Sitz, Platz",
      ].join("\n"),
    );
  });

  it("grades (consumer half): correct assignment passes, misplaced or missing item fails", () => {
    const exercise = categorizationExercise(SIGNAL_CATEGORIES);
    const correctAssignment = {
      "flache Hand": "Sichtzeichen",
      "Zeigefinger hoch": "Sichtzeichen",
      Sitz: "Hoerzeichen",
      Platz: "Hoerzeichen",
    };
    expect(gradeRefCategorization(exercise, correctAssignment)).toBe(true);
    expect(
      gradeRefCategorization(exercise, { ...correctAssignment, Sitz: "Sichtzeichen" }),
    ).toBe(false);
    const missingOne = Object.fromEntries(
      Object.entries(correctAssignment).filter(([assignedItem]) => assignedItem !== "Platz"),
    );
    expect(gradeRefCategorization(exercise, missingOne)).toBe(false);
  });
});
