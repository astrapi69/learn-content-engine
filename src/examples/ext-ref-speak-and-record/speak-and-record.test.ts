import { describe, it, expect } from "vitest";

import { refSpeakAndRecordExtension, renderRefSpeakAndRecord } from "./speak-and-record-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-speak-and-record: a
 * speaker button reads a sentence, a "show" button reveals its text, a
 * "record" button lets the learner record themselves saying it (engine#68 /
 * idea 3). Unlike every other reference extension this one is deliberately
 * UNGRADED: there is nothing to check a recording against, so the payload
 * carries no accept list and the extension exposes no grade function.
 *
 * The payload is self-contained (no card reference): everything the consumer
 * needs is in ext_payload. ``audio`` is optional - when absent the consumer
 * falls back to on-device speech synthesis of ``sentence``.
 */

const SENTENCE = "Je suis ici et tres content.";
const AUDIO = "assets/audio/je-suis-ici-content.mp3";

const speakAndRecordExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-speak-and-record",
    prompt: "Höre den Satz, zeige ihn dir an und nimm dich selbst auf.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Speak and record lesson",
  requires_extensions: ["ext:ref-speak-and-record@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

describe("ext:ref-speak-and-record end-to-end", () => {
  it("validates a declared + registered exercise with authored audio", () => {
    const validated = validateLesson(lessonWith(speakAndRecordExercise({ sentence: SENTENCE, audio: AUDIO })), {
      extensions: [refSpeakAndRecordExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("validates a declared + registered exercise without authored audio (TTS fallback)", () => {
    const validated = validateLesson(lessonWith(speakAndRecordExercise({ sentence: SENTENCE })), {
      extensions: [refSpeakAndRecordExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(speakAndRecordExercise({ sentence: SENTENCE })));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a payload without a sentence with a shape error", () => {
    const noSentence = validateLesson(lessonWith(speakAndRecordExercise({ audio: AUDIO })), {
      extensions: [refSpeakAndRecordExtension],
    });
    expect(noSentence.errors.some((issue) => issue.id === "E-EXT-REFSPEAKRECORD-SHAPE")).toBe(true);
  });

  it("rejects a non-string audio field with a shape error", () => {
    const wrongType = validateLesson(lessonWith(speakAndRecordExercise({ sentence: SENTENCE, audio: 1 })), {
      extensions: [refSpeakAndRecordExtension],
    });
    expect(wrongType.errors.some((issue) => issue.id === "E-EXT-REFSPEAKRECORD-SHAPE")).toBe(true);
  });

  it("requires a non-empty sentence", () => {
    const blankSentence = validateLesson(lessonWith(speakAndRecordExercise({ sentence: "  " })), {
      extensions: [refSpeakAndRecordExtension],
    });
    expect(blankSentence.errors.some((issue) => issue.id === "E-EXT-REFSPEAKRECORD-SENTENCE")).toBe(true);
  });

  it("boundary: sentence alone (no audio) is the smallest valid payload", () => {
    const minimal = validateLesson(lessonWith(speakAndRecordExercise({ sentence: "Salut." })), {
      extensions: [refSpeakAndRecordExtension],
    });
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("renders (consumer half) the prompt over the sentence and audio reference", () => {
    const rendered = renderRefSpeakAndRecord(speakAndRecordExercise({ sentence: SENTENCE, audio: AUDIO }));
    expect(rendered).toBe(
      ["Höre den Satz, zeige ihn dir an und nimm dich selbst auf.", `[sentence] ${SENTENCE}`, `[audio] ${AUDIO}`].join(
        "\n",
      ),
    );
  });

  it("renders without an [audio] line when no audio was authored", () => {
    const rendered = renderRefSpeakAndRecord(speakAndRecordExercise({ sentence: SENTENCE }));
    expect(rendered).toBe(
      ["Höre den Satz, zeige ihn dir an und nimm dich selbst auf.", `[sentence] ${SENTENCE}`].join("\n"),
    );
  });

  it("renders the bare prompt when the payload is malformed", () => {
    const rendered = renderRefSpeakAndRecord(speakAndRecordExercise({ audio: AUDIO }));
    expect(rendered).toBe("Höre den Satz, zeige ihn dir an und nimm dich selbst auf.");
  });
});
