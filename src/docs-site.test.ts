import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, afterAll } from "vitest";

import { docTitle, renderDocPage, renderDocsIndex, rewriteDocLink } from "../scripts/docs-site-lib.mjs";

/**
 * The docs site build (engine#152): every top-level docs/*.md is rendered to
 * HTML for GitHub Pages. The pure functions carry the two decisions that can
 * silently break the site: how a Markdown link becomes a site link, and how
 * a mermaid fence becomes a diagram. The end-to-end run proves the script
 * writes one page per doc plus an index.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const GITHUB_BLOB = "https://github.com/astrapi69/learn-content-engine/blob/main/";

describe("rewriteDocLink", () => {
  it("turns a sibling .md link into the rendered .html page, anchor preserved", () => {
    expect(rewriteDocLink("lesson-format.md")).toBe("lesson-format.html");
    expect(rewriteDocLink("lesson-format.md#content-domains")).toBe("lesson-format.html#content-domains");
  });

  it("leaves pure anchors, absolute URLs and empty hrefs alone", () => {
    expect(rewriteDocLink("#rule-catalog")).toBe("#rule-catalog");
    expect(rewriteDocLink("https://example.org/x.md")).toBe("https://example.org/x.md");
    expect(rewriteDocLink("")).toBe("");
  });

  it("leaves ../schema/*.json alone because the site serves /schema at that path", () => {
    expect(rewriteDocLink("../schema/lesson.schema.json")).toBe("../schema/lesson.schema.json");
  });

  it("points repository files outside the published docs at GitHub", () => {
    expect(rewriteDocLink("../README.md")).toBe(`${GITHUB_BLOB}README.md`);
    expect(rewriteDocLink("../CONTRIBUTING.md#tdd")).toBe(`${GITHUB_BLOB}CONTRIBUTING.md#tdd`);
    expect(rewriteDocLink("../src/examples/ext-ref-ordering/ordering-extension.ts")).toBe(
      `${GITHUB_BLOB}src/examples/ext-ref-ordering/ordering-extension.ts`,
    );
  });

  it("points unpublished docs subfolders (blog, proposals) at GitHub", () => {
    expect(rewriteDocLink("blog/one-source-many-outputs.md")).toBe(`${GITHUB_BLOB}docs/blog/one-source-many-outputs.md`);
    expect(rewriteDocLink("proposals/discoverability.md#x")).toBe(`${GITHUB_BLOB}docs/proposals/discoverability.md#x`);
  });
});

describe("docTitle", () => {
  it("takes the first H1, falling back to the file stem", () => {
    expect(docTitle("# Extensions\n\ntext", "extensions")).toBe("Extensions");
    expect(docTitle("no heading here", "concepts")).toBe("concepts");
  });
});

describe("renderDocPage", () => {
  it("renders a full HTML document titled after the H1 with links rewritten", () => {
    const html = renderDocPage("# Concepts\n\nSee [the format](lesson-format.md#fields) and [README](../README.md).", "concepts");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Concepts</title>");
    expect(html).toContain('href="lesson-format.html#fields"');
    expect(html).toContain(`href="${GITHUB_BLOB}README.md"`);
    expect(html).not.toContain("mermaid.min.js");
  });

  it("gives headings GitHub-style ids so the anchors the docs link to resolve", () => {
    const html = renderDocPage(
      "# X\n\n## Rule catalog\n\n## Example extension: `ext:ref-hotspot`\n\n## Rule catalog\n\n### ext_payload\n",
      "x",
    );
    expect(html).toContain('<h2 id="rule-catalog">');
    expect(html).toContain('<h2 id="example-extension-extref-hotspot">');
    expect(html).toContain('<h2 id="rule-catalog-1">');
    expect(html).toContain('<h3 id="ext_payload">');
  });

  it("turns a mermaid fence into a mermaid container and loads the renderer only then", () => {
    const html = renderDocPage("# Diagrams\n\n```mermaid\nflowchart LR\n  A --> B\n```\n", "schema-diagrams");
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain("A --> B");
    expect(html).toContain("mermaid.min.js");
  });

  it("keeps other fenced code as code, not as a mermaid container", () => {
    const html = renderDocPage('# X\n\n```json\n{"id": "l1"}\n```\n', "x");
    expect(html).toContain('<code class="language-json">');
    expect(html).not.toContain('class="mermaid"');
  });
});

describe("renderDocsIndex", () => {
  it("links every page by title", () => {
    const html = renderDocsIndex([
      { file: "concepts.html", title: "Concepts" },
      { file: "extensions.html", title: "Extensions" },
    ]);
    expect(html).toContain('<a href="concepts.html">Concepts</a>');
    expect(html).toContain('<a href="extensions.html">Extensions</a>');
  });
});

describe("scripts/build-docs-site.mjs end-to-end", () => {
  const outDir = mkdtempSync(join(tmpdir(), "lce-docs-site-"));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("writes one .html per top-level docs/*.md plus an index", () => {
    execFileSync("node", [join(REPO_ROOT, "scripts/build-docs-site.mjs"), "--out", outDir], { cwd: REPO_ROOT });
    const sources = readdirSync(join(REPO_ROOT, "docs")).filter((name) => name.endsWith(".md"));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(existsSync(join(outDir, source.replace(/\.md$/, ".html")))).toBe(true);
    }
    const index = readFileSync(join(outDir, "index.html"), "utf8");
    expect(index).toContain('href="extensions.html"');
    expect(index).not.toContain("blog/");
  });
});
