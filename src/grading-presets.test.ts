import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { findInvisibleChars } from "./invisible-chars.js";
import { isSlugId } from "./rules.js";
import { validateManifest } from "./validate.js";

/**
 * grading-presets.json: the catalog of grading scales an author can copy into
 * a set's `evaluation` block. Data, not code, shipped like quality-rules.json
 * so the content repos can mirror it and the app can offer it. Every preset
 * must be exactly what the validator accepts without a warning, every entry
 * must say where it comes from, and a template carries no thresholds at all:
 * where no source maps a scale to percentages, the file does not pretend one.
 */

const repoPath = (relativePath: string): string => fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
const readRepoJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(repoPath(relativePath), "utf8")) as Record<string, unknown>;

interface Source {
  title: string;
  url: string;
}
interface GradeRow {
  min_percent: number;
  label: string;
  label_native?: string;
}
interface Preset {
  id: string;
  name: string;
  class: "base" | "A" | "B";
  country: string | null;
  scope: string;
  languages: string[];
  evaluation: { scheme: string; grades?: GradeRow[]; pass_percent?: number };
  pass: { label: string; min_percent: number } | null;
  rounded_rows: { label: string; official_min_percent: number }[];
  note: string;
  sources: Source[];
}
interface Template {
  id: string;
  name: string;
  country: string;
  scope: string;
  languages: string[];
  scale: { label: string; label_native?: string }[];
  pass_label: string | null;
  note: string;
  sources: Source[];
}
interface Unavailable {
  id: string;
  name: string;
  reason: string;
  sources: Source[];
}
interface Catalog {
  "$schema-version": string;
  description: string;
  presets: Preset[];
  templates: Template[];
  unavailable: Unavailable[];
}

const FILE = "schema/grading-presets.json";
const catalog = (): Catalog => readRepoJson(FILE) as unknown as Catalog;

const manifestWith = (evaluation: Preset["evaluation"]) => ({
  schema_version: "1.7",
  name: "Grading preset probe",
  sets: [
    {
      id: "probe",
      title: "Probe",
      target_language: "de",
      level: "none",
      domain: "knowledge",
      version: "1.0.0",
      lesson_count: 1,
      evaluation,
    },
  ],
});

describe("grading-presets.json: the file and how it ships", () => {
  it("exists and parses", () => {
    expect(existsSync(repoPath(FILE))).toBe(true);
    expect(() => catalog()).not.toThrow();
  });

  it("ships in the npm package (files whitelist + exports subpath)", () => {
    const packageManifest = readRepoJson("package.json");
    expect(packageManifest.files as string[]).toContain("schema");
    expect((packageManifest.exports as Record<string, unknown>)["./schema/grading-presets.json"]).toBe(
      "./schema/grading-presets.json",
    );
  });

  it("tracks the bundled manifest schema version ($schema-version === x-schema-version)", () => {
    expect(catalog()["$schema-version"]).toBe(readRepoJson("schema/content-manifest.schema.json")["x-schema-version"]);
  });

  it("says that a preset is copied, so a later correction does not reach existing sets", () => {
    const description = catalog().description;
    expect(description).toMatch(/copied/i);
    expect(description).toMatch(/does not change|never reach|not updated/i);
  });

  it("holds no em dash, no control character and no invisible character", () => {
    const text = readFileSync(repoPath(FILE), "utf8");
    expect(text.includes("—")).toBe(false);
    expect([...text].filter((character) => character < " " && character !== "\n")).toEqual([]);
    expect(findInvisibleChars(catalog())).toEqual([]);
  });
});

