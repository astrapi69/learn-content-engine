#!/usr/bin/env node
// Thin CLI shim: read argv + files, delegate to the tested cores in dist/,
// print, and set the exit code. All logic worth testing lives in src/cli.ts
// (lint) and src/migrate.ts (migrate); this file only wires filesystem I/O to
// them. Subcommands live in a table so adding one is a new entry, not another
// copy of the read/format/exit block. An unknown command falls back to `lint`,
// whose parser reports it (parity with the pre-table behaviour).
import { readFileSync, writeFileSync } from "node:fs";

import { parseLintArgs, lintContent, formatReports } from "../dist/cli.js";
import { parseMigrateArgs, migrateContent, formatMigrateReports } from "../dist/migrate.js";

const COMMANDS = {
  lint: {
    parseArgs: parseLintArgs,
    run: lintContent,
    readError: (path, message) => ({ path, ok: false, parseError: message }),
    format: (reports, args) => formatReports(reports, args.json),
  },
  migrate: {
    parseArgs: parseMigrateArgs,
    run: migrateContent,
    readError: (path, message) => ({ path, ok: false, converted: 0, changes: [], parseError: message }),
    // Dry-run by default: only an --write run touches files, and only for a
    // report that parsed, validated and actually converted something.
    afterRun: (reports, args) => {
      if (!args.write) return;
      for (const report of reports) {
        if (report.ok && report.converted > 0) {
          writeFileSync(report.path, JSON.stringify(report.lesson, null, 2) + "\n");
        }
      }
    },
    format: (reports, args) => formatMigrateReports(reports, { json: args.json, write: args.write }),
  },
};

const argv = process.argv.slice(2);
const command = COMMANDS[argv[0]] ?? COMMANDS.lint;

const parsed = command.parseArgs(argv);
if ("error" in parsed) {
  console.error(parsed.error);
  process.exit(2);
}

const reports = parsed.paths.map((path) => {
  try {
    return command.run(readFileSync(path, "utf8"), path);
  } catch (error) {
    return command.readError(path, `cannot read file - ${String(error)}`);
  }
});

command.afterRun?.(reports, parsed);

const { text, exitCode } = command.format(reports, parsed);
console.log(text);
process.exit(exitCode);
