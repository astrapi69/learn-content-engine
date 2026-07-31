import { describe, it, expect } from "vitest";

import { collectStableIds } from "./stable-ids.js";

/**
 * Set-wide stable_id uniqueness helper (engine#90). JSON Schema can only see
 * one document; this helper gives the content-repo gates and the conformance
 * harness the cross-lesson view. Contract: report every duplicate with its
 * locations, and report the checked quantity so a run over nothing is visible.
 */

const lesson = (id: string, stableIds: string[], cardStableIds: string[] = []) => ({
  id,
  title: id,
  steps: stableIds.map((sid, index) => ({
    id: `s${index}`,
    type: "exercise",
    exercise: { id: `e${index}`, type: "free_text", prompt: "p", accept: ["a"], stable_id: sid },
  })),
  cards: cardStableIds.map((sid, index) => ({
    id: `c${index}`,
    front: "f",
    back: "b",
    stable_id: sid,
  })),
});

describe("collectStableIds", () => {
  it("counts every stable_id across lessons (exercises and cards)", () => {
    const report = collectStableIds([
      lesson("l1", ["ex-aaaa0001"], ["card-aaaa0001"]),
      lesson("l2", ["ex-aaaa0002"]),
    ]);
    expect(report.total).toBe(3);
    expect(report.duplicates).toEqual([]);
  });

  it("reports a cross-lesson duplicate with both locations", () => {
    const report = collectStableIds([
      lesson("l1", ["ex-aaaa0001"]),
      lesson("l2", ["ex-aaaa0001"]),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]?.stableId).toBe("ex-aaaa0001");
    expect(report.duplicates[0]?.locations).toHaveLength(2);
  });

  it("reports an exercise/card collision (kinds share one namespace)", () => {
    const report = collectStableIds([lesson("l1", ["dup-aaaa0001"], ["dup-aaaa0001"])]);
    expect(report.duplicates).toHaveLength(1);
  });

  it("ignores elements without a stable_id (optional field, pre-1.9 content)", () => {
    const bare = { id: "l1", title: "l1", steps: [{ id: "s0", type: "exercise", exercise: { id: "e0", type: "free_text", prompt: "p", accept: ["a"] } }] };
    const report = collectStableIds([bare]);
    expect(report.total).toBe(0);
    expect(report.duplicates).toEqual([]);
  });

  it("boundary: the same stable_id twice within ONE lesson is a duplicate too", () => {
    const report = collectStableIds([lesson("l1", ["ex-aaaa0001", "ex-aaaa0001"])]);
    expect(report.duplicates).toHaveLength(1);
  });
});
