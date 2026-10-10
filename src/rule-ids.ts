/**
 * Rule IDs and their tier (engine#256).
 *
 * The prefix of a rule ID carries its tier: ``E-`` blocks, ``W-`` warns. An
 * ID is stable while its rule keeps its tier. Raising or lowering a rule
 * renames it (``W-X`` becomes ``E-X``): a breaking change for anyone who
 * mirrors or accepts a rule by its full ID, announced in the CHANGELOG and
 * recorded in {@link RENAMED_RULE_IDS}, so a downstream tool can follow the
 * rename instead of silently losing the match.
 */

/**
 * Every retired rule ID mapped to the ID its rule carries now. A rename only
 * ever changes the tier prefix. Frozen: the table is part of the API.
 *
 * - ``W-MANIFEST-ENTRY-MISMATCH`` became ``E-MANIFEST-ENTRY-MISMATCH`` in
 *   0.38.0 (engine#246): a set manifest that disagrees with its root entry is
 *   an error.
 */
export const RENAMED_RULE_IDS: Readonly<Record<string, string>> = Object.freeze({
  "W-MANIFEST-ENTRY-MISMATCH": "E-MANIFEST-ENTRY-MISMATCH",
});

/**
 * The ID a rule carries now: ``id`` itself, or, for a retired ID, the ID it
 * was renamed to (following a chain of renames). An unknown ID is returned as
 * it is, so a caller can map every ID it holds without checking first.
 */
export function currentRuleId(id: string): string {
  let current = id;
  const seen = new Set<string>();
  while (Object.hasOwn(RENAMED_RULE_IDS, current) && !seen.has(current)) {
    seen.add(current);
    current = RENAMED_RULE_IDS[current]!;
  }
  return current;
}
