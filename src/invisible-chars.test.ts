import { describe, it, expect } from "vitest";

import { validateLesson } from "./validate.js";

/**
 * ``W-INVISIBLE-CHAR`` (#75): text pasted from a PDF or a web page carries
 * characters that are invisible by definition (zero-width spaces, BOMs,
 * directional marks, soft hyphens). They are legal JSON string content, so no
 * structural check catches them, and no one spots them by reading the file.
 * The app's book-text wizard invites exactly that paste, so this is a real
 * content path rather than a theoretical one.
 *
 * The bar these tests set is TWO-sided: every invisible codepoint must be
 * named, and clean content, INCLUDING legitimate typography that merely looks
 * exotic, must stay silent. An over-sensitive lint is worse than none, because
 * warnings that are usually wrong stop being read.
 */

const lessonWith = (overrides: Record<string, unknown>) => ({
  id: "l1",
  title: "Lesson",
  cards: [{ id: "c1", front: "coffee", back: "der Kaffee" }],
  steps: [
    {
      id: "s1",
      type: "exercise",
      exercise: { id: "e1", type: "free_text", prompt: "Translate.", accept: ["der Kaffee"] },
    },
  ],
  ...overrides,
});

const warningsFor = (lesson: unknown) =>
  validateLesson(lesson).warnings.filter((issue) => issue.id === "W-INVISIBLE-CHAR");

const messageFor = (lesson: unknown) => warningsFor(lesson)[0]?.message ?? "";

describe("W-INVISIBLE-CHAR", () => {
  it("flags a zero-width space in a card field and names the codepoint", () => {
    const lesson = lessonWith({
      cards: [{ id: "c1", front: "cof​fee", back: "der Kaffee" }],
    });
    expect(warningsFor(lesson)).toHaveLength(1);
    expect(messageFor(lesson)).toContain("U+200B");
    expect(messageFor(lesson)).toContain("ZERO WIDTH SPACE");
  });

  it("names the field path so the author can find it", () => {
    const lesson = lessonWith({
      cards: [{ id: "c1", front: "cof​fee", back: "der Kaffee" }],
    });
    expect(messageFor(lesson)).toContain("/cards/0/front");
  });

  it("flags a byte-order mark", () => {
    const lesson = lessonWith({ title: "﻿Lesson" });
    expect(messageFor(lesson)).toContain("U+FEFF");
    expect(messageFor(lesson)).toContain("BYTE ORDER MARK");
  });

  it("flags a left-to-right mark", () => {
    const lesson = lessonWith({ title: "Lesson‎" });
    expect(messageFor(lesson)).toContain("U+200E");
    expect(messageFor(lesson)).toContain("LEFT-TO-RIGHT MARK");
  });

  it("flags a right-to-left mark", () => {
    const lesson = lessonWith({ title: "Lesson‏" });
    expect(messageFor(lesson)).toContain("U+200F");
  });

  it("flags a soft hyphen, which a PDF copy routinely injects", () => {
    const lesson = lessonWith({ title: "Kaf­fee" });
    expect(messageFor(lesson)).toContain("U+00AD");
    expect(messageFor(lesson)).toContain("SOFT HYPHEN");
  });

  it("flags text inside an exercise prompt", () => {
    const lesson = lessonWith({
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "e1",
            type: "free_text",
            prompt: "Trans​late.",
            accept: ["der Kaffee"],
          },
        },
      ],
    });
    expect(messageFor(lesson)).toContain("/steps/0/exercise/prompt");
  });

  it("reaches into ext_payload without enumerating its fields", () => {
    const lesson = lessonWith({
      requires_extensions: ["ext:al-dictation@1"],
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "e1",
            type: "ext:al-dictation",
            prompt: "Listen.",
            ext_payload: { audio: "assets/a.mp3", accept: ["a cof​fee"] },
          },
        },
      ],
    });
    const found = validateLesson(lesson, {
      extensions: [{ type: "ext:al-dictation", major: 1, validate: () => [] }],
    }).warnings.filter((issue) => issue.id === "W-INVISIBLE-CHAR");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("ext_payload");
  });

  it("aggregates to ONE warning per lesson, not one per occurrence", () => {
    // A pasted chapter can carry dozens; emitting one warning each is the
    // alert fatigue W-CARD-UNUSED was aggregated to avoid (#49).
    const lesson = lessonWith({
      title: "Les​son",
      cards: [
        { id: "c1", front: "cof​fee", back: "der Kaf​fee" },
        { id: "c2", front: "milk​", back: "die Milch" },
      ],
    });
    expect(warningsFor(lesson)).toHaveLength(1);
    expect(messageFor(lesson)).toMatch(/4 occurrence|4 /);
  });

  it("reports every distinct codepoint it found, not just the first", () => {
    const lesson = lessonWith({ title: "A​B­C" });
    expect(messageFor(lesson)).toContain("U+200B");
    expect(messageFor(lesson)).toContain("U+00AD");
  });

  it("stays silent on clean content", () => {
    expect(warningsFor(lessonWith({}))).toEqual([]);
  });

  it("stays silent on umlauts, accents and other legitimate non-ASCII text", () => {
    const lesson = lessonWith({
      title: "Über die Prüfung",
      cards: [{ id: "c1", front: "café", back: "das Café" }],
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "e1",
            type: "free_text",
            prompt: "Wie heißt „Kaffee“ auf Französisch?",
            accept: ["café"],
          },
        },
      ],
    });
    expect(warningsFor(lesson)).toEqual([]);
  });

  it("boundary: does NOT flag a no-break space, which is legitimate French typography", () => {
    // "Comment ça va ?" sets U+00A0 before the question mark by convention.
    // Flagging it would reproduce the over-sensitive behaviour this lint
    // exists to avoid, and this ecosystem ships French content.
    const lesson = lessonWith({ title: "Comment ça va ?" });
    expect(warningsFor(lesson)).toEqual([]);
  });

  it("boundary: does NOT flag a narrow no-break space either", () => {
    const lesson = lessonWith({ title: "1 000 Wörter" });
    expect(warningsFor(lesson)).toEqual([]);
  });

  it("never blocks: the lesson stays valid", () => {
    const lesson = lessonWith({ title: "Les​son" });
    const result = validateLesson(lesson);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
