import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Internal-link consistency across the docs. Every relative markdown link in the
 * README, CONTRIBUTING and docs/ must resolve to an existing file, and every
 * ``#anchor`` must resolve to a heading in the target file. Keeps the doc tree
 * from rotting as files move or headings get renamed.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const DOC_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/getting-started.md",
  "docs/concepts.md",
  "docs/lesson-format.md",
  "docs/validation.md",
  "docs/architecture.md",
  "docs/extensions.md",
];

/** GitHub-style heading slug. */
const slugify = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

const headingSlugs = (absPath: string): Set<string> => {
  const slugs = new Set<string>();
  for (const match of readFileSync(absPath, "utf8").matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    slugs.add(slugify(match[1]!));
  }
  return slugs;
};

const isExternal = (target: string): boolean => /^(https?:|mailto:|tel:|#!|\/\/)/.test(target);

interface Link {
  sourceFile: string;
  target: string;
  filePart: string;
  anchor: string;
}

function collectLinks(): Link[] {
  const links: Link[] = [];
  for (const docFile of DOC_FILES) {
    const content = readFileSync(resolve(repoRoot, docFile), "utf8");
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1]!;
      if (isExternal(target)) continue;
      const [filePart, anchor = ""] = target.split("#");
      links.push({ sourceFile: docFile, target, filePart: filePart!, anchor });
    }
  }
  return links;
}

const links = collectLinks();

describe("docs — internal link consistency", () => {
  it("scans a non-trivial number of internal links", () => {
    expect(links.length).toBeGreaterThanOrEqual(15);
  });

  for (const link of links) {
    it(`${link.sourceFile} → ${link.target} resolves`, () => {
      const baseDir = dirname(resolve(repoRoot, link.sourceFile));
      const targetPath = link.filePart === "" ? resolve(repoRoot, link.sourceFile) : resolve(baseDir, link.filePart);
      expect(existsSync(targetPath), `missing file for ${link.target}`).toBe(true);
      if (link.anchor) {
        expect(
          headingSlugs(targetPath).has(link.anchor),
          `missing anchor #${link.anchor} in ${link.filePart || link.sourceFile}`,
        ).toBe(true);
      }
    });
  }
});
