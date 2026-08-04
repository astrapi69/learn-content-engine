/**
 * Set-wide lesson ordering view (engine#106).
 *
 * Every consumer surface orders a set's lessons by the LEXICOGRAPHIC sort of
 * their ids: the reference consumer (adaptive-learner) sorts the stored
 * `lessons/<lesson.id>.json` filenames on read and on zip import, and the set
 * manifest's `metadata.lessons` list only steers download discovery. The
 * `NN-` prefix convention is therefore the ordering mechanism itself.
 *
 * The JSON Schema validates one document and cannot see a set; this helper
 * gives repo gates the cross-lesson view in the collectStableIds style: the
 * caller decides which lesson ids form the set.
 */

import { warn, type ValidationIssue } from "./validate.js";

const NN_PREFIX_RE = /^([0-9]+)-/;

/** Split into digit / non-digit runs for the numeric-aware comparison. */
const chunked = (lessonId: string): string[] => lessonId.match(/[0-9]+|[^0-9]+/g) ?? [];

/** Compare two ids the way a human reads embedded numbers: digit runs compare
 *  numerically, everything else by code unit (the same order `.sort()` uses). */
function compareNumericAware(leftId: string, rightId: string): number {
  const leftChunks = chunked(leftId);
  const rightChunks = chunked(rightId);
  const shared = Math.min(leftChunks.length, rightChunks.length);
  for (let i = 0; i < shared; i++) {
    const leftChunk = leftChunks[i]!;
    const rightChunk = rightChunks[i]!;
    if (leftChunk === rightChunk) continue;
    const bothNumeric = /^[0-9]/.test(leftChunk) && /^[0-9]/.test(rightChunk);
    if (bothNumeric) {
      const difference = Number(leftChunk) - Number(rightChunk);
      if (difference !== 0) return difference;
      continue;
    }
    return leftChunk < rightChunk ? -1 : 1;
  }
  return leftChunks.length - rightChunks.length;
}

function checkMixedPrefix(lessonIds: string[], issues: ValidationIssue[]): void {
  const unprefixed = lessonIds.filter((lessonId) => !NN_PREFIX_RE.test(lessonId));
  if (unprefixed.length === 0 || unprefixed.length === lessonIds.length) return;
  issues.push(
    warn(
      "W-SET-ORDER-MIXED-PREFIX",
      "",
      `some lesson ids carry an NN- ordering prefix and some do not (${unprefixed.join(", ")}); ` +
        "consumers sort ids lexicographically, so the unprefixed ids land wherever their first character falls",
      "lesson-ordering",
    ),
  );
}

function checkPrefixWidth(lessonIds: string[], issues: ValidationIssue[]): void {
  const widths = new Set<number>();
  for (const lessonId of lessonIds) {
    const prefix = NN_PREFIX_RE.exec(lessonId);
    if (prefix) widths.add(prefix[1]!.length);
  }
  if (widths.size < 2) return;
  const sortedWidths = [...widths].sort((a, b) => a - b).join(" and ");
  issues.push(
    warn(
      "W-SET-ORDER-PREFIX-WIDTH",
      "",
      `NN- ordering prefixes have different digit widths (${sortedWidths}); ` +
        "lexicographic sorting puts '10-' before '2-', so zero-pad every prefix to one fixed width",
      "lesson-ordering",
    ),
  );
}

function checkNumericDivergence(lessonIds: string[], issues: ValidationIssue[]): void {
  const lexicographic = [...lessonIds].sort();
  const numericAware = [...lessonIds].sort(compareNumericAware);
  for (let i = 0; i < lexicographic.length; i++) {
    if (lexicographic[i] === numericAware[i]) continue;
    issues.push(
      warn(
        "W-SET-ORDER-NUMERIC",
        "",
        `the display order diverges from the numeric reading: consumers sort '${lexicographic[i]!}' before '${numericAware[i]!}'; ` +
          "zero-pad the embedded numbers to a fixed width",
        "lesson-ordering",
      ),
    );
    return;
  }
}

/**
 * Check a set's lesson ids for shapes that guarantee a wrong display order
 * under lexicographic sorting. Returns warning-tier issues (never errors):
 * mixed `NN-` prefix presence, inconsistent prefix digit widths, and
 * lexicographic-vs-numeric divergence (`kapitel-10` displaying before
 * `kapitel-2`). An empty or single-id set yields no issues.
 */
export function lessonIdOrderingIssues(lessonIds: string[]): ValidationIssue[] {
  if (lessonIds.length < 2) return [];
  const issues: ValidationIssue[] = [];
  checkMixedPrefix(lessonIds, issues);
  checkPrefixWidth(lessonIds, issues);
  checkNumericDivergence(lessonIds, issues);
  return issues;
}
