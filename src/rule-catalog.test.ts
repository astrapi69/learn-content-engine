import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
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
// the scan only ever covered validate.ts). Since engine#191 the semantic
// rules live in rules.ts; validate.ts keeps the structural layer.
const ISSUE_EMITTING_SOURCES = ["./validate.ts", "./rules.ts", "./set-ordering.ts", "./variables.ts"];

const ruleIdsInSource = (): string[] => {
  const ids = new Set<string>();
  for (const sourceFile of ISSUE_EMITTING_SOURCES) {
    const source = read(sourceFile);
    for (const match of source.matchAll(/"([EW]-[A-Z0-9-]+)"/g)) ids.add(match[1]!);
  }
  return [...ids].sort();
};

// The list above is hand-kept, and it fell behind once more: variables.ts
// emits the E-VAR-* ids through rules.ts and was not on it. The ids happened
// to be in the catalog, but a new one would not have been forced there. So
// the list is checked against the validators' module graph: every module
// validate.ts reaches that carries a rule id literal must be on it.
const IMPORT_FORMS = [
  /^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gms,
  /^\s*import\s+"([^"]+)"/gm,
  /\bimport\(\s*"([^"]+)"\s*\)/g,
];
const reachableModules = (entry: string): string[] => {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = read(file);
    for (const form of IMPORT_FORMS) {
      for (const match of source.matchAll(form)) {
        const specifier = match[1]!;
        if (!specifier.startsWith(".")) continue;
        // Resolve against the importing module, not against this test file.
        const resolved = `./${posix.normalize(posix.join(posix.dirname(file), specifier))}`.replace(/\.js$/, ".ts");
        if (!existsSync(fileURLToPath(new URL(resolved, import.meta.url)))) {
          throw new Error(`${file} imports ${specifier}, which resolves to no source file (${resolved})`);
        }
        pending.push(resolved);
      }
    }
  }
  return [...seen].sort();
};

describe("rule catalog completeness", () => {
  const catalog = read("../docs/lesson-format.md");
  const ids = ruleIdsInSource();

  it("finds every rule id in the validator source", () => {
    expect(ids.length).toBeGreaterThanOrEqual(20);
  });

  it("scans every module the validators reach that emits rule ids", () => {
    const reached = reachableModules("./validate.ts");
    expect(reached.length).toBeGreaterThan(5);
    const emitters = reached.filter((file) => /"[EW]-[A-Z0-9-]+"/.test(read(file)));
    expect(emitters.filter((file) => !ISSUE_EMITTING_SOURCES.includes(file))).toEqual([]);
  });

  for (const id of ruleIdsInSource()) {
    it(`documents ${id} in the rule catalog`, () => {
      expect(catalog).toContain(`\`${id}\``);
    });
  }
});

/**
 * The reverse direction (engine#174). The scan above proves the CATALOG covers
 * the validator. It cannot prove that prose outside the catalog still names
 * rules that exist: an id quoted in the architecture text and later renamed
 * would go stale in silence, because nothing reads that document.
 *
 * The known set is taken from every non-test source file, not just
 * `ISSUE_EMITTING_SOURCES`: the `ext:` reference extensions and the parametric
 * rules emit ids of their own, and a prose mention of one of those is the same
 * kind of claim. Only documents listed here are scanned - `lesson-format.md`
 * and the proposals name ids on purpose that no source emits (a retired rule
 * in a history note, a rule a proposal has not built yet), so a blanket scan
 * would gate history instead of claims.
 */
const PROSE_NAMING_RULE_IDS = ["../docs/architecture.md"];

const RULE_ID_IN_PROSE = /`([EW]-[A-Z0-9-]+)`/g;

/** Rule ids written as `` `X-Y` `` in a piece of prose. */
const ruleIdsNamedIn = (prose: string): string[] =>
  [...new Set([...prose.matchAll(RULE_ID_IN_PROSE)].map((match) => match[1]!))].sort();

/** Every rule id any non-test source file emits as a string literal. */
const knownRuleIds = (): Set<string> => {
  const ids = new Set<string>();
  const srcDir = fileURLToPath(new URL(".", import.meta.url));
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        for (const match of readFileSync(entryPath, "utf8").matchAll(/"([EW]-[A-Z0-9-]+)"/g)) {
          ids.add(match[1]!);
        }
      }
    }
  };
  walk(srcDir);
  return ids;
};

describe("rule ids named in prose still exist", () => {
  const known = knownRuleIds();

  it("collects rule ids from every non-test source file", () => {
    expect(known.size).toBeGreaterThan(ruleIdsInSource().length);
  });

  it.each(PROSE_NAMING_RULE_IDS)("%s names only rules that exist", (docFile) => {
    const named = ruleIdsNamedIn(read(docFile));
    expect(named.length, `${docFile} names no rule id at all`).toBeGreaterThan(0);
    expect(named.filter((id) => !known.has(id)), `unknown rule ids in ${docFile}`).toEqual([]);
  });

  it("catches a rule id nothing emits", () => {
    // Negative control: a scan that never fires on a known-bad document is a
    // gate that cannot fail.
    const seeded = "the validator emits `W-RENAMED-AWAY` for this case";
    expect(ruleIdsNamedIn(seeded).filter((id) => !known.has(id))).toEqual(["W-RENAMED-AWAY"]);
  });
});
