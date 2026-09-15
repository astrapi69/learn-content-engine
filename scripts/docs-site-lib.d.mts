/** Type surface of docs-site-lib.mjs for the Vitest suite (src/docs-site.test.ts). */

export interface DocsIndexPage {
  file: string;
  title: string;
}

export function rewriteDocLink(href: string): string;
export function docTitle(markdown: string, stem: string): string;
export function renderDocPage(markdown: string, stem: string): string;
export function renderDocsIndex(pages: DocsIndexPage[]): string;
