import { describe, it, expect } from "vitest";

import {
  refImageDescriptionExtension,
  renderRefImageDescription,
  gradeRefImageDescription,
} from "./image-description-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof for the example extension ext:ref-image-description: an
 * image stimulus bound to a typed answer ("look at the picture, then write
 * what you see" / answer a question about it). The visual twin of
 * ext:ref-dictation: the flat core schema has no image-stimulus free-text
 * type (`images` is the picture_choice OPTION list, `free_text` carries no
 * media), so instead of a core-schema change it is modelled as a single ext
 * exercise whose ext_payload carries the image reference plus the accepted
 * answers.
 *
 * The payload is self-contained (no card reference): everything the consumer
 * needs is in ext_payload. The engine validates only the SHAPE of `src` (a
 * non-empty string); resolving, storing or displaying the image is entirely
 * the consumer's business.
 */

const SRC = "assets/images/hund-im-garten.jpg";
const ACCEPT = ["Ein Hund liegt im Garten", "Der Hund liegt im Garten"];

const imageExercise = (payload: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-image-description",
    prompt: "Sieh dir das Bild an und beschreibe es in einem Satz.",
    ext_payload: payload,
  }) as Exercise;

const lessonWith = (exercise: Exercise) => ({
  id: "l1",
  title: "Image description lesson",
  requires_extensions: ["ext:ref-image-description@1"],
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const wellFormed = { src: SRC, accept: ACCEPT };

describe("ext:ref-image-description end-to-end", () => {
  it("validates a declared + registered image-description exercise", () => {
    const validated = validateLesson(lessonWith(imageExercise(wellFormed)), {
      extensions: [refImageDescriptionExtension],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const refused = validateLesson(lessonWith(imageExercise(wellFormed)));
    expect(refused.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("rejects a payload without src with a single shape error", () => {
    const noSrc = validateLesson(lessonWith(imageExercise({ accept: ACCEPT })), {
      extensions: [refImageDescriptionExtension],
    });
    expect(noSrc.errors.some((issue) => issue.id === "E-EXT-REFIMGDESC-SHAPE")).toBe(true);
  });

  it("rejects a payload without an accept list with a shape error", () => {
    const noAccept = validateLesson(lessonWith(imageExercise({ src: SRC })), {
      extensions: [refImageDescriptionExtension],
    });
    expect(noAccept.errors.some((issue) => issue.id === "E-EXT-REFIMGDESC-SHAPE")).toBe(true);
  });

  it("rejects a non-string accept entry with a shape error", () => {
    const wrongEntry = validateLesson(
      lessonWith(imageExercise({ src: SRC, accept: [42] })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(wrongEntry.errors.some((issue) => issue.id === "E-EXT-REFIMGDESC-SHAPE")).toBe(true);
  });

  it("requires a non-empty image reference", () => {
    const blankSrc = validateLesson(
      lessonWith(imageExercise({ src: "  ", accept: ACCEPT })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(blankSrc.errors.some((issue) => issue.id === "E-EXT-REFIMGDESC-SRC")).toBe(true);
  });

  it("requires the accept list to hold at least one entry", () => {
    const emptyAccept = validateLesson(
      lessonWith(imageExercise({ src: SRC, accept: [] })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(emptyAccept.errors.some((issue) => issue.id === "E-EXT-REFIMGDESC-ACCEPT")).toBe(true);
  });

  it("requires at least one accept entry to be non-blank", () => {
    const blankAccept = validateLesson(
      lessonWith(imageExercise({ src: SRC, accept: ["   ", ""] })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(blankAccept.errors.some((issue) => issue.id === "E-EXT-REFIMGDESC-ACCEPT")).toBe(true);
  });

  it("boundary: one src plus one accept entry is the smallest valid payload", () => {
    const minimal = validateLesson(
      lessonWith(imageExercise({ src: SRC, accept: ["Ein Hund"] })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(minimal.errors).toEqual([]);
    expect(minimal.valid).toBe(true);
  });

  it("boundary: a data URI src validates like a path (consumer decides storage)", () => {
    const dataUri = validateLesson(
      lessonWith(imageExercise({ src: "data:image/jpeg;base64,AAAA", accept: ["Ein Hund"] })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(dataUri.errors).toEqual([]);
    expect(dataUri.valid).toBe(true);
  });

  it("boundary: a blank entry alongside a real one still validates", () => {
    const mixed = validateLesson(
      lessonWith(imageExercise({ src: SRC, accept: ["  ", "Ein Hund"] })),
      { extensions: [refImageDescriptionExtension] },
    );
    expect(mixed.errors).toEqual([]);
    expect(mixed.valid).toBe(true);
  });

  it("renders (consumer half) the prompt over the image reference", () => {
    const rendered = renderRefImageDescription(imageExercise(wellFormed));
    expect(rendered).toBe(
      ["Sieh dir das Bild an und beschreibe es in einem Satz.", `[image] ${SRC}`].join("\n"),
    );
  });

  it("renders the bare prompt when the payload is malformed", () => {
    const rendered = renderRefImageDescription(imageExercise({ accept: ACCEPT }));
    expect(rendered).toBe("Sieh dir das Bild an und beschreibe es in einem Satz.");
  });

  it("grades (consumer half) tolerantly against every accept entry", () => {
    const exercise = imageExercise(wellFormed);
    expect(gradeRefImageDescription(exercise, "  ein hund liegt im garten ")).toBe(true);
    expect(gradeRefImageDescription(exercise, "Der Hund liegt im Garten")).toBe(true);
    expect(gradeRefImageDescription(exercise, "Eine Katze schlaeft")).toBe(false);
  });

  it("grades a malformed payload as incorrect rather than throwing", () => {
    expect(gradeRefImageDescription(imageExercise({ src: SRC }), "irgendwas")).toBe(false);
  });
});
