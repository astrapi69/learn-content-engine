/**
 * The grade lookup for a set's ``evaluation`` block (engine#227).
 *
 * The engine validates the declaration (``E-EVAL-*``, ``W-EVAL-*`` in
 * ``rules.ts``); the consumer samples the run and computes its percent. This
 * module maps that percent to the block's verdict, so every consumer applies
 * the same boundary rules (docs/lesson-format.md#evaluation). It imports
 * nothing but types, so it ships in ``learn-content-engine/rules`` for a
 * browser consumer.
 */
import type { ContentSetEvaluation, ContentSetGrade, EvaluationScheme } from "./types/index.js";

/** One lesson run under a set's evaluation block. */
export interface EvaluationOutcome {
  /** The scheme applied: the block's, or ``percent`` when it names none. */
  scheme: EvaluationScheme;
  /** Whether the run reached ``pass_percent``. Absent when the block has no
   *  pass mark; under ``percent`` the mark is advisory. */
  passed?: boolean;
  /** The grade row the run earns. Present only under ``grades``, and absent
   *  below the lowest row (a table without a row at 0). */
  grade?: ContentSetGrade;
}

/**
 * The verdict of a run that reached ``percent`` under ``evaluation``.
 *
 * - ``pass_percent`` is inclusive: a run at the mark passes.
 * - ``grades``: the row with the highest ``min_percent`` the run reaches, in
 *   any row order. ``min_percent`` is a lower bound, so a run between two
 *   reachable points of a national scale (86.25 % on a 60-point scale) earns
 *   the upper grade, as the grading presets intend.
 * - Pass the unrounded percent: the presets' thresholds assume it, and
 *   rounding first moves every boundary by up to half a point.
 * - A declaration the validator refuses yields what it still determines:
 *   ``pass_fail`` without ``pass_percent`` has no ``passed``, ``grades``
 *   without a table has no ``grade``.
 *
 * Throws a RangeError for a percent outside 0 to 100 or not a finite number:
 * that is a consumer's scoring bug, and a verdict on it would hide it.
 */
export function gradeFor(evaluation: ContentSetEvaluation, percent: number): EvaluationOutcome {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`a run's percent must lie in 0..100, got ${percent}`);
  }
  const scheme = evaluation.scheme ?? "percent";
  const outcome: EvaluationOutcome = { scheme };
  if (evaluation.pass_percent !== undefined) outcome.passed = percent >= evaluation.pass_percent;
  if (scheme !== "grades") return outcome;
  const grade = highestReachedRow(evaluation.grades ?? [], percent);
  if (grade) outcome.grade = grade;
  return outcome;
}

/** The row with the highest ``min_percent`` at or below ``percent``; of two
 *  rows on the same threshold (refused as ``E-EVAL-GRADES-DUP``) the first. */
function highestReachedRow(grades: readonly ContentSetGrade[], percent: number): ContentSetGrade | undefined {
  let best: ContentSetGrade | undefined;
  for (const row of grades) {
    if (row.min_percent <= percent && (!best || row.min_percent > best.min_percent)) best = row;
  }
  return best;
}
