import { describe, it, expect } from "vitest";

import { describeInvisibleChars, findInvisibleChars } from "./invisible-chars.js";
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

/**
 * Control characters were the gap in the first cut. They are escaped in the
 * JSON source (````), so ``JSON.parse`` hands back a real control
 * character that every structural check accepts. Verified before writing
 * this: such a lesson validated clean and produced no warning at all.
 *
 * The boundary that matters more is the opposite one. Tab, newline and
 * carriage return are ordinary text, and theory bodies are full of newlines,
 * so flagging them would fire on nearly every knowledge lesson in the
 * ecosystem.
 */
describe("W-INVISIBLE-CHAR: control characters", () => {
  const control = (codepoint: number): string => String.fromCharCode(codepoint);

  it("flags a C0 control character that survived the JSON escape", () => {
    const lesson = lessonWith({ title: `Les${control(0x07)}son` });
    expect(messageFor(lesson)).toContain("U+0007");
    expect(messageFor(lesson)).toContain("CONTROL CHARACTER");
  });

  it("flags DELETE", () => {
    const lesson = lessonWith({ title: `Les${control(0x7f)}son` });
    expect(messageFor(lesson)).toContain("U+007F");
  });

  it("flags a C1 control character", () => {
    const lesson = lessonWith({ title: `Les${control(0x9b)}son` });
    expect(messageFor(lesson)).toContain("U+009B");
  });

  it("flags the bidi isolates, which modern editors emit instead of the embeddings", () => {
    for (const codepoint of [0x2066, 0x2067, 0x2068, 0x2069]) {
      const lesson = lessonWith({ title: `A${String.fromCharCode(codepoint)}B` });
      expect(warningsFor(lesson), `U+${codepoint.toString(16)}`).toHaveLength(1);
    }
  });

  it("flags the invisible math operators a formula editor pastes", () => {
    for (const codepoint of [0x2061, 0x2062, 0x2063, 0x2064]) {
      const lesson = lessonWith({ title: `A${String.fromCharCode(codepoint)}B` });
      expect(warningsFor(lesson), `U+${codepoint.toString(16)}`).toHaveLength(1);
    }
  });

  it("sorts reported codepoints numerically, not as text", () => {
    // Once a codepoint needs five hex digits the two orders disagree:
    // "U+10000" precedes "U+FEFF" as text and follows it as a number.
    const described = describeInvisibleChars([
      { path: "/a", codepoint: "U+10000", name: "SUPPLEMENTARY" },
      { path: "/a", codepoint: "U+FEFF", name: "BYTE ORDER MARK" },
      { path: "/a", codepoint: "U+00AD", name: "SOFT HYPHEN" },
    ])!;
    const order = ["U+00AD", "U+FEFF", "U+10000"].map((label) => described.indexOf(label));
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it("survives a circular reference instead of blowing the stack", () => {
    // validateLesson takes `unknown`, so a caller can hand it a hand-built
    // object rather than JSON.parse output. Before the guard this threw
    // RangeError: Maximum call stack size exceeded, verified.
    const cyclic: Record<string, unknown> = { title: "Les​son" };
    cyclic.self = cyclic;
    expect(() => findInvisibleChars(cyclic)).not.toThrow();
    expect(findInvisibleChars(cyclic)).toHaveLength(1);
  });

  it("visits a repeated (but acyclic) object on each path it appears at", () => {
    // Sharing is not a cycle: the same node reachable twice must still be
    // reported twice, or a shared card would be silently skipped.
    const shared = { note: "cof​fee" };
    expect(findInvisibleChars({ a: shared, b: shared })).toHaveLength(2);
  });

  it("boundary: tab, newline and carriage return are ordinary text", () => {
    const lesson = lessonWith({
      steps: [
        { id: "s0", type: "theory", body: "Zeile eins\nZeile zwei\r\nSpalte\teins" },
        {
          id: "s1",
          type: "exercise",
          exercise: { id: "e1", type: "free_text", prompt: "P", accept: ["b"] },
        },
      ],
    });
    expect(warningsFor(lesson)).toEqual([]);
  });
});
