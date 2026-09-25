/**
 * Test support, shared by the gates that scan the validator source
 * (rule-catalog.test.ts, issue-params.test.ts). Excluded from the build
 * (tsconfig.build.json), never shipped.
 *
 * One list of the modules that emit ValidationIssues, so the gates cannot
 * drift apart: a second hand-kept copy of it was the gap the engine#201
 * review found.
 */

import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = new URL("../", import.meta.url);

/** The text of a source file, by its path relative to `src/` ("./rules.ts"). */
export const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, SRC)), "utf8");

/** Every module that emits ValidationIssues; a new emitter belongs on this
 *  list, or its rule ids escape the catalog and params checks (the gap
 *  engine#106 closed: the scan only ever covered validate.ts). Since
 *  engine#191 the semantic rules live in rules.ts; validate.ts keeps the
 *  structural layer. The list is checked against the module graph below. */
export const ISSUE_EMITTING_SOURCES = ["./validate.ts", "./rules.ts", "./set-ordering.ts", "./variables.ts", "./quality.ts", "./language-rules.ts"];

const IMPORT_FORMS = [
  /^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gms,
  /^\s*import\s+"([^"]+)"/gm,
  /\bimport\(\s*"([^"]+)"\s*\)/g,
];

/** Every source module reachable from `entry` through relative imports,
 *  resolved against the importing module. An import that resolves to no
 *  file throws instead of being skipped. */
export function reachableModules(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readSource(file);
    for (const form of IMPORT_FORMS) {
      for (const match of source.matchAll(form)) {
        const specifier = match[1]!;
        if (!specifier.startsWith(".")) continue;
        const resolved = `./${posix.normalize(posix.join(posix.dirname(file), specifier))}`.replace(/\.js$/, ".ts");
        if (!existsSync(fileURLToPath(new URL(resolved, SRC)))) {
          throw new Error(`${file} imports ${specifier}, which resolves to no source file (${resolved})`);
        }
        pending.push(resolved);
      }
    }
  }
  return [...seen].sort();
}

/** The modules reachable from `entry` that carry a rule id literal. */
export const emittersReachedFrom = (entry: string): string[] =>
  reachableModules(entry).filter((file) => /"[EW]-[A-Z0-9-]+"/.test(readSource(file)));
