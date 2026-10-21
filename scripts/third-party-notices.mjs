/**
 * Third-party notices for a vendored bundle (engine#274).
 *
 * The Pages site serves Mermaid's standalone bundle itself (engine#272).
 * Redistributing that bundle means shipping the notice of every package whose
 * code it contains, not only Mermaid's: d3, dagre, cytoscape, KaTeX, and,
 * bundled a level deeper into Mermaid's parser, langium and chevrotain
 * (Apache-2.0, which asks for a copy of the licence itself).
 *
 * What the bundle contains is read from its source map, not from the
 * dependency tree: the bundle was built from Mermaid's own lockfile, so
 * versions differ from what npm installs here, and code bundled into a
 * dependency at its own build time (langium inside ``@mermaid-js/parser``)
 * is not installed at all. ``bundledPackages`` walks the map, follows a
 * sibling package's own maps, and fails closed on any source it cannot
 * attribute. ``noticeTexts`` takes each package's licence and NOTICE files
 * from the installed package at that exact version, else from the vendored
 * copy that ``scripts/vendor-licence-texts.mjs`` fetches with ``npm pack``;
 * a package with neither stops the build. ``renderNotices`` writes the file
 * the site serves next to the bundle.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.-][\w.-]*)?$/i;
const CODE_FILE = /\.(c|m)?(js|ts)$|\.json$/i;
const LICENCE_FILE = /^(licen[cs]e|copying)/i;
const PNPM_SOURCE = /\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//;
const NODE_MODULES_SOURCE = /node_modules\/((?:@[^/]+\/)?[^/]+)\//;
const RULE = "=".repeat(72);
const THIN = "-".repeat(72);

/**
 * The package a source-map source belongs to: name and version from a pnpm
 * store path, name only (version null) from a plain ``node_modules`` path,
 * and null for a source outside ``node_modules``.
 */
export function sourcePackage(source) {
  const pnpm = PNPM_SOURCE.exec(source);
  if (pnpm) {
    const [, storeDir, name] = pnpm;
    const version = storeDir.slice(name.replace("/", "+").length + 1).split("_")[0];
    return { name, version };
  }
  const plain = NODE_MODULES_SOURCE.exec(source);
  return plain ? { name: plain[1], version: null } : null;
}

/**
 * Whether ``name`` is a licence or notice text as packages name them
 * (LICENSE, LICENCE.md, License.txt, LICENSE-MIT, COPYING, NOTICE), and not
 * a script or data file that only starts like one (``license-update.mjs``).
 */
export function isNoticeFile(name) {
  return NOTICE_FILE.test(name) && !CODE_FILE.test(name);
}

/** Whether a notice file is the licence itself, rather than a NOTICE. */
export function isLicenceFile(name) {
  return LICENCE_FILE.test(name);
}

const keyOf = (pkg) => `${pkg.name}@${pkg.version}`;
const byNameThenVersion = (a, b) =>
  a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true });

/**
 * Every package whose code the bundle mapped by ``mapPath`` contains: the
 * root first, then the rest sorted, once per ``name@version``. ``rules``:
 * ``root`` ({name, version, own: RegExp[]}) owns the matching sources;
 * ``siblings`` ([{prefix, dir, name, version, own}]) are packages whose
 * already-bundled files the map points into, followed through their own maps
 * under ``dir``; ``aliases`` ([{prefix, id}]) attribute sources that carry no
 * package path, such as a dependency's own webpack bundle. Throws listing
 * every source it cannot attribute.
 */
export function bundledPackages(mapPath, rules) {
  const found = new Map([[keyOf(rules.root), { name: rules.root.name, version: rules.root.version }]]);
  const unresolved = [];
  const add = (pkg) => found.set(keyOf(pkg), pkg);

  const walk = (file, owner) => {
    if (!existsSync(file)) {
      unresolved.push(`${file} (the map of a bundled sibling file is not installed)`);
      return;
    }
    for (const source of JSON.parse(readFileSync(file, "utf8")).sources) {
      const alias = rules.aliases.find((entry) => source.startsWith(entry.prefix));
      if (alias) {
        const at = alias.id.lastIndexOf("@");
        add({ name: alias.id.slice(0, at), version: alias.id.slice(at + 1) });
        continue;
      }
      const pkg = sourcePackage(source);
      if (pkg?.version) {
        add(pkg);
        continue;
      }
      if (pkg) {
        unresolved.push(`${source}: ${pkg.name} (no version in the path)`);
        continue;
      }
      const sibling = rules.siblings.find((entry) => source.startsWith(entry.prefix));
      if (sibling) {
        add({ name: sibling.name, version: sibling.version });
        walk(join(sibling.dir, `${source.slice(sibling.prefix.length)}.map`), sibling);
        continue;
      }
      if (!owner.own.some((pattern) => pattern.test(source))) unresolved.push(source);
    }
  };

  walk(mapPath, rules.root);
  if (unresolved.length > 0) {
    const unique = [...new Set(unresolved)];
    throw new Error(`${unique.length} source(s) in ${mapPath} cannot be attributed to a package:\n  ${unique.join("\n  ")}`);
  }
  const [root, ...rest] = found.values();
  return [root, ...rest.sort(byNameThenVersion)];
}

