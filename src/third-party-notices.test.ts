/**
 * Third-party notices for a vendored bundle (engine#274). The Pages site
 * redistributes Mermaid's standalone bundle; what the bundle contains is read
 * from its source maps, and every contained package's licence text ships
 * with it. These tests build small maps and package trees on disk.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bundledPackages,
  isNoticeFile,
  licenceSectionOf,
  missingNoticeTexts,
  findPackageDir,
  noticeTexts,
  renderNotices,
  sourcePackage,
  vendorDirName,
} from "../scripts/third-party-notices.mjs";

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "notices-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function writeMap(path: string, sources: string[]): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify({ version: 3, sources, mappings: "" }));
  return path;
}

function writePackage(dir: string, name: string, version: string, files: Record<string, string>, license?: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version, ...(license ? { license } : {}) }));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  return dir;
}

describe("sourcePackage", () => {
  it("reads name and version from a pnpm store path, scoped and with a peer suffix", () => {
    expect(sourcePackage("../../../node_modules/.pnpm/@iconify+utils@3.0.2/node_modules/@iconify/utils/lib/a.js")).toEqual({
      name: "@iconify/utils",
      version: "3.0.2",
    });
    expect(
      sourcePackage("../node_modules/.pnpm/cytoscape-fcose@2.2.0_cytoscape@3.33.3/node_modules/cytoscape-fcose/x.js"),
    ).toEqual({ name: "cytoscape-fcose", version: "2.2.0" });
  });

  it("knows the name but not the version of a plain node_modules path, and nothing of a source outside node_modules", () => {
    expect(sourcePackage("webpack://LIB/node_modules/path-browserify/index.js")).toEqual({ name: "path-browserify", version: null });
    expect(sourcePackage("../src/diagrams/flow.ts")).toBeNull();
  });
});

describe("bundledPackages", () => {
  function fixture() {
    const parserDist = join(base, "parser", "dist");
    writeMap(join(parserDist, "chunks", "core", "chunk-A.mjs.map"), [
      "../../../src/language/grammar.ts",
      "../../../../../node_modules/.pnpm/langium@4.2.0/node_modules/langium/lib/index.js",
      "../../../../../node_modules/.pnpm/@chevrotain+gast@11.1.2/node_modules/@chevrotain/gast/lib/a.js",
      "webpack://LIB/./src/uri.ts",
      "webpack://LIB/node_modules/path-browserify/index.js",
    ]);
    const rootMap = writeMap(join(base, "root", "dist", "root.min.js.map"), [
      "../src/main.ts",
      "../../../node_modules/.pnpm/zeta@1.0.0/node_modules/zeta/index.js",
      "../../../node_modules/.pnpm/d3-array@2.12.1/node_modules/d3-array/a.js",
      "../../../node_modules/.pnpm/d3-array@3.2.4/node_modules/d3-array/a.js",
      "../../parser/dist/chunks/core/chunk-A.mjs",
      "../../../node_modules/.pnpm/zeta@1.0.0/node_modules/zeta/other.js",
    ]);
    const rules = {
      root: { name: "root", version: "11.0.0", own: [/^\.\.\/src\//] },
      siblings: [{ prefix: "../../parser/dist/", dir: parserDist, name: "parser", version: "1.2.0", own: [/^(\.\.\/)+src\//] }],
      aliases: [
        { prefix: "webpack://LIB/node_modules/path-browserify/", id: "path-browserify@1.0.1" },
        { prefix: "webpack://LIB/", id: "vscode-uri@3.1.0" },
      ],
    };
    return { rootMap, rules };
  }

  it("lists the root, then every package the maps name once per name@version, sorted, following a sibling's own map", () => {
    const { rootMap, rules } = fixture();
    expect(bundledPackages(rootMap, rules).map((pkg) => `${pkg.name}@${pkg.version}`)).toEqual([
      "root@11.0.0",
      "@chevrotain/gast@11.1.2",
      "d3-array@2.12.1",
      "d3-array@3.2.4",
      "langium@4.2.0",
      "parser@1.2.0",
      "path-browserify@1.0.1",
      "vscode-uri@3.1.0",
      "zeta@1.0.0",
    ]);
  });

  it("refuses every source it cannot attribute, listing them all", () => {
    const { rootMap, rules } = fixture();
    writeMap(rootMap, ["../src/ok.ts", "../../other/dist/x.mjs", "webpack://APP/./y.ts", "../node_modules/bare/index.js"]);
    expect(() => bundledPackages(rootMap, rules)).toThrow(
      /3 source\(s\)[\s\S]*\.\.\/\.\.\/other\/dist\/x\.mjs[\s\S]*webpack:\/\/APP\/\.\/y\.ts[\s\S]*bare \(no version in the path\)/,
    );
  });

  it("refuses a sibling reference whose map is not installed", () => {
    const { rootMap, rules } = fixture();
    writeMap(rootMap, ["../../parser/dist/chunks/core/chunk-MISSING.mjs"]);
    expect(() => bundledPackages(rootMap, rules)).toThrow(/chunk-MISSING\.mjs\.map/);
  });
});

describe("isNoticeFile", () => {
  it("takes licence and notice texts and leaves scripts named like them", () => {
    for (const name of ["LICENSE", "LICENCE.md", "License.txt", "LICENSE-MIT", "COPYING", "NOTICE", "license.txt"]) {
      expect(isNoticeFile(name), name).toBe(true);
    }
    for (const name of ["license-update.mjs", "LICENSE.js", "notice.ts", "license.json", "README.md"]) {
      expect(isNoticeFile(name), name).toBe(false);
    }
  });
});

describe("licenceSectionOf", () => {
  it("takes a README's licence section up to the next heading of its level", () => {
    const readme = "# pkg\n\n## Usage\n\nx\n\n## License\n\n(The MIT License)\n\nCopyright (c) 2016 A\n\n### Note\n\nkept\n\n## Contributors\n\nB\n";
    expect(licenceSectionOf(readme)).toBe("(The MIT License)\n\nCopyright (c) 2016 A\n\n### Note\n\nkept\n");
  });

  it("returns null without a licence heading, and for a section that only names the licence", () => {
    expect(licenceSectionOf("# pkg\n\nno licence here\n")).toBeNull();
    expect(licenceSectionOf("# pkg\n\n## Licence\n\nMIT\n")).toBeNull();
  });
});

describe("findPackageDir", () => {
  it("finds a package nested under its dependent before a hoisted one, as Node resolves it", () => {
    const modules = join(base, "node_modules");
    const parent = writePackage(join(modules, "parent"), "parent", "1.0.0", {});
    writePackage(join(modules, "dep"), "dep", "2.0.0", {});
    const nested = writePackage(join(parent, "node_modules", "dep"), "dep", "1.0.0", {});
    expect(findPackageDir(parent, "dep")).toBe(nested);
    expect(findPackageDir(base, "absent")).toBeNull();
  });
});

describe("noticeTexts", () => {
  it("takes the texts of the installed package at that exact version, else the vendored copy, licence first", () => {
    const modules = join(base, "node_modules");
    writePackage(join(modules, "inst"), "inst", "1.0.0", { NOTICE: "inst notice\n", "LICENSE.md": "inst licence\n", "license-update.mjs": "a script\n" }, "Apache-2.0");
    writePackage(join(modules, "old"), "old", "9.9.9", { LICENSE: "wrong version\n" });
    const vendor = join(base, "vendor");
    writePackage(join(vendor, vendorDirName({ name: "@s/old", version: "1.0.0" })), "@s/old", "1.0.0", { "LICENSE-MIT": "vendored licence\n" }, "MIT");
    writePackage(join(vendor, vendorDirName({ name: "old", version: "1.0.0" })), "old", "1.0.0", { LICENSE: "old 1.0.0 licence\n" }, "ISC");

    const texts = noticeTexts(
      [
        { name: "inst", version: "1.0.0" },
        { name: "old", version: "1.0.0" },
        { name: "@s/old", version: "1.0.0" },
      ],
      { searchFrom: base, vendorDir: vendor },
    );

    expect(texts.map((pkg) => [pkg.name, pkg.license, pkg.files.map((file) => file.name)])).toEqual([
      ["inst", "Apache-2.0", ["LICENSE.md", "NOTICE"]],
      ["old", "ISC", ["LICENSE"]],
      ["@s/old", "MIT", ["LICENSE-MIT"]],
    ]);
    expect(texts[1]?.files[0]?.text).toBe("old 1.0.0 licence\n");
  });

  it("refuses packages whose licence text is neither installed nor vendored, naming the vendoring command", () => {
    expect(() =>
      noticeTexts(
        [
          { name: "ghost", version: "1.0.0" },
          { name: "@s/ghost", version: "2.0.0" },
        ],
        { searchFrom: base, vendorDir: join(base, "vendor") },
      ),
    ).toThrow(/2 package\(s\) without a licence text[\s\S]*ghost@1\.0\.0[\s\S]*@s\/ghost@2\.0\.0[\s\S]*vendor-licence-texts\.mjs/);
  });

  it("names the packages that lack a text without throwing, for a caller that fetches them", () => {
    const modules = join(base, "node_modules");
    writePackage(join(modules, "inst"), "inst", "1.0.0", { LICENSE: "inst\n" });
    expect(
      missingNoticeTexts(
        [
          { name: "inst", version: "1.0.0" },
          { name: "ghost", version: "1.0.0" },
        ],
        { searchFrom: base, vendorDir: join(base, "vendor") },
      ),
    ).toEqual(["ghost@1.0.0"]);
  });

  it("takes the vendored copy when the installed one ships no licence file", () => {
    const modules = join(base, "node_modules");
    writePackage(join(modules, "readme-only"), "readme-only", "1.0.0", { "README.md": "## License\n\nMIT\n" });
    const vendor = join(base, "vendor");
    writePackage(join(vendor, "readme-only@1.0.0"), "readme-only", "1.0.0", { "LICENSE.from-README": "extracted\n" }, "MIT");
    const [pkg] = noticeTexts([{ name: "readme-only", version: "1.0.0" }], { searchFrom: base, vendorDir: vendor });
    expect(pkg?.files.map((file) => file.name)).toEqual(["LICENSE.from-README"]);
  });

  it("refuses a vendored copy that holds no licence file", () => {
    const vendor = join(base, "vendor");
    writePackage(join(vendor, vendorDirName({ name: "bare", version: "1.0.0" })), "bare", "1.0.0", { NOTICE: "only notice\n" });
    expect(() => noticeTexts([{ name: "bare", version: "1.0.0" }], { searchFrom: base, vendorDir: vendor })).toThrow(/bare@1\.0\.0/);
  });
});

describe("renderNotices", () => {
  it("names the bundle and the root, then gives every package its header and texts verbatim", () => {
    const text = renderNotices(
      [
        { name: "root", version: "3.1.0", license: "MIT", files: [{ name: "LICENSE", text: "root licence\n" }] },
        { name: "dep", version: "1.0.0", license: null, files: [{ name: "LICENSE", text: "dep licence\n" }, { name: "NOTICE", text: "dep notice\n" }] },
        { name: "dual", version: "2.0.0", license: "(MPL-2.0 OR Apache-2.0)", files: [{ name: "LICENSE", text: "dual\n" }] },
      ],
      "assets/root.min.js",
    );
    expect(text.startsWith("Third-party notices for assets/root.min.js (root 3.1.0)\n")).toBe(true);
    expect(text).toContain("root@3.1.0 (MIT)");
    expect(text).toContain("dep@1.0.0 (no licence field in package.json)");
    expect(text).toContain("dual@2.0.0 (MPL-2.0 OR Apache-2.0)");
    expect(text.indexOf("root licence")).toBeLessThan(text.indexOf("dep licence"));
    expect(text.indexOf("dep licence")).toBeLessThan(text.indexOf("dep notice"));
    expect(text.endsWith("\n")).toBe(true);
  });
});
