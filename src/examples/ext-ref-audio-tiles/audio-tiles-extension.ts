/**
 * Example extension ``ext:ref-audio-tiles`` - a spoken source-language
 * sentence, built up as a target-language translation from word tiles
 * ("listen to the sentence, arrange the translation from tiles"). Core
 * ``word_tiles`` already covers the puzzle mechanic (``tiles`` +
 * ``accept_orderings``), but carries no audio and no source-language
 * sentence. Rather than pairing a core ``word_tiles`` exercise with a bare
 * ``ext_payload.audio`` - an untested "core fields + ext_payload coexist"
 * pattern nobody has exercised yet - this bundles audio + tiles into ONE
 * self-contained ``ext_payload`` (engine#68), matching ``ext:ref-dictation``'s
 * and ``ext:ref-image-description``'s established shape.
 *
 * The payload is self-contained (Option A): no card reference, everything the
 * consumer needs is in ``ext_payload``. The engine validates only the SHAPE
 * of ``audio`` and ``tiles``, plus ``accept_orderings`` when present - the
 * same permutation rule core ``word_tiles`` enforces on its own
 * ``accept_orderings`` field (mirrored, not reused directly: the core check
 * runs on ``exercise.tiles``/``exercise.accept_orderings``, this one on the
 * ext_payload's own fields). There is no ``direction`` field: the payload is
 * already direction-specific by construction (``audio`` = source language,
 * ``tiles`` = target language), so a separate direction toggle would be
 * meaningless here.
 *
 * Note on stability: the payload is a first cut. Open sub-decisions (reverse
 * direction, per-tile audio, distractor tiles) are exactly why this is an
 * extension - the ``@major`` pin lets the payload evolve without migrating
 * core content. Excluded from the published build (tsconfig.build); a
 * production adoption uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-audio-tiles";

/** The ``ext_payload`` shape ``ext:ref-audio-tiles`` expects. */
interface AudioTilesPayload {
  audio: string;
  tiles: string[];
  accept_orderings?: number[][];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** Read the payload, or null when it is not shaped right. */
function asAudioTilesPayload(exercise: Exercise): AudioTilesPayload | null {
  const payload = exercise.ext_payload as
    | { audio?: unknown; tiles?: unknown; accept_orderings?: unknown }
    | undefined;
  if (!payload) return null;
  if (typeof payload.audio !== "string") return null;
  if (!Array.isArray(payload.tiles) || !payload.tiles.every((tile) => typeof tile === "string")) return null;
  if (payload.accept_orderings !== undefined) {
    const orderings = payload.accept_orderings;
    if (
      !Array.isArray(orderings) ||
      !orderings.every(
        (ordering) => Array.isArray(ordering) && ordering.every((index) => typeof index === "number"),
      )
    ) {
      return null;
    }
  }
  return {
    audio: payload.audio,
    tiles: payload.tiles as string[],
    accept_orderings: payload.accept_orderings as number[][] | undefined,
  };
}

/** Whether ``ordering`` is a permutation of ``[0..tileCount - 1]``. */
function isPermutation(ordering: number[], tileCount: number): boolean {
  const expected = Array.from({ length: tileCount }, (_unused, index) => index);
  const sorted = [...ordering].sort((a, b) => a - b);
  return sorted.length === expected.length && sorted.every((value, index) => value === expected[index]);
}

/** ENGINE half: validate one ``ext:ref-audio-tiles`` payload. */
export const refAudioTilesExtension: ExerciseExtension = {
  type: "ext:ref-audio-tiles",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asAudioTilesPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFAUDIOTILES-SHAPE",
          "ext:ref-audio-tiles requires 'ext_payload' with audio (string) and tiles (string[])",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.audio.trim() === "") {
      issues.push(issue("E-EXT-REFAUDIOTILES-AUDIO", "ext:ref-audio-tiles requires a non-empty audio reference"));
    }
    if (payload.tiles.length < 2) {
      issues.push(issue("E-EXT-REFAUDIOTILES-TILES", "ext:ref-audio-tiles requires at least 2 tiles"));
    }
    for (const ordering of payload.accept_orderings ?? []) {
      if (!isPermutation(ordering, payload.tiles.length)) {
        issues.push(
          issue(
            "E-EXT-REFAUDIOTILES-ORDERINGS",
            `accept_orderings entry ${JSON.stringify(ordering)} must be a permutation of [0..${payload.tiles.length - 1}]`,
          ),
        );
      }
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the prompt over the audio reference and tile list. A
 * real consumer would mount its audio player and draggable tiles here; this
 * string form keeps the demo framework-agnostic and testable. Falls back to
 * the bare prompt when the payload is malformed.
 */
export function renderRefAudioTiles(exercise: Exercise): string {
  const payload = asAudioTilesPayload(exercise);
  if (!payload) return exercise.prompt;
  return [exercise.prompt, `[audio] ${payload.audio}`, `[tiles] ${payload.tiles.join(", ")}`].join("\n");
}

/**
 * CONSUMER half: grade the learner's tile ordering against the canonical
 * order (tile indices ``[0..n-1]`` in payload order), or against any
 * ``accept_orderings`` entry when present - mirrors core word_tiles' own
 * grading contract ("if omitted, only the canonical order is accepted"). A
 * malformed payload grades as incorrect rather than throwing.
 */
export function gradeRefAudioTiles(exercise: Exercise, chosenOrder: number[]): boolean {
  const payload = asAudioTilesPayload(exercise);
  if (!payload) return false;
  const canonical = payload.tiles.map((_tile, index) => index);
  const accepted = payload.accept_orderings ?? [canonical];
  return accepted.some(
    (ordering) => ordering.length === chosenOrder.length && ordering.every((value, index) => value === chosenOrder[index]),
  );
}
