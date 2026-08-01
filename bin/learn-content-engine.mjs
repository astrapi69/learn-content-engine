#!/usr/bin/env node
// Thin CLI shim: read argv + files, delegate to the tested cores in dist/,
// print, and set the exit code. All logic worth testing lives in src/cli.ts
// (lint), src/migrate.ts (migrate) and src/suggest-wiring.ts (suggest-wiring);
// this file only wires filesystem I/O to them. Subcommands live in a table so
// adding one is a new entry, not another copy of the read/format/exit block.
// An unknown command falls back to `lint`, whose parser reports it (parity
// with the pre-table behaviour).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse as parseYaml } from "yaml";

import { parseLintArgs, lintContent, formatReports } from "../dist/cli.js";
import { parseMigrateArgs, migrateContent, formatMigrateReports } from "../dist/migrate.js";
import { parseMintArgs, mintStableIds, formatMintReports } from "../dist/mint-stable-ids.js";
import {
  computeStableIdCoverage,
  formatCoverageResult,
} from "../dist/stable-id-coverage.js";
import {
  buildStableIdInventory,
  compareStableIdInventories,
  formatStabilityResult,
  isBaseCredible,
} from "../dist/stable-id-stability.js";
import {
  parseSuggestWiringArgs,
  suggestWiringContent,
  formatSuggestWiringReports,
} from "../dist/suggest-wiring.js";

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
  "mint-stable-ids": {
    parseArgs: parseMintArgs,
    run: (rawJson, path) => mintStableIds(rawJson, path),
    readError: (path, message) => ({ path, ok: false, minted: 0, parseError: message }),
    // Dry-run by default; --write applies the core's format-preserving text,
    // which carries the built-in add-only proof (a file that failed the proof
    // has no newText and is never written).
    afterRun: (reports, args) => {
      if (!args.write) return;
      for (const report of reports) {
        if (report.ok && report.minted > 0 && report.newText) {
          writeFileSync(report.path, report.newText);
        }
      }
    },
    format: (reports, args) => formatMintReports(reports, { json: args.json, write: args.write }),
  },
  "suggest-wiring": {
    parseArgs: parseSuggestWiringArgs,
    run: (rawJson, path, args) => suggestWiringContent(rawJson, path, args.accept),
    readError: (path, message) => ({ path, ok: false, suggestions: [], manualReview: [], accepted: [], parseError: message }),
    // Dry-run by default; the core sets `lesson` ONLY when explicitly accepted
    // suggestions were applied AND the rewired lesson passed validateLesson.
    afterRun: (reports, args) => {
      if (!args.write) return;
      for (const report of reports) {
        if (report.ok && report.accepted.length > 0 && report.lesson) {
          writeFileSync(report.path, JSON.stringify(report.lesson, null, 2) + "\n");
        }
      }
    },
    format: (reports, args) =>
      formatSuggestWiringReports(reports, { json: args.json, write: args.write, accept: args.accept }),
  },
};

const argv = process.argv.slice(2);

// `check-stable-ids` is not a per-file command: it compares the WHOLE repo
// against its last published state, so it needs git history, which no other
// command touches. It is handled before the file-command table rather than
// bent into it. Shipping it here (instead of every content repo copying a
// script) is what gives the stability promise the same reach as the schema:
// a repo that re-pins the engine gets the enforcement with it.
if (argv[0] === "check-stable-ids") {
  const baseFlagIndex = argv.indexOf("--base");
  const baseRef = baseFlagIndex === -1 ? "origin/main" : argv[baseFlagIndex + 1];
  if (!baseRef) {
    console.error("usage: learn-content-engine check-stable-ids [--base <ref>] [--allow-empty-base]");
    process.exit(2);
  }
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const isLesson = (path) => path.endsWith(".json") && path.includes("/lessons/");
  const setOf = (path) => path.split("/").slice(0, 3).join("/");
  const fileOf = (path) => path.split("/").pop();

  let mergeBase;
  try {
    mergeBase = git("merge-base", "HEAD", baseRef).trim();
  } catch (error) {
    console.error(`cannot resolve the comparison base '${baseRef}': ${String(error)}`);
    process.exit(2);
  }

  const readLessons = (paths, read) =>
    paths.filter(isLesson).flatMap((path) => {
      try {
        return [{ set: setOf(path), filename: fileOf(path), lesson: JSON.parse(read(path)) }];
      } catch (error) {
        console.error(`cannot read ${path}: ${String(error)}`);
        process.exit(2);
      }
    });

  const basePaths = git("ls-tree", "-r", "--name-only", mergeBase, "sets/").split("\n").filter(Boolean);
  const headPaths = git("ls-files", "--cached", "--others", "--exclude-standard", "sets/")
    .split("\n")
    .filter((path) => Boolean(path) && existsSync(path));

  const base = buildStableIdInventory(readLessons(basePaths, (path) => git("show", `${mergeBase}:${path}`)));
  const head = buildStableIdInventory(readLessons(headPaths, (path) => readFileSync(path, "utf8")));

  const result = compareStableIdInventories(base, head);
  console.log(`base: ${mergeBase.slice(0, 7)} (${baseRef})`);
  console.log(formatStabilityResult(result));
  // A run over nothing is not a run, in either direction.
  if (base.lessons.length > 0 && head.lessons.length === 0) {
    console.log("FAIL: the base carries lessons but the head yields none");
    process.exit(1);
  }
  const credibility = isBaseCredible(result.checked);
  if (!credibility.credible && !argv.includes("--allow-empty-base")) {
    console.log(`FAIL: ${credibility.reason}`);
    process.exit(1);
  }
  process.exit(result.violations.length === 0 ? 0 : 1);
}

