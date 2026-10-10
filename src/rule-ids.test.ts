import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import * as root from "./index.js";
import * as rulesEntry from "./rules.js";
import { RENAMED_RULE_IDS, currentRuleId } from "./rule-ids.js";
import { ISSUE_EMITTING_SOURCES, RULE_ID_TABLES, readSource } from "./test-support/emitters.js";

/**
 * engine#256: a rule ID's prefix carries its tier (`E-` blocks, `W-` warns),
 * so raising or lowering a rule renames it. 0.38.0 raised the manifest
 * mismatch rule and renamed it; a downstream mirror that keys on the full ID
 * would stop matching in silence (none did this time). The renames are
 * recorded here, so a tool can follow one instead of losing the rule.
 */

const read = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const emittedIds = (): Set<string> => {
  const ids = new Set<string>();
  for (const sourceFile of ISSUE_EMITTING_SOURCES) {
    for (const match of read(sourceFile).matchAll(/"([EW]-[A-Z0-9-]+)"/g)) ids.add(match[1]!);
  }
  return ids;
};

describe("reproduction (engine#256)", () => {
  it("records the 0.38.0 raise of the manifest mismatch rule", () => {
    expect(RENAMED_RULE_IDS["W-MANIFEST-ENTRY-MISMATCH"]).toBe("E-MANIFEST-ENTRY-MISMATCH");
    expect(currentRuleId("W-MANIFEST-ENTRY-MISMATCH")).toBe("E-MANIFEST-ENTRY-MISMATCH");
  });
});

describe("the table matches the validator", () => {
  const emitted = emittedIds();

  it("finds the emitted ids (the scan is not blind)", () => {
    expect(emitted.size).toBeGreaterThan(50);
  });

  for (const [retired, current] of Object.entries(RENAMED_RULE_IDS)) {
    it(`${retired} is no longer emitted and ${current} is`, () => {
      expect(emitted.has(retired)).toBe(false);
      expect(emitted.has(current)).toBe(true);
    });

    it(`${retired} -> ${current} changes the tier and nothing else`, () => {
      expect(retired.slice(0, 2)).not.toBe(current.slice(0, 2));
      expect(retired.slice(2)).toBe(current.slice(2));
    });
  }
});

describe("currentRuleId", () => {
  it("returns an id that was never renamed as it is", () => {
    expect(currentRuleId("E-CARD-REF")).toBe("E-CARD-REF");
  });

  it("returns an unknown id as it is", () => {
    expect(currentRuleId("W-NOT-A-RULE")).toBe("W-NOT-A-RULE");
  });

  it("returns a current id as it is", () => {
    expect(currentRuleId("E-MANIFEST-ENTRY-MISMATCH")).toBe("E-MANIFEST-ENTRY-MISMATCH");
  });
});

describe("both entries export it", () => {
  it("from the package root and from learn-content-engine/rules", () => {
    expect(root.RENAMED_RULE_IDS).toBe(RENAMED_RULE_IDS);
    expect(root.currentRuleId).toBe(currentRuleId);
    expect(rulesEntry.RENAMED_RULE_IDS).toBe(RENAMED_RULE_IDS);
    expect(rulesEntry.currentRuleId).toBe(currentRuleId);
  });

  it("the table module emits nothing, so the emitter scan may skip it", () => {
    expect(RULE_ID_TABLES).toEqual(["./rule-ids.ts"]);
    const source = readSource("./rule-ids.ts");
    expect(source).not.toMatch(/\b(?:err|warn)\(/);
    expect(source).not.toMatch(/from "\.\/issues\.js"/);
  });

  it("the table cannot be changed at run time", () => {
    expect(Object.isFrozen(RENAMED_RULE_IDS)).toBe(true);
  });
});
