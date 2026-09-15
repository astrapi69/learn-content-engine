/**
 * Pure functions behind ``scripts/build-docs-site.mjs`` (engine#152): how a
 * Markdown link becomes a site link, how a page and the index are rendered.
 * Kept free of file I/O so ``src/docs-site.test.ts`` can pin the decisions.
 *
 * Published set: the top-level ``docs/*.md`` only. Links into anything else
 * (repository files, ``docs/blog``, ``docs/proposals``) point at GitHub, and
 * ``../schema/*.json`` stays relative because the site serves ``/schema`` at
 * exactly that path (the schema ``$id`` URLs).
 */

import { Marked } from "marked";

const GITHUB_BLOB = "https://github.com/astrapi69/learn-content-engine/blob/main/";
const MERMAID_SCRIPT =
  '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>\n' +
  "<script>mermaid.initialize({ startOnLoad: true });</script>";

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; }
  code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.95em; }
  pre { background: #f6f6f6; padding: 0.8em 1em; overflow-x: auto; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  pre.mermaid { background: none; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 0.3em 0.6em; vertical-align: top; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #444; }
  nav { font-size: 0.9em; color: #666; }
`;

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Text content for a mermaid container: only what would break parsing as HTML. */
function escapeDiagram(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

function splitAnchor(href) {
  const hash = href.indexOf("#");
  return hash === -1 ? [href, ""] : [href.slice(0, hash), href.slice(hash)];
}

/** Rewrite one Markdown link target for the rendered site. */
export function rewriteDocLink(href) {
  if (href === "" || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const [path, anchor] = splitAnchor(href);
  if (path.startsWith("../schema/")) return href;
  if (path.startsWith("../")) return `${GITHUB_BLOB}${path.slice(3)}${anchor}`;
  if (path.includes("/")) return `${GITHUB_BLOB}docs/${path}${anchor}`;
  if (path.endsWith(".md")) return `${path.slice(0, -3)}.html${anchor}`;
  return href;
}

/** GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens. */
function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** The first H1's text (Markdown emphasis stripped), or the file stem. */
export function docTitle(markdown, stem) {
  const match = markdown.match(/^#\s+(.+?)\s*#*\s*$/m);
  if (!match) return stem;
  return match[1].replaceAll("*", "").replaceAll("`", "").trim();
}

function markedForPage() {
  const seenSlugs = new Map();
  return new Marked({
    walkTokens(token) {
      if (token.type === "link") token.href = rewriteDocLink(token.href);
    },
    renderer: {
      code(token) {
        if (token.lang !== "mermaid") return false;
        return `<pre class="mermaid">${escapeDiagram(token.text)}</pre>\n`;
      },
      heading(token) {
        const base = githubSlug(token.text);
        const count = seenSlugs.get(base) ?? 0;
        seenSlugs.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
    },
  });
}

function document(title, body, extraHead = "") {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${PAGE_STYLE}</style>`,
    extraHead,
    "</head>",
    "<body>",
    '<nav><a href="../">learn-content-engine</a> / <a href="./">docs</a></nav>',
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** Render one docs page to a complete HTML document. */
export function renderDocPage(markdown, stem) {
  const body = markedForPage().parse(markdown);
  const extraHead = /```mermaid/.test(markdown) ? MERMAID_SCRIPT : "";
  return document(docTitle(markdown, stem), body, extraHead);
}

/** Render the docs index: one link per page, by title. */
export function renderDocsIndex(pages) {
  const items = pages.map((page) => `<li><a href="${page.file}">${escapeHtml(page.title)}</a></li>`);
  const body = ["<h1>learn-content-engine documentation</h1>", "<ul>", ...items, "</ul>"].join("\n");
  return document("learn-content-engine documentation", body);
}
