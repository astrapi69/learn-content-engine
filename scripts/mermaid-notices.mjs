/**
 * The notices file for the Mermaid bundle the docs site serves (engine#274).
 *
 * The rules name what Mermaid 11's map holds besides Mermaid's own sources
 * (``../src/``): packages from Mermaid's pnpm store, and files of
 * ``@mermaid-js/parser``'s own bundle (``../../parser/dist/``), whose maps
 * name langium, chevrotain and the vscode-languageserver packages. Two
 * sources there carry no package path, because vscode-uri is itself a
 * webpack bundle: ``webpack://LIB/`` is vscode-uri 3.1.0 (langium 4.2.0
 * asks for ~3.1.0, and 3.1.0 is the only 3.1.x release) and its
 * ``node_modules/path-browserify`` is path-browserify 1.0.1 (vscode-uri
 * 3.1.0 asks for ^1.0.1, the only 1.x release). A Mermaid bump that changes
 * these forms fails the build rather than ship an incomplete file.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bundledPackages, findPackageDir, noticeTexts, renderNotices } from "./third-party-notices.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_DIR = join(REPO_ROOT, "third-party", "licenses");

const readVersion = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;

/** The source-map rules for Mermaid installed at ``mermaidDir``. */
export function mermaidRules(mermaidDir) {
  const parserDir = findPackageDir(mermaidDir, "@mermaid-js/parser");
  if (!parserDir) throw new Error("@mermaid-js/parser is not installed next to mermaid");
  return {
    root: { name: "mermaid", version: readVersion(mermaidDir), own: [/^\.\.\/src\//] },
    siblings: [
      {
        prefix: "../../parser/dist/",
        dir: join(parserDir, "dist"),
        name: "@mermaid-js/parser",
        version: readVersion(parserDir),
        own: [/^(\.\.\/)+src\//],
      },
    ],
    aliases: [
      { prefix: "webpack://LIB/node_modules/path-browserify/", id: "path-browserify@1.0.1" },
      { prefix: "webpack://LIB/", id: "vscode-uri@3.1.0" },
    ],
  };
}

/** The packages ``dist/mermaid.min.js`` of the Mermaid at ``mermaidDir`` contains, root first. */
export function mermaidBundlePackages(mermaidDir) {
  return bundledPackages(join(mermaidDir, "dist", "mermaid.min.js.map"), mermaidRules(mermaidDir));
}

/** The notices text for the bundle served at ``bundle`` (its path on the site). */
export function mermaidNotices(mermaidDir, bundle) {
  const packages = noticeTexts(mermaidBundlePackages(mermaidDir), { searchFrom: REPO_ROOT, vendorDir: VENDOR_DIR });
  return renderNotices(packages, bundle);
}
