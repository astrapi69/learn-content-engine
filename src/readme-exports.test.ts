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
