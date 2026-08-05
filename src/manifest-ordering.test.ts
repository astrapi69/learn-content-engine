import { describe, it, expect } from "vitest";

import { validateManifest, type ValidationResult } from "./validate.js";

/**
 * engine#110: the ordering gate gets a carrier. `lessonIdOrderingIssues`
 * shipped in 0.18.0 with zero callers - the repos' gates import only
 * validateLesson + validateManifest, so the rule existed without reaching
 * any content. Per-set manifests already list their lesson files in
 * `metadata.lessons` (the download discovery list), and every content repo
 * validates every per-set manifest through validateManifest. Hooking the
 * ordering check in HERE means a repo adopts it with a pure engine pin
 * bump - no script change, ten times zero extra steps.
 *
 * Written RED-first against 0.18.0 main (validateManifest returned no
 * warnings at all).
 */

const ORDER_CODES = ["W-SET-ORDER-MIXED-PREFIX", "W-SET-ORDER-PREFIX-WIDTH", "W-SET-ORDER-NUMERIC"];

const setManifestWith = (lessons: unknown): Record<string, unknown> => ({
  schema_version: "1.3",
  name: "Probe set",
  sets: [
    {
      id: "probe-set",
      title: "Probe",
      target_language: "fr",
      level: "A1",
      version: "1.0.0",
      lesson_count: 3,
    },
  ],
  metadata: lessons === undefined ? { author: "A" } : { author: "A", lessons },
});

const orderWarnings = (validation: ValidationResult): string[] =>
  validation.warnings.filter((issue) => ORDER_CODES.includes(issue.id)).map((issue) => issue.id);

describe("validateManifest - lesson ordering carrier (engine#110)", () => {
  it("reproduction: the engine#106 damage-case shape warns W-SET-ORDER-NUMERIC at /metadata/lessons", () => {
    const validation = validateManifest(
      setManifestWith(["kapitel-1.json", "kapitel-10.json", "kapitel-2.json"]),
    );
    expect(validation.valid).toBe(true);
    expect(orderWarnings(validation)).toContain("W-SET-ORDER-NUMERIC");
    const numericWarning = validation.warnings.find((issue) => issue.id === "W-SET-ORDER-NUMERIC");
    expect(numericWarning!.path).toBe("/metadata/lessons");
  });

  it("mixed NN- prefix presence warns", () => {
    const validation = validateManifest(setManifestWith(["01-a.json", "b.json", "03-c.json"]));
    expect(validation.valid).toBe(true);
    expect(orderWarnings(validation)).toContain("W-SET-ORDER-MIXED-PREFIX");
  });

  it("inconsistent prefix widths warn", () => {
    const validation = validateManifest(setManifestWith(["1-a.json", "10-b.json"]));
    expect(validation.valid).toBe(true);
    expect(orderWarnings(validation)).toContain("W-SET-ORDER-PREFIX-WIDTH");
  });

  it("a cleanly zero-padded list stays silent", () => {
    const validation = validateManifest(
      setManifestWith(["01-a.json", "02-b.json", "10-j.json"]),
    );
    expect(validation.valid).toBe(true);
    expect(orderWarnings(validation)).toEqual([]);
  });

  it("edge: absent metadata.lessons, a single lesson, and an empty list stay silent", () => {
    for (const lessons of [undefined, [], ["01-only.json"]]) {
      const validation = validateManifest(setManifestWith(lessons));
      expect(validation.valid).toBe(true);
      expect(orderWarnings(validation)).toEqual([]);
    }
  });

  it("edge: non-string entries are ignored, strings still checked (free-form metadata)", () => {
    const validation = validateManifest(
      setManifestWith([42, "kapitel-1.json", null, "kapitel-10.json", "kapitel-2.json"]),
    );
    expect(validation.valid).toBe(true);
    expect(orderWarnings(validation)).toContain("W-SET-ORDER-NUMERIC");
  });

  it("boundary: ids are the filenames minus .json only - a name without the suffix still counts", () => {
    // The loader treats the entry as a file name; a suffixless entry would be
    // a broken listing, but for ordering purposes its id is the entry itself.
    const validation = validateManifest(setManifestWith(["kapitel-1", "kapitel-10", "kapitel-2"]));
    expect(validation.valid).toBe(true);
    expect(orderWarnings(validation)).toContain("W-SET-ORDER-NUMERIC");
  });
});
