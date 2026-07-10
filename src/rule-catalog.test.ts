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

const ruleIdsInSource = (): string[] => {
  const source = read("./validate.ts");
  const ids = new Set<string>();
  for (const match of source.matchAll(/"([EW]-[A-Z0-9-]+)"/g)) ids.add(match[1]!);
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
