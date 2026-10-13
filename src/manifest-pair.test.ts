import { describe, expect, it } from "vitest";

import { validateManifestPair } from "./index.js";

interface EntryFields {
  [field: string]: unknown;
}

const entry = (overrides: EntryFields = {}): EntryFields => ({
  id: "example-set",
  title: "Example",
  target_language: "es",
  source_language: "en",
  level: "A1",
  version: "1.0.0",
  lesson_count: 2,
  ...overrides,
});

const rootWith = (...sets: EntryFields[]) => ({ name: "Repo", sets });
const setManifestWith = (setEntry: EntryFields) => ({ sets: [setEntry] });

const mismatches = (rootEntry: EntryFields, setEntry: EntryFields) =>
  validateManifestPair(rootWith(rootEntry), setManifestWith(setEntry)).errors.filter(
    (issue) => issue.id === "E-MANIFEST-ENTRY-MISMATCH",
  );

describe("validateManifestPair (engine#246, step 2)", () => {
  it("reports the observed title drift between the root and the set file", () => {
    const issues = mismatches(
      entry({ id: "en-a1-from-de", title: "Englisch A1 (für Deutschsprachige)" }),
      entry({ id: "en-a1-from-de", title: "Englisch A1 - Anfänger" }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "error",
      path: "/sets/0/title",
      params: {
        setId: "en-a1-from-de",
        field: "title",
        rootValue: '"Englisch A1 (für Deutschsprachige)"',
        setValue: '"Englisch A1 - Anfänger"',
      },
    });
  });

  it("is silent when both entries agree", () => {
    // A field both files may carry; an identical description is the one
    // agreeing field that still warns (W-MANIFEST-DESCRIPTION-COPY, below).
    const result = validateManifestPair(rootWith(entry({ tags: ["same"] })), setManifestWith(entry({ tags: ["same"] })));

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("reports one warning per differing field, in field order", () => {
    const issues = mismatches(
      entry({ description: "Long", tags: ["a"], visibility: "hidden" }),
      entry({ description: "Short", tags: ["b"], visibility: "visible" }),
    );

    expect(issues.map((issue) => issue.params?.["field"])).toEqual(["description", "tags", "visibility"]);
  });

  it.each([
    ["absent in the set file", entry({ visibility: "hidden" }), entry()],
    ["absent at the root", entry(), entry({ description: "Only here" })],
    ["null in the set file", entry({ description: "Root text" }), entry({ description: null })],
    [
      "a nested null against an absent key",
      entry({ book: { title: "A Book", url: null, cover_image: null } }),
      entry({ book: { title: "A Book" } }),
    ],
  ])("treats a field that is %s as silent, not as a difference", (_label, rootEntry, setEntry) => {
    expect(mismatches(rootEntry, setEntry)).toEqual([]);
  });

  it.each([
    ["key order inside an object", { title: "A Book", author: "X" }, { author: "X", title: "A Book" }, 0],
    ["a nested value", { title: "A Book", author: "X" }, { title: "A Book", author: "Y" }, 1],
  ])("compares nested values by content: %s", (_label, rootBook, setBook, expected) => {
    expect(mismatches(entry({ book: rootBook }), entry({ book: setBook }))).toHaveLength(expected);
  });

  it("finds the root entry by the set's id among several", () => {
    const result = validateManifestPair(
      rootWith(entry({ id: "other", title: "Other" }), entry({ title: "Root title" })),
      setManifestWith(entry({ title: "Set title" })),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.params?.["setId"]).toBe("example-set");
  });

  it.each([
    ["the root does not list the set", rootWith(entry({ id: "other" })), setManifestWith(entry())],
    ["the set manifest has no entry", rootWith(entry()), { sets: [] }],
    ["the set manifest is not an object", rootWith(entry()), null],
    ["the root manifest is not an object", "not a manifest", setManifestWith(entry())],
  ])("reports nothing when %s (other checks own that)", (_label, rootManifest, setManifest) => {
    expect(validateManifestPair(rootManifest, setManifest)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("blocks: a disagreement makes the result invalid (engine#246, step 3)", () => {
    const result = validateManifestPair(rootWith(entry({ title: "A" })), setManifestWith(entry({ title: "B" })));

    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors.map((issue) => issue.id)).toEqual(["E-MANIFEST-ENTRY-MISMATCH"]);
  });

});

describe("W-MANIFEST-DESCRIPTION-COPY: the description lives in the root entry", () => {
  const descriptionCopies = (rootEntry: EntryFields, setEntry: EntryFields) =>
    validateManifestPair(rootWith(rootEntry), setManifestWith(setEntry)).warnings.filter(
      (issue) => issue.id === "W-MANIFEST-DESCRIPTION-COPY",
    );

  it("warns about an identical copy, which the mismatch error lets through", () => {
    // The reproduction (adaptive-learner-content-test#110): both files carried
    // the same text, so E-MANIFEST-ENTRY-MISMATCH stayed silent although the
    // field has one home.
    const result = validateManifestPair(
      rootWith(entry({ description: "A set." })),
      setManifestWith(entry({ description: "A set." })),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      id: "W-MANIFEST-DESCRIPTION-COPY",
      severity: "warning",
      path: "/sets/0/description",
      params: { setId: "example-set" },
    });
  });

  it("stays silent when only the root entry carries it", () => {
    expect(descriptionCopies(entry({ description: "A set." }), entry())).toEqual([]);
  });

  it("warns when only the set manifest carries it: it belongs in the root entry", () => {
    expect(descriptionCopies(entry(), entry({ description: "A set." }))).toHaveLength(1);
  });

  it("adds to the mismatch error when the copy differs, without hiding it", () => {
    const result = validateManifestPair(
      rootWith(entry({ description: "Root text." })),
      setManifestWith(entry({ description: "Set text." })),
    );

    expect(result.errors.map((issue) => issue.id)).toEqual(["E-MANIFEST-ENTRY-MISMATCH"]);
    expect(result.warnings.map((issue) => issue.id)).toEqual(["W-MANIFEST-DESCRIPTION-COPY"]);
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
  ])("treats %s as saying nothing", (_label, value) => {
    expect(descriptionCopies(entry({ description: "A set." }), entry({ description: value }))).toEqual([]);
  });

  it("leaves the other root-owned fields alone: a repeated title is allowed", () => {
    const result = validateManifestPair(rootWith(entry({ visibility: "hidden" })), setManifestWith(entry({ visibility: "hidden" })));

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });
});
