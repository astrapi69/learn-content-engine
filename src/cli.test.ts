import { describe, it, expect } from "vitest";

import { parseLintArgs, lintContent, formatReports } from "./cli.js";

/** Author lint CLI core (the fs-free, testable half). */

const validLesson = JSON.stringify({
  id: "l1",
  title: "L",
  steps: [{ id: "s1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "?", accept: ["a"] } }],
  cards: [],
});

describe("parseLintArgs", () => {
  it("parses a file list", () => {
    expect(parseLintArgs(["lint", "a.json", "b.json"])).toEqual({ paths: ["a.json", "b.json"], json: false });
  });
  it("recognizes --json anywhere", () => {
    expect(parseLintArgs(["lint", "--json", "a.json"])).toEqual({ paths: ["a.json"], json: true });
  });
  it("errors on an unknown command", () => {
    expect(parseLintArgs(["frobnicate"])).toEqual({ error: expect.stringContaining("unknown command") });
  });
  it("errors on empty argv", () => {
    expect(parseLintArgs([])).toEqual({ error: expect.stringContaining("unknown command") });
  });
  it("errors when no files are given", () => {
    expect(parseLintArgs(["lint"])).toEqual({ error: expect.stringContaining("usage") });
  });
});

describe("lintContent", () => {
  it("reports a clean lesson as ok", () => {
    const report = lintContent(validLesson, "ok.json");
    expect(report.ok).toBe(true);
    expect(report.result?.errors).toEqual([]);
  });
  it("reports invalid JSON as a parse error (not ok)", () => {
    const report = lintContent("{ not json", "bad.json");
    expect(report.ok).toBe(false);
    expect(report.parseError).toBeDefined();
  });
  it("reports a schema-invalid lesson as not ok", () => {
    const report = lintContent(JSON.stringify({ id: "x" }), "invalid.json");
    expect(report.ok).toBe(false);
    expect(report.result?.errors.length).toBeGreaterThan(0);
  });
  it("stays ok when only warnings are present", () => {
    const withWarning = JSON.stringify({
      id: "l1",
      title: "L",
      steps: [{ id: "s1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "?", accept: ["a"] } }],
      cards: [{ id: "orphan", front: "o", back: "p" }],
    });
    const report = lintContent(withWarning, "warn.json");
    expect(report.ok).toBe(true);
    expect(report.result?.warnings.length).toBeGreaterThan(0);
  });
});

describe("formatReports", () => {
  it("human output carries the rule id and doc anchor, exit 1 on errors", () => {
    const reports = [lintContent(JSON.stringify({ id: "x" }), "invalid.json")];
    const { text, exitCode } = formatReports(reports, false);
    expect(exitCode).toBe(1);
    expect(text).toContain("[E-");
    expect(text).toContain("see docs/lesson-format.md#");
  });
  it("human output marks a clean file OK, exit 0", () => {
    const { text, exitCode } = formatReports([lintContent(validLesson, "ok.json")], false);
    expect(exitCode).toBe(0);
    expect(text).toContain("OK");
  });
  it("human output marks a warnings-only file WARN, exit 0", () => {
    const withWarning = JSON.stringify({
      id: "l1",
      title: "L",
      steps: [{ id: "s1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "?", accept: ["a"] } }],
      cards: [{ id: "orphan", front: "o", back: "p" }],
    });
    const { text, exitCode } = formatReports([lintContent(withWarning, "warn.json")], false);
    expect(exitCode).toBe(0);
    expect(text).toContain("WARN");
    expect(text).toContain("[W-CARD-UNUSED]");
  });
  it("reports invalid JSON in human output", () => {
    const { text, exitCode } = formatReports([lintContent("{bad", "bad.json")], false);
    expect(exitCode).toBe(1);
    expect(text).toContain("invalid JSON");
  });
  it("json output is machine-readable and carries the exit code", () => {
    const reports = [lintContent(validLesson, "ok.json")];
    const { text, exitCode } = formatReports(reports, true);
    expect(exitCode).toBe(0);
    expect(JSON.parse(text)[0].path).toBe("ok.json");
  });
});
