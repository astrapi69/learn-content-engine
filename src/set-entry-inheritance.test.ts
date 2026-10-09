import { describe, expect, it } from "vitest";

import {
  asContentSetEntry,
  inheritFromRootEntry,
  type ContentSetSource,
  type ParsedSet,
} from "./index.js";

const SOURCE: ContentSetSource = { source: "owner/repo", branch: "main" };

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

function project(parsed: ParsedSet) {
  return asContentSetEntry(SOURCE, parsed, null);
}

describe("inheritFromRootEntry (engine#246, step 1)", () => {
  it("keeps a set hidden at the root hidden when the set file is silent", () => {
    const root = setEntry({ visibility: "hidden" });
    const local = setEntry();

    expect(project(local).visibility).toBe("visible");
    expect(project(inheritFromRootEntry(root, local)).visibility).toBe("hidden");
  });

  it("applies the default only when both entries are silent", () => {
    const merged = inheritFromRootEntry(setEntry(), setEntry());

    expect(project(merged).visibility).toBe("visible");
    expect(project(merged).review_status).toBe("authored");
    expect(project(merged).description).toBeNull();
  });

  it.each([
    ["visibility", "hidden"],
    ["review_status", "reviewed"],
    ["description", "Same text"],
  ] as const)("keeps %s when both entries carry the same value", (field, value) => {
    const merged = inheritFromRootEntry(
      setEntry({ [field]: value }),
      setEntry({ [field]: value }),
    );

    expect(merged[field]).toBe(value);
  });

  it("keeps the set file's value when both entries carry different values", () => {
    const merged = inheritFromRootEntry(
      setEntry({ description: "Long catalog text" }),
      setEntry({ description: "Short summary" }),
    );

    expect(merged.description).toBe("Short summary");
  });

  it.each([
    ["absent", setEntry()],
    ["null", setEntry({ description: null, book: undefined, evaluation: null })],
  ])("treats a field that is %s in the set file as silent", (_label, local) => {
    const root = setEntry({
      description: "From the root",
      book: { title: "A Book" },
      evaluation: { scheme: "pass_fail", pass_percent: 60 },
    });

    const merged = inheritFromRootEntry(root, local);

    expect(merged.description).toBe("From the root");
    expect(merged.book).toEqual({ title: "A Book" });
    expect(merged.evaluation).toEqual({ scheme: "pass_fail", pass_percent: 60 });
  });

  it("keeps fields only the set file carries", () => {
    const merged = inheritFromRootEntry(setEntry(), setEntry({ tags: ["grammar"] }));

    expect(merged.tags).toEqual(["grammar"]);
  });

  it("does not mutate either entry", () => {
    const root = setEntry({ visibility: "hidden" });
    const local = setEntry();
    const rootBefore = structuredClone(root);
    const localBefore = structuredClone(local);

    inheritFromRootEntry(root, local);

    expect(root).toEqual(rootBefore);
    expect(local).toEqual(localBefore);
  });

  it("refuses two entries of different sets", () => {
    expect(() =>
      inheritFromRootEntry(setEntry({ id: "set-a" }), setEntry({ id: "set-b" })),
    ).toThrow(/set-a.*set-b/);
  });
});