describe("grading-presets.json: every entry", () => {
  const all = (): { id: string; kind: string }[] => [
    ...catalog().presets.map((entry) => ({ id: entry.id, kind: "preset" })),
    ...catalog().templates.map((entry) => ({ id: entry.id, kind: "template" })),
    ...catalog().unavailable.map((entry) => ({ id: entry.id, kind: "unavailable" })),
  ];

  it("has a unique slug id", () => {
    const ids = all().map((entry) => entry.id);
    expect(ids.filter((id) => !isSlugId(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names its sources, except the two schemeless base forms", () => {
    const entries = [...catalog().presets.filter((preset) => preset.class !== "base"), ...catalog().templates, ...catalog().unavailable];
    const unsourced = entries.filter(
      (entry) => entry.sources.length === 0 || entry.sources.some((source) => !source.title || !/^https?:\/\//.test(source.url)),
    );
    expect(unsourced.map((entry) => entry.id)).toEqual([]);
  });

  it("uses ISO codes: two-letter lowercase languages, two-letter uppercase countries", () => {
    const entries = [...catalog().presets, ...catalog().templates];
    const bad = entries.filter(
      (entry) =>
        entry.languages.some((language) => !/^[a-z]{2}$/.test(language)) ||
        (entry.country !== null && !/^[A-Z]{2}$/.test(entry.country)),
    );
    expect(bad.map((entry) => entry.id)).toEqual([]);
  });
});

describe("grading-presets.json: presets", () => {
  it("each evaluation block passes validateManifest with no error and no warning", () => {
    const failing = catalog()
      .presets.map((preset) => ({ id: preset.id, result: validateManifest(manifestWith(preset.evaluation)) }))
      .filter(({ result }) => result.errors.length > 0 || result.warnings.length > 0)
      .map(({ id, result }) => `${id}: ${[...result.errors, ...result.warnings].map((issue) => issue.id).join(", ")}`);
    expect(failing).toEqual([]);
  });

  it("lists grade rows in strictly descending min_percent", () => {
    const unsorted = catalog()
      .presets.filter((preset) => preset.evaluation.grades)
      .filter((preset) => preset.evaluation.grades!.some((row, index, rows) => index > 0 && row.min_percent >= rows[index - 1]!.min_percent));
    expect(unsorted.map((preset) => preset.id)).toEqual([]);
  });

  it("has a class, and every class B preset says what its convention is", () => {
    const presets = catalog().presets;
    expect(presets.filter((preset) => !["base", "A", "B"].includes(preset.class)).map((preset) => preset.id)).toEqual([]);
    expect(presets.filter((preset) => preset.class === "B" && preset.note.trim() === "").map((preset) => preset.id)).toEqual([]);
  });

  it("marks its pass line on one of its own rows", () => {
    const misplaced = catalog()
      .presets.filter((preset) => preset.pass !== null && preset.evaluation.grades)
      .filter(
        (preset) =>
          !preset.evaluation.grades!.some((row) => row.min_percent === preset.pass!.min_percent && row.label === preset.pass!.label),
      );
    expect(misplaced.map((preset) => preset.id)).toEqual([]);
  });

  // min_percent is an integer in the schema. Where an official lower bound
  // is not a whole percent (52 of 60 points is 86.67 %), the row carries the
  // whole percent below it, so a run exactly at the bound earns the grade;
  // runs up to one percentage point below it earn it too. Every such row is
  // listed with its official value, so the rounding is visible and
  // checkable, not only described.
  it("lists every rounded row with its official bound, floored to the row's min_percent", () => {
    const wrong = catalog().presets.flatMap((preset) =>
      (preset.rounded_rows ?? [undefined as never]).flatMap((rounded) => {
        if (rounded === undefined) return [`${preset.id}: no rounded_rows list`];
        const row = (preset.evaluation.grades ?? []).find((candidate) => candidate.label === rounded.label);
        if (!row) return [`${preset.id}: no row labelled ${rounded.label}`];
        if (Number.isInteger(rounded.official_min_percent)) return [`${preset.id}: ${rounded.label} is not rounded`];
        if (row.min_percent !== Math.floor(rounded.official_min_percent)) return [`${preset.id}: ${rounded.label} is not floored`];
        return [];
      }),
    );
    expect(wrong).toEqual([]);
  });

  it("states the rounding rule in the file", () => {
    expect(catalog().description).toMatch(/whole percent below/i);
  });

  it("carries no German helper words in the labels of a scale that is not German", () => {
    const leaking = catalog()
      .presets.filter((preset) => !preset.languages.includes("de"))
      .filter((preset) =>
        (preset.evaluation.grades ?? []).some((row) => /\b(bis|bestanden|unter)\b/i.test(`${row.label} ${row.label_native ?? ""}`)),
      );
    expect(leaking.map((preset) => preset.id)).toEqual([]);
  });
});

describe("grading-presets.json: templates and unavailable scales", () => {
  it("a template lists at least two grades best first and no threshold", () => {
    const bad = catalog().templates.filter(
      (template) => template.scale.length < 2 || JSON.stringify(template).includes("min_percent"),
    );
    expect(bad.map((template) => template.id)).toEqual([]);
  });

  it("a template's pass label is one of its grades, or null where the scale has no pass mark", () => {
    const bad = catalog().templates.filter(
      (template) => template.pass_label !== null && !template.scale.some((grade) => grade.label === template.pass_label),
    );
    expect(bad.map((template) => template.id)).toEqual([]);
  });

  it("an unavailable scale says why and carries no grades", () => {
    const bad = catalog().unavailable.filter((entry) => entry.reason.trim() === "" || "grades" in entry || "scale" in entry);
    expect(bad.map((entry) => entry.id)).toEqual([]);
  });
});
