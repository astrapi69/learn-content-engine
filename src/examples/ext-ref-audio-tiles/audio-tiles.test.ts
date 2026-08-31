import { describe, it, expect } from "vitest";

import {
  refAudioTilesExtension,
  renderRefAudioTiles,
  gradeRefAudioTiles,
} from "./audio-tiles-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-audio-tiles: a spoken
 * source-language sentence, built up as a target-language translation from
 * word tiles (engine#68 / idea 2: "sentence shown+spoken in language A, build
 * the translation in language B from tiles"). Core word_tiles already covers
 * the puzzle mechanic itself (``tiles`` + ``accept_orderings``), but carries
 * no audio - so instead of pairing a core exercise with a bare
 * ``ext_payload.audio``, this bundles audio + tiles into ONE self-contained
 * ext_payload, matching the established "no core fields + ext_payload
 * coexistence" pattern the other reference extensions already use.
 */

const AUDIO = "assets/audio/je-suis-ici.mp3";
const TILES = ["ich", "bin", "hier"];

const audioTilesExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-audio-tiles",
    prompt: "Höre den Satz und baue die Übersetzung aus den Kacheln.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Audio tiles lesson",
  requires_extensions: ["ext:ref-audio-tiles@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const wellFormed = { audio: AUDIO, tiles: TILES };

describe("ext:ref-audio-tiles end-to-end", () => {
  it("validates a declared + registered audio-tiles exercise", () => {
    const validated = validateLesson(lessonWith(audioTilesExercise(wellFormed)), {
      extensions: [refAudioTilesExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(audioTilesExercise(wellFormed)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a payload without audio with a single shape error", () => {
    const noAudio = validateLesson(lessonWith(audioTilesExercise({ tiles: TILES })), {
      extensions: [refAudioTilesExtension],
    });
    expect(noAudio.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-SHAPE")).toBe(true);
  });

  it("rejects a payload without tiles with a shape error", () => {
    const noTiles = validateLesson(lessonWith(audioTilesExercise({ audio: AUDIO })), {
      extensions: [refAudioTilesExtension],
    });
    expect(noTiles.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-SHAPE")).toBe(true);
  });

  it("rejects a non-string tile with a shape error", () => {
    const wrongTile = validateLesson(
      lessonWith(audioTilesExercise({ audio: AUDIO, tiles: ["ich", 1] })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(wrongTile.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-SHAPE")).toBe(true);
  });

  it("requires a non-empty audio reference", () => {
    const blankAudio = validateLesson(
      lessonWith(audioTilesExercise({ audio: "  ", tiles: TILES })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(blankAudio.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-AUDIO")).toBe(true);
  });

  it("requires at least 2 tiles", () => {
    const oneTile = validateLesson(
      lessonWith(audioTilesExercise({ audio: AUDIO, tiles: ["ich"] })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(oneTile.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-TILES")).toBe(true);
  });

  it("boundary: exactly 2 tiles is the smallest valid puzzle", () => {
    const minimal = validateLesson(
      lessonWith(audioTilesExercise({ audio: AUDIO, tiles: ["ich", "hier"] })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("accepts an omitted accept_orderings (only the canonical order is accepted)", () => {
    const noOrderings = validateLesson(lessonWith(audioTilesExercise(wellFormed)), {
      extensions: [refAudioTilesExtension],
    });
    expect(noOrderings.errors).toEqual([]);
  });

  it("accepts a valid accept_orderings permutation", () => {
    const validOrdering = validateLesson(
      lessonWith(audioTilesExercise({ ...wellFormed, accept_orderings: [[0, 1, 2]] })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(validOrdering.errors).toEqual([]);
  });

  it("rejects an accept_orderings entry that is not a permutation of the tile indices", () => {
    const badOrdering = validateLesson(
      lessonWith(audioTilesExercise({ ...wellFormed, accept_orderings: [[0, 1, 1]] })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(badOrdering.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-ORDERINGS")).toBe(true);
  });

  it("rejects an accept_orderings entry of the wrong length", () => {
    const shortOrdering = validateLesson(
      lessonWith(audioTilesExercise({ ...wellFormed, accept_orderings: [[0, 1]] })),
      { extensions: [refAudioTilesExtension] },
    );
    expect(shortOrdering.errors.some((issue) => issue.id === "E-EXT-REFAUDIOTILES-ORDERINGS")).toBe(true);
  });

  it("renders (consumer half) the prompt over the audio reference and tiles", () => {
    const rendered = renderRefAudioTiles(audioTilesExercise(wellFormed));
    expect(rendered).toBe(
      ["Höre den Satz und baue die Übersetzung aus den Kacheln.", `[audio] ${AUDIO}`, `[tiles] ${TILES.join(", ")}`].join(
        "\n",
      ),
    );
  });

  it("renders the bare prompt when the payload is malformed", () => {
    const rendered = renderRefAudioTiles(audioTilesExercise({ tiles: TILES }));
    expect(rendered).toBe("Höre den Satz und baue die Übersetzung aus den Kacheln.");
  });

  it("grades (consumer half) the canonical order when accept_orderings is absent", () => {
    const exercise = audioTilesExercise(wellFormed);
    expect(gradeRefAudioTiles(exercise, [0, 1, 2])).toBe(true);
    expect(gradeRefAudioTiles(exercise, [1, 0, 2])).toBe(false);
  });

  it("grades an accepted alternative ordering as correct", () => {
    const exercise = audioTilesExercise({ ...wellFormed, accept_orderings: [[0, 2, 1]] });
    expect(gradeRefAudioTiles(exercise, [0, 2, 1])).toBe(true);
    expect(gradeRefAudioTiles(exercise, [0, 1, 2])).toBe(false);
  });

  it("grades a malformed payload as incorrect rather than throwing", () => {
    expect(gradeRefAudioTiles(audioTilesExercise({ tiles: TILES }), [0, 1, 2])).toBe(false);
  });
});
