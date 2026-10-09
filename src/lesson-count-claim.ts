/**
 * ``W-LESSON-COUNT-CLAIM``: a set's title or description states a lesson
 * count that differs from its ``lesson_count``.
 *
 * Prose that repeats a number the manifest already carries goes stale when
 * the set grows: alc-psychology's set manifest described ``psych-intro`` as
 * "90 Lektionen" while the set had 115 (engine#246). Nothing compared the two.
 *
 * Only digits count. Number words are left alone on purpose: in the content
 * repositories they also name deliberate subsets ("vier Lektionen zu ...
 * sowie eine Wiederholungslektion" in a five-lesson set), which a digit total
 * like "(115 Lektionen)" or "a 15-lesson course" does not. A digit glued to a
 * letter (the ``1`` of "A1-Lektionen") is a level, not a count.
 */

import { warn, type ValidationIssue } from "./issues.js";

/** The lesson nouns of the source languages the content repositories use,
 *  singular and plural. A noun that continues into a compound
 *  ("Lektionsmodi") does not match. */
const LESSON_NOUN = "lektion(?:en)?|lessons?|lecci(?:ón|ones)|leçons?|lezion[ei]|liç(?:ão|ões)|μάθημα|μαθήματα";

/** A digit run not glued to a letter, digit or decimal mark, then the noun
 *  (optionally after a space or hyphen), not continued by a letter. */
const COUNT_CLAIM = new RegExp(`(?<![\\p{L}\\p{N}.,])(\\d+)[\\s-]?(?:${LESSON_NOUN})(?!\\p{L})`, "giu");

const CHECKED_FIELDS = ["title", "description"] as const;

/** The distinct counts a text states, in order of first appearance. */
function statedCounts(text: string): number[] {
  const counts = [...text.matchAll(COUNT_CLAIM)].map((match) => Number(match[1]));
  return [...new Set(counts)];
}

/** The claims in one set entry that differ from its ``lesson_count``. */
function setCountIssues(rawSet: unknown, index: number): ValidationIssue[] {
  const set = rawSet as Record<string, unknown> | null;
  const lessonCount = set?.["lesson_count"];
  if (typeof lessonCount !== "number") return [];
  return CHECKED_FIELDS.flatMap((field) => {
    const text = set?.[field];
    if (typeof text !== "string") return [];
    return statedCounts(text)
      .filter((claimed) => claimed !== lessonCount)
      .map((claimed) =>
        warn(
          "W-LESSON-COUNT-CLAIM",
          `/sets/${index}/${field}`,
          `'${field}' states ${claimed} lessons, but 'lesson_count' is ${lessonCount}`,
          "manifest-format",
          { field, claimed, lessonCount },
        ),
      );
  });
}

/** ``W-LESSON-COUNT-CLAIM`` for every set entry of a manifest. */
export function lessonCountClaimIssues(manifest: unknown): ValidationIssue[] {
  const sets = (manifest as { sets?: unknown } | null)?.sets;
  return Array.isArray(sets) ? sets.flatMap((rawSet, index) => setCountIssues(rawSet, index)) : [];
}
