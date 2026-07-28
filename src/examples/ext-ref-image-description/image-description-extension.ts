/**
 * Example extension ``ext:ref-image-description`` - an image stimulus bound to
 * a typed answer ("look at the picture, then describe it" / answer a question
 * about it). The visual twin of ``ext:ref-dictation``: the flat core schema
 * has no image-stimulus free-text type (``images`` is the picture_choice
 * OPTION list with an exactly-one-correct contract, and ``free_text`` carries
 * no media), so instead of a core-schema change it is modelled as a SINGLE ext
 * exercise whose ``ext_payload`` carries the image reference plus the accepted
 * answers.
 *
 * The payload is self-contained (Option A): no card reference, everything the
 * consumer needs is in ``ext_payload``. The engine validates only the SHAPE of
 * ``src`` - a non-empty string. Whether that string is a relative path into
 * the set's ``assets/`` directory or an inline data URI, and how the image is
 * stored, resolved or displayed, stays consumer-side; that keeps the reference
 * free of an asset pipeline. Deliberately NO alt-text field: a description of
 * the image would leak the expected answer, so the accessibility affordance is
 * a consumer decision, not payload data.
 *
 * Note on stability: the payload is a first cut. Open sub-decisions (typo
 * tolerance, multiple images, hint images) are exactly why this is an
 * extension - the ``@major`` pin lets the payload evolve without migrating
 * core content. Excluded from the published build (tsconfig.build); a
 * production adoption uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-image-description";

/** The ``ext_payload`` shape ``ext:ref-image-description`` expects. */
interface ImageDescriptionPayload {
  src: string;
  accept: string[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload, or null when it is not shaped right. */
function asImageDescriptionPayload(exercise: Exercise): ImageDescriptionPayload | null {
  const payload = exercise.ext_payload as { src?: unknown; accept?: unknown } | undefined;
  if (!payload) return null;
  if (typeof payload.src !== "string") return null;
  if (!Array.isArray(payload.accept) || !payload.accept.every((entry) => typeof entry === "string")) {
    return null;
  }
  return { src: payload.src, accept: payload.accept as string[] };
}

/** ENGINE half: validate one ``ext:ref-image-description`` payload. */
export const refImageDescriptionExtension: ExerciseExtension = {
  type: "ext:ref-image-description",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asImageDescriptionPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFIMGDESC-SHAPE",
          "ext:ref-image-description requires 'ext_payload' with src (string) and accept (string[])",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.src.trim() === "") {
      issues.push(
        issue("E-EXT-REFIMGDESC-SRC", "ext:ref-image-description requires a non-empty image reference"),
      );
    }
    if (payload.accept.filter((entry) => entry.trim() !== "").length === 0) {
      issues.push(
        issue(
          "E-EXT-REFIMGDESC-ACCEPT",
          "ext:ref-image-description requires at least 1 non-empty accept entry",
        ),
      );
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the prompt over the image reference. A real consumer
 * would mount its image view here; this string form keeps the demo
 * framework-agnostic and testable. Falls back to the bare prompt when the
 * payload is malformed.
 */
export function renderRefImageDescription(exercise: Exercise): string {
  const payload = asImageDescriptionPayload(exercise);
  if (!payload) return exercise.prompt;
  return [exercise.prompt, `[image] ${payload.src}`].join("\n");
}

/** Normalise a typed answer for tolerant comparison (trim + case-fold). */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * CONSUMER half: grade the learner's answer against EVERY ``accept`` entry,
 * tolerantly (trim + case-fold; a production consumer would reuse its
 * free-text matcher for typo tolerance). A malformed payload grades as
 * incorrect rather than throwing.
 */
export function gradeRefImageDescription(exercise: Exercise, answer: string): boolean {
  const payload = asImageDescriptionPayload(exercise);
  if (!payload) return false;
  return payload.accept.some((entry) => entry.trim() !== "" && normalize(entry) === normalize(answer));
}
