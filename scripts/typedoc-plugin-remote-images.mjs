/**
 * Local TypeDoc plugin (engine#272): a remote image in rendered Markdown
 * becomes its alt text.
 *
 * TypeDoc renders README.md into the start page of the API reference, the
 * npm and CI badges included. On github.com and npmjs.com those images load
 * through the platform's image proxy; on the Pages site the visitor's browser
 * fetched them from img.shields.io and github.com on every visit to /api/,
 * which hands both hosts the visitor's IP address. As text, "npm version" and
 * "CI" stay links to the same targets.
 *
 * Remote means an http(s) or protocol-relative source (``isRemoteUrl``, the
 * definition the third-party host gate applies too). A relative,
 * root-relative or data: source is served by the site itself and stays. A
 * remote image without alt text is decorative in HTML terms and is dropped.
 *
 * Registered in typedoc.json (``plugin``). It listens to
 * ``MarkdownEvent.PARSE`` below TypeDoc's own Markdown renderer, so it
 * rewrites the rendered HTML, not the Markdown source.
 */

import { MarkdownEvent } from "typedoc";

import { isRemoteUrl } from "./remote-url.mjs";

/** TypeDoc's markdown-it renderer listens at priority 0; lower runs later. */
const AFTER_MARKDOWN_RENDERER = -100;

/** One image start tag; a quoted attribute value may contain ">". */
const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
/** An attribute name with an optional double-quoted, single-quoted or bare value. */
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Attribute values by lower-cased name; the first of two duplicates wins, as in HTML. */
function attributesOf(imgTag) {
  const attributes = new Map();
  for (const match of imgTag.slice("<img".length).matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/** Alt text as element content: an attribute value may hold a raw "<". */
function asText(altText) {
  return altText.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * The HTML with every remote ``<img>`` replaced by its alt text (empty when
 * it has none). Images the site serves itself, and markup that is not a real
 * tag (``&lt;img ...&gt;`` in a code sample), are returned unchanged.
 */
export function remoteImagesToAltText(html) {
  return html.replace(IMG_TAG, (imgTag) => {
    const attributes = attributesOf(imgTag);
    if (!isRemoteUrl(attributes.get("src") ?? "")) return imgTag;
    return asText(attributes.get("alt") ?? "");
  });
}

/** TypeDoc plugin entry point: rewrite each rendered Markdown block. */
export function load(app) {
  app.renderer.on(
    MarkdownEvent.PARSE,
    (event) => {
      event.parsedText = remoteImagesToAltText(event.parsedText);
    },
    AFTER_MARKDOWN_RENDERER,
  );
}
