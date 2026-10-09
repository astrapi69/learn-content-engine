import { describe, expect, it } from "vitest";

import { validateManifest } from "./index.js";

interface SetFields {
  [field: string]: unknown;
}

const manifestWith = (overrides: SetFields) => ({
  name: "Repo",
  sets: [
    {
      id: "psych-intro-from-de",
      title: "Psychologie",
      target_language: "de",
      source_language: "de",
      level: "B1",
      domain: "psychology",
      version: "1.0.0",
      lesson_count: 115,
      ...overrides,
    },
  ],
});

const claims = (overrides: SetFields) =>
  validateManifest(manifestWith(overrides)).warnings.filter((issue) => issue.id === "W-LESSON-COUNT-CLAIM");

describe("W-LESSON-COUNT-CLAIM: a stated lesson count must match lesson_count", () => {
  it("reports the observed stale count (alc-psychology, 90 stated, 115 real)", () => {
    const issues = claims({ description: "Einführungskurs Psychologie (90 Lektionen), auf Deutsch erklärt." });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "warning",
      path: "/sets/0/description",
      params: { field: "description", claimed: 90, lessonCount: 115 },
    });
  });

  it.each([
    ["German, in parentheses", "Kurs (115 Lektionen): Grundlagen."],
    ["English, compound", "A 115-lesson course."],
    ["English, plural", "115 lessons explained in English."],
    ["Greek", "Ψυχολογία (115 μαθήματα)."],
  ])("is silent when the count matches: %s", (_label, description) => {
    expect(claims({ description })).toEqual([]);
  });

  it.each([
    ["German", "Kurs (90 Lektionen).", 90],
    ["English", "A 90-lesson course.", 90],
    ["Spanish", "Curso de 90 lecciones.", 90],
    ["French", "Cours en 90 leçons.", 90],
    ["Italian", "Corso di 90 lezioni.", 90],
    ["Portuguese", "Curso com 90 lições.", 90],
    ["Greek", "Μάθημα (90 μαθήματα).", 90],
    ["singular", "Nur 1 Lektion.", 1],
  ])("reads the count in %s", (_label, description, claimed) => {
    expect(claims({ description }).map((issue) => issue.params?.["claimed"])).toEqual([claimed]);
  });

  it.each([
    ["a level glued to the noun", "Zehn A1-Lektionen Japanisch."],
    ["a number word (can be a deliberate subset)", "vier Lektionen zur Alltagssouveränität sowie eine Wiederholungslektion."],
    ["a compound noun after the number", "12 Lektionsmodi."],
    ["a count of something else", "Zahlen 1-20 und 88 Karten in jeder Lektion."],
    ["no description", undefined],
  ])("ignores %s", (_label, description) => {
    expect(claims({ description })).toEqual([]);
  });

  it("checks the title too, at its own path", () => {
    const issues = claims({ title: "Psychologie in 90 Lektionen", description: "Kurs (115 Lektionen)." });

    expect(issues.map((issue) => issue.path)).toEqual(["/sets/0/title"]);
  });

  it("reports each differing count in one text once", () => {
    const issues = claims({ description: "Teil A (90 Lektionen), Teil B (90 Lektionen), gesamt 115 Lektionen." });

    expect(issues).toHaveLength(1);
    expect(issues[0]!.params?.["claimed"]).toBe(90);
  });

  it("never blocks", () => {
    const result = validateManifest(manifestWith({ description: "Kurs (90 Lektionen)." }));

    expect(result.valid).toBe(true);
  });
});
