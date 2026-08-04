import { describe, it, expect } from "vitest";

import { lessonIdOrderingIssues } from "./set-ordering.js";

/**
 * Set-level lesson ordering gate (engine#106). Written RED-first.
 *
 * Every consumer surface orders a set's lessons by the LEXICOGRAPHIC sort of
 * their ids (the reference consumer sorts `lessons/<lesson.id>.json` filenames
 * on read AND on zip import; the set manifest's `metadata.lessons` list only
 * steers download discovery). The `NN-` prefix convention is therefore the
 * ordering mechanism, not cosmetics - and three id shapes guarantee a wrong
 * display order without any validation firing:
 *
 *  - some ids carry an `NN-` prefix and some do not,
 *  - the prefixes have different digit widths (`1-` next to `01-`),
 *  - embedded numbers make the lexicographic order diverge from the numeric
 *    reading (`kapitel-10` before `kapitel-2` - the observed damage case).
 *
 * The engine validates one lesson at a time, so this is a set-level helper in
 * the collectStableIds style: the caller (a repo gate) decides which lesson
 * ids form the set.
 */

const issueIds = (lessonIds: string[]): string[] =>
  lessonIdOrderingIssues(lessonIds).map((issue) => issue.id);

describe("lessonIdOrderingIssues - mixed NN- prefix presence", () => {
  it("warns when only a part of the set carries an NN- prefix", () => {
    const issues = lessonIdOrderingIssues(["01-a", "b", "03-c"]);
    expect(issues.map((issue) => issue.id)).toContain("W-SET-ORDER-MIXED-PREFIX");
    const mixed = issues.find((issue) => issue.id === "W-SET-ORDER-MIXED-PREFIX")!;
    expect(mixed.severity).toBe("warning");
    expect(mixed.message).toContain("b");
  });

  it("stays silent when every id is prefixed", () => {
    expect(issueIds(["01-a", "02-b", "03-c"])).not.toContain("W-SET-ORDER-MIXED-PREFIX");
  });

  it("stays silent when no id is prefixed", () => {
    expect(issueIds(["alpha", "beta"])).not.toContain("W-SET-ORDER-MIXED-PREFIX");
  });
});

describe("lessonIdOrderingIssues - inconsistent prefix width", () => {
  it("warns on '1-' next to '10-'", () => {
    const issues = lessonIdOrderingIssues(["1-a", "10-b"]);
    expect(issues.map((issue) => issue.id)).toContain("W-SET-ORDER-PREFIX-WIDTH");
  });

  it("stays silent on a uniform zero-padded width", () => {
    expect(issueIds(["01-a", "02-b", "10-c"])).toEqual([]);
  });
});

describe("lessonIdOrderingIssues - lexicographic vs numeric divergence (the observed damage case)", () => {
  it("warns on the exact shape that displayed kapitel-10 before kapitel-2", () => {
    const damageCase = [
      "einleitung",
      "interludium",
      "kapitel-1",
      "kapitel-10",
      "kapitel-2",
      "teil-1",
    ];
    const issues = lessonIdOrderingIssues(damageCase);
    expect(issues.map((issue) => issue.id)).toContain("W-SET-ORDER-NUMERIC");
    const numeric = issues.find((issue) => issue.id === "W-SET-ORDER-NUMERIC")!;
    expect(numeric.message).toContain("kapitel-10");
    expect(numeric.message).toContain("kapitel-2");
  });

  it("stays silent when the lexicographic order matches the numeric reading", () => {
    expect(issueIds(["kapitel-01", "kapitel-02", "kapitel-10"])).toEqual([]);
  });

  it("stays silent on ids without numbers", () => {
    expect(issueIds(["alpha", "beta", "gamma"])).toEqual([]);
  });
});

describe("lessonIdOrderingIssues - degenerate inputs", () => {
  it("returns nothing for an empty set", () => {
    expect(lessonIdOrderingIssues([])).toEqual([]);
  });

  it("returns nothing for a single lesson", () => {
    expect(lessonIdOrderingIssues(["einleitung"])).toEqual([]);
  });
});
