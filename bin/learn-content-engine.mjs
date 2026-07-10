#!/usr/bin/env node
// Thin CLI shim: read argv + files, delegate to the tested core in dist/cli.js,
// print, and set the exit code. All logic worth testing lives in src/cli.ts.
import { readFileSync } from "node:fs";

import { parseLintArgs, lintContent, formatReports } from "../dist/cli.js";

const parsed = parseLintArgs(process.argv.slice(2));
if ("error" in parsed) {
  console.error(parsed.error);
  process.exit(2);
}

const reports = parsed.paths.map((path) => {
  try {
    return lintContent(readFileSync(path, "utf8"), path);
  } catch (error) {
    return { path, ok: false, parseError: `cannot read file - ${String(error)}` };
  }
});

const { text, exitCode } = formatReports(reports, parsed.json);
console.log(text);
process.exit(exitCode);
