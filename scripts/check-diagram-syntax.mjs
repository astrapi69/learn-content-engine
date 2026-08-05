#!/usr/bin/env node
/**
 * Parse every Mermaid block in the documentation with the REAL Mermaid
 * parser (engine#117 follow-up).
 *
 * WHY THIS EXISTS
 * ---------------
 * The drift gate (`generate-schema-diagrams.mjs --check`) proves the committed
 * page matches what the generator produces. It says nothing about whether the
 * generator produces something Mermaid can read. Those are different questions,
 * and the difference shipped: the generated cardinality label was emitted as
 * `-->|steps "1..*"|`, and a `"` inside a flowchart edge label is a parse
 * error, so GitHub rendered an error box where diagram 1 should be. Every
 * gate was green, because none of them asked the parser.
 *
 * A generator that emits unparseable output is exactly the shape this repo
 * keeps finding: a check that cannot fail on the thing that actually breaks.
 *
 * Covers hand-written blocks too, not only generated ones - a coarse diagram
 * can be mistyped just as easily, and nothing else would catch it.
 *
 * Usage: node scripts/check-diagram-syntax.mjs [file.md ...]
 *        (no arguments: every .md under docs/ plus README.md)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { JSDOM } from "jsdom";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Mermaid needs a DOM even to parse: it wires DOMPurify hooks during
// initialize(). A DOMPurify stub alone is not enough (verified).
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

function markdownFiles() {
  const files = [join(REPO_ROOT, "README.md")];
  const stack = [join(REPO_ROOT, "docs")];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (entry.endsWith(".md")) files.push(full);
    }
  }
  return files;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((path) => join(REPO_ROOT, path))
  : markdownFiles();

let blocksChecked = 0;
let failures = 0;

for (const file of targets) {
  const text = readFileSync(file, "utf8");
  const blocks = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((match) => match[1]);
  for (const [index, block] of blocks.entries()) {
    blocksChecked += 1;
    try {
      await mermaid.parse(block);
    } catch (error) {
      failures += 1;
      const firstLine = (block.split("\n").find((line) => line.trim()) ?? "").trim();
      console.error(`PARSE FAIL ${relative(REPO_ROOT, file)} block ${index + 1} (${firstLine})`);
      console.error(`   ${String(error.message).split("\n").slice(0, 3).join(" | ")}`);
    }
  }
}

// A run that found no blocks is a broken run, not a passing one: the same
// floor rule the coverage and diagram gates already carry (engine#93).
if (blocksChecked === 0) {
  console.error("FATAL: no mermaid blocks found - the check would pass vacuously.");
  process.exit(2);
}

if (failures) {
  console.error(`\n${failures} of ${blocksChecked} mermaid block(s) do not parse.`);
  process.exit(1);
}
console.log(`All ${blocksChecked} mermaid block(s) parse.`);
