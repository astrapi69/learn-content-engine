#!/usr/bin/env node
/**
 * Write the notices file for a Mermaid bundle installed elsewhere, for a repo
 * that vendors the bundle without installing Mermaid (adaptive-learner#3813).
 *
 *   node scripts/write-mermaid-notices.mjs --mermaid-dir <dir>/node_modules/mermaid \
 *     --bundle <path of the bundle on the site> --out <file> [--vendor-dir <dir>] [--fetch-missing]
 *
 * Install the exact Mermaid version into a scratch project first
 * (``npm install --ignore-scripts mermaid@<version>``); the texts of packages
 * installed there are read directly. ``--vendor-dir`` holds the rest
 * (default: ``<scratch project>/licenses``); ``--fetch-missing`` fills it
 * with ``npm pack`` before writing. Same rules and output as the docs-site
 * build (engine#274).
 */

import { writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { mermaidBundlePackages, mermaidNotices } from "./mermaid-notices.mjs";
import { missingNoticeTexts } from "./third-party-notices.mjs";
import { vendorLicenceTexts } from "./vendor-licence-texts.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const mermaidDir = option("--mermaid-dir") && resolve(option("--mermaid-dir"));
const bundle = option("--bundle");
const out = option("--out") && resolve(option("--out"));
if (!mermaidDir || !bundle || !out || basename(dirname(mermaidDir)) !== "node_modules") {
  console.error("usage: write-mermaid-notices.mjs --mermaid-dir <project>/node_modules/mermaid --bundle <site path> --out <file> [--vendor-dir <dir>] [--fetch-missing]");
  process.exit(2);
}
const searchFrom = dirname(dirname(mermaidDir));
const vendorDir = resolve(option("--vendor-dir") ?? join(searchFrom, "licenses"));

if (args.includes("--fetch-missing")) {
  const missing = missingNoticeTexts(mermaidBundlePackages(mermaidDir), { searchFrom, vendorDir });
  const failed = vendorLicenceTexts(missing, vendorDir);
  if (failed.length > 0) {
    console.error(`no licence file in the published tarball of: ${failed.join(", ")}`);
    process.exit(1);
  }
}
writeFileSync(out, mermaidNotices(mermaidDir, bundle, { searchFrom, vendorDir }));
console.log(`wrote ${out}`);
