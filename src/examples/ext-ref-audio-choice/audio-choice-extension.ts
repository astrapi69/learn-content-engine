/**
 * Example extension ``ext:ref-audio-choice`` - a gapped sentence with N audio
 * options, one of which fills the gap ("listen to the words, pick the one
 * that fits"). The flat core schema has no audio-option choice type:
 * ``images`` is ``picture_choice``'s visual twin (an exactly-one-correct
 * OPTION list), ``multiple_choice``'s options carry text only, and
 * ``free_text`` carries no media. So instead of a core-schema change it is
 * modelled as a SINGLE ext exercise whose ``ext_payload`` carries the gapped
 * sentence plus the audio options (engine#68 - an audio player is a consumer
 * capability, not a core field rippling through every exercise type).
 *
 * The payload is self-contained (Option A): no card reference, everything the
 * consumer needs is in ``ext_payload``. The engine validates only the SHAPE
 * of ``sentence`` and each option's ``audio``, plus the exactly-one-correct
 * contract - mirrored from core picture_choice's own ``E-PIC-ONE-CORRECT``
 * check, not reused directly (that check lives on ``exercise.images``, not an
 * ext_payload option list). Deliberately NO label/text field on an option: a
 * visible word next to its audio would spoil a listening exercise the same
 * way alt-text would spoil an image one (mirrors ``ext:ref-image-description``'s
 * reasoning for omitting alt-text).
 *
 * Note on stability: the payload is a first cut. Open sub-decisions (more than
 * two options, partial audio playback speed, per-option distractor audio
 * reuse) are exactly why this is an extension - the ``@major`` pin lets the
 * payload evolve without migrating core content. Excluded from the published
 * build (tsconfig.build); a production adoption uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-audio-choice";

/** One audio option in an ``ext:ref-audio-choice`` payload. */
interface AudioChoiceOption {
  audio: string;
  is_correct?: "true";
}

/** The ``ext_payload`` shape ``ext:ref-audio-choice`` expects. */
interface AudioChoicePayload {
  sentence: string;
  options: AudioChoiceOption[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

function asAudioChoiceOption(value: unknown): AudioChoiceOption | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { audio?: unknown; is_correct?: unknown };
  if (typeof candidate.audio !== "string") return null;
  if (candidate.is_correct !== undefined && candidate.is_correct !== "true") return null;
  return { audio: candidate.audio, is_correct: candidate.is_correct as "true" | undefined };
}

/** Read the payload, or null when it is not shaped right. */
function asAudioChoicePayload(exercise: Exercise): AudioChoicePayload | null {
  const payload = exercise.ext_payload as { sentence?: unknown; options?: unknown } | undefined;
  if (!payload) return null;
  if (typeof payload.sentence !== "string") return null;
  if (!Array.isArray(payload.options) || payload.options.length < 2) return null;
  const options = payload.options.map(asAudioChoiceOption);
  if (options.some((option) => option === null)) return null;
  return { sentence: payload.sentence, options: options as AudioChoiceOption[] };
}

/** ENGINE half: validate one ``ext:ref-audio-choice`` payload. */
export const refAudioChoiceExtension: ExerciseExtension = {
  type: "ext:ref-audio-choice",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asAudioChoicePayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFAUDIOCHOICE-SHAPE",
          "ext:ref-audio-choice requires 'ext_payload' with sentence (string) and at least 2 options ({audio: string, is_correct?: 'true'})",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.sentence.trim() === "" || !payload.sentence.includes("___")) {
      issues.push(
        issue(
          "E-EXT-REFAUDIOCHOICE-SENTENCE",
          "ext:ref-audio-choice requires a non-empty sentence containing the gap marker '___'",
        ),
      );
    }
    if (payload.options.some((option) => option.audio.trim() === "")) {
      issues.push(
        issue("E-EXT-REFAUDIOCHOICE-AUDIO", "ext:ref-audio-choice requires every option's audio to be non-empty"),
      );
    }
    const correctCount = payload.options.filter((option) => option.is_correct === "true").length;
    if (correctCount !== 1) {
      issues.push(
        issue(
          "E-EXT-REFAUDIOCHOICE-CORRECT",
          "ext:ref-audio-choice requires exactly one option marked is_correct: 'true'",
        ),
      );
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the sentence over every option's audio reference. A
 * real consumer would mount its audio buttons here; this string form keeps
 * the demo framework-agnostic and testable. Falls back to the bare prompt
 * when the payload is malformed.
 */
export function renderRefAudioChoice(exercise: Exercise): string {
  const payload = asAudioChoicePayload(exercise);
  if (!payload) return exercise.prompt;
  return [payload.sentence, ...payload.options.map((option) => `[audio] ${option.audio}`)].join("\n");
}

/**
 * CONSUMER half: grade the learner's chosen option (identified by its
 * ``audio`` reference) against the option marked ``is_correct: 'true'``. A
 * malformed payload, or a payload with no single correct option, grades as
 * incorrect rather than throwing.
 */
export function gradeRefAudioChoice(exercise: Exercise, chosenAudio: string): boolean {
  const payload = asAudioChoicePayload(exercise);
  if (!payload) return false;
  const correct = payload.options.filter((option) => option.is_correct === "true");
  if (correct.length !== 1) return false;
  return correct[0]!.audio === chosenAudio;
}