// `check-stable-id-coverage` is the second half of the stable_id promise
// (engine#103): the stability gate above proves that a PUBLISHED id still
// points at its element, which an unminted set never violates because it
// publishes nothing. This one proves that every set listed in the root
// manifest actually carries ids. It ships here for the same reason the
// stability half does - ten vendored copies drift, one pinned command does
// not. Only the baseline NUMBER stays repo-local.
if (argv[0] === "check-stable-id-coverage") {
  const flag = (name, fallback) => {
    const index = argv.indexOf(name);
    return index === -1 ? fallback : argv[index + 1];
  };
  const manifestPath = flag("--manifest", "manifest.yaml");
  const baselinePath = flag("--baseline", "schema/stable-id-coverage.txt");
  if (!manifestPath || !baselinePath) {
    console.error(
      "usage: learn-content-engine check-stable-id-coverage [--manifest <path>] [--baseline <path>]",
    );
    process.exit(2);
  }

  const readYaml = (path) => {
    try {
      return parseYaml(readFileSync(path, "utf8")) ?? {};
    } catch (error) {
      console.error(`cannot read ${path}: ${String(error)}`);
      process.exit(2);
    }
  };

  const rootManifest = readYaml(manifestPath);
  const rootDir = dirname(manifestPath);
  const coverageSets = (rootManifest.sets ?? [])
    .filter((entry) => entry?.path)
    .map((entry) => {
      const setDir = join(rootDir, entry.path);
      const setManifest = existsSync(join(setDir, "manifest.yaml"))
        ? readYaml(join(setDir, "manifest.yaml"))
        : {};
      const lessonNames = setManifest.metadata?.lessons ?? [];
      const lessons = lessonNames.map((name) => {
        const lessonPath = join(setDir, "lessons", name);
        if (!existsSync(lessonPath)) {
          // A listed lesson that is not on disk cannot carry ids. Reporting it
          // as an unminted set is the honest reading; crashing would hide the
          // coverage of every other set behind an unrelated bookkeeping error.
          return { cards: [{ id: name }] };
        }
        try {
          return JSON.parse(readFileSync(lessonPath, "utf8"));
        } catch (error) {
          console.error(`cannot read ${lessonPath}: ${String(error)}`);
          process.exit(2);
        }
      });
      return { set: entry.path, lessons };
    });

  let baseline = 0;
  if (existsSync(baselinePath)) {
    baseline = Number.parseInt(readFileSync(baselinePath, "utf8").trim(), 10);
    if (Number.isNaN(baseline)) {
      console.error(`the baseline in ${baselinePath} is not a number`);
      process.exit(2);
    }
  }

  const { text, exitCode } = formatCoverageResult(computeStableIdCoverage(coverageSets), baseline);
  console.log(text);
  process.exit(exitCode);
}

const command = COMMANDS[argv[0]] ?? COMMANDS.lint;

const parsed = command.parseArgs(argv);
if ("error" in parsed) {
  console.error(parsed.error);
  process.exit(2);
}

const reports = parsed.paths.map((path) => {
  try {
    return command.run(readFileSync(path, "utf8"), path, parsed);
  } catch (error) {
    return command.readError(path, `cannot read file - ${String(error)}`);
  }
});

command.afterRun?.(reports, parsed);

const { text, exitCode } = command.format(reports, parsed);
console.log(text);
process.exit(exitCode);
