/**
 * The repo-level manifest check (engine#246, step 2): a content repo describes
 * each set twice, as a ``sets[]`` entry in the root ``manifest.yaml`` and as
 * ``sets[0]`` in the set's own manifest. ``validateManifest`` sees one file at a
 * time, so a field the two carry with different values went unreported, and
 * which value a consumer showed depended on which file it read.
 *
 * This check sees both entries of one set and reports an error per field that
 * differs. It was a warning in 0.37.0 (``W-MANIFEST-ENTRY-MISMATCH``) until the
 * content repositories were clean (step 3: 0 findings over the eleven).
 */

import { err, splitIssues, type ValidationIssue, type ValidationResult } from "./issues.js";

type ManifestEntry = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** ``null`` and an absent key both mean "this file says nothing". */
const isSilent = (value: unknown): boolean => value === undefined || value === null;

/**
 * A comparable form of a manifest value: object keys sorted, silent keys
 * dropped at every depth, so key order and ``url: null`` against a missing
 * ``url`` do not count as differences.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (!isSilent(value[key])) sorted[key] = canonical(value[key]);
  }
  return sorted;
}

const asText = (value: unknown): string => JSON.stringify(canonical(value));

/** The first ``sets[]`` entry of a set manifest, or ``null`` without one. */
function setFileEntry(setManifest: unknown): ManifestEntry | null {
  if (!isObject(setManifest) || !Array.isArray(setManifest["sets"])) return null;
  const first: unknown = setManifest["sets"][0];
  return isObject(first) && typeof first["id"] === "string" ? first : null;
}

/** The root ``sets[]`` entry with the given id, or ``null``. */
function rootEntryFor(rootManifest: unknown, setId: string): ManifestEntry | null {
  if (!isObject(rootManifest) || !Array.isArray(rootManifest["sets"])) return null;
  const match: unknown = rootManifest["sets"].find((candidate: unknown) => isObject(candidate) && candidate["id"] === setId);
  return isObject(match) ? match : null;
}

/** One warning per field both entries carry with different values. */
function mismatchIssues(setId: string, rootEntry: ManifestEntry, setEntry: ManifestEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of Object.keys(setEntry).sort()) {
    if (isSilent(setEntry[field]) || isSilent(rootEntry[field])) continue;
    const rootValue = asText(rootEntry[field]);
    const setValue = asText(setEntry[field]);
    if (rootValue === setValue) continue;
    issues.push(
      err(
        "E-MANIFEST-ENTRY-MISMATCH",
        `/sets/0/${field}`,
        `set '${setId}': '${field}' is ${rootValue} in the root manifest but ${setValue} in the set manifest; the two must be identical`,
        "root-entry-and-set-manifest",
        { setId, field, rootValue, setValue },
      ),
    );
  }
  return issues;
}

/**
 * Compare a set's own manifest with its entry in the root manifest
 * (engine#246). Returns ``E-MANIFEST-ENTRY-MISMATCH`` per field present in
 * both with different values; ``null`` and an absent key are both silent, so
 * they never differ. Paths point into the set manifest. Never throws.
 *
 * Reports nothing when there is no pair to compare (the set manifest has no
 * entry, or the root does not list that set id): that is not this check's
 * finding, and ``validateManifest`` covers each file's shape.
 */
export function validateManifestPair(rootManifest: unknown, setManifest: unknown): ValidationResult {
  const setEntry = setFileEntry(setManifest);
  if (setEntry === null) return splitIssues([]);
  const setId = setEntry["id"] as string;
  const rootEntry = rootEntryFor(rootManifest, setId);
  if (rootEntry === null) return splitIssues([]);
  return splitIssues(mismatchIssues(setId, rootEntry, setEntry));
}
