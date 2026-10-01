import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Internal-link consistency across the docs. Every relative markdown link in the
 * README, CHANGELOG, CONTRIBUTING and EVERY markdown file under docs/ (blog
 * articles in both languages and proposals included) must resolve to an
 * existing file, and every ``#anchor`` must resolve to a heading in the target
 * file. Keeps the doc tree from rotting as files move or headings get renamed.
 *
 * The file list used to be hand-kept and covered eleven files; the comparative
 * analysis, the schema diagrams, all blog articles and all proposals were
 * outside it, and a proposal kept pointing at a README heading that no longer
 * existed (found in the docs audit of 2026-10-01). It is walked now.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Every markdown file under ``dir``, as a path relative to the repo root. */
const markdownUnder = (dir: string): string[] =>
  readdirSync(resolve(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownUnder(path);
    return entry.name.endsWith(".md") ? [relative(repoRoot, resolve(repoRoot, path))] : [];
  });

const DOC_FILES = ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", ...markdownUnder("docs")];

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

  it("walks every doc folder, blog articles and proposals included", () => {
    expect(DOC_FILES).toContain("docs/blog/de/did-we-reinvent-the-wheel.md");
    expect(DOC_FILES).toContain("docs/proposals/author-ergonomics-app-track.md");
    expect(DOC_FILES).toContain("docs/comparative-analysis.md");
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
