#!/usr/bin/env node
/**
 * Generate src/schemas.generated.ts: the two authored JSON-Schemas as module
 * constants, for the structural layer (engine#203).
 *
 * validate.ts used to read schema/*.json at run time through
 * `new URL(`../schema/${fileName}`, import.meta.url)` and node:fs. A bundler
 * such as Vite turns such a URL into a lookup over every file in schema/ and
 * copies all of them into the consumer's build, even when nothing calls a
 * validator; and a browser has no file system to read them from. As modules,
 * the schemas travel only with the code that imports them, and validateLesson
 * runs anywhere. The JSON files stay the authored source (and ship for
 * consumers that mirror them); this module is derived from them.
 *
 * Usage:
 *   node scripts/generate-schema-module.mjs           # write
 *   node scripts/generate-schema-module.mjs --check   # exit 1 on drift
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { stripAnnotations } from "./schema-module-lib.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(REPO_ROOT, "src", "schemas.generated.ts");
const SCHEMAS = [
  { constant: "LESSON_SCHEMA", file: "lesson.schema.json" },
  { constant: "CONTENT_MANIFEST_SCHEMA", file: "content-manifest.schema.json" },
];

const BANNER = `/**
 * GENERATED from schema/lesson.schema.json and
 * schema/content-manifest.schema.json via scripts/generate-schema-module.mjs.
 * DO NOT EDIT: edit the schema, then run \`make sync-types\`.
 *
 * The structural layer (validate.ts) compiles these, so no module under the
 * package root reads a file at run time (engine#203). Annotation keywords
 * (description, title, $comment) are left out: they never change what a
 * schema accepts. The JSON files keep them.
 */`;

function build() {
  const constants = SCHEMAS.map(({ constant, file }) => {
    const schema = stripAnnotations(JSON.parse(readFileSync(join(REPO_ROOT, "schema", file), "utf-8")));
    return `/** schema/${file}, without its annotations */\nexport const ${constant}: object = ${JSON.stringify(schema, null, 2)};\n`;
  });
  return `${BANNER}\n\n${constants.join("\n")}`;
}

function readOrEmpty(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

const check = process.argv.includes("--check");
const generated = build();

if (check) {
  if (readOrEmpty(OUT_PATH) !== generated) {
    console.error("Schema module out of date. Run `make sync-types`.");
    process.exit(1);
  }
  console.log("Schema module up to date.");
} else {
  writeFileSync(OUT_PATH, generated, "utf-8");
  console.log(`Wrote ${OUT_PATH}`);
}
