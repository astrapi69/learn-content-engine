import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * A release section names each change once. The 0.28.0 section carried the
 * `W-CLOZE-NO-CARRIER` entry twice, the second copy a sentence shorter, and
 * shipped that way: the docs gates checked the changelog's links, not its
 * structure. Two copies of one entry are two places for the same truth, and
 * they had already started to differ.
 */

const CHANGELOG = readFileSync(fileURLToPath(new URL("../CHANGELOG.md", import.meta.url)), "utf8");

interface ReleaseSection {
  release: string;
  headings: string[];
}

/** Split the changelog into release sections (`## ...`) with their `###` headings. */
function releaseSections(markdown: string): ReleaseSection[] {
  const sections: ReleaseSection[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) sections.push({ release: line.slice(3).trim(), headings: [] });
    else if (line.startsWith("### ") && sections.length > 0) sections.at(-1)!.headings.push(line.slice(4).trim());
  }
  return sections;
}

const duplicatesIn = (headings: string[]): string[] =>
  headings.filter((heading, index) => headings.indexOf(heading) !== index);

describe("CHANGELOG structure", () => {
  const sections = releaseSections(CHANGELOG);

  it("finds release sections with headings (the scan is not blind)", () => {
    expect(sections.length).toBeGreaterThan(10);
    expect(sections.filter((section) => section.headings.length > 0).length).toBeGreaterThan(10);
  });

  it.each(sections.map((section) => [section.release, section] as const))(
    "section %s names each change once",
    (_release, section) => {
      expect(duplicatesIn(section.headings)).toEqual([]);
    },
  );

  it("detects a heading repeated within one section (seeded)", () => {
    const seeded = releaseSections("## [1.0.0]\n\n### A\n\ntext\n\n### B\n\n### A\n\n## [0.9.0]\n\n### A\n");
    expect(duplicatesIn(seeded[0]!.headings)).toEqual(["A"]);
    expect(duplicatesIn(seeded[1]!.headings)).toEqual([]);
  });
});
