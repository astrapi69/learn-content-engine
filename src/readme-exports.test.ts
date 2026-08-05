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
 * TYPE exports are deliberately out of scope: they vanish at runtime, so
 * there is nothing here to enumerate them from, and inventing a parallel
 * list would recreate the problem this test exists to solve.
 */

const README = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");

const runtimeExports = Object.keys(publicApi).sort();

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
  });
});
