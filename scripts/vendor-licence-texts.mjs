#!/usr/bin/env node
/**
 * Vendor the licence and notice files of packages a bundle contains but that
 * are not installed at that version (engine#274).
 *
 *   node scripts/vendor-licence-texts.mjs chevrotain@11.1.2 @chevrotain/gast@11.1.2 ...
 *
 * For each ``name@version`` it runs ``npm pack`` (the published tarball, no
 * install), and copies the licence and NOTICE files plus a minimal
 * ``package.json`` (name, version, license) into
 * ``third-party/licenses/<@scope+name@version>/``. The docs-site build reads
 * them from there when the bundle names a version npm did not install here.
 * Run it when a Mermaid bump makes the build list missing texts; commit the
 * result. It fails when a tarball carries no licence file.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isLicenceFile, isNoticeFile, vendorDirName } from "./third-party-notices.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(REPO_ROOT, "third-party", "licenses");

const specs = process.argv.slice(2);
if (specs.length === 0) {
  console.error("usage: node scripts/vendor-licence-texts.mjs <name@version> ...");
  process.exit(2);
}

let failed = 0;
for (const spec of specs) {
  const work = mkdtempSync(join(tmpdir(), "licence-texts-"));
  try {
    const tarball = execFileSync("npm", ["pack", spec, "--pack-destination", work, "--silent"], { encoding: "utf8" }).trim().split("\n").pop();
    execFileSync("tar", ["-xzf", join(work, tarball), "-C", work]);
    const packageDir = join(work, "package");
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    const files = readdirSync(packageDir).filter(isNoticeFile);
    if (!files.some(isLicenceFile)) {
      console.error(`FAIL ${spec}: the published tarball carries no licence file`);
      failed += 1;
      continue;
    }
    const target = join(VENDOR_DIR, vendorDirName({ name: manifest.name, version: manifest.version }));
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    const { name, version, license, licenses } = manifest;
    writeFileSync(join(target, "package.json"), `${JSON.stringify({ name, version, license, licenses }, null, 2)}\n`);
    for (const file of files) copyFileSync(join(packageDir, file), join(target, file));
    console.log(`ok ${name}@${version}: ${files.join(", ")}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
process.exit(failed > 0 ? 1 : 0);
