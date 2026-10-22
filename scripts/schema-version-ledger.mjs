/**
 * The schema set's version must move with its content, and only then (engine#279).
 *
 * `x-schema-version` is the revision counter of the schema DEFINITION
 * (docs/lesson-format.md, "schema_version vs x-schema-version"): it bumps on
 * every change, description-only edits included. The two schema files move
 * in lockstep, so the counter versions the SET (lesson + manifest), not each
 * file. Nothing enforced that, and a check over every release tag found
 * content that changed under an unchanged number seven times, twice after the
 * rule was written down (0.24.1 under 1.14, 0.42.1 under 1.19).
 *
 * The ledger (`src/__fixtures__/schema-baseline/schema-version-ledger.json`)
 * maps each `x-schema-version` to the digest of the schema set's content:
 * both files parsed, `$id` and `x-schema-version` removed, keys sorted. A
 * change without a bump leaves the current digest different from its own
 * version's row; a bump without a change reproduces an earlier row's digest.
 * Both are findings, as are files out of lockstep and two rows with one
 * digest.
 */

import { createHash } from "node:crypto";

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
};

const withoutCounters = (text) => {
  const content = JSON.parse(text);
  delete content.$id;
  delete content["x-schema-version"];
  return sortKeys(content);
};

/** Digest of the schema set's content, without `$id` and `x-schema-version`. */
export function schemaSetDigest({ lesson, manifest }) {
  const content = JSON.stringify([withoutCounters(lesson), withoutCounters(manifest)]);
  return createHash("sha256").update(content).digest("hex");
}

/** The `x-schema-version` of each file of the set. */
export function schemaSetVersions({ lesson, manifest }) {
  return {
    lesson: JSON.parse(lesson)["x-schema-version"],
    manifest: JSON.parse(manifest)["x-schema-version"],
  };
}

/**
 * Every way the set and the ledger disagree, as messages; empty when the
 * current version's row holds exactly the current content.
 */
export function ledgerFindings(ledger, texts) {
  const findings = [];
  const versions = schemaSetVersions(texts);
  if (versions.lesson !== versions.manifest) {
    findings.push(
      `the schema files are out of lockstep: lesson.schema.json is ${versions.lesson}, content-manifest.schema.json is ${versions.manifest}`,
    );
  }
  const seen = new Map();
  for (const [version, digest] of Object.entries(ledger)) {
    if (seen.has(digest)) findings.push(`ledger rows ${seen.get(digest)} and ${version} hold the same content`);
    else seen.set(digest, version);
  }
  const version = versions.lesson;
  const digest = schemaSetDigest(texts);
  const earlier = Object.entries(ledger).find(([other, recorded]) => other !== version && recorded === digest);
  if (earlier) {
    findings.push(
      `x-schema-version rose to ${version}, but the content equals ${earlier[0]}: a version moves only with a change`,
    );
  } else if (!(version in ledger)) {
    findings.push(`x-schema-version ${version} has no ledger row; add "${version}": "${digest}"`);
  } else if (ledger[version] !== digest) {
    findings.push(
      `the schema content changed but x-schema-version is still ${version}: bump it in both files and add a ledger row`,
    );
  }
  return findings;
}
