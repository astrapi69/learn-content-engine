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
  const prefix: Record<"exercise" | "card" | "pair" | "blank" | "option", string> = {
    exercise: "ex",
    card: "card",
    pair: "pair",
    blank: "blank",
    option: "opt",
  };
  return (kind: "exercise" | "card" | "pair" | "blank" | "option"): string =>
    `${prefix[kind]}-test${String(++counter).padStart(4, "0")}`;
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

describe("mintStableIds: several elements in real repo shape", () => {
  // Regression for the scanner bug the coverage ratchet caught on the first
  // real wave: after a string VALUE the pending key stayed set, so the NEXT
  // object inherited that key instead of its array index, its path no longer
  // matched, and only the first card plus one lucky exercise were minted.
  const MULTI = `{
  "id": "01-demo",
  "title": "Demo",
  "cards": [
    { "id": "c1", "front": "f1", "back": "b1" },
    { "id": "c2", "front": "f2", "back": "b2" },
    { "id": "c3", "front": "f3", "back": "b3" }
  ],
  "steps": [
    { "id": "t1", "type": "theory", "body": "text" },
    {
      "id": "s1",
      "type": "exercise",
      "exercise": { "id": "e1", "type": "free_text", "prompt": "p1", "accept": ["a"] }
    },
    {
      "id": "s2",
      "type": "exercise",
      "exercise": { "id": "e2", "type": "free_text", "prompt": "p2", "accept": ["a"] }
    }
  ]
}
`;

  it("mints EVERY card and EVERY exercise, not just the first", () => {
    const report = mintStableIds(MULTI, "01-demo.json", minter);
    expect(report.minted).toBe(5);
    const after = JSON.parse(report.newText ?? "") as {
      cards: { stable_id?: string }[];
      steps: { exercise?: { stable_id?: string } }[];
    };
    expect(after.cards.every((card) => Boolean(card.stable_id))).toBe(true);
    expect(
      after.steps.filter((step) => step.exercise).every((step) => Boolean(step.exercise?.stable_id)),
    ).toBe(true);
  });

  it("leaves theory steps and the lesson itself untouched", () => {
    const report = mintStableIds(MULTI, "01-demo.json", minter);
    const after = JSON.parse(report.newText ?? "") as {
      stable_id?: string;
      steps: { stable_id?: string }[];
    };
    expect(after.stable_id).toBeUndefined();
    expect(after.steps.every((step) => step.stable_id === undefined)).toBe(true);
  });

  it("mints unique ids (a shared id would collapse two elements into one)", () => {
    const report = mintStableIds(MULTI, "01-demo.json", minter);
    const after = JSON.parse(report.newText ?? "") as {
      cards: { stable_id: string }[];
      steps: { exercise?: { stable_id: string } }[];
    };
    const ids = [
      ...after.cards.map((card) => card.stable_id),
      ...after.steps.filter((step) => step.exercise).map((step) => step.exercise!.stable_id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("mintStableIds: completeness is asserted, not assumed", () => {
  // The add-only proof answers "did anything ELSE move?" - never "was
  // everything eligible actually minted?". That is why 2 of 8 could pass as a
  // success. The regression test for that bug closed the case, not the class:
  // a future scanner gap that mints 7 of 8 would need a matching fixture to
  // show. So the tool now derives the eligible count structurally (from the
  // parsed lesson) and compares it against what the byte scanner produced.
  const TWO_CARDS = `{
  "id": "01-demo",
  "title": "Demo",
  "cards": [
    { "id": "c1", "front": "f1", "back": "b1" },
    { "id": "c2", "front": "f2", "back": "b2" }
  ],
  "steps": []
}
`;

  it("reports how many ids were eligible alongside how many were minted", () => {
    const report = mintStableIds(TWO_CARDS, "01-demo.json", minter);
    expect(report.eligible).toBe(2);
    expect(report.minted).toBe(2);
    expect(report.ok).toBe(true);
  });

  it("fails instead of succeeding when the minter covers only part of them", () => {
    // A scanner that finds fewer targets than the lesson has eligible
    // elements is the shape of the 0.16.0 bug. It must be a failure, whatever
    // the fixtures look like.
    const partial = mintStableIds(TWO_CARDS, "01-demo.json", minter, {
      findTargetsLimit: 1,
    });
    expect(partial.ok).toBe(false);
    expect(partial.minted).toBe(0);
    expect(partial.newText).toBeUndefined();
    expect(partial.parseError).toContain("1 of 2");
  });

  it("an already fully minted lesson is complete with zero eligible", () => {
    const first = mintStableIds(TWO_CARDS, "01-demo.json", minter);
    const second = mintStableIds(first.newText ?? "", "01-demo.json", minter);
    expect(second.eligible).toBe(0);
    expect(second.minted).toBe(0);
    expect(second.ok).toBe(true);
  });

  it("counts a partially minted lesson's REMAINING elements as eligible", () => {
    const partiallyMinted = TWO_CARDS.replace('"id": "c1",', '"id": "c1", "stable_id": "card-vorhanden1",');
    const report = mintStableIds(partiallyMinted, "01-demo.json", minter);
    expect(report.eligible).toBe(1);
    expect(report.minted).toBe(1);
  });
});

describe("mintStableIds: pairs/blanks/options (engine#91 Phase 2)", () => {
  const PRETTY_SUB = `{
  "id": "03-sub",
  "title": "Sub-elements",
  "cards": [],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "m1",
        "type": "matching",
        "prompt": "p",
        "pairs": [
          { "left": "a", "right": "b" },
          { "left": "c", "right": "d" }
        ]
      }
    },
    {
      "id": "s2",
      "type": "exercise",
      "exercise": {
        "id": "c1",
        "type": "cloze",
        "cloze_mode": "type",
        "prompt": "p",
        "sentence": "___ ___",
        "blanks": [
          { "accept": ["x"] },
          { "accept": ["y"] }
        ]
      }
    },
    {
      "id": "s3",
      "type": "exercise",
      "exercise": {
        "id": "mc1",
        "type": "multiple_choice",
        "prompt": "p",
        "options": [
          { "text": "a", "correct": true },
          { "text": "b" }
        ]
      }
    }
  ]
}
`;

  const INLINE_SUB = `{
  "id": "04-sub-inline",
  "title": "Sub-elements inline",
  "cards": [],
  "steps": [
    { "id": "s1", "type": "exercise", "exercise": { "id": "m1", "type": "matching", "prompt": "p", "pairs": [{ "left": "a", "right": "b" }] } }
  ]
}
`;

  it("mints every pair, blank and option alongside exercises/cards", () => {
    const report = mintStableIds(PRETTY_SUB, "03-sub.json", minter);
    expect(report.ok).toBe(true);
    expect(report.eligible).toBe(9);
    expect(report.minted).toBe(9);
    const after = JSON.parse(report.newText ?? "") as {
      steps: {
        exercise: { pairs?: { stable_id?: string }[]; blanks?: { stable_id?: string }[]; options?: { stable_id?: string }[] };
      }[];
    };
    expect(after.steps[0]!.exercise.pairs!.every((pair) => pair.stable_id)).toBe(true);
    expect(after.steps[1]!.exercise.blanks!.every((blank) => blank.stable_id)).toBe(true);
    expect(after.steps[2]!.exercise.options!.every((option) => option.stable_id)).toBe(true);
  });

  it("stays add-only: everything except the new stable_ids is byte-identical modulo formatting", () => {
    const report = mintStableIds(PRETTY_SUB, "03-sub.json", minter);
    const strip = (text: string) =>
      JSON.parse(
        JSON.stringify(JSON.parse(text), (key, value) => (key === "stable_id" ? undefined : value)),
      );
    expect(strip(report.newText ?? "")).toEqual(strip(PRETTY_SUB));
  });

  it("inline style: inserts inline and keeps the one-line object", () => {
    const report = mintStableIds(INLINE_SUB, "04-sub-inline.json", minter);
    expect(report.ok).toBe(true);
    expect(report.minted).toBe(2);
    const after = report.newText ?? "";
    expect(after.split("\n").length).toBe(INLINE_SUB.split("\n").length);
    expect(after).toContain('"right": "b", "stable_id": "');
  });

  it("the minted lesson passes validateLesson under schema 1.12", () => {
    const report = mintStableIds(PRETTY_SUB, "03-sub.json", minter);
    const checked = validateLesson(JSON.parse(report.newText ?? ""));
    expect(checked.errors).toEqual([]);
    expect(checked.valid).toBe(true);
  });

  it("keeps an existing sub-element stable_id verbatim and only mints the rest", () => {
    const partiallyMinted = PRETTY_SUB.replace(
      '{ "left": "a", "right": "b" }',
      '{ "left": "a", "right": "b", "stable_id": "pair-vorhanden1" }',
    );
    const report = mintStableIds(partiallyMinted, "03-sub.json", minter);
    expect(report.eligible).toBe(8);
    expect(report.minted).toBe(8);
    expect(report.newText).toContain('"pair-vorhanden1"');
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
    expect(output.text).toContain("dry run");
    expect(output.exitCode).toBe(0);
  });
});
