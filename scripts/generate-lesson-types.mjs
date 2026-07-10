#!/usr/bin/env node
/**
 * Generate the canonical TypeScript lesson types from the authored JSON-Schema.
 *
 * This engine is the source of truth for the lesson schema (schema authority,
 * v0.6.0). These types are DERIVED from schema/lesson.schema.json via
 * json-schema-to-typescript, so they cannot drift from the schema. Consumers
 * (the app, content tooling) import the published types from this package.
 *
 * Input:  schema/lesson.schema.json
 * Output: src/types/lesson-schema.generated.ts
 *
 * Usage:
 *   node scripts/generate-lesson-types.mjs           # write
 *   node scripts/generate-lesson-types.mjs --check   # exit 1 on drift
 */
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = join(REPO_ROOT, "schema", "lesson.schema.json");
const OUT_PATH = join(REPO_ROOT, "src", "types", "lesson-schema.generated.ts");

const BANNER = `/**
 * GENERATED from schema/lesson.schema.json via
 * scripts/generate-lesson-types.mjs. DO NOT EDIT.
 *
 * This engine is the canonical source of the lesson schema. These types are
 * derived from schema/lesson.schema.json; edit the schema, then run
 * \`make sync-types\`.
 */`;

/**
 * Strip ``minItems`` / ``maxItems`` from every array node, in place.
 * json-schema-to-typescript turns a bounded array into a tuple union
 * (``[] | [T] | [T, T] | …``), which is correct for validation but useless as
 * a CONSUMER type: a plain ``T[]`` is not assignable to such a union. Array
 * cardinality is the ajv validator's job (the committed schema keeps
 * min/maxItems); the generated TS types only need the element type.
 */
function stripArrayBounds(node) {
  if (Array.isArray(node)) {
    for (const child of node) stripArrayBounds(child);
    return;
  }
  if (node && typeof node === "object") {
    if (node.type === "array") {
      delete node.minItems;
      delete node.maxItems;
    }
    for (const value of Object.values(node)) stripArrayBounds(value);
  }
}

async function build() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  // Drop the custom x-schema-version key so json2ts does not emit a stray type.
  delete schema["x-schema-version"];
  stripArrayBounds(schema);
  return compile(schema, "Lesson", {
    bannerComment: BANNER,
    additionalProperties: false,
    declareExternallyReferenced: true,
    style: { singleQuote: false, semi: true },
  });
}

function readOrEmpty(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

const check = process.argv.includes("--check");
const generated = await build();

if (check) {
  if (readOrEmpty(OUT_PATH) !== generated) {
    console.error("Lesson TS types out of date. Run `make sync-types`.");
    process.exit(1);
  }
  console.log("Lesson TS types up to date.");
} else {
  writeFileSync(OUT_PATH, generated, "utf-8");
  console.log(`Wrote ${OUT_PATH}`);
}
