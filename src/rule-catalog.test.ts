import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Every stable rule id emitted by the validator must be documented in the
 * lesson-format rule catalog. Keeps the catalog from drifting behind the code -
 * a new rule without a doc entry turns CI red.
 */

const read = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

// Every module that emits ValidationIssues; a new emitter belongs on this
// list, or its rule ids escape the catalog check (the gap engine#106 closed:
// the scan only ever covered validate.ts).
const ISSUE_EMITTING_SOURCES = ["./validate.ts", "./set-ordering.ts"];

const ruleIdsInSource = (): string[] => {
  const ids = new Set<string>();
  for (const sourceFile of ISSUE_EMITTING_SOURCES) {
    const source = read(sourceFile);
    for (const match of source.matchAll(/"([EW]-[A-Z0-9-]+)"/g)) ids.add(match[1]!);
  }
  return [...ids].sort();
};

describe("rule catalog completeness", () => {
  const catalog = read("../docs/lesson-format.md");
  const ids = ruleIdsInSource();

  it("finds every rule id in the validator source", () => {
    expect(ids.length).toBeGreaterThanOrEqual(20);
  });

  for (const id of ruleIdsInSource()) {
    it(`documents ${id} in the rule catalog`, () => {
      expect(catalog).toContain(`\`${id}\``);
    });
  }
});
