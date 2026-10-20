#!/usr/bin/env node
/**
 * Render the top-level ``docs/*.md`` to HTML for GitHub Pages (engine#152).
 *
 *   node scripts/build-docs-site.mjs            # -> docs-site/
 *   node scripts/build-docs-site.mjs --out DIR
 *
 * ``npm run docs:pages`` copies the output to ``/docs`` on the site next to
 * ``/api`` (TypeDoc) and ``/schema``; the Pages workflow deploys that, and CI
 * scans it on every pull request. The Markdown stays the source of truth;
 * the output is a build artifact and is gitignored.
 *
 * The output carries the Mermaid bundle the diagram pages load
 * (``assets/mermaid.min.js``): the ``mermaid`` devDependency's own build, at
 * the version ``package-lock.json`` pins, so no page fetches anything from a
 * CDN (engine#272). Mermaid's MIT licence ships next to it
 * (``assets/mermaid.min.js.LICENSE.txt``): the licence asks for its notice
 * in every copy, and the bundle does not carry it.
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MERMAID_ASSET, docTitle, renderDocPage, renderDocsIndex } from "./docs-site-lib.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(REPO_ROOT, "docs");
const requireFromHere = createRequire(import.meta.url);
const MERMAID_BUNDLE = requireFromHere.resolve("mermaid/dist/mermaid.min.js");
const MERMAID_LICENSE = requireFromHere.resolve("mermaid/LICENSE");
/** Named after the bundle, as bundlers name an extracted licence; .txt so it is served as text. */
const MERMAID_LICENSE_ASSET = `${MERMAID_ASSET}.LICENSE.txt`;

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDir = outFlag === -1 ? join(REPO_ROOT, "docs-site") : args[outFlag + 1];
if (!outDir) {
  console.error("FATAL: --out needs a directory");
  process.exit(1);
}

const sources = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();
if (sources.length === 0) {
  console.error(`FATAL: no docs/*.md found under ${DOCS_DIR} - the site would be empty.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const pages = sources.map((name) => {
  const stem = name.slice(0, -".md".length);
  const markdown = readFileSync(join(DOCS_DIR, name), "utf8");
  const file = `${stem}.html`;
  writeFileSync(join(outDir, file), renderDocPage(markdown, stem));
  return { file, title: docTitle(markdown, stem) };
});
writeFileSync(join(outDir, "index.html"), renderDocsIndex(pages));
mkdirSync(dirname(join(outDir, MERMAID_ASSET)), { recursive: true });
copyFileSync(MERMAID_BUNDLE, join(outDir, MERMAID_ASSET));
copyFileSync(MERMAID_LICENSE, join(outDir, MERMAID_LICENSE_ASSET));
console.log(`docs site: ${pages.length} page(s) + index + ${MERMAID_ASSET} + ${MERMAID_LICENSE_ASSET} -> ${outDir}`);
