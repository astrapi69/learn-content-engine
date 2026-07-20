/**
 * Example extension ``ext:ref-dictation`` - an audio stimulus bound to a typed
 * transcription ("listen, then write what you hear"). The flat core schema has
 * no audio-stimulus exercise type and ``free_text`` carries no media, so
 * instead of a core-schema change it is modelled as a SINGLE ext exercise whose
 * ``ext_payload`` carries the audio reference plus the accepted transcriptions
 * (engine#68 - decided as an extension, not a core type: an audio player is a
 * consumer capability, and a core ``audio`` field would ripple through every
 * exercise type for one bounded case).
 *
 * The payload is self-contained (Option A): no card reference, everything the
 * consumer needs is in ``ext_payload``. The engine validates only the SHAPE of
 * ``audio`` - a non-empty string. It deliberately knows nothing about how the
 * clip is stored, uploaded, resolved or played; that stays consumer-side, which
 * is what keeps the reference free of an asset pipeline.
 *
 * Note on stability: the payload is a first cut. Open sub-decisions (per-clip
 * playback limits, slow-speed variants, partial-credit scoring) are exactly why
 * this is an extension - the ``@major`` pin lets the payload evolve without
 * migrating core content. Excluded from the published build (tsconfig.build);
 * a production adoption uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-dictation";

/** The ``ext_payload`` shape ``ext:ref-dictation`` expects. */
interface DictationPayload {
  audio: string;
  accept: string[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload, or null when it is not shaped right. */
function asDictationPayload(exercise: Exercise): DictationPayload | null {
  const payload = exercise.ext_payload as { audio?: unknown; accept?: unknown } | undefined;
  if (!payload) return null;
  if (typeof payload.audio !== "string") return null;
  if (!Array.isArray(payload.accept) || !payload.accept.every((entry) => typeof entry === "string")) {
    return null;
  }
  return { audio: payload.audio, accept: payload.accept as string[] };
}

/** ENGINE half: validate one ``ext:ref-dictation`` payload. */
export const refDictationExtension: ExerciseExtension = {
  type: "ext:ref-dictation",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asDictationPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFDICT-SHAPE",
          "ext:ref-dictation requires 'ext_payload' with audio (string) and accept (string[])",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.audio.trim() === "") {
      issues.push(issue("E-EXT-REFDICT-AUDIO", "ext:ref-dictation requires a non-empty audio reference"));
    }
    if (payload.accept.filter((entry) => entry.trim() !== "").length === 0) {
      issues.push(issue("E-EXT-REFDICT-ACCEPT", "ext:ref-dictation requires at least 1 non-empty accept entry"));
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the prompt over the audio reference. A real consumer
 * would mount its player here; this string form keeps the demo
 * framework-agnostic and testable. Falls back to the bare prompt when the
 * payload is malformed.
 */
export function renderRefDictation(exercise: Exercise): string {
  const payload = asDictationPayload(exercise);
  if (!payload) return exercise.prompt;
  return [exercise.prompt, `[audio] ${payload.audio}`].join("\n");
}

/** Normalise a typed transcription for tolerant comparison (trim + case-fold). */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * CONSUMER half: grade the learner's transcription against EVERY ``accept``
 * entry, tolerantly (trim + case-fold; a production consumer would reuse its
 * free-text matcher for typo tolerance). A malformed payload grades as
 * incorrect rather than throwing.
 */
export function gradeRefDictation(exercise: Exercise, answer: string): boolean {
  const payload = asDictationPayload(exercise);
  if (!payload) return false;
  return payload.accept.some((entry) => entry.trim() !== "" && normalize(entry) === normalize(answer));
}
