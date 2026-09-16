/**
 * `qti import` / `qti export` CLI core (engine#164): the filesystem-free half
 * the bin shim delegates to. The mapping itself is the adapter's
 * (`src/qti/`, both dialects); this module parses argv, turns the adapter's
 * loud errors into report lines, and shapes the `{ text, exitCode }` the
 * shim destructures for every command.
 *
 * One document per run: `import` reads a QTI item or test (2.x or 3.0,
 * detected) and yields lesson JSON; `export` reads lesson JSON and yields a
 * QTI test in the requested dialect. With `--out` the shim writes the
 * document and the command prints a one-line summary; without it the
 * document goes to stdout, so it composes with a shell.
 */

import { exportQti, importQti, QtiExportError, QtiImportError, type QtiVersion } from "./qti/index.js";

const USAGE =
  "usage: learn-content-engine qti import <file.xml> [--out <lesson.json>] [--id <slug>] [--title <text>] | " +
  "qti export <lesson.json> [--out <file.xml>] [--version 2.x|3.0]";

const VALUE_FLAGS = new Set(["--out", "--id", "--title", "--version"]);

export type QtiCliArgs =
  | { action: "import"; path: string; out?: string; id?: string; title?: string }
  | { action: "export"; path: string; out?: string; version: QtiVersion }
  | { error: string };

/** Parse `qti import|export <file> [flags]`. Pure; no filesystem access. */
export function parseQtiArgs(argv: string[]): QtiCliArgs {
  if (argv[0] !== "qti") return { error: `unknown command '${argv[0] ?? ""}' (expected: qti import|export)` };
  const action = argv[1];
  if (action !== "import" && action !== "export") return { error: USAGE };

  const positionals: string[] = [];
  const values = new Map<string, string>();
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (VALUE_FLAGS.has(token)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) return { error: `${token} needs a value (${USAGE})` };
      values.set(token, value);
      index += 1;
    } else if (token.startsWith("--")) {
      return { error: `unknown flag '${token}' (${USAGE})` };
    } else {
      positionals.push(token);
    }
  }
  if (positionals.length === 0) return { error: USAGE };
  if (positionals.length > 1) return { error: `qti ${action} takes one file per run, got ${positionals.length} (${USAGE})` };
  const path = positionals[0]!;
  const out = values.get("--out");

  if (action === "import") {
    return {
      action,
      path,
      ...(out !== undefined ? { out } : {}),
      ...(values.has("--id") ? { id: values.get("--id")! } : {}),
      ...(values.has("--title") ? { title: values.get("--title")! } : {}),
    };
  }
  const version = values.get("--version") ?? "2.x";
  if (version !== "2.x" && version !== "3.0") return { error: `--version must be 2.x or 3.0, got '${version}'` };
  return { action, path, version, ...(out !== undefined ? { out } : {}) };
}

/** Outcome of one conversion: the produced document when ok, else the reasons. */
export interface QtiCliResult {
  ok: boolean;
  text: string;
  errors: string[];
}

function failure(errors: string[]): QtiCliResult {
  return { ok: false, text: "", errors };
}

/** QTI XML (either dialect) to pretty-printed lesson JSON. Never throws. */
export function runQtiImport(xml: string, meta: { id?: string; title?: string } = {}): QtiCliResult {
  try {
    const lesson = importQti(xml, meta);
    return { ok: true, text: `${JSON.stringify(lesson, null, 2)}\n`, errors: [] };
  } catch (error) {
    if (error instanceof QtiImportError && error.issues.length > 0) {
      return failure(error.issues.map((issue) => `${issue.itemIdentifier}: ${issue.interaction} (${issue.reason})`));
    }
    return failure([error instanceof Error ? error.message : String(error)]);
  }
}

/** Lesson JSON text to a QTI test document in the requested dialect. Never throws. */
export function runQtiExport(rawJson: string, version: QtiVersion): QtiCliResult {
  let lesson: unknown;
  try {
    lesson = JSON.parse(rawJson);
  } catch (error) {
    return failure([`invalid JSON - ${String(error)}`]);
  }
  try {
    return { ok: true, text: exportQti(lesson as Parameters<typeof exportQti>[0], { version }), errors: [] };
  } catch (error) {
    if (error instanceof QtiExportError) return failure([error.message]);
    return failure([error instanceof Error ? error.message : String(error)]);
  }
}

/**
 * Shape the shim's `{ text, exitCode }`: the document itself when it goes to
 * stdout, a one-line summary when `--out` names the file the shim writes,
 * `ERROR <path>` plus one indented line per reason otherwise (exit 1).
 */
export function formatQtiResult(result: QtiCliResult, options: { path: string; out?: string }): { text: string; exitCode: number } {
  if (!result.ok) {
    return { text: [`ERROR ${options.path}`, ...result.errors.map((line) => `  ${line}`)].join("\n"), exitCode: 1 };
  }
  if (options.out !== undefined) {
    return { text: `OK    ${options.path} -> ${options.out}`, exitCode: 0 };
  }
  return { text: result.text, exitCode: 0 };
}
