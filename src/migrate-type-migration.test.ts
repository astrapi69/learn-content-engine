import { describe, expect, it } from "vitest";

import { formatMigrateReports, migrateContent, migrateLesson } from "./migrate.js";

/**
 * `migrate` and declared type migrations (engine#254). A converted exercise
 * keeps its `stable_id`, so the stability gate needs the set to declare the
 * change; `migrate` names the declaration. It converts a typed cloze without
 * a carrier sentence to `free_text`, the other pair `W-CLOZE-NO-CARRIER`
 * recommends. The shape it writes keeps the consumer's element key: the
 * correct option text (or `accept[0]`) is the blank's first accept, and no
 * option gains a `stable_id`.
 */

interface LooseExercise {
  [field: string]: unknown;
}

const lessonWith = (exercise: LooseExercise) => ({
  id: "07-x",
  title: "T",
  steps: [
    { id: "t1", type: "theory", body: "Theorie." },
    { id: "s1", type: "exercise", exercise },
  ],
});

const migratedExercise = (exercise: LooseExercise): LooseExercise =>
  (migrateLesson(lessonWith(exercise)).lesson as { steps: { exercise?: LooseExercise }[] }).steps[1]!.exercise!;

const typedNoCarrier = (overrides: LooseExercise = {}): LooseExercise => ({
  id: "f1",
  stable_id: "ex-ms9433ij2plip",
  type: "cloze",
  cloze_mode: "type",
  prompt: "Γράψε τη λέξη: γεια",
  sentence: "___",
  blanks: [{ accept: ["bonjour", "Bonjour"] }],
  hint: "Χαιρετισμός.",
  ...overrides,
});

const selectNoCarrier = (overrides: LooseExercise = {}): LooseExercise => ({
  id: "c1",
  stable_id: "ex-ms9433ik2pya6",
  type: "cloze",
  cloze_mode: "select",
  prompt: "Τι σημαίνει «merci»;",
  sentence: "___",
  blanks: [{ accept: ["ευχαριστώ"] }],
  distractors: ["παρακαλώ", "γεια"],
  hint: "Ευγένεια.",
  ...overrides,
});

describe("migrate: a typed cloze without a carrier becomes free_text (engine#254)", () => {
  it("converts, keeping id, stable_id, prompt, hint and the accept list in order", () => {
    expect(migratedExercise(typedNoCarrier())).toEqual({
      id: "f1",
      stable_id: "ex-ms9433ij2plip",
      type: "free_text",
      prompt: "Γράψε τη λέξη: γεια",
      accept: ["bonjour", "Bonjour"],
      hint: "Χαιρετισμός.",
    });
  });

  it("leaves a typed cloze with a carrier sentence alone (a real gap text)", () => {
    const outcome = migrateLesson(lessonWith(typedNoCarrier({ sentence: "Je dis ___ le matin." })));

    expect(outcome.converted).toBe(0);
    expect(outcome.changes).toEqual([]);
  });

  it("skips a typed cloze with two blanks, with a reason", () => {
    const outcome = migrateLesson(lessonWith(typedNoCarrier({ sentence: "___ ___", blanks: [{ accept: ["a"] }, { accept: ["b"] }] })));

    expect(outcome.converted).toBe(0);
    expect(outcome.changes).toEqual([expect.objectContaining({ id: "f1", status: "skipped" })]);
  });

  it("moves a blank hint to the exercise when the exercise has none", () => {
    const exercise = migratedExercise(typedNoCarrier({ hint: undefined, blanks: [{ accept: ["bonjour"], hint: "Salut." }] }));

    expect(exercise["hint"]).toBe("Salut.");
  });

  it("skips when both the blank and the exercise carry a hint (one would be lost)", () => {
    const outcome = migrateLesson(lessonWith(typedNoCarrier({ blanks: [{ accept: ["bonjour"], hint: "Salut." }] })));

    expect(outcome.changes).toEqual([expect.objectContaining({ id: "f1", status: "skipped" })]);
  });

  it("passes the bundled validator", () => {
    const report = migrateContent(JSON.stringify(lessonWith(typedNoCarrier())), "07.json");

    expect(report.ok).toBe(true);
    expect(report.converted).toBe(1);
  });
});

describe("migrate keeps the consumer's element key (engine#254)", () => {
  it("a select: the correct option text is the blank's first accept, and no option has a stable_id", () => {
    const options = migratedExercise(selectNoCarrier())["options"] as { text: string; correct?: boolean; stable_id?: string }[];

    expect(options.find((option) => option.correct)?.text).toBe("ευχαριστώ");
    expect(options.every((option) => option.stable_id === undefined)).toBe(true);
  });

  it("a typed cloze: free_text's first accept is the blank's first accept", () => {
    expect((migratedExercise(typedNoCarrier())["accept"] as string[])[0]).toBe("bonjour");
  });
});

describe("migrate names the type_migrations declaration (engine#254)", () => {
  it.each([
    ["a select", selectNoCarrier(), "multiple_choice"],
    ["a typed cloze", typedNoCarrier(), "free_text"],
  ])("records the declaration for %s with a stable_id", (_label, exercise, to) => {
    const { changes } = migrateLesson(lessonWith(exercise));

    expect(changes[0]!.typeMigration).toEqual({ stable_id: exercise["stable_id"], from: "cloze", to });
  });

  it("records none for an exercise without a stable_id (nothing to keep)", () => {
    const { changes } = migrateLesson(lessonWith(selectNoCarrier({ stable_id: undefined })));

    expect(changes[0]!.status).toBe("converted");
    expect(changes[0]!.typeMigration).toBeUndefined();
  });

  it("notes a blank stable_id that cannot survive the conversion", () => {
    const { changes } = migrateLesson(lessonWith(selectNoCarrier({ blanks: [{ accept: ["ευχαριστώ"], stable_id: "bl-1" }] })));

    expect(changes[0]!.notes).toEqual([expect.stringMatching(/bl-1.*retired_ids/)]);
  });

  it("prints a ready-to-paste type_migrations block", () => {
    const report = migrateContent(JSON.stringify(lessonWith(typedNoCarrier())), "sets/el/fr-a1/lessons/07.json");
    const { text } = formatMigrateReports([report], { json: false, write: false });

    expect(text).toContain(
      [
        "declare in the set manifest's metadata (engine#254):",
        "  type_migrations:",
        "    - { stable_id: ex-ms9433ij2plip, from: cloze, to: free_text }",
      ].join("\n"),
    );
  });

  it("prints no block when nothing keeps a stable_id", () => {
    const report = migrateContent(JSON.stringify(lessonWith(selectNoCarrier({ stable_id: undefined }))), "07.json");

    expect(formatMigrateReports([report], { json: false, write: false }).text).not.toContain("type_migrations");
  });
});
