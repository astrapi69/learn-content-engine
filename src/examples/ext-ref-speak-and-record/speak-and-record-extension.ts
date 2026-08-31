/**
 * Example extension ``ext:ref-speak-and-record`` - a speaker button reads a
 * sentence, a "show" button reveals its text, a "record" button lets the
 * learner record themselves saying it (engine#68 / idea 3). Unlike every
 * other reference extension this one is deliberately UNGRADED: there is
 * nothing to check a recording against, so the payload carries no ``accept``
 * list and this module exposes no grade function - a consumer treats it as a
 * self-review activity, not a scored exercise (see the adaptive-learner
 * adoption notes for how an ungraded exercise still flows through the
 * standard step-completion pipeline with zero SRS rows).
 *
 * The payload is self-contained (Option A): no card reference, everything the
 * consumer needs is in ``ext_payload``. ``audio`` is OPTIONAL: when an author
 * has not recorded a reference clip, the consumer falls back to on-device
 * speech synthesis of ``sentence`` (the app's existing TTS affordance already
 * does this for plain text elsewhere). The engine validates only the SHAPE of
 * ``sentence`` (required, non-empty) and ``audio`` (optional, but a string
 * when present) - it knows nothing about capturing, storing or playing back
 * the learner's OWN recording, which is entirely consumer-side (genuinely new
 * capability there: no Blob/MediaRecorder storage precedent existed before
 * this feature).
 *
 * Note on stability: the payload is a first cut. Open sub-decisions (a target
 * recording length, multiple reference speakers, phoneme-level feedback) are
 * exactly why this is an extension - the ``@major`` pin lets the payload
 * evolve without migrating core content. Excluded from the published build
 * (tsconfig.build); a production adoption uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-speak-and-record";

/** The ``ext_payload`` shape ``ext:ref-speak-and-record`` expects. */
interface SpeakAndRecordPayload {
  sentence: string;
  audio?: string;
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload, or null when it is not shaped right. */
function asSpeakAndRecordPayload(exercise: Exercise): SpeakAndRecordPayload | null {
  const payload = exercise.ext_payload as { sentence?: unknown; audio?: unknown } | undefined;
  if (!payload) return null;
  if (typeof payload.sentence !== "string") return null;
  if (payload.audio !== undefined && typeof payload.audio !== "string") return null;
  return { sentence: payload.sentence, audio: payload.audio };
}

/** ENGINE half: validate one ``ext:ref-speak-and-record`` payload. */
export const refSpeakAndRecordExtension: ExerciseExtension = {
  type: "ext:ref-speak-and-record",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asSpeakAndRecordPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFSPEAKRECORD-SHAPE",
          "ext:ref-speak-and-record requires 'ext_payload' with sentence (string) and an optional audio (string)",
        ),
      ];
    }
    if (payload.sentence.trim() === "") {
      return [issue("E-EXT-REFSPEAKRECORD-SENTENCE", "ext:ref-speak-and-record requires a non-empty sentence")];
    }
    return [];
  },
};

/**
 * CONSUMER half: render the prompt over the sentence and, when authored, the
 * audio reference. A real consumer would mount its speaker/show/record
 * buttons here; this string form keeps the demo framework-agnostic and
 * testable. Falls back to the bare prompt when the payload is malformed.
 */
export function renderRefSpeakAndRecord(exercise: Exercise): string {
  const payload = asSpeakAndRecordPayload(exercise);
  if (!payload) return exercise.prompt;
  const lines = [exercise.prompt, `[sentence] ${payload.sentence}`];
  if (payload.audio) lines.push(`[audio] ${payload.audio}`);
  return lines.join("\n");
}
