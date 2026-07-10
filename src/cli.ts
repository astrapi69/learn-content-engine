/**
 * Author lint CLI core - the filesystem-free, unit-tested half. The thin
 * `bin/learn-content-engine.mjs` shim reads argv + files and delegates here, so
 * an author gets the same errors AND warnings the CI gate does, offline, in
 * seconds. Every issue line carries a stable rule id and a doc anchor.
 */

import { validateLesson, type ValidationResult } from "./validate.js";

/** Parsed `lint` invocation, or a usage error. */
export type LintArgs = { paths: string[]; json: boolean } | { error: string };

/** Parse `lint <file...> [--json]`. Pure; no filesystem access. */
export function parseLintArgs(argv: string[]): LintArgs {
  if (argv[0] !== "lint") {
    return { error: `unknown command '${argv[0] ?? ""}' (expected: lint <file...> [--json])` };
  }
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const paths = rest.filter((arg) => arg !== "--json");
  if (paths.length === 0) {
    return { error: "usage: learn-content-engine lint <file...> [--json]" };
  }
  return { paths, json };
}

/** One file's lint outcome. */
export interface LintReport {
  path: string;
  ok: boolean;
  result?: ValidationResult;
  parseError?: string;
}

/** Parse + validate one file's raw JSON. `ok` is errors-only (warnings allowed). */
export function lintContent(rawJson: string, path: string): LintReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return { path, ok: false, parseError: String(error) };
  }
  const result = validateLesson(parsed);
  return { path, ok: result.valid, result };
}

/** Render lint reports for humans or as JSON; the exit code is 1 iff any file
 *  has errors (or failed to parse), 0 otherwise (warnings do not fail). */
export function formatReports(reports: LintReport[], asJson: boolean): { text: string; exitCode: number } {
  const exitCode = reports.every((report) => report.ok) ? 0 : 1;
  if (asJson) {
    return { text: JSON.stringify(reports, null, 2), exitCode };
  }
  const lines: string[] = [];
  for (const report of reports) {
    if (report.parseError) {
      lines.push(`ERROR ${report.path}: invalid JSON - ${report.parseError}`);
      continue;
    }
    const { errors, warnings } = report.result!;
    if (errors.length === 0 && warnings.length === 0) {
      lines.push(`OK    ${report.path}`);
      continue;
    }
    lines.push(`${errors.length > 0 ? "ERROR" : "WARN "} ${report.path}`);
    for (const issue of [...errors, ...warnings]) {
      lines.push(`  [${issue.id}] ${issue.path} ${issue.message}  (see ${issue.docAnchor})`);
    }
  }
  return { text: lines.join("\n"), exitCode };
}
