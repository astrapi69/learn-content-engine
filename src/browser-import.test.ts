import { describe, expect, it, vi } from "vitest";

import { reachableModules, readSource } from "./test-support/emitters.js";

/**
 * Browser-consumer contract (engine#59): importing the package entry must not
 * touch the filesystem. The compiled ajv validators are created lazily on the
 * first validate call, so a browser bundler that executes the entry eagerly
 * (vite dev pre-bundling, no tree-shaking) can load the module even though
 * node:fs / node:url are unavailable there. Since engine#203 no validator
 * reads a file at all (below).
 */
describe("package entry in a browser-like environment", () => {
  it("imports without any filesystem access (schemas compile lazily)", async () => {
    vi.resetModules();
    vi.doMock("node:fs", () => ({
      readFileSync: () => {
        throw new Error("node:fs touched at import time (engine#59 regression)");
      },
    }));
    try {
      const engine = await import("./index.js");
      expect(typeof engine.parseLesson).toBe("function");
      expect(typeof engine.parseManifest).toBe("function");
      expect(typeof engine.validateLesson).toBe("function");
      expect(typeof engine.validateManifest).toBe("function");
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  it("the first validate call still compiles and validates (fs available)", async () => {
    vi.resetModules();
    const engine = await import("./index.js");
    const invalid = engine.validateLesson({});
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});

/**
 * engine#203: the structural layer used to read the two schemas from disk
 * (`new URL(\`../schema/${fileName}\`, import.meta.url)` + node:fs). A bundler
 * such as Vite turns that URL into a lookup over every file in schema/ and
 * copied all of them (146 kB, grading presets included) into every consumer
 * build that imported the package root, parse-only builds included; and
 * validateLesson itself could not run in a browser. The schemas are modules
 * now, so no module under the package root touches the file system.
 */
describe("the package root reads no file at run time (engine#203)", () => {
  it("validateLesson and validateManifest run without node:fs", async () => {
    vi.resetModules();
    vi.doMock("node:fs", () => ({
      readFileSync: () => {
        throw new Error("node:fs touched by a validator (engine#203 regression)");
      },
    }));
    try {
      const engine = await import("./index.js");
      expect(engine.validateLesson({}).valid).toBe(false);
      expect(engine.validateManifest({}).valid).toBe(false);
      expect(engine.validateLesson({ id: "l1", title: "L", steps: [{ id: "t1", type: "theory", body: "x" }] }).valid).toBe(true);
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  /** A module that reads a file at run time: imports node:fs or node:url, or
   *  builds a URL from import.meta.url (the form a bundler turns into copied
   *  assets). */
  const readsFiles = (source: string): boolean =>
    /from\s+"node:(?:fs|url)"/.test(source) || /new URL\([^)]*import\.meta\.url/.test(source);

  it("no module reachable from the package root reads a file", () => {
    const modules = reachableModules("./index.ts");
    expect(modules.length).toBeGreaterThan(10);
    expect(modules.filter((file) => readsFiles(readSource(file)))).toEqual([]);
  });

  it.each([
    ["a template URL", "const u = new URL(`../schema/${name}`, import.meta.url);"],
    ["a literal URL", 'const u = new URL("../schema/lesson.schema.json", import.meta.url);'],
    ["a node:fs import", 'import { readFileSync } from "node:fs";'],
    ["a node:url import", 'import { fileURLToPath } from "node:url";'],
  ])("the scan flags a seeded module with %s", (_label, seeded) => {
    expect(readsFiles(seeded)).toBe(true);
  });

  it("the scan passes a module that only imports JavaScript", () => {
    expect(readsFiles('import { err } from "./issues.js";\nconst x = "node:fs is mentioned in a string";')).toBe(false);
  });
});
