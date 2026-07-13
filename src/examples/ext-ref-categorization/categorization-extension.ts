/**
 * Example extension ``ext:ref-categorization`` - "sort these items into their
 * buckets". One of the two adoption candidates from the external review
 * (adaptive-learner#1579), worked out end-to-end as a decision basis. Like the
 * reference extension it ships BOTH halves in one place:
 *
 *  - the ENGINE half ({@link refCategorizationExtension}) - an
 *    {@link ExerciseExtension} validating the ``ext_payload``;
 *  - the CONSUMER half ({@link renderRefCategorization} +
 *    {@link gradeRefCategorization}) - a minimal renderer and grader a host
 *    would register on its side.
 *
 * This lives under ``src/examples`` and is excluded from the published build
 * (tsconfig.build) - it is a demonstration, not part of the package API. A
 * production adoption would ship under its own vendor namespace, not ``ref``.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-categorization";

/** One target bucket: a name plus the items that belong into it. */
interface CategoryBucket {
  name: string;
  items: string[];
}

/** The ``ext_payload`` shape ``ext:ref-categorization`` expects. */
interface CategorizationPayload {
  /** At least two buckets; names unique, every item in exactly one bucket. */
  categories: CategoryBucket[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload as a CategorizationPayload, or null when it is not shaped right. */
function asCategorizationPayload(exercise: Exercise): CategorizationPayload | null {
  const categories = (exercise.ext_payload as { categories?: unknown } | undefined)?.categories;
  if (!Array.isArray(categories)) return null;
  const shapedRight = categories.every(
    (bucket) =>
      typeof bucket === "object" &&
      bucket !== null &&
      typeof (bucket as CategoryBucket).name === "string" &&
      Array.isArray((bucket as CategoryBucket).items) &&
      (bucket as CategoryBucket).items.every((item) => typeof item === "string"),
  );
  return shapedRight ? { categories: categories as CategoryBucket[] } : null;
}

/** ENGINE half: validate one ``ext:ref-categorization`` exercise's payload. */
export const refCategorizationExtension: ExerciseExtension = {
  type: "ext:ref-categorization",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asCategorizationPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFCATEG-SHAPE",
          "ext:ref-categorization requires 'ext_payload.categories' as an array of {name, items[]}",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.categories.length < 2) {
      issues.push(issue("E-EXT-REFCATEG-MIN", "ext:ref-categorization requires at least 2 categories"));
    }
    if (payload.categories.some((bucket) => bucket.items.length === 0)) {
      issues.push(issue("E-EXT-REFCATEG-ITEMS", "ext:ref-categorization categories need at least 1 item each"));
    }
    if (payload.categories.some((bucket) => bucket.items.some((item) => item.trim() === ""))) {
      issues.push(issue("E-EXT-REFCATEG-EMPTY", "ext:ref-categorization items must be non-empty"));
    }
    const bucketNames = payload.categories.map((bucket) => bucket.name);
    if (new Set(bucketNames).size !== bucketNames.length) {
      issues.push(issue("E-EXT-REFCATEG-DUPNAME", "ext:ref-categorization category names must be unique"));
    }
    const allItems = payload.categories.flatMap((bucket) => bucket.items);
    if (new Set(allItems).size !== allItems.length) {
      issues.push(
        issue(
          "E-EXT-REFCATEG-DUPITEM",
          "ext:ref-categorization items must appear in exactly one category (a duplicate makes grading ambiguous)",
        ),
      );
    }
    return issues;
  },
};

/**
 * CONSUMER half: render one ``ext:ref-categorization`` exercise to plain text -
 * the bucket names and the combined item pool. A real consumer would shuffle
 * the pool and return its UI framework's nodes; this deterministic string form
 * keeps the demo framework-agnostic and testable.
 */
export function renderRefCategorization(exercise: Exercise): string {
  const payload = asCategorizationPayload(exercise);
  const categories = payload ? payload.categories : [];
  const bucketRow = `Kategorien: ${categories.map((bucket) => bucket.name).join(" | ")}`;
  const poolRow = `Items: ${categories.flatMap((bucket) => bucket.items).join(", ")}`;
  return [exercise.prompt, bucketRow, poolRow].join("\n");
}

/**
 * CONSUMER half: grade a learner's assignment (item -> category name). Correct
 * iff EVERY authored item is assigned to its authored bucket; a missing or
 * misplaced item fails, unknown extra keys are ignored.
 */
export function gradeRefCategorization(
  exercise: Exercise,
  assignment: Readonly<Record<string, string>>,
): boolean {
  const payload = asCategorizationPayload(exercise);
  if (!payload) return false;
  return payload.categories.every((bucket) =>
    bucket.items.every((item) => assignment[item] === bucket.name),
  );
}
