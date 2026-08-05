/**
 * Per-tag release parity (engine#111): every git tag ``vX.Y.Z`` must have
 * BOTH the GitHub release page and the npm version ``X.Y.Z``. The class
 * "version without publication" is proven on both axes: v0.17.0 had tag +
 * npm but no release page for four days, and three early tags (0.1.0,
 * 0.3.0, 0.10.0) have tag + release page but were never published to npm.
 *
 * Pure comparator; the I/O (git tags, GitHub API, npm registry) lives in
 * ``scripts/check-release-parity.mjs``, the check-stable-ids shim pattern.
 */

/** Tags historically never published to npm. Deliberately NOT backfilled:
 *  publishing them now would create a state that never existed (each was
 *  superseded within days). The parity rule applies from engine#111
 *  forward, not backwards. */
export const KNOWN_NPM_GAPS: readonly string[] = ["0.1.0", "0.3.0", "0.10.0"];

const VERSION_TAG_RE = /^v(\d+\.\d+\.\d+)$/;

export interface ReleaseParityInput {
  /** All git tags (any shape; only ``vX.Y.Z`` ones are checked). */
  tags: string[];
  /** Tag names that have a GitHub release page. */
  releaseTags: string[];
  /** Versions the npm registry lists for the package. */
  npmVersions: string[];
}

export interface ReleaseParityResult {
  /** ``vX.Y.Z`` tags without a GitHub release page. */
  missingReleasePages: string[];
  /** ``vX.Y.Z`` tags whose ``X.Y.Z`` is not on npm (known gaps excluded). */
  missingNpmVersions: string[];
  ok: boolean;
}

/**
 * Compare the three publication axes. Returns the tags that violate parity;
 * ``ok`` is true when both findings lists are empty. Tags that do not match
 * ``vX.Y.Z`` are ignored, and the three historical npm gaps are allowlisted.
 */
export function checkReleaseParity(parityInput: ReleaseParityInput): ReleaseParityResult {
  const releasePages = new Set(parityInput.releaseTags);
  const npmVersions = new Set(parityInput.npmVersions);
  const missingReleasePages: string[] = [];
  const missingNpmVersions: string[] = [];
  for (const tag of parityInput.tags) {
    const versionMatch = VERSION_TAG_RE.exec(tag);
    if (!versionMatch) continue;
    const version = versionMatch[1]!;
    if (!releasePages.has(tag)) missingReleasePages.push(tag);
    if (!npmVersions.has(version) && !KNOWN_NPM_GAPS.includes(version)) {
      missingNpmVersions.push(tag);
    }
  }
  return {
    missingReleasePages,
    missingNpmVersions,
    ok: missingReleasePages.length === 0 && missingNpmVersions.length === 0,
  };
}
