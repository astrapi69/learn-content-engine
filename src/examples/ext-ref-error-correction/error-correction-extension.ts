/**
 * Example extension ``ext:ref-error-correction`` - "mark the wrong token in
 * the sentence and correct it". The second adoption candidate from the
 * external review (adaptive-learner#1579), worked out end-to-end as a decision
 * basis. Like the reference extension it ships BOTH halves in one place:
 *
 *  - the ENGINE half ({@link refErrorCorrectionExtension}) - an
 *    {@link ExerciseExtension} validating the ``ext_payload``;
 *  - the CONSUMER half ({@link renderRefErrorCorrection} +
 *    {@link gradeRefErrorCorrection}) - a minimal renderer and grader a host
 *    would register on its side. A production consumer would route the typed
 *    correction through its free-text matcher for typo tolerance; the demo
 *    grader keeps it at trim + case-fold.
 *
 * Accepted corrections are an ``accept`` ARRAY, mirroring the core
 * ``free_text`` contract: real sentences often allow more than one defensible
 * fix for the same wrong token ("folgt das Kommando" -> "dem" / "einem"), and
 * a single authored string would reproduce the too-narrow-accept-list class
 * of false negatives (adaptive-learner#1580). ``accept[0]`` is the canonical
 * correction a consumer surfaces after a wrong attempt
 * ({@link canonicalCorrection}).
 *
 * This lives under ``src/examples`` and is excluded from the published build
 * (tsconfig.build) - it is a demonstration, not part of the package API. A
 * production adoption would ship under its own vendor namespace, not ``ref``.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-error-correction";

/** The ``ext_payload`` shape ``ext:ref-error-correction`` expects. */
interface ErrorCorrectionPayload {
  /** The sentence as tokens (at least two, non-empty). */
  tokens: string[];
  /** Which token is wrong (0-based, inside the token range). */
  error_index: number;
  /** The accepted corrections; ``accept[0]`` is canonical (shown after a
   *  wrong attempt), every entry must differ from the marked token. */
  accept: string[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload as an ErrorCorrectionPayload, or null when it is not shaped right. */
function asErrorCorrectionPayload(exercise: Exercise): ErrorCorrectionPayload | null {
  const payload = exercise.ext_payload as
    | { tokens?: unknown; error_index?: unknown; accept?: unknown }
    | undefined;
  if (!payload) return null;
  const { tokens, error_index, accept } = payload;
  if (!Array.isArray(tokens) || !tokens.every((token) => typeof token === "string")) return null;
  if (typeof error_index !== "number") return null;
  if (!Array.isArray(accept) || !accept.every((entry) => typeof entry === "string")) return null;
  return { tokens: tokens as string[], error_index, accept: accept as string[] };
}

/** ENGINE half: validate one ``ext:ref-error-correction`` exercise's payload. */
export const refErrorCorrectionExtension: ExerciseExtension = {
  type: "ext:ref-error-correction",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asErrorCorrectionPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFERRCORR-SHAPE",
          "ext:ref-error-correction requires 'ext_payload' with tokens (string array), error_index (number), accept (string array)",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.tokens.length < 2) {
      issues.push(issue("E-EXT-REFERRCORR-TOKENS", "ext:ref-error-correction requires at least 2 tokens"));
    }
    if (payload.tokens.some((token) => token.trim() === "")) {
      issues.push(issue("E-EXT-REFERRCORR-EMPTY", "ext:ref-error-correction tokens must be non-empty"));
    }
    const indexInRange =
      Number.isInteger(payload.error_index) &&
      payload.error_index >= 0 &&
      payload.error_index < payload.tokens.length;
    if (!indexInRange) {
      issues.push(
        issue("E-EXT-REFERRCORR-INDEX", "ext:ref-error-correction error_index must be an integer inside the token range"),
      );
    }
    if (payload.accept.length === 0 || payload.accept.some((entry) => entry.trim() === "")) {
      issues.push(
        issue(
          "E-EXT-REFERRCORR-CORRECTION",
          "ext:ref-error-correction accept needs at least 1 non-empty correction",
        ),
      );
    } else if (indexInRange && payload.accept.includes(payload.tokens[payload.error_index]!)) {
      issues.push(
        issue(
          "E-EXT-REFERRCORR-NOOP",
          "ext:ref-error-correction accept entries must differ from the marked token (otherwise there is no error)",
        ),
      );
    }
    return issues;
  },
};

/**
 * CONSUMER half: render one ``ext:ref-error-correction`` exercise to a plain
 * numbered token row under the prompt. A real consumer would render tappable
 * tokens; this string form keeps the demo framework-agnostic and testable.
 */
export function renderRefErrorCorrection(exercise: Exercise): string {
  const payload = asErrorCorrectionPayload(exercise);
  const tokens = payload ? payload.tokens : [];
  const numbered = tokens.map((token, index) => `${index + 1}. ${token}`);
  return [exercise.prompt, ...numbered].join("\n");
}

/** The canonical correction (``accept[0]``) a consumer surfaces after a wrong
 *  attempt - the same first-entry-is-canonical contract as core
 *  ``free_text``. Null when the payload is malformed. */
export function canonicalCorrection(exercise: Exercise): string | null {
  const payload = asErrorCorrectionPayload(exercise);
  return payload ? (payload.accept[0] ?? null) : null;
}

/**
 * CONSUMER half: grade a learner's attempt - the tapped token index plus the
 * typed correction. Correct iff the index hits ``error_index`` and the typed
 * correction equals ANY accepted one after trim + case-fold. A production
 * consumer would reuse its free-text matcher here for typo tolerance.
 */
export function gradeRefErrorCorrection(
  exercise: Exercise,
  pickedIndex: number,
  typedCorrection: string,
): boolean {
  const payload = asErrorCorrectionPayload(exercise);
  if (!payload) return false;
  if (pickedIndex !== payload.error_index) return false;
  const normalizedInput = typedCorrection.trim().toLocaleLowerCase();
  return payload.accept.some(
    (entry) => entry.trim().toLocaleLowerCase() === normalizedInput,
  );
}
