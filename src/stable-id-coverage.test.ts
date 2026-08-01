import { describe, it, expect } from "vitest";

import {
  computeStableIdCoverage,
  gateStableIdCoverage,
  formatCoverageResult,
  type CoverageSet,
} from "./stable-id-coverage.js";

/**
 * The COVERAGE half of the stable_id gate (engine#103). The stability half
 * answers "does a published id still point at its element?"; this half answers
 * "is every set actually minted?" - a different question, and the one the
 * vendored ratchet in the ten content repos did NOT answer.
 *
 * That ratchet compared the count of fully minted sets against a committed
 * baseline and never looked at the total, so a new unminted set raised the
 * total, left the count untouched and passed. The regression test for that hole
 * is `reports a red verdict when a set is not minted at all` below.
 */

const set = (name: string, lessons: unknown[]): CoverageSet => ({ set: name, lessons });

const MINTED_LESSON = {
  cards: [{ id: "c1", stable_id: "card-aaaa0001" }],
  steps: [{ exercise: { id: "e1", type: "free_text", stable_id: "ex-aaaa0001" } }],
};

const UNMINTED_LESSON = {
  cards: [{ id: "c1" }],
  steps: [{ exercise: { id: "e1", type: "free_text" } }],
};

describe("computeStableIdCoverage", () => {
  it("counts a set whose every card and exercise carries a stable_id as covered", () => {
    const coverage = computeStableIdCoverage([set("sets/de/a", [MINTED_LESSON])]);
    expect(coverage).toEqual({ covered: 1, total: 1, unminted: [] });
  });

  it("names a set in which nothing is minted, the shape a fresh set arrives in", () => {
    const coverage = computeStableIdCoverage([
      set("sets/de/minted", [MINTED_LESSON]),
      set("sets/de/fresh", [UNMINTED_LESSON, UNMINTED_LESSON]),
    ]);
    expect(coverage).toEqual({ covered: 1, total: 2, unminted: ["sets/de/fresh"] });
  });

  it("names the set as unminted when one single element lacks its stable_id", () => {
    const halfMinted = {
      cards: [{ id: "c1", stable_id: "card-aaaa0001" }, { id: "c2" }],
      steps: [{ exercise: { id: "e1", type: "free_text", stable_id: "ex-aaaa0001" } }],
    };
    const coverage = computeStableIdCoverage([set("sets/de/a", [halfMinted])]);
    expect(coverage).toEqual({ covered: 0, total: 1, unminted: ["sets/de/a"] });
  });

  it("treats a set without lessons as unminted, because half a set is half a promise", () => {
    const coverage = computeStableIdCoverage([set("sets/de/empty", [])]);
    expect(coverage).toEqual({ covered: 0, total: 1, unminted: ["sets/de/empty"] });
  });

  it("reads a lesson with neither cards nor steps as covered rather than crashing", () => {
    const coverage = computeStableIdCoverage([set("sets/de/a", [{}])]);
    expect(coverage).toEqual({ covered: 1, total: 1, unminted: [] });
  });

  it("ignores a step that carries no exercise", () => {
    const theoryOnly = { cards: [], steps: [{ id: "s1", type: "theory" }] };
    const coverage = computeStableIdCoverage([set("sets/de/a", [theoryOnly])]);
    expect(coverage).toEqual({ covered: 1, total: 1, unminted: [] });
  });

  it("counts an empty string stable_id as absent, not as present", () => {
    const blank = { cards: [{ id: "c1", stable_id: "" }], steps: [] };
    const coverage = computeStableIdCoverage([set("sets/de/a", [blank])]);
    expect(coverage).toEqual({ covered: 0, total: 1, unminted: ["sets/de/a"] });
  });
});

describe("gateStableIdCoverage", () => {
  it("passes when every set is minted and the baseline says so", () => {
    const verdict = gateStableIdCoverage({ covered: 2, total: 2, unminted: [] }, 2);
    expect(verdict.ok).toBe(true);
    expect(verdict.failures).toEqual([]);
  });

  /**
   * The regression test for engine#103. The vendored ratchet returned green
   * here: covered equalled the baseline, and the total was never consulted.
   */
  it("reports a red verdict when a set is not minted at all", () => {
    const verdict = gateStableIdCoverage(
      { covered: 2, total: 3, unminted: ["sets/de/rhetorik"] },
      2,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.some((failure) => failure.rule === "INCOMPLETE")).toBe(true);
    expect(verdict.failures.some((failure) => failure.message.includes("sets/de/rhetorik"))).toBe(
      true,
    );
  });

  it("reports a regression when fewer sets are minted than the baseline records", () => {
    const verdict = gateStableIdCoverage({ covered: 1, total: 2, unminted: ["sets/de/b"] }, 2);
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map((failure) => failure.rule)).toContain("REGRESSION");
  });

  it("refuses an undeclared raise, because crossing the baseline is a deliberate act", () => {
    const verdict = gateStableIdCoverage({ covered: 3, total: 3, unminted: [] }, 2);
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map((failure) => failure.rule)).toContain("UNDECLARED_RAISE");
  });

  it("refuses a repo whose manifest lists no sets, because a run over nothing proves nothing", () => {
    const verdict = gateStableIdCoverage({ covered: 0, total: 0, unminted: [] }, 0);
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map((failure) => failure.rule)).toContain("NO_SETS");
  });

  it("reports the incomplete coverage and the stale baseline together, not one at a time", () => {
    const verdict = gateStableIdCoverage({ covered: 1, total: 3, unminted: ["b", "c"] }, 2);
    expect(verdict.failures.map((failure) => failure.rule).sort()).toEqual([
      "INCOMPLETE",
      "REGRESSION",
    ]);
  });
});

describe("formatCoverageResult", () => {
  it("prints the checked quantities and exits 0 on a clean run", () => {
    const { text, exitCode } = formatCoverageResult({ covered: 2, total: 2, unminted: [] }, 2);
    expect(text).toContain("2 of 2 set(s) fully minted, baseline 2");
    expect(exitCode).toBe(0);
  });

  it("names every unminted set and exits 1, so an incomplete run cannot read as a clean one", () => {
    const { text, exitCode } = formatCoverageResult(
      { covered: 2, total: 3, unminted: ["sets/de/rhetorik"] },
      2,
    );
    expect(text).toContain("sets/de/rhetorik");
    expect(exitCode).toBe(1);
  });
});
