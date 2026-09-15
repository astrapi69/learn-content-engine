#!/usr/bin/env node
/**
 * Render the top-level ``docs/*.md`` to HTML for GitHub Pages (engine#152).
 *
 *   node scripts/build-docs-site.mjs            # -> docs-site/
 *   node scripts/build-docs-site.mjs --out DIR
 *
 * The Pages workflow copies the output to ``/docs`` on the site next to
 * ``/api`` (TypeDoc) and ``/schema``. The Markdown stays the source of
 * truth; the output is a build artifact and is gitignored.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { docTitle, renderDocPage, renderDocsIndex } from "./docs-site-lib.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(REPO_ROOT, "docs");

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
console.log(`docs site: ${pages.length} page(s) + index -> ${outDir}`);
