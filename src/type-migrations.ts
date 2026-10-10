/**
 * Declared type migrations (engine#254): an exercise that changes its type and
 * stays the same element keeps its ``stable_id``.
 *
 * ``W-CLOZE-NO-CARRIER`` names a better type for a cloze whose sentence is only
 * its blank. Following it used to cost the learner's progress, because the
 * stability gate read the type change as id reuse (``V3``) and the only legal
 * path was retire-and-mint. A set manifest now declares the change in
 * ``metadata.type_migrations`` (``stable_id``, ``from``, ``to``), and the gate
 * accepts it for the declared id.
 *
 * Only transitions that ask the same question are allowed: the pairs
 * ``W-CLOZE-NO-CARRIER`` and ``migrate`` name. A blank's own ``stable_id`` does
 * not survive the change; it follows the ordinary rules (declare it in
 * ``retired_ids``).
 */

import { err, warn, type ValidationIssue } from "./issues.js";

/** One allowed type transition. */
export interface TypeMigration {
  from: string;
  to: string;
}

/** The transitions a declaration may name: a cloze becomes the native type
 *  that asks the same question (``multiple_choice`` for a select or
 *  multiselect, ``free_text`` for a typed answer). */
export const TYPE_MIGRATIONS: readonly TypeMigration[] = [
  { from: "cloze", to: "multiple_choice" },
  { from: "cloze", to: "free_text" },
];

/** Whether ``from`` -> ``to`` is one of {@link TYPE_MIGRATIONS}. */
export function isAllowedTypeMigration(from: string, to: string): boolean {
  return TYPE_MIGRATIONS.some((migration) => migration.from === from && migration.to === to);
}

const ENTRY_KEYS = ["stable_id", "from", "to"];
const PATH = "/metadata/type_migrations";
const ANCHOR = "type-migrations";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

/** Whether every entry is ``{ stable_id, from, to }`` with non-empty strings
 *  and no other key. */
function isWellFormed(entries: unknown): entries is { stable_id: string; from: string; to: string }[] {
  if (!Array.isArray(entries)) return false;
  return entries.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record);
    return keys.every((key) => ENTRY_KEYS.includes(key)) && ENTRY_KEYS.every((key) => isNonEmptyString(record[key]));
  });
}

/**
 * The manifest-level checks of ``metadata.type_migrations``: its shape
 * (``E-TYPE-MIGRATIONS-SHAPE``), each transition against
 * {@link TYPE_MIGRATIONS} (``E-TYPE-MIGRATION-PAIR``), and an id declared twice
 * (``W-TYPE-MIGRATIONS-DUP``). Whether the declared element really changed is
 * the stability gate's question; only it sees the previous version.
 */
export function typeMigrationIssues(metadata: Record<string, unknown> | undefined): ValidationIssue[] {
  if (!metadata || !("type_migrations" in metadata)) return [];
  const entries = metadata["type_migrations"];
  if (!isWellFormed(entries)) {
    return [
      err(
        "E-TYPE-MIGRATIONS-SHAPE",
        PATH,
        "'type_migrations' must be a list of { stable_id, from, to } entries, each a non-empty string and nothing else",
        ANCHOR,
      ),
    ];
  }
  const issues: ValidationIssue[] = [];
  entries.forEach((entry, index) => {
    if (isAllowedTypeMigration(entry.from, entry.to)) return;
    issues.push(
      err(
        "E-TYPE-MIGRATION-PAIR",
        `${PATH}/${index}`,
        `type migration '${entry.from}' -> '${entry.to}' for '${entry.stable_id}' is not allowed; a declaration may only name cloze -> multiple_choice or cloze -> free_text`,
        ANCHOR,
        { stableId: entry.stable_id, from: entry.from, to: entry.to },
      ),
    );
  });
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const entry of entries) (seen.has(entry.stable_id) ? repeated : seen).add(entry.stable_id);
  if (repeated.size > 0) {
    const stableIds = [...repeated];
    issues.push(
      warn("W-TYPE-MIGRATIONS-DUP", PATH, `'type_migrations' declares ${stableIds.join(", ")} more than once`, ANCHOR, { stableIds }),
    );
  }
  return issues;
}
