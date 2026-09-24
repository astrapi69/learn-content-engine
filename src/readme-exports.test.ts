import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import * as publicApi from "./index.js";

/**
 * Every runtime export must appear in the README's public-surface table.
 *
 * The table is a second place for the same truth, and it drifted the way
 * such places do: `lessonIdOrderingIssues` (0.18.0) and `isBaseCredible`
 * (0.16.0) shipped without ever reaching it. Nobody noticed, because
 * nothing compared the two - the docs gates covered version claims, links
 * and examples, and the surface table sat outside all of them.
 *
 * The check runs against the actual module namespace, not a hand-kept list,
 * so a new export cannot be added without either documenting it or turning
 * this red.
 *
 * TYPE exports were the same gap one level deeper: they vanish at runtime,
 * so `Object.keys(publicApi)` cannot see them, and for a while nothing else
 * enumerated them either - `ExerciseExtension`/`ExtensionRegistry` (schema
 * 1.7) and half the `stable-id-stability.js`/`stable-id-coverage.js` return
 * types shipped and stayed undocumented for releases. The fix parses
 * `index.ts`'s SOURCE for every `export type { ... }` block instead of
 * introspecting the compiled module (which erases them the same way
 * runtime introspection does).
 */

const README = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
const INDEX_SOURCE = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

const runtimeExports = Object.keys(publicApi).sort();

const typeExports = [...INDEX_SOURCE.matchAll(/export type \{([\s\S]*?)\}/g)]
  .flatMap((match) => match[1]!.split(","))
  .map((name) => name.trim())
  .filter((name) => name.length > 0)
  .sort();

describe("README public-surface table", () => {
  it("has something to check (the scan is not blind)", () => {
    expect(runtimeExports.length).toBeGreaterThan(10);
  });

  it.each(runtimeExports)("documents `%s`", (exportName) => {
    expect(
      README.includes(`\`${exportName}\``),
      `${exportName} is exported but missing from the README surface table`,
    ).toBe(true);
  });

  it("has type exports to check (the type scan is not blind)", () => {
    expect(typeExports.length).toBeGreaterThan(10);
  });

  it.each(typeExports)("documents type export `%s`", (exportName) => {
    expect(
      README.includes(`\`${exportName}\``),
      `${exportName} is a type export but missing from the README surface table`,
    ).toBe(true);
  });

  it("names no export that does not exist", () => {
    // The other direction: a removed export must not linger in the table.
    // Only the NAME cell counts - the description column is prose and is full
    // of backticked type names that were never meant as claims.
    const tableRows = README.split("\n").filter((line) => /^\| `.+\| (fn|types?) \|/.test(line));
    expect(tableRows.length).toBeGreaterThan(5);
    const claimedFunctions = tableRows
      .filter((row) => /\| fn \|/.test(row))
      .flatMap((row) => {
        const nameCell = row.split("|")[1] ?? "";
        return [...nameCell.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g)].map((match) => match[1]!);
      });
    const phantom = claimedFunctions.filter((name) => !runtimeExports.includes(name));
    expect(phantom, "README lists functions the package does not export").toEqual([]);

    const claimedTypes = tableRows
      .filter((row) => /\| types? \|/.test(row))
      .flatMap((row) => {
        const nameCell = row.split("|")[1] ?? "";
        return [...nameCell.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g)].map((match) => match[1]!);
      });
    const phantomTypes = claimedTypes.filter((name) => !typeExports.includes(name));
    expect(phantomTypes, "README lists types the package does not export").toEqual([]);
  });
});

/**
 * The subpath entries were the same gap one entry point further: the table
 * above is checked against the package root only, so `learn-content-engine/rules`
 * shipped in 0.29.0 with two of its seven runtime exports (`unusedCardIds`,
 * `normalizeManifestAliases`) missing from its README row, and five of the ten
 * `learn-content-engine/qti` exports were named in no doc at all. Each subpath
 * is checked where its exports are documented: the `/rules` row names every
 * export itself; the `/qti` row abbreviates with "..." and points to
 * docs/qti.md, so that page carries the full list.
 */
const readSource = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const EXPORTED_NAME_FORMS = [
  /^export (?:async )?(?:function|const|class|let) ([A-Za-z_][A-Za-z0-9_]*)/gm,
  /^export (?:interface|type) ([A-Za-z_][A-Za-z0-9_]*)/gm,
];
const exportedNamesIn = (source: string): string[] => {
  const declared = EXPORTED_NAME_FORMS.flatMap((form) => [...source.matchAll(form)].map((match) => match[1]!));
  const listed = [...source.matchAll(/^export (?:type )?\{([\s\S]*?)\}/gm)]
    .flatMap((match) => match[1]!.split(","))
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return [...new Set([...declared, ...listed])].sort();
};

describe("subpath entries: every export is documented where the README points", () => {
  const rulesRow = README.split("\n").find((line) => line.startsWith("| `learn-content-engine/rules` |")) ?? "";
  const rulesExports = exportedNamesIn(readSource("./rules.ts"));

  it("finds the /rules row and its exports (the scan is not blind)", () => {
    expect(rulesRow).not.toBe("");
    expect(rulesExports.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rulesExports)("the README's /rules row names `%s`", (exportName) => {
    expect(rulesRow.includes(`\`${exportName}\``), `${exportName} is exported by /rules but missing from its README row`).toBe(true);
  });

  const qtiDoc = readSource("../docs/qti.md");
  const qtiExports = exportedNamesIn(readSource("./qti/index.ts"));

  it("finds the /qti exports (the scan is not blind)", () => {
    expect(qtiExports.length).toBeGreaterThanOrEqual(5);
  });

  it.each(qtiExports)("docs/qti.md names `%s`", (exportName) => {
    expect(qtiDoc.includes(`\`${exportName}\``), `${exportName} is exported by /qti but named nowhere in docs/qti.md`).toBe(true);
  });
});
