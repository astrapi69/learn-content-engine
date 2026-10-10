import { describe, expect, it } from "vitest";

import {
  TYPE_MIGRATIONS,
  stableIdDeclarations,
  compareStableIdInventories,
  formatStabilityResult,
  validateManifest,
  type StableIdInventory,
} from "./index.js";

/**
 * A declared type migration keeps an exercise's stable_id (engine#254).
 * Following `W-CLOZE-NO-CARRIER` (a cloze whose sentence is only its blank is
 * a question with an answer) used to cost the learner's progress: the
 * stability gate read the type change as id reuse (`V3`), so the only legal
 * path was retire-and-mint.
 */

const SET = "sets/el/fr-a1";

const exercise = (stableId: string, type: string): StableIdInventory["elements"][number] => ({
  set: SET,
  stableId,
  kind: "exercise",
  type,
  lesson: "07.json",
});

const tree = (
  elements: StableIdInventory["elements"],
  typeMigrations?: StableIdInventory["typeMigrations"],
): StableIdInventory => ({
  elements,
  lessons: [{ set: SET, filename: "07.json" }],
  ...(typeMigrations ? { typeMigrations } : {}),
});

const rules = (base: StableIdInventory, head: StableIdInventory): string[] =>
  compareStableIdInventories(base, head).violations.map((violation) => violation.rule);

describe("check-stable-ids accepts a declared type migration (engine#254)", () => {
  it("reproduction: an undeclared cloze -> multiple_choice change is V3", () => {
    expect(rules(tree([exercise("ex-1", "cloze")]), tree([exercise("ex-1", "multiple_choice")]))).toEqual(["V3"]);
  });

  it.each([
    ["cloze", "multiple_choice"],
    ["cloze", "free_text"],
  ])("a declared %s -> %s change keeps the id without a violation", (from, to) => {
    const head = tree([exercise("ex-1", to)], [{ set: SET, stableId: "ex-1", from, to }]);

    expect(rules(tree([exercise("ex-1", from)]), head)).toEqual([]);
  });

  it("only the declared id is accepted; an undeclared sibling stays V3", () => {
    const base = tree([exercise("ex-1", "cloze"), exercise("ex-2", "cloze")]);
    const head = tree(
      [exercise("ex-1", "multiple_choice"), exercise("ex-2", "multiple_choice")],
      [{ set: SET, stableId: "ex-1", from: "cloze", to: "multiple_choice" }],
    );

    const violations = compareStableIdInventories(base, head).violations;
    expect(violations.map((violation) => violation.rule)).toEqual(["V3"]);
    expect(violations[0]!.message).toContain("ex-2");
  });

  it.each([
    ["the declaration names another target type", { from: "cloze", to: "free_text" }, "multiple_choice"],
    ["the declaration names another source type", { from: "matching", to: "multiple_choice" }, "multiple_choice"],
  ])("stays V3 when %s", (_label, declared, headType) => {
    const head = tree([exercise("ex-1", headType)], [{ set: SET, stableId: "ex-1", ...declared }]);

    expect(rules(tree([exercise("ex-1", "cloze")]), head)).toEqual(["V3"]);
  });

  it("stays V3 for a transition outside the allowed pairs, even when declared", () => {
    const head = tree([exercise("ex-1", "matching")], [{ set: SET, stableId: "ex-1", from: "cloze", to: "matching" }]);

    expect(rules(tree([exercise("ex-1", "cloze")]), head)).toEqual(["V3"]);
  });

  it("a declaration in another set does not apply", () => {
    const head = tree(
      [exercise("ex-1", "multiple_choice")],
      [{ set: "sets/de/ja-a0", stableId: "ex-1", from: "cloze", to: "multiple_choice" }],
    );

    expect(rules(tree([exercise("ex-1", "cloze")]), head)).toEqual(["V3"]);
  });

  it("a card turning into an exercise stays V3 (only exercises migrate)", () => {
    const base = tree([{ ...exercise("c-1", "card"), kind: "card" }]);
    const head = tree([exercise("c-1", "multiple_choice")], [{ set: SET, stableId: "c-1", from: "card", to: "multiple_choice" }]);

    expect(rules(base, head)).toEqual(["V3"]);
  });

  it("a declaration kept after the change was published is harmless (no type change, no violation)", () => {
    const declared = [{ set: SET, stableId: "ex-1", from: "cloze", to: "multiple_choice" }];

    expect(rules(tree([exercise("ex-1", "multiple_choice")], declared), tree([exercise("ex-1", "multiple_choice")], declared))).toEqual([]);
    expect(rules(tree([exercise("ex-1", "multiple_choice")], declared), tree([exercise("ex-1", "multiple_choice")]))).toEqual([]);
  });

  it("reports how many migrations the head declares and how many it applied", () => {
    const head = tree(
      [exercise("ex-1", "multiple_choice"), exercise("ex-2", "cloze")],
      [
        { set: SET, stableId: "ex-1", from: "cloze", to: "multiple_choice" },
        { set: SET, stableId: "ex-2", from: "cloze", to: "free_text" },
      ],
    );

    const result = compareStableIdInventories(tree([exercise("ex-1", "cloze"), exercise("ex-2", "cloze")]), head);

    expect(result.checked.headTypeMigrations).toBe(2);
    expect(result.checked.typeMigrationsApplied).toBe(1);
    expect(formatStabilityResult(result)).toMatch(/type migrations: 2 declared, 1 applied/);
  });

  it("names exactly the cloze -> native pairs of W-CLOZE-NO-CARRIER", () => {
    expect(TYPE_MIGRATIONS).toEqual([
      { from: "cloze", to: "multiple_choice" },
      { from: "cloze", to: "free_text" },
    ]);
  });
});

