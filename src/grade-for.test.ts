import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gradeFor as gradeForFromRoot } from "./index.js";
import { gradeFor } from "./rules.js";
import type { ContentSetEvaluation } from "./types/index.js";

/**
 * gradeFor (engine#227): a run's percent under a set's evaluation block, so
 * every consumer maps a score the same way. The boundary rules are the ones
 * docs/lesson-format.md#evaluation writes down: `min_percent` is a lower
 * bound, `pass_percent` is inclusive, and a run between two reachable points
 * of a scale earns the upper grade.
 */

interface Preset {
  id: string;
  evaluation: ContentSetEvaluation;
}

const PRESETS: Preset[] = JSON.parse(
  readFileSync(fileURLToPath(new URL("../schema/grading-presets.json", import.meta.url)), "utf8"),
).presets;

function preset(id: string): ContentSetEvaluation {
  const found = PRESETS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return found.evaluation;
}

const LETTERS: ContentSetEvaluation = {
  scheme: "grades",
  grades: [
    { min_percent: 90, label: "A", label_native: "Excellent" },
    { min_percent: 75, label: "B" },
    { min_percent: 60, label: "C" },
    { min_percent: 0, label: "F", label_native: "Fail" },
  ],
};

describe("gradeFor", () => {
  it("gives a run between two reachable points of a scale the upper grade (the 86.25 % case)", () => {
    // Luxembourg, 1 to 60: 52 of 60 points (86.67 %) earns "excellent", and
    // the row carries 86. A 40-unit run lands at 86.25 %, between 51 and 52
    // points, and earns the upper grade.
    expect(gradeFor(preset("lu-secondary"), 86.25).grade?.label).toBe("52–60");
    expect(gradeFor(preset("lu-secondary"), (51 / 60) * 100).grade?.label).toBe("48–51");
  });

  it("picks the row with the highest min_percent the run reaches, whatever the row order", () => {
    const shuffled: ContentSetEvaluation = { scheme: "grades", grades: [...LETTERS.grades!].reverse() };
    expect(gradeFor(LETTERS, 80)).toEqual({ scheme: "grades", grade: { min_percent: 75, label: "B" } });
    expect(gradeFor(shuffled, 80).grade?.label).toBe("B");
  });

  it("passes a pass_fail run at the mark and fails it just below (pass_percent is inclusive)", () => {
    const passFail: ContentSetEvaluation = { scheme: "pass_fail", pass_percent: 70 };
    expect(gradeFor(passFail, 70)).toEqual({ scheme: "pass_fail", passed: true });
    expect(gradeFor(passFail, 69.99)).toEqual({ scheme: "pass_fail", passed: false });
  });

  it("treats a run exactly on a min_percent as reaching that row", () => {
    expect(gradeFor(LETTERS, 90).grade?.label).toBe("A");
    expect(gradeFor(LETTERS, 89.99).grade?.label).toBe("B");
  });

  it("gives no grade below the lowest row (W-EVAL-GRADES-NO-FLOOR territory)", () => {
    const noFloor: ContentSetEvaluation = {
      scheme: "grades",
      grades: [
        { min_percent: 80, label: "pass with merit" },
        { min_percent: 50, label: "pass" },
      ],
    };
    expect(gradeFor(noFloor, 49)).toEqual({ scheme: "grades" });
  });

  it("maps 0 % and 100 % like any other run", () => {
    expect(gradeFor(LETTERS, 0).grade?.label).toBe("F");
    expect(gradeFor(LETTERS, 100).grade?.label).toBe("A");
    expect(gradeFor({ scheme: "pass_fail", pass_percent: 0 }, 0).passed).toBe(true);
    expect(gradeFor({ scheme: "pass_fail", pass_percent: 100 }, 100).passed).toBe(true);
  });

  it("compares the unrounded percent (40 of 60 points reaches a row at 66)", () => {
    expect(gradeFor(preset("lu-secondary"), (40 / 60) * 100).grade?.label).toBe("40–47");
  });

  it("maps every row of every preset end to end: on the row, the row; just below, the next one down", () => {
    for (const { id, evaluation } of PRESETS) {
      const rows = [...(evaluation.grades ?? [])].sort((a, b) => b.min_percent - a.min_percent);
      rows.forEach((row, index) => {
        expect(gradeFor(evaluation, row.min_percent).grade, `${id} at ${row.min_percent}`).toEqual(row);
        if (row.min_percent > 0) {
          expect(gradeFor(evaluation, row.min_percent - 0.01).grade, `${id} below ${row.min_percent}`).toEqual(
            rows[index + 1],
          );
        }
      });
    }
  });

  it("defaults to the percent scheme, with no verdict and no grade", () => {
    expect(gradeFor({}, 55)).toEqual({ scheme: "percent" });
  });

  it("reports an advisory pass mark under percent, and a pass mark next to a grade table", () => {
    expect(gradeFor({ scheme: "percent", pass_percent: 60 }, 59)).toEqual({ scheme: "percent", passed: false });
    expect(gradeFor({ ...LETTERS, pass_percent: 60 }, 60)).toEqual({
      scheme: "grades",
      passed: true,
      grade: { min_percent: 60, label: "C" },
    });
  });

  it("leaves out what an invalid declaration does not determine (E-EVAL-PASS-MISSING, E-EVAL-GRADES-MISSING)", () => {
    expect(gradeFor({ scheme: "pass_fail" }, 80)).toEqual({ scheme: "pass_fail" });
    expect(gradeFor({ scheme: "grades" }, 80)).toEqual({ scheme: "grades" });
  });

  it("refuses a percent outside 0 to 100, or not a number, instead of guessing", () => {
    for (const percent of [-0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => gradeFor(LETTERS, percent), String(percent)).toThrow(RangeError);
    }
  });

  it("is the same function from the root and from learn-content-engine/rules", () => {
    expect(gradeForFromRoot).toBe(gradeFor);
  });
});
