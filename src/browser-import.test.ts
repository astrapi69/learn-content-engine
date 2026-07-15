import { describe, expect, it, vi } from "vitest";

/**
 * Browser-consumer contract (engine#59): importing the package entry must not
 * touch the filesystem. The compiled ajv validators are created lazily on the
 * first validate call, so a browser bundler that executes the entry eagerly
 * (vite dev pre-bundling, no tree-shaking) can load the module even though
 * node:fs / node:url are unavailable there. Only calling
 * validateLesson/validateManifest may read the bundled schemas.
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
