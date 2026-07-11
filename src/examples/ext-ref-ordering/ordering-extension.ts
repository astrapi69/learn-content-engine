/**
 * Reference extension ``ext:ref-ordering`` - a deliberately trivial "put these
 * items in the correct order" exercise type, used as an end-to-end proof of the
 * extension seam. It ships BOTH halves in one place:
 *
 *  - the ENGINE half ({@link refOrderingExtension}) - an {@link ExerciseExtension}
 *    that validates the ``ext_payload`` and registers with ``validateLesson``;
 *  - the CONSUMER half ({@link renderRefOrdering}) - a minimal renderer a host
 *    would register on its side.
 *
 * This lives under ``src/examples`` and is excluded from the published build
 * (tsconfig.build) - it is a demonstration, not part of the package API. A real
 * extension would ship as its own package importing the engine's
 * {@link ExerciseExtension} type. adaptive-learner would register the consumer
 * half; that wiring is not done here.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#reference-extension-extref-ordering";

/** The ``ext_payload`` shape ``ext:ref-ordering`` expects. */
interface OrderingPayload {
  /** The items in their correct order (at least two, unique, non-empty). */
  items: string[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload as an OrderingPayload, or null when it is not shaped right. */
function asOrderingPayload(exercise: Exercise): OrderingPayload | null {
  const items = (exercise.ext_payload as { items?: unknown } | undefined)?.items;
  if (!Array.isArray(items) || !items.every((item) => typeof item === "string")) return null;
  return { items: items as string[] };
}

/** ENGINE half: validate one ``ext:ref-ordering`` exercise's payload. */
export const refOrderingExtension: ExerciseExtension = {
  type: "ext:ref-ordering",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asOrderingPayload(exercise);
    if (!payload) {
      return [issue("E-EXT-REFORDER-ITEMS", "ext:ref-ordering requires 'ext_payload.items' as a string array")];
    }
    const issues: ValidationIssue[] = [];
    if (payload.items.length < 2) {
      issues.push(issue("E-EXT-REFORDER-MIN", "ext:ref-ordering requires at least 2 items"));
    }
    if (payload.items.some((item) => item.trim() === "")) {
      issues.push(issue("E-EXT-REFORDER-EMPTY", "ext:ref-ordering items must be non-empty"));
    }
    if (new Set(payload.items).size !== payload.items.length) {
      issues.push(issue("E-EXT-REFORDER-DUP", "ext:ref-ordering items must be unique (a duplicate makes the order ambiguous)"));
    }
    return issues;
  },
};

/**
 * CONSUMER half: render one ``ext:ref-ordering`` exercise to a plain-text
 * ordered list. A real consumer would return its UI framework's nodes; this
 * string form keeps the demo framework-agnostic and testable.
 */
export function renderRefOrdering(exercise: Exercise): string {
  const payload = asOrderingPayload(exercise);
  const items = payload ? payload.items : [];
  const lines = items.map((item, index) => `${index + 1}. ${item}`);
  return [exercise.prompt, ...lines].join("\n");
}
