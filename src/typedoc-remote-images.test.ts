import { MarkdownEvent } from "typedoc";
import { describe, it, expect } from "vitest";

import { load, remoteImagesToAltText } from "../scripts/typedoc-plugin-remote-images.mjs";

/**
 * The local TypeDoc plugin behind the API reference (engine#272). TypeDoc
 * renders README.md into /api/index.html, badges included, and on the Pages
 * site the visitor's browser fetched them from img.shields.io and github.com
 * on every visit (on github.com and npmjs.com the same images go through the
 * platform's image proxy). A remote image in rendered Markdown becomes its
 * alt text, so a badge link stays a text link to the same target.
 */

// The README badges exactly as TypeDoc 0.28 rendered them into /api/index.html.
const NPM_BADGE =
  '<a href="https://www.npmjs.com/package/learn-content-engine">' +
  '<img src="https://img.shields.io/npm/v/learn-content-engine" alt="npm version"></a>';
const CI_BADGE =
  '<a href="https://github.com/astrapi69/learn-content-engine/actions/workflows/ci.yml">' +
  '<img src="https://github.com/astrapi69/learn-content-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>';

describe("remoteImagesToAltText", () => {
  it("turns the README badges, as TypeDoc renders them, into text links to the same targets", () => {
    expect(remoteImagesToAltText(`<p>${NPM_BADGE}\n${CI_BADGE}</p>`)).toBe(
      '<p><a href="https://www.npmjs.com/package/learn-content-engine">npm version</a>\n' +
        '<a href="https://github.com/astrapi69/learn-content-engine/actions/workflows/ci.yml">CI</a></p>',
    );
  });

  it("leaves images the site serves itself alone: relative, root-relative and data: sources", () => {
    const local =
      '<img src="media/diagram.png" alt="diagram"><img src="/learn-content-engine/x.svg" alt="x">' +
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="dot">';
    expect(remoteImagesToAltText(local)).toBe(local);
  });

  it("catches every spelling of a remote source: protocol-relative, upper case, single quotes, alt first", () => {
    expect(remoteImagesToAltText('<img src="//cdn.example.org/a.png" alt="a">')).toBe("a");
    expect(remoteImagesToAltText('<IMG SRC="HTTPS://cdn.example.org/b.png" ALT="b">')).toBe("b");
    expect(remoteImagesToAltText("<img alt='c' src='http://cdn.example.org/c.png' />")).toBe("c");
    expect(remoteImagesToAltText('<img alt="d" width=20 src=https://cdn.example.org/d.png>')).toBe("d");
  });

  it("drops a remote image without alt text (decorative in HTML terms) and keeps alt text inert", () => {
    expect(remoteImagesToAltText('x<img src="https://cdn.example.org/e.png">y')).toBe("xy");
    expect(remoteImagesToAltText('x<img src="https://cdn.example.org/e.png" alt="">y')).toBe("xy");
    expect(remoteImagesToAltText("<img src='https://cdn.example.org/f.png' alt='a <b> c'>")).toBe("a &lt;b&gt; c");
  });

  it("touches only real tags: escaped markup in a code sample and a bare URL stay as they are", () => {
    const sample = '<pre><code>&lt;img src="https://img.shields.io/x"&gt;</code></pre><p>https://img.shields.io/x</p>';
    expect(remoteImagesToAltText(sample)).toBe(sample);
    expect(remoteImagesToAltText("")).toBe("");
  });
});

describe("load (the TypeDoc plugin entry point)", () => {
  it("rewrites TypeDoc's rendered Markdown, hooked after TypeDoc's own renderer", () => {
    const hooks: { event: string; listener: (event: { parsedText: string }) => void; priority?: number }[] = [];
    load({ renderer: { on: (event, listener, priority) => hooks.push({ event, listener, priority }) } });

    expect(hooks).toHaveLength(1);
    const [hook] = hooks;
    expect(hook!.event).toBe(MarkdownEvent.PARSE);
    // TypeDoc renders Markdown to HTML in its own PARSE listener at priority
    // 0; a lower priority runs later, on the HTML.
    expect(hook!.priority).toBeLessThan(0);
    const parsed = { parsedText: `<p>${NPM_BADGE}</p>` };
    hook!.listener(parsed);
    expect(parsed.parsedText).toBe('<p><a href="https://www.npmjs.com/package/learn-content-engine">npm version</a></p>');
  });
});
