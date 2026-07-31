import { describe, it, expect } from "vitest";

import {
  formatMintReports,
  mintStableIds,
  parseMintArgs,
} from "./mint-stable-ids.js";
import { validateLesson } from "./validate.js";

/**
 * The minting tool for the engine#90 retrofit waves. The hard property is
 * ADD-ONLY: existing ids, content and FORMATTING stay byte-identical, only
 * `stable_id` members are inserted, because the whole no-migration argument
 * rests on old and new identity coexisting in one file. Pretty-printed and
 * inline-array lessons (the ansible style) must both survive untouched.
 */

const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/;

/** Deterministic minter for tests. */
const minter = (() => {
  let counter = 0;
  return (kind: "exercise" | "card"): string =>
    `${kind === "card" ? "card" : "ex"}-test${String(++counter).padStart(4, "0")}`;
})();

const PRETTY = `{
  "id": "01-demo",
  "title": "Demo",
  "cards": [
    {
      "id": "c1",
      "front": "f",
      "back": "b"
    }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "free_text",
        "prompt": "p",
        "accept": ["a"]
      }
    }
  ]
}
`;

const INLINE = `{
  "id": "02-inline",
  "title": "Inline",
  "cards": [
    { "id": "c1", "front": "f", "back": "b", "tags": ["x"] }
  ],
  "steps": [
    { "id": "s1", "type": "exercise", "exercise": { "id": "e1", "type": "free_text", "prompt": "p", "accept": ["a"] } }
  ]
}
`;

describe("mintStableIds", () => {
  it("mints for every exercise and card and stays parse-equal modulo stable_id", () => {
    const report = mintStableIds(PRETTY, "01-demo.json", minter);
    expect(report.ok).toBe(true);
    expect(report.minted).toBe(2);
    const after = JSON.parse(report.newText ?? "") as {
      cards: { stable_id?: string }[];
      steps: { exercise?: { stable_id?: string } }[];
    };
    expect(after.cards[0]?.stable_id).toMatch(STABLE_ID_PATTERN);
    expect(after.steps[0]?.exercise?.stable_id).toMatch(STABLE_ID_PATTERN);
    const strip = (text: string) =>
      JSON.parse(
        JSON.stringify(JSON.parse(text), (key, value) => (key === "stable_id" ? undefined : value)),
      );
    expect(strip(report.newText ?? "")).toEqual(strip(PRETTY));
  });

  it("pretty style: every changed line is an ADDED stable_id line", () => {
    const report = mintStableIds(PRETTY, "01-demo.json", minter);
    const before = PRETTY.split("\n");
    const after = (report.newText ?? "").split("\n");
    expect(after.length).toBe(before.length + 2);
    const added = after.filter((line) => !before.includes(line));
    expect(added).toHaveLength(2);
    for (const line of added) {
      expect(line).toMatch(/^\s+"stable_id": "[a-z0-9_-]+",$/);
    }
  });

  it("inline style (ansible-like) keeps the one-line objects and inserts inline", () => {
    const report = mintStableIds(INLINE, "02-inline.json", minter);
    expect(report.ok).toBe(true);
    expect(report.minted).toBe(2);
    const after = report.newText ?? "";
    expect(after.split("\n").length).toBe(INLINE.split("\n").length);
    expect(after).toContain('{ "id": "c1", "stable_id": "');
    expect(after).toContain('"tags": ["x"] }');
  });

  it("does not touch the lesson id or step ids", () => {
    const report = mintStableIds(PRETTY, "01-demo.json", minter);
    const after = JSON.parse(report.newText ?? "") as {
      stable_id?: string;
      steps: { stable_id?: string }[];
    };
    expect(after.stable_id).toBeUndefined();
    expect(after.steps[0]?.stable_id).toBeUndefined();
  });

  it("is idempotent: a second run mints nothing and returns no newText", () => {
    const first = mintStableIds(PRETTY, "01-demo.json", minter);
    const second = mintStableIds(first.newText ?? "", "01-demo.json", minter);
    expect(second.ok).toBe(true);
    expect(second.minted).toBe(0);
    expect(second.newText).toBeUndefined();
  });

  it("keeps an existing stable_id verbatim and only fills the gaps", () => {
    const partiallyMinted = PRETTY.replace(
      '"id": "c1",',
      '"id": "c1",\n      "stable_id": "card-vorhanden1",',
    );
    const report = mintStableIds(partiallyMinted, "01-demo.json", minter);
    expect(report.minted).toBe(1);
    expect(report.newText).toContain('"card-vorhanden1"');
  });

  it("the minted lesson passes validateLesson under schema 1.9", () => {
    const report = mintStableIds(PRETTY, "01-demo.json", minter);
    const checked = validateLesson(JSON.parse(report.newText ?? ""));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("reports invalid JSON instead of throwing", () => {
    const report = mintStableIds("{nope", "broken.json", minter);
    expect(report.ok).toBe(false);
    expect(report.parseError).toBeTruthy();
  });
});

describe("parseMintArgs / formatMintReports", () => {
  it("parses paths and the write flag; dry-run is the default", () => {
    const parsed = parseMintArgs(["mint-stable-ids", "a.json", "--write"]);
    expect(parsed).toEqual({ paths: ["a.json"], write: true, json: false });
    const dry = parseMintArgs(["mint-stable-ids", "a.json"]);
    expect(dry).toEqual({ paths: ["a.json"], write: false, json: false });
  });

  it("mentions the dry run in the human output", () => {
    const report = mintStableIds(PRETTY, "01-demo.json", minter);
    const output = formatMintReports([report], { json: false, write: false });
    expect(output).toContain("dry run");
  });
});
