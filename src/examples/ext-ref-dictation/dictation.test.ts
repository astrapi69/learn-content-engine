import { describe, it, expect } from "vitest";

import {
  refDictationExtension,
  renderRefDictation,
  gradeRefDictation,
} from "./dictation-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-dictation: an audio
 * stimulus bound to a typed transcription. The flat core schema has no
 * audio-stimulus exercise type, so instead of a core-schema change it is
 * modelled as a single ext exercise whose ext_payload carries the audio
 * reference plus the accepted transcriptions (engine#68).
 *
 * The payload is self-contained (no card reference): everything the consumer
 * needs is in ext_payload. The engine validates only the SHAPE of `audio` (a
 * non-empty string); resolving, uploading or playing the clip is entirely the
 * consumer's business.
 */

const AUDIO = "assets/audio/s1.mp3";
const ACCEPT = ["Der Hund läuft in den Garten", "Der Hund lief in den Garten"];

const dictationExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-dictation",
    prompt: "Hoere zu und schreibe den Satz auf.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Dictation lesson",
  requires_extensions: ["ext:ref-dictation@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const wellFormed = { audio: AUDIO, accept: ACCEPT };

describe("ext:ref-dictation end-to-end", () => {
  it("validates a declared + registered dictation exercise", () => {
    const validated = validateLesson(lessonWith(dictationExercise(wellFormed)), {
      extensions: [refDictationExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(dictationExercise(wellFormed)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a payload without audio with a single shape error", () => {
    const noAudio = validateLesson(lessonWith(dictationExercise({ accept: ACCEPT })), {
      extensions: [refDictationExtension],
    });
    expect(noAudio.errors.some((issue) => issue.id === "E-EXT-REFDICT-SHAPE")).toBe(true);
  });

  it("rejects a payload without an accept list with a shape error", () => {
    const noAccept = validateLesson(lessonWith(dictationExercise({ audio: AUDIO })), {
      extensions: [refDictationExtension],
    });
    expect(noAccept.errors.some((issue) => issue.id === "E-EXT-REFDICT-SHAPE")).toBe(true);
  });

  it("rejects a non-string accept entry with a shape error", () => {
    const wrongEntry = validateLesson(
      lessonWith(dictationExercise({ audio: AUDIO, accept: [42] })),
      { extensions: [refDictationExtension] },
    );
    expect(wrongEntry.errors.some((issue) => issue.id === "E-EXT-REFDICT-SHAPE")).toBe(true);
  });

  it("requires a non-empty audio reference", () => {
    const blankAudio = validateLesson(
      lessonWith(dictationExercise({ audio: "  ", accept: ACCEPT })),
      { extensions: [refDictationExtension] },
    );
    expect(blankAudio.errors.some((issue) => issue.id === "E-EXT-REFDICT-AUDIO")).toBe(true);
  });

  it("requires the accept list to hold at least one entry", () => {
    const emptyAccept = validateLesson(
      lessonWith(dictationExercise({ audio: AUDIO, accept: [] })),
      { extensions: [refDictationExtension] },
    );
    expect(emptyAccept.errors.some((issue) => issue.id === "E-EXT-REFDICT-ACCEPT")).toBe(true);
  });

  it("requires at least one accept entry to be non-blank", () => {
    const blankAccept = validateLesson(
      lessonWith(dictationExercise({ audio: AUDIO, accept: ["   ", ""] })),
      { extensions: [refDictationExtension] },
    );
    expect(blankAccept.errors.some((issue) => issue.id === "E-EXT-REFDICT-ACCEPT")).toBe(true);
  });

  it("boundary: one audio plus one accept entry is the smallest valid payload", () => {
    const minimal = validateLesson(
      lessonWith(dictationExercise({ audio: AUDIO, accept: ["Hallo"] })),
      { extensions: [refDictationExtension] },
    );
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("boundary: a blank entry alongside a real one still validates", () => {
    const mixed = validateLesson(
      lessonWith(dictationExercise({ audio: AUDIO, accept: ["  ", "Hallo"] })),
      { extensions: [refDictationExtension] },
    );
    expect(mixed.errors).toEqual([]);
    expect(mixed.valid).toBe(true);
  });

  it("renders (consumer half) the prompt over the audio reference", () => {
    const rendered = renderRefDictation(dictationExercise(wellFormed));
    expect(rendered).toBe(["Hoere zu und schreibe den Satz auf.", `[audio] ${AUDIO}`].join("\n"));
  });

  it("renders the bare prompt when the payload is malformed", () => {
    const rendered = renderRefDictation(dictationExercise({ accept: ACCEPT }));
    expect(rendered).toBe("Hoere zu und schreibe den Satz auf.");
  });

  it("grades (consumer half) tolerantly against every accept entry", () => {
    const exercise = dictationExercise(wellFormed);
    expect(gradeRefDictation(exercise, "  der hund läuft in den garten ")).toBe(true);
    expect(gradeRefDictation(exercise, "Der Hund lief in den Garten")).toBe(true);
    expect(gradeRefDictation(exercise, "Die Katze schlaeft")).toBe(false);
  });

  it("grades a malformed payload as incorrect rather than throwing", () => {
    expect(gradeRefDictation(dictationExercise({ audio: AUDIO }), "irgendwas")).toBe(false);
  });
});
