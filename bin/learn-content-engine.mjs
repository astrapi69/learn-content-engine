#!/usr/bin/env node
// Thin CLI shim: read argv + files, delegate to the tested cores in dist/,
// print, and set the exit code. All logic worth testing lives in src/cli.ts
// (lint) and src/migrate.ts (migrate).
import { readFileSync, writeFileSync } from "node:fs";

import { parseLintArgs, lintContent, formatReports } from "../dist/cli.js";
import { parseMigrateArgs, migrateContent, formatMigrateReports } from "../dist/migrate.js";

const argv = process.argv.slice(2);

if (argv[0] === "migrate") {
  const parsed = parseMigrateArgs(argv);
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(2);
  }
  const reports = parsed.paths.map((path) => {
    try {
      return migrateContent(readFileSync(path, "utf8"), path);
    } catch (error) {
      return { path, ok: false, converted: 0, changes: [], parseError: `cannot read file - ${String(error)}` };
    }
  });
  if (parsed.write) {
    for (const report of reports) {
      if (report.ok && report.converted > 0) {
        writeFileSync(report.path, JSON.stringify(report.lesson, null, 2) + "\n");
      }
    }
  }
  const { text, exitCode } = formatMigrateReports(reports, { json: parsed.json, write: parsed.write });
  console.log(text);
  process.exit(exitCode);
}

const parsed = parseLintArgs(argv);
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
