#!/usr/bin/env node
/**
 * Bundle-size gate for the two public entry points (issue #37).
 *
 * Bundles dist/index.js (core) and dist/qti/index.js (qti) SEPARATELY with
 * esbuild (minified, gzip measured) and fails when:
 *   - a bundle exceeds its gzip budget, or
 *   - a forbidden dependency leaks into an entry - the qti XML parser
 *     (@rgrove/parse-xml) must never reach the core import. The metafile
 *     input list is the evidence, not a string scan.
 *
 * Budgets are deliberately explicit constants: raising one is a reviewed
 * decision, not an accident. Measured 2026-07-13 (engine 0.12.0):
 * core 76.3 kB gzip, qti 47.9 kB gzip. Core raised 90 -> 92 kB on 2026-10-10
 * for engine#254 (declared type migrations): main measured 89.6 kB, the
 * change 90.3 kB, i.e. +0.7 kB for the gate exception, the declaration
 * checks and the typed-cloze conversion in migrate.
 *
 * Usage:
 *   npm run build && node scripts/check-bundle-size.mjs
 */
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BUNDLE_BUDGETS = [
  {
    entryName: "core",
    entryFile: "dist/index.js",
    gzipLimitKb: 92,
    forbiddenDependencies: ["@rgrove/parse-xml"],
  },
  {
    entryName: "qti",
    entryFile: "dist/qti/index.js",
    gzipLimitKb: 60,
    forbiddenDependencies: [],
  },
];

/** Bundle one entry and return its gzip size plus any forbidden inputs. */
async function measureEntry(budget) {
  const bundled = await build({
    entryPoints: [join(REPO_ROOT, budget.entryFile)],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "node",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const gzippedKb = gzipSync(bundled.outputFiles[0].contents).length / 1024;
  const inputPaths = Object.keys(bundled.metafile.inputs);
  const leakedDependencies = budget.forbiddenDependencies.filter((dependency) =>
    inputPaths.some((inputPath) => inputPath.includes(`node_modules/${dependency}/`)),
  );
  return { gzippedKb, leakedDependencies };
}

let gateFailed = false;
for (const budget of BUNDLE_BUDGETS) {
  const { gzippedKb, leakedDependencies } = await measureEntry(budget);
  const overBudget = gzippedKb > budget.gzipLimitKb;
  const verdict = overBudget || leakedDependencies.length > 0 ? "FAIL" : "ok";
  console.log(
    `${verdict}  ${budget.entryName} (${budget.entryFile}): ` +
      `${gzippedKb.toFixed(1)} kB gzip (limit ${budget.gzipLimitKb} kB)`,
  );
  if (overBudget) {
    console.error(`  over budget by ${(gzippedKb - budget.gzipLimitKb).toFixed(1)} kB`);
    gateFailed = true;
  }
  for (const dependency of leakedDependencies) {
    console.error(`  forbidden dependency leaked into ${budget.entryName}: ${dependency}`);
    gateFailed = true;
  }
}

process.exit(gateFailed ? 1 : 0);
