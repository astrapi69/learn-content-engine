#!/usr/bin/env node
/**
 * Release parity gate (engine#111): every git tag vX.Y.Z must have BOTH the
 * GitHub release page and the npm version X.Y.Z.
 *
 * I/O shim around the pure comparator in dist/release-parity.js (build
 * first: npm run build). Exit 0 on parity, 1 on findings, 2 on I/O errors.
 *
 * Usage: node scripts/check-release-parity.mjs
 * Needs: git tags fetched (fetch-depth: 0 in CI), network access to
 * api.github.com and registry.npmjs.org. GITHUB_TOKEN is used when set
 * (rate limit), not required.
 */
import { execFileSync } from "node:child_process";

import { checkReleaseParity } from "../dist/release-parity.js";

const REPO = process.env.GITHUB_REPOSITORY ?? "astrapi69/learn-content-engine";
const PACKAGE_NAME = "learn-content-engine";

const gitTags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" })
  .split("\n")
  .map((tag) => tag.trim())
  .filter(Boolean);

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.error(`cannot fetch ${url}: HTTP ${response.status}`);
    process.exit(2);
  }
  return response.json();
}

const githubHeaders = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

// One page of 100 covers every release this repo will see for years; the
// count is asserted against the tag count anyway, so silent truncation
// would surface as a missing page, not as a false OK.
const releases = await fetchJson(
  `https://api.github.com/repos/${REPO}/releases?per_page=100`,
  githubHeaders,
);
const releaseTags = releases.filter((release) => !release.draft).map((release) => release.tag_name);

const registryDocument = await fetchJson(`https://registry.npmjs.org/${PACKAGE_NAME}`);
const npmVersions = Object.keys(registryDocument.versions ?? {});

const parity = checkReleaseParity({ tags: gitTags, releaseTags, npmVersions });

console.log(
  `release parity: ${gitTags.length} version tags, ${releaseTags.length} release pages, ${npmVersions.length} npm versions`,
);
if (parity.ok) {
  console.log("OK: every vX.Y.Z tag has its release page and npm version (known gaps excluded).");
  process.exit(0);
}
for (const tag of parity.missingReleasePages) {
  console.error(`FAIL ${tag}: git tag exists but no GitHub release page`);
}
for (const tag of parity.missingNpmVersions) {
  console.error(`FAIL ${tag}: git tag exists but the version is not on npm`);
}
process.exit(1);
