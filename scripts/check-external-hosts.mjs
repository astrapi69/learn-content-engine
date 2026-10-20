#!/usr/bin/env node
/**
 * Third-party host gate for the assembled Pages site (engine#272).
 *
 *   npm run docs:pages && npm run docs:pages:check
 *   node scripts/check-external-hosts.mjs <site-dir> [--origin <url>]
 *
 * Scans every HTML page, stylesheet, web manifest and service worker under
 * the directory for a resource the browser would fetch from another host;
 * the rules are in external-hosts-lib.mjs, ported from bibliogon. Runs in
 * ci.yml on every pull request and in pages.yml before the deploy.
 *
 * Exit 0: nothing found. Exit 1: a finding whose host is not in
 * ALLOWED_HOSTS. Exit 2: the run proves nothing (a usage error, no such
 * directory, or no HTML page in it). That floor is this repository's rule
 * for every gate (engine#93): a scan that saw nothing is a broken run, not a
 * clean one. The original passes an empty directory.
 */

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { ALLOWED_HOSTS, describeFinding, scanSite, unallowed } from "./external-hosts-lib.mjs";

const USAGE = "usage: node scripts/check-external-hosts.mjs <site-dir> [--origin <url>]";

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(2);
}

let options;
try {
  options = parseArgs({ options: { origin: { type: "string" } }, allowPositionals: true });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (options.positionals.length !== 1) fail(`expected one site directory\n${USAGE}`);

const [root] = options.positionals;
if (!existsSync(root)) fail(`${root} does not exist - assemble the site first (npm run docs:pages).`);

const { scanned, findings } = scanSite(root, options.values.origin);
const pages = scanned.filter((file) => /\.html?$/i.test(file)).length;
if (pages === 0) fail(`no HTML page under ${root} - the scan would pass vacuously.`);

const failing = unallowed(findings, ALLOWED_HOSTS);
for (const found of findings.filter((candidate) => !failing.includes(candidate))) {
  console.log(`allowed (${ALLOWED_HOSTS[found.host]}): ${describeFinding(found)}`);
}
for (const found of failing) console.log(`EXTERNAL: ${describeFinding(found)}`);
if (failing.length > 0) {
  console.log(
    `\n${failing.length} third-party resource fetch(es). Self-host the resource, or add the host to ` +
      "ALLOWED_HOSTS in scripts/external-hosts-lib.mjs with a written reason.",
  );
  process.exit(1);
}
console.log(`OK: no third-party resource fetch in ${root} (${scanned.length} file(s) scanned, ${pages} HTML page(s))`);
