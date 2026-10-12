#!/usr/bin/env node
/**
 * Generate src/schema-validators.generated.ts: the structural validators for
 * the two authored JSON-Schemas, precompiled at build time (engine#261).
 *
 * validate.ts used to compile the schemas with ajv on the first call. That put
 * the whole ajv compiler (code generation, vocabularies, fast-uri) into every
 * consumer's bundle: about 40 percent of the core entry. ajv's standalone code
 * generation emits the same validation functions as source, so the compiler
 * stays a build-time tool and only one run-time helper (ucs2length, for
 * minLength/maxLength) ships. The options are the ones validate.ts used:
 * allErrors, so one call reports every problem; strict:false, so the
 * schema's x-schema-version annotation is tolerated.
 * src/schema-validators.test.ts proves the output equal to the run-time
 * compiler's, error for error.
 *
 * Usage:
 *   node scripts/generate-schema-validators.mjs           # write
 *   node scripts/generate-schema-validators.mjs --check   # exit 1 on drift
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import standaloneCodeModule from "ajv/dist/standalone/index.js";

import { stripAnnotations } from "./schema-module-lib.mjs";

const standaloneCode = standaloneCodeModule.default ?? standaloneCodeModule;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(REPO_ROOT, "src", "schema-validators.generated.ts");

const VALIDATORS = [
  { name: "validateLessonStructure", file: "lesson.schema.json" },
  { name: "validateManifestStructure", file: "content-manifest.schema.json" },
];

/** ajv emits its run-time helper as a CommonJS require even in ESM mode; the
 *  package is ESM, so the require becomes an import. */
const REQUIRE_UCS2LENGTH = 'require("ajv/dist/runtime/ucs2length").default';

const BANNER = `// @ts-nocheck
/**
 * GENERATED from schema/lesson.schema.json and
 * schema/content-manifest.schema.json via
 * scripts/generate-schema-validators.mjs. DO NOT EDIT: edit the schema, then
 * run \`make sync-types\`.
 *
 * The structural validators, precompiled with ajv's standalone code generation
 * (engine#261), so the core bundle does not ship the ajv compiler. Same
 * options as the run-time compilation they replace: allErrors, strict:false.
 * Type-checking is off for the generated function bodies; the exports are
 * typed as ajv ValidateFunctions.
 * ESLint skips this file (eslint.config.js).
 */
import ucs2lengthModule from "ajv/dist/runtime/ucs2length.js";
import type { ValidateFunction } from "ajv";

// A CommonJS module: Node hands the default import over as module.exports
// (the function under .default), some bundlers and test runners as the
// function itself.
const ucs2length = ucs2lengthModule.default ?? ucs2lengthModule;
`;

function build() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } });
  const refs = {};
  for (const { name, file } of VALIDATORS) {
    const schema = stripAnnotations(JSON.parse(readFileSync(join(REPO_ROOT, "schema", file), "utf-8")));
    ajv.addSchema(schema);
    refs[name] = schema.$id;
  }
  let code = standaloneCode(ajv, refs);
  if (!code.includes(REQUIRE_UCS2LENGTH)) throw new Error("ajv no longer emits the ucs2length require this generator rewrites");
  code = code
    .replace(/^"use strict";/, "")
    .replaceAll(REQUIRE_UCS2LENGTH, "ucs2length");
  if (/\brequire\(/.test(code)) throw new Error("generated validators still contain a require()");
  for (const { name } of VALIDATORS) {
    const exported = new RegExp(`export const ${name} = (validate\\d+);`);
    if (!exported.test(code)) throw new Error(`no export for ${name} in the generated code`);
    code = code.replace(exported, `export const ${name}: ValidateFunction = $1 as unknown as ValidateFunction;`);
  }
  return `${BANNER}\n${code}\n`;
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
    console.error("Schema validators out of date. Run `make sync-types`.");
    process.exit(1);
  }
  console.log("Schema validators up to date.");
} else {
  writeFileSync(OUT_PATH, generated, "utf-8");
  console.log(`Wrote ${OUT_PATH}`);
}