const manifestWith = (metadata: Record<string, unknown>) => ({
  name: "Set",
  sets: [{ id: "s", title: "S", target_language: "fr", level: "A1", version: "1.0.0", lesson_count: 1 }],
  metadata,
});

const ids = (metadata: Record<string, unknown>): string[] => {
  const { errors, warnings } = validateManifest(manifestWith(metadata));
  return [...errors, ...warnings].map((issue) => issue.id).filter((id) => id.includes("TYPE-MIGRATION"));
};

describe("validateManifest checks metadata.type_migrations (engine#254)", () => {
  it("accepts a well-formed declaration", () => {
    expect(ids({ type_migrations: [{ stable_id: "ex-1", from: "cloze", to: "multiple_choice" }] })).toEqual([]);
  });

  it("accepts a manifest without the key", () => {
    expect(ids({ lessons: ["01.json"] })).toEqual([]);
  });

  it.each([
    ["not a list", { stable_id: "ex-1", from: "cloze", to: "free_text" }],
    ["an entry without stable_id", [{ from: "cloze", to: "free_text" }]],
    ["an empty stable_id", [{ stable_id: "", from: "cloze", to: "free_text" }]],
    ["an entry that is a string", ["ex-1"]],
    ["an unknown key", [{ stable_id: "ex-1", from: "cloze", to: "free_text", why: "x" }]],
  ])("rejects %s (E-TYPE-MIGRATIONS-SHAPE)", (_label, typeMigrations) => {
    expect(ids({ type_migrations: typeMigrations })).toEqual(["E-TYPE-MIGRATIONS-SHAPE"]);
  });

  it("rejects a transition outside the allowed pairs, naming the entry", () => {
    const { errors } = validateManifest(manifestWith({ type_migrations: [{ stable_id: "ex-1", from: "cloze", to: "matching" }] }));

    expect(errors).toEqual([
      expect.objectContaining({
        id: "E-TYPE-MIGRATION-PAIR",
        path: "/metadata/type_migrations/0",
        params: { stableId: "ex-1", from: "cloze", to: "matching" },
      }),
    ]);
  });

  it("warns when the same stable_id is declared twice (W-TYPE-MIGRATIONS-DUP)", () => {
    const entry = { stable_id: "ex-1", from: "cloze", to: "multiple_choice" };

    expect(ids({ type_migrations: [entry, entry] })).toEqual(["W-TYPE-MIGRATIONS-DUP"]);
  });
});

describe("stableIdDeclarations reads a set manifest's declarations (engine#254)", () => {
  it("reads retired_ids and type_migrations, tagged with the set", () => {
    const manifest = {
      metadata: {
        retired_ids: ["old-1", ""],
        type_migrations: [{ stable_id: "ex-1", from: "cloze", to: "free_text" }],
      },
    };

    expect(stableIdDeclarations(manifest, SET)).toEqual({
      retired: [{ set: SET, stableId: "old-1" }],
      typeMigrations: [{ set: SET, stableId: "ex-1", from: "cloze", to: "free_text" }],
    });
  });

  it.each([
    ["no metadata", {}],
    ["null", null],
    ["malformed lists", { metadata: { retired_ids: "old-1", type_migrations: [{ stable_id: "ex-1" }, "x"] } }],
  ])("yields empty lists for %s (the validator reports the shape)", (_label, manifest) => {
    expect(stableIdDeclarations(manifest, SET)).toEqual({ retired: [], typeMigrations: [] });
  });
});
