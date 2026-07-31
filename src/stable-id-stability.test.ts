import { describe, it, expect } from "vitest";

import {
  buildStableIdInventory,
  compareStableIdInventories,
  type StableIdInventory,
} from "./stable-id-stability.js";

/**
 * The PURE half of the stability gate (engine#90): given the inventory of the
 * last published state and the inventory of the head, report the violations.
 * Reading git history and files is the shipped CLI's job; this core stays
 * I/O-free so every violation class is provable in a unit test.
 *
 * Shipping this in the package (instead of a script each repo copies) is what
 * gives the promise the same reach as the schema itself: ten copies drift,
 * one pinned command does not.
 */

const inventory = (
  entries: [set: string, stableId: string, kind: "exercise" | "card", type: string, lesson: string][],
  lessons: [set: string, filename: string][] = [],
): StableIdInventory => ({
  elements: entries.map(([set, stableId, kind, type, lesson]) => ({
    set,
    stableId,
    kind,
    type,
    lesson,
  })),
  lessons: lessons.map(([set, filename]) => ({ set, filename })),
});

const BASE = inventory(
  [["sets/de/a", "ex-aaaa0001", "exercise", "free_text", "01.json"]],
  [["sets/de/a", "01.json"]],
);

describe("compareStableIdInventories", () => {
  it("passes when nothing moved (content edits under a constant id are the point)", () => {
    const result = compareStableIdInventories(BASE, BASE);
    expect(result.violations).toEqual([]);
    expect(result.checked.baseIds).toBe(1);
    expect(result.checked.headIds).toBe(1);
  });

  it("V1: a base stable_id missing from the head is a violation", () => {
    const head = inventory([], [["sets/de/a", "01.json"]]);
    const result = compareStableIdInventories(BASE, head);
    expect(result.violations.map((violation) => violation.rule)).toEqual(["V1"]);
    expect(result.violations[0]?.message).toContain("ex-aaaa0001");
  });

  it("V2: a set-wide duplicate in the head is a violation", () => {
    const head = inventory(
      [
        ["sets/de/a", "ex-aaaa0001", "exercise", "free_text", "01.json"],
        ["sets/de/a", "ex-aaaa0001", "card", "card", "02.json"],
      ],
      [["sets/de/a", "01.json"]],
    );
    expect(compareStableIdInventories(BASE, head).violations.map((v) => v.rule)).toContain("V2");
  });

  it("V2 boundary: the same id in DIFFERENT sets is allowed (uniqueness is set-wide)", () => {
    const base = inventory([], []);
    const head = inventory([
      ["sets/de/a", "ex-aaaa0001", "exercise", "free_text", "01.json"],
      ["sets/de/b", "ex-aaaa0001", "exercise", "free_text", "01.json"],
    ]);
    expect(compareStableIdInventories(base, head).violations).toEqual([]);
  });

  it("V3: the same id pointing at another kind or exercise type is a violation", () => {
    const kindChanged = inventory(
      [["sets/de/a", "ex-aaaa0001", "card", "card", "01.json"]],
      [["sets/de/a", "01.json"]],
    );
    expect(compareStableIdInventories(BASE, kindChanged).violations.map((v) => v.rule)).toContain("V3");
    const typeChanged = inventory(
      [["sets/de/a", "ex-aaaa0001", "exercise", "cloze", "01.json"]],
      [["sets/de/a", "01.json"]],
    );
    expect(compareStableIdInventories(BASE, typeChanged).violations.map((v) => v.rule)).toContain("V3");
  });

  it("V4: a lesson file gone while its set survives is a violation (filename is identity)", () => {
    const head = inventory(
      [["sets/de/a", "ex-aaaa0001", "exercise", "free_text", "02.json"]],
      [["sets/de/a", "02.json"]],
    );
    expect(compareStableIdInventories(BASE, head).violations.map((v) => v.rule)).toContain("V4");
  });

  it("V4 boundary: a whole set disappearing is NOT reported per lesson file", () => {
    const head = inventory([], []);
    const rules = compareStableIdInventories(BASE, head).violations.map((v) => v.rule);
    expect(rules).toContain("V1");
    expect(rules).not.toContain("V4");
  });

  it("reports the checked quantities so a run over nothing stays visible", () => {
    const empty = inventory([], []);
    const result = compareStableIdInventories(empty, empty);
    expect(result.checked).toEqual({ baseIds: 0, headIds: 0, baseLessons: 0, headLessons: 0 });
  });
});

describe("buildStableIdInventory", () => {
  const lesson = {
    id: "l1",
    title: "L",
    cards: [{ id: "c1", front: "f", back: "b", stable_id: "card-aaaa0001" }],
    steps: [
      {
        id: "s1",
        type: "exercise",
        exercise: { id: "e1", type: "free_text", prompt: "p", accept: ["a"], stable_id: "ex-aaaa0001" },
      },
    ],
  };

  it("collects exercises and cards with their set and lesson filename", () => {
    const built = buildStableIdInventory([{ set: "sets/de/a", filename: "01.json", lesson }]);
    expect(built.elements).toHaveLength(2);
    expect(built.lessons).toEqual([{ set: "sets/de/a", filename: "01.json" }]);
    expect(built.elements.find((element) => element.kind === "card")?.stableId).toBe("card-aaaa0001");
  });

  it("records a lesson even when it carries no stable_ids yet (pre-mint state)", () => {
    const bare = { id: "l1", title: "L", steps: [] };
    const built = buildStableIdInventory([{ set: "sets/de/a", filename: "01.json", lesson: bare }]);
    expect(built.elements).toEqual([]);
    expect(built.lessons).toHaveLength(1);
  });
});
