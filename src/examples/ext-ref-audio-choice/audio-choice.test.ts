import { describe, it, expect } from "vitest";

import {
  refAudioChoiceExtension,
  renderRefAudioChoice,
  gradeRefAudioChoice,
} from "./audio-choice-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-audio-choice: a gapped
 * sentence with N audio options, one of which fills the gap (engine#68 /
 * idea 1: "sentence + two audio buttons, one word each, pick the one that
 * fits"). The flat core schema has no audio-option choice type - `images` is
 * `picture_choice`'s visual twin, `free_text`/`multiple_choice` carry no
 * media - so instead of a core-schema change it is modelled as a single ext
 * exercise whose ext_payload carries the gapped sentence plus the audio
 * options.
 *
 * The payload is self-contained (no card reference): everything the consumer
 * needs is in ext_payload. The engine validates only the SHAPE of `sentence`
 * and each option's `audio`, plus the exactly-one-correct contract that
 * mirrors core picture_choice's own E-PIC-ONE-CORRECT rule.
 */

const OPTION_A = "assets/audio/word-suis.mp3";
const OPTION_B = "assets/audio/word-es.mp3";
const SENTENCE = "Je ___ ici.";

const audioChoiceExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-audio-choice",
    prompt: "Höre die Wörter und wähle das passende.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Audio choice lesson",
  requires_extensions: ["ext:ref-audio-choice@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const wellFormed = {
  sentence: SENTENCE,
  options: [
    { audio: OPTION_A, is_correct: "true" },
    { audio: OPTION_B },
  ],
};

describe("ext:ref-audio-choice end-to-end", () => {
  it("validates a declared + registered audio-choice exercise", () => {
    const validated = validateLesson(lessonWith(audioChoiceExercise(wellFormed)), {
      extensions: [refAudioChoiceExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(audioChoiceExercise(wellFormed)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a payload without a sentence with a single shape error", () => {
    const noSentence = validateLesson(
      lessonWith(audioChoiceExercise({ options: wellFormed.options })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(noSentence.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-SHAPE")).toBe(true);
  });

  it("rejects a payload without options with a shape error", () => {
    const noOptions = validateLesson(
      lessonWith(audioChoiceExercise({ sentence: SENTENCE })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(noOptions.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-SHAPE")).toBe(true);
  });

  it("rejects fewer than 2 options with a shape error", () => {
    const oneOption = validateLesson(
      lessonWith(audioChoiceExercise({ sentence: SENTENCE, options: [{ audio: OPTION_A, is_correct: "true" }] })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(oneOption.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-SHAPE")).toBe(true);
  });

  it("rejects an option with a non-string audio field with a shape error", () => {
    const wrongType = validateLesson(
      lessonWith(audioChoiceExercise({ sentence: SENTENCE, options: [{ audio: 1 }, { audio: OPTION_B, is_correct: "true" }] })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(wrongType.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-SHAPE")).toBe(true);
  });

  it("requires a non-empty sentence containing the gap marker", () => {
    const blankSentence = validateLesson(
      lessonWith(audioChoiceExercise({ sentence: "  ", options: wellFormed.options })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(blankSentence.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-SENTENCE")).toBe(true);
  });

  it("requires the gap marker '___' in the sentence", () => {
    const noGap = validateLesson(
      lessonWith(audioChoiceExercise({ sentence: "Je suis ici.", options: wellFormed.options })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(noGap.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-SENTENCE")).toBe(true);
  });

  it("requires every option's audio to be non-empty", () => {
    const blankAudio = validateLesson(
      lessonWith(
        audioChoiceExercise({ sentence: SENTENCE, options: [{ audio: "  ", is_correct: "true" }, { audio: OPTION_B }] }),
      ),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(blankAudio.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-AUDIO")).toBe(true);
  });

  it("requires exactly one option marked is_correct: 'true'", () => {
    const none = validateLesson(
      lessonWith(audioChoiceExercise({ sentence: SENTENCE, options: [{ audio: OPTION_A }, { audio: OPTION_B }] })),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(none.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-CORRECT")).toBe(true);

    const both = validateLesson(
      lessonWith(
        audioChoiceExercise({
          sentence: SENTENCE,
          options: [
            { audio: OPTION_A, is_correct: "true" },
            { audio: OPTION_B, is_correct: "true" },
          ],
        }),
      ),
      { extensions: [refAudioChoiceExtension] },
    );
    expect(both.errors.some((issue) => issue.id === "E-EXT-REFAUDIOCHOICE-CORRECT")).toBe(true);
  });

  it("boundary: exactly 2 options, one correct, is the smallest valid payload", () => {
    const minimal = validateLesson(lessonWith(audioChoiceExercise(wellFormed)), {
      extensions: [refAudioChoiceExtension],
    });
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("renders (consumer half) the sentence over the option audio references", () => {
    const rendered = renderRefAudioChoice(audioChoiceExercise(wellFormed));
    expect(rendered).toBe([SENTENCE, `[audio] ${OPTION_A}`, `[audio] ${OPTION_B}`].join("\n"));
  });

  it("renders the bare prompt when the payload is malformed", () => {
    const rendered = renderRefAudioChoice(audioChoiceExercise({ options: wellFormed.options }));
    expect(rendered).toBe("Höre die Wörter und wähle das passende.");
  });

  it("grades (consumer half) the chosen option's audio reference against the correct one", () => {
    const exercise = audioChoiceExercise(wellFormed);
    expect(gradeRefAudioChoice(exercise, OPTION_A)).toBe(true);
    expect(gradeRefAudioChoice(exercise, OPTION_B)).toBe(false);
  });

  it("grades a malformed payload as incorrect rather than throwing", () => {
    expect(gradeRefAudioChoice(audioChoiceExercise({ options: wellFormed.options }), OPTION_A)).toBe(false);
  });
});
