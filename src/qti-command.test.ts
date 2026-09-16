import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { formatQtiResult, parseQtiArgs, runQtiExport, runQtiImport } from "./qti-command.js";

/**
 * The `qti import` / `qti export` CLI core (engine#164): the filesystem-free
 * half the bin shim delegates to. Import and export themselves are the
 * adapter's (`src/qti/`); this module parses argv, turns the adapter's loud
 * errors into report lines, and shapes the `{ text, exitCode }` the shim
 * destructures.
 */

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./qti/__fixtures__/${name}`, import.meta.url)), "utf8");

const lessonJson = JSON.stringify({
  id: "rt",
  title: "Round trip",
  cards: [],
  steps: [
    { id: "e1", type: "exercise", exercise: { id: "e1", type: "multiple_choice", prompt: "Pick one", options: [{ text: "a", correct: true }, { text: "b" }] } },
    { id: "e2", type: "exercise", exercise: { id: "e2", type: "free_text", prompt: "Say hi", accept: ["hi", "hello"] } },
  ],
});

describe("parseQtiArgs", () => {
  it("parses import with its optional out, id and title", () => {
    expect(parseQtiArgs(["qti", "import", "item.xml"])).toEqual({ action: "import", path: "item.xml" });
    expect(parseQtiArgs(["qti", "import", "item.xml", "--out", "l.json", "--id", "my-lesson", "--title", "My lesson"])).toEqual({
      action: "import",
      path: "item.xml",
      out: "l.json",
      id: "my-lesson",
      title: "My lesson",
    });
  });

  it("parses export with the 2.x default and the 3.0 option", () => {
    expect(parseQtiArgs(["qti", "export", "l.json"])).toEqual({ action: "export", path: "l.json", version: "2.x" });
    expect(parseQtiArgs(["qti", "export", "l.json", "--version", "3.0", "--out", "t.xml"])).toEqual({
      action: "export",
      path: "l.json",
      version: "3.0",
      out: "t.xml",
    });
  });

  it("rejects an unknown version, action, a missing file, a second file, and a flag without a value", () => {
    expect(parseQtiArgs(["qti", "export", "l.json", "--version", "1.2"])).toEqual({ error: expect.stringContaining("--version") });
    expect(parseQtiArgs(["qti", "frobnicate", "l.json"])).toEqual({ error: expect.stringContaining("usage") });
    expect(parseQtiArgs(["qti", "import"])).toEqual({ error: expect.stringContaining("usage") });
    expect(parseQtiArgs(["qti", "import", "a.xml", "b.xml"])).toEqual({ error: expect.stringContaining("one file") });
    expect(parseQtiArgs(["qti", "import", "a.xml", "--out"])).toEqual({ error: expect.stringContaining("--out") });
    expect(parseQtiArgs(["lint", "a.json"])).toEqual({ error: expect.stringContaining("unknown command") });
  });
});

describe("runQtiImport", () => {
  it("maps a 2.x item to lesson JSON, pretty-printed with a trailing newline", () => {
    const result = runQtiImport(fixture("choice_single.xml"));
    expect(result.ok).toBe(true);
    expect(result.text.endsWith("\n")).toBe(true);
    const lesson = JSON.parse(result.text) as { id: string; steps: { exercise: { type: string } }[] };
    expect(lesson.id).toBe("q-capital");
    expect(lesson.steps[0]!.exercise.type).toBe("multiple_choice");
  });

  it("maps a 3.0 item the same way and honours id and title overrides", () => {
    const result = runQtiImport(fixture("qti3_text_entry.xml"), { id: "hallo", title: "Hallo auf Franzoesisch" });
    expect(result.ok).toBe(true);
    const lesson = JSON.parse(result.text) as { id: string; title: string; steps: { exercise: { type: string } }[] };
    expect(lesson.id).toBe("hallo");
    expect(lesson.title).toBe("Hallo auf Franzoesisch");
    expect(lesson.steps[0]!.exercise.type).toBe("free_text");
  });

  it("refuses an unmappable item with one line per issue, naming item and interaction", () => {
    const result = runQtiImport(fixture("qti3_unsupported_order.xml"));
    expect(result.ok).toBe(false);
    expect(result.text).toBe("");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("q-order");
    expect(result.errors[0]).toContain("orderInteraction");
  });

  it("refuses a non-QTI document with the adapter's message", () => {
    const result = runQtiImport('<?xml version="1.0"?><questestinterop/>');
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/root/);
  });

  it("refuses malformed XML without throwing", () => {
    const result = runQtiImport("<assessmentItem");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("runQtiExport", () => {
  it("emits 2.x by default and 3.0 on request", () => {
    const two = runQtiExport(lessonJson, "2.x");
    expect(two.ok).toBe(true);
    expect(two.text).toContain("<assessmentTest xmlns=\"http://www.imsglobal.org/xsd/imsqti_v2p1\"");
    const three = runQtiExport(lessonJson, "3.0");
    expect(three.ok).toBe(true);
    expect(three.text).toContain("<qti-assessment-test xmlns=\"http://www.imsglobal.org/xsd/imsqtiasi_v3p0\"");
  });

  it("reports invalid JSON as a parse error", () => {
    const result = runQtiExport("{not json", "2.x");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("invalid JSON");
  });

  it("refuses a lesson with an unmappable exercise type, naming the exercise", () => {
    const lesson = JSON.parse(lessonJson) as { steps: unknown[] };
    lesson.steps.push({ id: "e3", type: "exercise", exercise: { id: "e3", type: "word_tiles", prompt: "Order", tiles: ["a", "b"] } });
    const result = runQtiExport(JSON.stringify(lesson), "2.x");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("e3");
    expect(result.errors.join("\n")).toContain("word_tiles");
  });
});

describe("formatQtiResult", () => {
  it("prints the document itself when no --out is given, exit 0", () => {
    const formatted = formatQtiResult({ ok: true, text: "<doc/>\n", errors: [] }, { path: "item.xml" });
    expect(formatted).toEqual({ text: "<doc/>\n", exitCode: 0 });
  });

  it("prints a one-line summary when --out is given (the shim writes the file), exit 0", () => {
    const formatted = formatQtiResult({ ok: true, text: "<doc/>\n", errors: [] }, { path: "item.xml", out: "lesson.json" });
    expect(formatted.exitCode).toBe(0);
    expect(formatted.text).toContain("item.xml");
    expect(formatted.text).toContain("lesson.json");
    expect(formatted.text).not.toContain("<doc/>");
  });

  it("prints ERROR plus one indented line per issue, exit 1", () => {
    const formatted = formatQtiResult({ ok: false, text: "", errors: ["q-order: orderInteraction (unsupported)"] }, { path: "item.xml" });
    expect(formatted.exitCode).toBe(1);
    expect(formatted.text).toMatch(/^ERROR item\.xml/);
    expect(formatted.text).toContain("  q-order: orderInteraction (unsupported)");
  });
});
