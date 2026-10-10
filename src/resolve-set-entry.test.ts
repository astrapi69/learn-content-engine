import { describe, expect, it } from "vitest";

import { ROOT_OWNED_SET_FIELDS, asContentSetEntry, resolveSetEntry, type ParsedSet } from "./index.js";

function setEntry(overrides: Partial<ParsedSet> = {}): ParsedSet {
  return {
    id: "example-set",
    title: "Example",
    target_language: "es",
    source_language: "en",
    level: "A1",
    version: "1.0.0",
    lesson_count: 2,
    ...overrides,
  };
}

describe("resolveSetEntry (engine#246, step 3)", () => {
  it("takes the description from the root even when the set manifest carries another", () => {
    const resolved = resolveSetEntry(
      setEntry({ description: "Root text" }),
      setEntry({ description: "Stale set text" }),
    );

    expect(resolved.description).toBe("Root text");
  });

  it.each(ROOT_OWNED_SET_FIELDS.map((field) => [field]))("lets the root own %s", (field) => {
    const rootValues: Partial<ParsedSet> = { title: "Root", description: "Root", visibility: "hidden", review_status: "reviewed" };
    const setValues: Partial<ParsedSet> = { title: "Set", description: "Set", visibility: "visible", review_status: "generated" };

    const resolved = resolveSetEntry(setEntry(rootValues), setEntry(setValues));

    expect(resolved[field]).toBe(rootValues[field]);
  });

  it("names exactly the four discovery fields as root-owned", () => {
    expect([...ROOT_OWNED_SET_FIELDS].sort()).toEqual(["description", "review_status", "title", "visibility"]);
  });

  it("keeps the set manifest's value for a field the root does not own", () => {
    const resolved = resolveSetEntry(setEntry({ tags: ["root"], version: "1.0.0" }), setEntry({ tags: ["set"], version: "1.1.0" }));

    expect(resolved.tags).toEqual(["set"]);
    expect(resolved.version).toBe("1.1.0");
  });

  it.each([
    ["root silent, set file carries it", setEntry(), setEntry({ description: "Set text" }), "Set text"],
    ["root null, set file carries it", setEntry({ description: null }), setEntry({ description: "Set text" }), "Set text"],
    ["set file silent, root carries it", setEntry({ description: "Root text" }), setEntry(), "Root text"],
    ["both silent", setEntry(), setEntry(), undefined],
  ])("falls back across files when one is silent: %s", (_label, root, local, expected) => {
    expect(resolveSetEntry(root, local).description).toBe(expected);
  });

  it("projects a set hidden only at the root as hidden", () => {
    const resolved = resolveSetEntry(setEntry({ visibility: "hidden" }), setEntry({ visibility: "visible" }));

    expect(asContentSetEntry({ source: "owner/repo", branch: "main" }, resolved, null).visibility).toBe("hidden");
  });

  it("does not mutate either entry", () => {
    const root = setEntry({ description: "Root" });
    const local = setEntry({ description: "Set", tags: ["a"] });
    const rootBefore = structuredClone(root);
    const localBefore = structuredClone(local);

    resolveSetEntry(root, local);

    expect(root).toEqual(rootBefore);
    expect(local).toEqual(localBefore);
  });

  it("refuses two entries of different sets", () => {
    expect(() => resolveSetEntry(setEntry({ id: "set-a" }), setEntry({ id: "set-b" }))).toThrow(/set-a.*set-b/);
  });
});
