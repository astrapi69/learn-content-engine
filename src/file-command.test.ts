import { describe, it, expect } from "vitest";

import { exitCodeFor, parseErrorLine, parseFileArgs } from "./file-command.js";

/** Shared file-command scaffolding used by the lint + migrate cores. */

describe("parseFileArgs", () => {
  it("splits paths from present flags", () => {
    expect(parseFileArgs("migrate", ["migrate", "a.json", "--write", "b.json"], ["--write", "--json"], "exp", "use")).toEqual({
      paths: ["a.json", "b.json"],
      flags: new Set(["--write"]),
    });
  });

  it("returns an empty flag set when none are present", () => {
    const parsed = parseFileArgs("lint", ["lint", "a.json"], ["--json"], "exp", "use");
    expect(parsed).toEqual({ paths: ["a.json"], flags: new Set() });
  });

  it("errors with the expected hint when the command does not match", () => {
    expect(parseFileArgs("lint", ["frob"], ["--json"], "lint <file...>", "use")).toEqual({
      error: "unknown command 'frob' (expected: lint <file...>)",
    });
  });

  it("errors with the usage string when no paths remain", () => {
    expect(parseFileArgs("lint", ["lint", "--json"], ["--json"], "exp", "usage: lint <file...>")).toEqual({
      error: "usage: lint <file...>",
    });
  });

  it("names the empty command in the error on empty argv", () => {
    expect(parseFileArgs("lint", [], ["--json"], "exp", "use")).toEqual({
      error: "unknown command '' (expected: exp)",
    });
  });
});

describe("exitCodeFor", () => {
  it("is 0 when every report is ok", () => {
    expect(exitCodeFor([{ path: "a", ok: true }, { path: "b", ok: true }])).toBe(0);
  });

  it("is 1 when any report is not ok", () => {
    expect(exitCodeFor([{ path: "a", ok: true }, { path: "b", ok: false }])).toBe(1);
  });

  it("is 0 for an empty batch", () => {
    expect(exitCodeFor([])).toBe(0);
  });
});

describe("parseErrorLine", () => {
  it("renders the invalid-file line with path and reason", () => {
    expect(parseErrorLine({ path: "bad.json", ok: false, parseError: "Unexpected token" })).toBe(
      "ERROR bad.json: invalid JSON - Unexpected token",
    );
  });
});
