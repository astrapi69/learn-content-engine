/**
 * Coverage gate for `stable_id` (engine#103) - the PURE core.
 *
 * The stability half (`stable-id-stability.ts`) answers "does a published id
 * still point at its element?". It cannot answer "is every set actually
 * minted?", because an unminted set publishes no ids and therefore violates
 * nothing. That second question is this file.
 *
 * Why it ships here instead of living as a script each content repo copies:
 * the same reason the stability half does. Ten vendored copies drift; a command
 * that arrives with the pinned release reaches every repo the moment it
 * re-pins. What stays repo-local is only the baseline NUMBER, because that is a
 * property of the individual repository. The RULE is universal.
 *
 * The hole this closes: the vendored ratchet compared the count of fully minted
 * sets against the baseline and never consulted the total, so a new unminted
 * set raised the total, left the count untouched and passed green. The promise
 * that every set carries stable ids would have quietly stopped being true.
 */

/** One set as the coverage gate sees it: its path plus its PARSED lessons. */
export interface CoverageSet {
  /** Repo-relative set directory, e.g. ``sets/de/psych-intro``. */
  set: string;
  /** The parsed lesson documents of that set, in manifest order. */
  lessons: unknown[];
}

/** How much of the repository carries stable ids. */
export interface StableIdCoverage {
  /** Sets in which EVERY card and exercise carries a stable_id. */
  covered: number;
  /** Sets the root manifest lists. */
  total: number;
  /** The set paths that are not fully minted, so a report can name them. */
  unminted: string[];
}

/** Why a coverage run is red. */
export interface CoverageFailure {
  rule: "NO_SETS" | "REGRESSION" | "UNDECLARED_RAISE" | "INCOMPLETE";
  message: string;
}

/** The verdict over one coverage measurement. */
export interface CoverageVerdict {
  ok: boolean;
  failures: CoverageFailure[];
}

const hasStableId = (element: unknown): boolean => {
  const stableId = (element as { stable_id?: unknown } | null)?.stable_id;
  return typeof stableId === "string" && stableId !== "";
};

/**
 * Is every identity-bearing element of this set minted?
 *
 * A set without lessons is NOT minted: half a set is half a promise, and an
 * empty set would otherwise report full coverage over nothing.
 */
function isSetFullyMinted(coverageSet: CoverageSet): boolean {
  if (coverageSet.lessons.length === 0) return false;
  for (const raw of coverageSet.lessons) {
    const lesson = (raw ?? {}) as {
      cards?: unknown[];
      steps?: { exercise?: unknown }[];
    };
    for (const card of lesson.cards ?? []) {
      if (!hasStableId(card)) return false;
    }
    for (const step of lesson.steps ?? []) {
      const exercise = step?.exercise;
      if (exercise && !hasStableId(exercise)) return false;
    }
  }
  return true;
}

/**
 * Measure how many of the listed sets are fully minted.
 *
 * Returns the covered count, the total, and the paths of the sets that fall
 * short, so a caller can name them instead of only reporting a number.
 */
export function computeStableIdCoverage(sets: CoverageSet[]): StableIdCoverage {
  const unminted = sets.filter((entry) => !isSetFullyMinted(entry)).map((entry) => entry.set);
  return { covered: sets.length - unminted.length, total: sets.length, unminted };
}

/**
 * Judge a measurement against the committed baseline.
 *
 * Four red paths, and they are reported TOGETHER rather than one per run, so a
 * repo does not fix one number only to discover the next on the following push:
 * - **NO_SETS** the root manifest lists nothing; a run over nothing is never
 *   fully covered.
 * - **REGRESSION** fewer sets are minted than the baseline records.
 * - **UNDECLARED_RAISE** more are minted than the baseline records; crossing
 *   the line is a deliberate act and gets a deliberate edit.
 * - **INCOMPLETE** a listed set carries no stable ids at all. This is the rule
 *   the vendored ratchet lacked, and the reason a new set could erode the
 *   promise without anything turning red.
 */
export function gateStableIdCoverage(
  coverage: StableIdCoverage,
  baseline: number,
): CoverageVerdict {
  const failures: CoverageFailure[] = [];

  if (coverage.total === 0) {
    failures.push({
      rule: "NO_SETS",
      message: "the root manifest lists no sets; a run over nothing is never fully covered",
    });
    return { ok: false, failures };
  }

  if (coverage.covered < baseline) {
    failures.push({
      rule: "REGRESSION",
      message: `coverage ${coverage.covered} below baseline ${baseline} (regression)`,
    });
  } else if (coverage.covered > baseline) {
    failures.push({
      rule: "UNDECLARED_RAISE",
      message: `coverage ${coverage.covered} above baseline ${baseline}; raise it deliberately`,
    });
  }

  if (coverage.unminted.length > 0) {
    failures.push({
      rule: "INCOMPLETE",
      message:
        `${coverage.unminted.length} listed set(s) carry no complete stable_id coverage: ` +
        `${coverage.unminted.join(", ")}`,
    });
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Human-readable report plus the exit code, in the shape the CLI shim expects.
 *
 * The checked quantities are printed on every run, clean or not, so a green
 * line always states WHAT was measured rather than only that it passed.
 */
export function formatCoverageResult(
  coverage: StableIdCoverage,
  baseline: number,
): { text: string; exitCode: number } {
  const verdict = gateStableIdCoverage(coverage, baseline);
  const lines = [
    `stable-id coverage: ${coverage.covered} of ${coverage.total} set(s) fully minted, ` +
      `baseline ${baseline}`,
  ];
  if (verdict.ok) {
    lines.push("ok: every listed set is fully minted and the baseline matches");
    return { text: lines.join("\n"), exitCode: 0 };
  }
  for (const failure of verdict.failures) {
    lines.push(`FAIL ${failure.rule}: ${failure.message}`);
  }
  return { text: lines.join("\n"), exitCode: 1 };
}