/**
 * The directory of package ``name`` as Node resolves it from ``fromDir``:
 * ``fromDir/node_modules/name`` first, then each parent's. Null when no such
 * package is installed above ``fromDir``.
 */
export function findPackageDir(fromDir, name) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/** The directory name of a package's vendored texts: ``@scope+name@1.2.3``. */
export function vendorDirName(pkg) {
  return `${pkg.name.replace("/", "+")}@${pkg.version}`;
}

/** Every installed package under ``root``'s node_modules trees, by ``name@version``. */
function installedPackages(root) {
  const index = new Map();
  const visit = (modulesDir) => {
    if (!existsSync(modulesDir)) return;
    for (const entry of readdirSync(modulesDir)) {
      if (entry.startsWith(".")) continue;
      const dirs = entry.startsWith("@")
        ? readdirSync(join(modulesDir, entry)).map((name) => join(modulesDir, entry, name))
        : [join(modulesDir, entry)];
      for (const dir of dirs) {
        const manifest = join(dir, "package.json");
        if (!existsSync(manifest) || !statSync(dir).isDirectory()) continue;
        const { name, version } = JSON.parse(readFileSync(manifest, "utf8"));
        if (!index.has(`${name}@${version}`)) index.set(`${name}@${version}`, dir);
        visit(join(dir, "node_modules"));
      }
    }
  };
  visit(join(root, "node_modules"));
  return index;
}

/** The SPDX expression of a manifest, from ``license`` or a legacy object; null when it names none. */
function licenseOf(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license && typeof manifest.license.type === "string") return manifest.license.type;
  if (Array.isArray(manifest.licenses)) return manifest.licenses.map((entry) => entry.type).join(" OR ");
  return null;
}

/** Licence field and notice files (licences first) of the package directory ``dir``. */
function readTexts(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const names = readdirSync(dir)
    .filter(isNoticeFile)
    .sort((a, b) => Number(!isLicenceFile(a)) - Number(!isLicenceFile(b)) || a.localeCompare(b));
  return { license: licenseOf(manifest), files: names.map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") })) };
}

/**
 * Each package with its licence field and notice files: from the package
 * installed under ``searchFrom`` at that exact version, else from
 * ``vendorDir/<vendorDirName>``. Throws listing every package that has
 * neither, or whose texts hold no licence file.
 */
export function noticeTexts(packages, { searchFrom, vendorDir }) {
  const installed = installedPackages(searchFrom);
  const missing = [];
  const result = packages.map((pkg) => {
    const vendored = join(vendorDir, vendorDirName(pkg));
    const dir = installed.get(keyOf(pkg)) ?? (existsSync(join(vendored, "package.json")) ? vendored : null);
    const texts = dir ? readTexts(dir) : null;
    if (!texts || !texts.files.some((file) => isLicenceFile(file.name))) {
      missing.push(keyOf(pkg));
      return null;
    }
    return { ...pkg, ...texts };
  });
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} package(s) without a licence text, neither installed at that version nor vendored in ${vendorDir}:\n  ` +
        `${missing.join("\n  ")}\nFetch them with: node scripts/vendor-licence-texts.mjs ${missing.join(" ")}`,
    );
  }
  return result;
}

/**
 * The notices file for ``bundle`` (its path on the site): a header naming the
 * root package, then one section per package with its licence field and the
 * text of each notice file, verbatim.
 */
export function renderNotices(packages, bundle) {
  const [root] = packages;
  const header = [
    `Third-party notices for ${bundle} (${root.name} ${root.version})`,
    "",
    `The bundle contains ${root.name} and the code of the packages below, as its`,
    "source maps name them. Each section carries the package's licence and",
    "notice files as the package ships them.",
  ].join("\n");
  const describe = (license) => (license === null ? "(no licence field in package.json)" : license.startsWith("(") ? license : `(${license})`);
  const sections = packages.map((pkg) =>
    [
      RULE,
      `${pkg.name}@${pkg.version} ${describe(pkg.license)}`,
      ...pkg.files.map((file) => `${THIN}\n${file.name}\n${THIN}\n${file.text.trimEnd()}`),
    ].join("\n"),
  );
  return `${header}\n\n${sections.join("\n\n")}\n`;
}
