import { describe, it, expect } from "vitest";

import {
  buildStableIdInventory,
  compareStableIdInventories,
  formatStabilityResult,
  isBaseCredible,
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
  entries: [
    set: string,
    stableId: string,
    kind: "exercise" | "card" | "pair" | "blank" | "option",
    type: string,
    lesson: string,
  ][],
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
    expect(result.checked).toEqual({
      baseIds: 0,
      headIds: 0,
      baseLessons: 0,
      headLessons: 0,
      baseRetired: 0,
      headRetired: 0,
    });
  });
});

describe("isBaseCredible", () => {
  it("a base carrying lessons is credible, minted or not (the mint wave case)", () => {
    // During a mint wave the base legitimately has lessons but ZERO stable_ids
    // while the head has many. That must pass, or no mint PR could ever land.
    expect(isBaseCredible({ baseIds: 0, headIds: 42, baseLessons: 12, headLessons: 12, baseRetired: 0, headRetired: 0 }).credible).toBe(true);
  });

  it("a base with NO lessons while the head has them is not a credible predecessor", () => {
    // The dangerous shape: an empty or unrelated ref yields no previous ids,
    // so nothing can be violated and the gate would report green exactly when
    // it is needed most.
    const verdict = isBaseCredible({ baseIds: 0, headIds: 42, baseLessons: 0, headLessons: 12, baseRetired: 0, headRetired: 0 });
    expect(verdict.credible).toBe(false);
    expect(verdict.reason).toContain("no lessons");
  });

  it("an empty base with an empty head is credible (nothing to compare, nothing claimed)", () => {
    expect(
      isBaseCredible({ baseIds: 0, headIds: 0, baseLessons: 0, headLessons: 0, baseRetired: 0, headRetired: 0 })
        .credible,
    ).toBe(true);
  });

  it("boundary: a single base lesson is enough to make the base credible", () => {
    expect(
      isBaseCredible({ baseIds: 0, headIds: 5, baseLessons: 1, headLessons: 3, baseRetired: 0, headRetired: 0 })
        .credible,
    ).toBe(true);
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

  it("collects pair, blank and option stable_ids too (engine#91 Phase 2)", () => {
    const withSubElements = {
      id: "l1",
      title: "L",
      steps: [
        {
          id: "s1",
          type: "exercise",
          exercise: {
            id: "e1",
            type: "matching",
            prompt: "p",
            pairs: [{ left: "a", right: "b", stable_id: "pair-aaaa0001" }],
            blanks: [{ accept: ["a"], stable_id: "blank-aaaa0001" }],
            options: [{ text: "a", stable_id: "opt-aaaa0001" }],
          },
        },
      ],
    };
    const built = buildStableIdInventory([{ set: "sets/de/a", filename: "01.json", lesson: withSubElements }]);
    const kinds = built.elements.map((element) => element.kind).sort();
    expect(kinds).toEqual(["blank", "option", "pair"]);
    expect(built.elements.find((element) => element.kind === "pair")?.stableId).toBe("pair-aaaa0001");
    expect(built.elements.find((element) => element.kind === "blank")?.stableId).toBe("blank-aaaa0001");
    expect(built.elements.find((element) => element.kind === "option")?.stableId).toBe("opt-aaaa0001");
  });
});

describe("compareStableIdInventories — pair/blank/option kinds share V1-V4 generically (engine#91 Phase 2)", () => {
  const pairInventory = inventory([["sets/de/a", "pair-aaaa0001", "pair", "matching", "01.json"]]);

  it("V1: a published pair stable_id disappearing undeclared is a violation", () => {
    const head = inventory([], []);
    const result = compareStableIdInventories(pairInventory, head);
    expect(result.violations.map((violation) => violation.rule)).toEqual(["V1"]);
  });

  it("V3: the same id moving from pair to blank kind is a violation (reuse)", () => {
    const head = inventory([["sets/de/a", "pair-aaaa0001", "blank", "matching", "01.json"]]);
    expect(compareStableIdInventories(pairInventory, head).violations.map((v) => v.rule)).toContain("V3");
  });

  it("V2: a duplicate shared between a pair and a blank in the same set is a violation", () => {
    const head = inventory([
      ["sets/de/a", "dup-aaaa0001", "pair", "matching", "01.json"],
      ["sets/de/a", "dup-aaaa0001", "blank", "matching", "01.json"],
    ]);
    expect(compareStableIdInventories(inventory([]), head).violations.map((v) => v.rule)).toContain("V2");
  });
});

/**
 * retired_ids in the stability core (engine#131). The lock
 * (E-RETIRED-IDS-LOCKED) fell after the consumer consequence shipped
 * (adaptive-learner#2188); the core now reads each tree's declared
 * retirements: a declared disappearance is legal (V1 unlock), a published
 * retirement never un-declares (V5), and retired-yet-alive is a
 * contradiction (V6). Multi-element fixtures on purpose: a bug in handling
 * several entries needs two to exist.
 */
describe("compareStableIdInventories - retired_ids (engine#131)", () => {
  const twoIdBase: StableIdInventory = {
    elements: [
      { set: "sets/de/a", stableId: "ex-aaaa0001", kind: "exercise", type: "free_text", lesson: "01.json" },
      { set: "sets/de/a", stableId: "ex-aaaa0002", kind: "exercise", type: "cloze", lesson: "01.json" },
    ],
    lessons: [{ set: "sets/de/a", filename: "01.json" }],
  };

  it("V1 unlock: two ids gone, ONE declared retired - exactly the undeclared one violates", () => {
    const head: StableIdInventory = {
      elements: [],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [{ set: "sets/de/a", stableId: "ex-aaaa0001" }],
    };
    const result = compareStableIdInventories(twoIdBase, head);
    expect(result.violations.map((violation) => violation.rule)).toEqual(["V1"]);
    expect(result.violations[0]?.message).toContain("ex-aaaa0002");
    expect(result.violations[0]?.message).toContain("retired_ids");
  });

  it("V1 boundary: a retirement declared in a DIFFERENT set does not legalize the disappearance", () => {
    const head: StableIdInventory = {
      elements: [
        { set: "sets/de/a", stableId: "ex-aaaa0002", kind: "exercise", type: "cloze", lesson: "01.json" },
      ],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [{ set: "sets/de/b", stableId: "ex-aaaa0001" }],
    };
    expect(compareStableIdInventories(twoIdBase, head).violations.map((v) => v.rule)).toEqual(["V1"]);
  });

  it("V5: a published retirement never un-declares - two retired in base, one dropped", () => {
    const base: StableIdInventory = {
      elements: [],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [
        { set: "sets/de/a", stableId: "ex-aaaa0001" },
        { set: "sets/de/a", stableId: "ex-aaaa0002" },
      ],
    };
    const head: StableIdInventory = {
      elements: [],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [{ set: "sets/de/a", stableId: "ex-aaaa0002" }],
    };
    const result = compareStableIdInventories(base, head);
    expect(result.violations.map((violation) => violation.rule)).toEqual(["V5"]);
    expect(result.violations[0]?.message).toContain("ex-aaaa0001");
  });

  it("V6: two retired, ONE still alive - exactly the alive one is the contradiction", () => {
    const head: StableIdInventory = {
      elements: [
        { set: "sets/de/a", stableId: "ex-aaaa0001", kind: "exercise", type: "free_text", lesson: "01.json" },
      ],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [
        { set: "sets/de/a", stableId: "ex-aaaa0001" },
        { set: "sets/de/a", stableId: "ex-aaaa0002" },
      ],
    };
    const base: StableIdInventory = {
      elements: [],
      lessons: [],
      retired: [
        { set: "sets/de/a", stableId: "ex-aaaa0001" },
        { set: "sets/de/a", stableId: "ex-aaaa0002" },
      ],
    };
    const result = compareStableIdInventories(base, head);
    expect(result.violations.map((violation) => violation.rule)).toEqual(["V6"]);
    expect(result.violations[0]?.message).toContain("ex-aaaa0001");
  });

  it("clean retirement round-trip: declared, gone, still declared - no violation", () => {
    const head: StableIdInventory = {
      elements: [
        { set: "sets/de/a", stableId: "ex-aaaa0002", kind: "exercise", type: "cloze", lesson: "01.json" },
      ],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [{ set: "sets/de/a", stableId: "ex-aaaa0001" }],
    };
    expect(compareStableIdInventories(twoIdBase, head).violations).toEqual([]);
  });

  it("inventories without a retired list behave exactly as before (back-compat)", () => {
    const head: StableIdInventory = {
      elements: [],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
    };
    const result = compareStableIdInventories(twoIdBase, head);
    expect(result.violations.map((violation) => violation.rule)).toEqual(["V1", "V1"]);
  });
});

describe("checked quantities cover the retired lists (test contract, engine#131)", () => {
  it("counts base and head retirements, so a run that never read the manifests is visible", () => {
    const base: StableIdInventory = {
      elements: [],
      lessons: [["sets/de/a", "01.json"]].map(([set, filename]) => ({ set: set!, filename: filename! })),
      retired: [
        { set: "sets/de/a", stableId: "ex-aaaa0001" },
        { set: "sets/de/a", stableId: "ex-aaaa0002" },
      ],
    };
    const head: StableIdInventory = {
      elements: [],
      lessons: [{ set: "sets/de/a", filename: "01.json" }],
      retired: [
        { set: "sets/de/a", stableId: "ex-aaaa0001" },
        { set: "sets/de/a", stableId: "ex-aaaa0002" },
      ],
    };
    const result = compareStableIdInventories(base, head);
    expect(result.checked.baseRetired).toBe(2);
    expect(result.checked.headRetired).toBe(2);
  });

  it("formatStabilityResult reports the retired quantities", () => {
    const emptyInventory: StableIdInventory = { elements: [], lessons: [] };
    const rendered = formatStabilityResult(compareStableIdInventories(emptyInventory, emptyInventory));
    expect(rendered).toContain("retired");
  });
});
