import { describe, it, expect } from "vitest";

import { migrateLesson, migrateContent, parseMigrateArgs } from "./migrate.js";

/**
 * cloze select/multiselect -> native multiple_choice migration (#14).
 * The conversion is mechanical and every content repo scripted it by hand -
 * this is the shared, validated implementation.
 */

interface MigratedExercise {
  type: string;
  cloze_mode?: string;
  sentence?: string;
  blanks?: unknown;
  accept?: unknown;
  distractors?: unknown;
  multiple?: boolean;
  prompt?: string;
  hint?: string;
  card_ids?: string[];
  options?: { text: string; correct?: boolean }[];
}

const clozeSelect = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  type: "cloze",
  cloze_mode: "select",
  prompt: "Wähle die richtige Antwort.",
  sentence: "Die Hauptstadt ist ___.",
  blanks: [{ accept: ["Berlin"] }],
  distractors: ["München", "Hamburg"],
  card_ids: ["hauptstadt"],
  hint: "Denk an die Regierung.",
  ...overrides,
});

const clozeMultiselect = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  type: "cloze",
  cloze_mode: "multiselect",
  prompt: "Was trifft zu?",
  sentence: "___",
  accept: ["Antwort A", "Antwort B"],
  distractors: ["Falsch C"],
  ...overrides,
});

const lessonWith = (...exercises: Record<string, unknown>[]) => ({
  id: "l1",
  title: "T",
  cards: [{ id: "hauptstadt", front: "Hauptstadt?", back: "Berlin" }],
  steps: [
    { id: "t1", type: "theory", body: "Theorie." },
    ...exercises.map((exercise, i) => ({
      id: `s${i}`,
      type: "exercise",
      exercise,
    })),
  ],
});

const firstExercise = (lesson: unknown): MigratedExercise =>
  (lesson as { steps: { exercise?: MigratedExercise }[] }).steps[1]!.exercise!;

describe("migrateLesson: cloze select -> multiple_choice (single)", () => {
  it("converts options, keeps identity fields, drops cloze fields", () => {
    const outcome = migrateLesson(lessonWith(clozeSelect()));
    expect(outcome.converted).toBe(1);
    const migrated = firstExercise(outcome.lesson);
    expect(migrated.type).toBe("multiple_choice");
    expect(migrated.options).toEqual([
      { text: "Berlin", correct: true },
      { text: "München" },
      { text: "Hamburg" },
    ]);
    expect(migrated.multiple).toBeUndefined();
    expect(migrated.card_ids).toEqual(["hauptstadt"]);
    expect(migrated.hint).toBe("Denk an die Regierung.");
    expect(migrated.cloze_mode).toBeUndefined();
    expect(migrated.sentence).toBeUndefined();
    expect(migrated.blanks).toBeUndefined();
    expect(migrated.distractors).toBeUndefined();
  });

  it("merges the sentence into the prompt so the gap context survives", () => {
    const outcome = migrateLesson(lessonWith(clozeSelect()));
    const migrated = firstExercise(outcome.lesson);
    expect(migrated.prompt).toContain("Wähle die richtige Antwort.");
    expect(migrated.prompt).toContain("Die Hauptstadt ist ___.");
  });

  it("drops alternate accepts (spelling variants) with a note", () => {
    const outcome = migrateLesson(
      lessonWith(clozeSelect({ blanks: [{ accept: ["Berlin", "berlin"] }] })),
    );
    const migrated = firstExercise(outcome.lesson);
    expect(migrated.options![0]).toEqual({ text: "Berlin", correct: true });
    expect(outcome.changes[0]!.notes?.join(" ")).toContain("berlin");
  });

  it("dedupes a distractor equal to the answer (would be E-MC-DUP-OPTION)", () => {
    const outcome = migrateLesson(
      lessonWith(clozeSelect({ distractors: ["Berlin", "Hamburg"] })),
    );
    const migrated = firstExercise(outcome.lesson);
    expect(migrated.options).toEqual([
      { text: "Berlin", correct: true },
      { text: "Hamburg" },
    ]);
    expect(outcome.changes[0]!.notes?.length).toBeGreaterThan(0);
  });
});

describe("migrateLesson: cloze multiselect -> multiple_choice (multiple)", () => {
  it("marks every accept correct and sets multiple: true", () => {
    const outcome = migrateLesson(lessonWith(clozeMultiselect()));
    const migrated = firstExercise(outcome.lesson);
    expect(migrated.type).toBe("multiple_choice");
    expect(migrated.multiple).toBe(true);
    expect(migrated.options).toEqual([
      { text: "Antwort A", correct: true },
      { text: "Antwort B", correct: true },
      { text: "Falsch C" },
    ]);
  });
});

describe("migrateLesson: what stays untouched", () => {
  it("leaves cloze type-mode and other exercise types alone", () => {
    const typedCloze = {
      id: "t1",
      type: "cloze",
      cloze_mode: "type",
      prompt: "Tippe.",
      sentence: "Je ___ ici.",
      blanks: [{ accept: ["suis"] }],
    };
    const matching = {
      id: "x1",
      type: "matching",
      prompt: "Ordne zu.",
      pairs: [
        { left: "a", right: "1" },
        { left: "b", right: "2" },
        { left: "c", right: "3" },
      ],
    };
    const outcome = migrateLesson(lessonWith(typedCloze, matching));
    expect(outcome.converted).toBe(0);
    expect(outcome.changes).toEqual([]);
    expect(firstExercise(outcome.lesson)).toEqual(typedCloze);
  });

  it("skips a multi-blank select with a reason instead of guessing", () => {
    const outcome = migrateLesson(
      lessonWith(
        clozeSelect({
          sentence: "___ und ___.",
          blanks: [{ accept: ["A"] }, { accept: ["B"] }],
        }),
      ),
    );
    expect(outcome.converted).toBe(0);
    expect(outcome.changes).toEqual([
      expect.objectContaining({ id: "c1", status: "skipped" }),
    ]);
    expect(firstExercise(outcome.lesson).type).toBe("cloze");
  });
});

describe("migrateContent: validation gate before any write", () => {
  it("migrated lesson passes the bundled validator", () => {
    const report = migrateContent(JSON.stringify(lessonWith(clozeSelect())), "l.json");
    expect(report.ok).toBe(true);
    expect(report.converted).toBe(1);
  });

  it("reports invalid JSON as a parse error", () => {
    const report = migrateContent("{nope", "broken.json");
    expect(report.ok).toBe(false);
    expect(report.parseError).toBeTruthy();
  });
});

describe("parseMigrateArgs", () => {
  it("parses paths, --write and --json", () => {
    expect(parseMigrateArgs(["migrate", "a.json", "b.json", "--write", "--json"])).toEqual({
      paths: ["a.json", "b.json"],
      write: true,
      json: true,
    });
  });

  it("is dry-run by default and errors without paths", () => {
    expect(parseMigrateArgs(["migrate", "a.json"])).toEqual({
      paths: ["a.json"],
      write: false,
      json: false,
    });
    expect(parseMigrateArgs(["migrate"])).toEqual({
      error: expect.stringContaining("usage"),
    });
  });
});
