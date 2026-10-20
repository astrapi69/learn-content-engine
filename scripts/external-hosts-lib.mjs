/**
 * Report resources the browser would fetch from a third-party host
 * (engine#272).
 *
 * A copy, for a reason: the rules come from bibliogon's
 * ``scripts/check_external_hosts.py`` (astrapi69/bibliogon#874, commit
 * 3a92b3a7), a repository script that no other repository can depend on.
 * astrapi69/bibliogon#1124 (open) proposes one shared, versioned scanner for
 * bibliogon, this repository and adaptive-learner; until it exists, this copy
 * names that issue, and a fix to the rules belongs in both copies. The nine
 * fetch forms #1124 lists, which the original passes, are read here.
 *
 * What it reads, file by file under the assembled site:
 *
 * - HTML pages, parsed with jsdom (a declared devDependency, the HTML
 *   standard's parser as in the browser):
 *   - ``<link>`` with a fetching rel: ``href`` and ``imagesrcset``;
 *   - ``src`` and ``srcset`` of ``script``, ``img``, ``iframe``, ``video``,
 *     ``audio``, ``source``, ``track`` and ``embed``; ``<video poster>``;
 *     ``<input type=image src>``; ``<object data>``;
 *   - ``href`` and ``xlink:href`` of the SVG elements that load what they
 *     name: ``image``, ``feImage``, ``use``, ``script``;
 *   - ``<meta http-equiv=refresh>``;
 *   - CSS ``url()`` and ``@import`` in ``<style>`` and in ``style``
 *     attributes;
 *   - the text of every ``<script>``, whatever its type (worker code is often
 *     kept in one): ``import``/``export ... from``, ``import()``,
 *     ``importScripts()``, ``new Worker()`` and ``new SharedWorker()`` with a
 *     string literal; and an import map's entries;
 *   - ``<iframe srcdoc>``, parsed as the page it is, and ``<template>``
 *     content.
 *
 *   A reference resolves as in the browser (``foreignUrl``,
 *   ``remote-url.mjs``): against the page's base URL, so a ``<base href>`` on
 *   another host makes every relative reference foreign, and by the URL
 *   standard, so ``\\host\x.js`` reads as ``//host/x.js``. CSS and JavaScript
 *   escapes are resolved first, as their parsers do.
 * - ``.css`` files: ``url()`` and ``@import``.
 * - Web manifests: icons, screenshots, shortcuts, ``start_url``, ``scope``.
 * - Service workers (by file name): ``importScripts`` and precache entries.
 *
 * Not findings: hyperlinks (``<a href>``, in SVG too), ``rel=canonical``/
 * ``alternate``, Open-Graph and other ``<meta>`` content, a JSON-LD
 * ``@context``.
 *
 * Not read, so never reported: JavaScript beyond the loads above. The scan
 * reads files and runs nothing. ``.js`` files other than service workers are
 * skipped (a provider base URL in a bundle is a string, not a fetch), and a
 * request a script makes at runtime (``fetch()``, an injected element, a URL
 * the code assembles, an event handler) is not in any file. Only a browser
 * loading the pages shows those; this repository runs no such capture, the
 * one for engine#272 was measured once in its pull request. Markup the list
 * above does not name is not read either, for example ``<frame>``, a legacy
 * ``background`` attribute, speculation rules or a CSS ``image-set()``
 * string.
 *
 * Where the port differs: jsdom parses the HTML instead of Python's
 * ``html.parser``; the original's ``--sources`` mode reads a Vite frontend's
 * sources, which this repository does not have. The CLI
 * (``check-external-hosts.mjs``) adds this repository's floor rule.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { URL } from "node:url";

import { JSDOM, VirtualConsole } from "jsdom";

import { OWN_SITE, foreignUrl } from "./remote-url.mjs";

/** ``host -> reason``. Empty on purpose: the Pages site needs nothing from a
 *  third party (engine#272). An entry here is a decision with a reason, not a
 *  way to make the check pass. */
export const ALLOWED_HOSTS = Object.freeze({});

const FETCHING_LINK_RELS = new Set([
  "stylesheet",
  "icon",
  "apple-touch-icon",
  "apple-touch-icon-precomposed",
  "mask-icon",
  "manifest",
  "preload",
  "prefetch",
  "modulepreload",
  "preconnect",
  "dns-prefetch",
  "prerender",
]);
const SRC_TAGS = new Set(["script", "img", "iframe", "video", "audio", "source", "track", "embed"]);
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
/** SVG elements that load what their href names; an SVG ``<a>`` is a hyperlink. */
const SVG_FETCHING_TAGS = new Set(["image", "feImage", "use", "script"]);

/** A CSS escape: up to six hex digits and the one whitespace that may end them, or the escaped character itself. */
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|([\s\S]))/gi;
/** The same escape inside a larger pattern, its groups not captured. */
const CSS_ESCAPED = String.raw`\\(?:[0-9a-f]{1,6}[ \t\n\r\f]?|[\s\S])`;
/** A CSS ``url()`` value, quoted or bare, and an ``@import`` string; CSS escapes still in. */
const CSS_URL = new RegExp(
  String.raw`url\(\s*(?:"((?:[^"\\]|${CSS_ESCAPED})*)"|'((?:[^'\\]|${CSS_ESCAPED})*)'|((?:[^"'()\\\s]|${CSS_ESCAPED})+))`,
  "gi",
);
const CSS_IMPORT = new RegExp(String.raw`@import\s+(?:"((?:[^"\\]|${CSS_ESCAPED})*)"|'((?:[^'\\]|${CSS_ESCAPED})*)')`, "gi");

/** A JavaScript string literal: "...", '...', or a template literal without substitutions. */
const JS_STRING = String.raw`(?:"((?:[^"\\\n]|\\[\s\S])*)"|'((?:[^'\\\n]|\\[\s\S])*)'|\x60((?:[^\x60\\$]|\\[\s\S]|\$(?!\{))*)\x60)`;
/** The keyword itself, not a property (``loader.import``) or a longer name (``reimport``). */
const KEYWORD = String.raw`(?<![\w$.])`;
/** Whitespace and block comments, such as a bundler's webpackIgnore hint. */
const GAP = String.raw`(?:\s|\/\*[\s\S]*?\*\/)*`;
/** The loads of a script that name one URL each: ``[kind, pattern]``. */
const SCRIPT_LOADS = [
  ["import", new RegExp(String.raw`${KEYWORD}(?:import|export)\s*(?:[\w$*{},\s]*?\bfrom)?${GAP}${JS_STRING}`, "g")],
  ["import()", new RegExp(String.raw`${KEYWORD}import${GAP}\(${GAP}${JS_STRING}`, "g")],
  [
    "new Worker()",
    new RegExp(String.raw`${KEYWORD}new\s+(?:Shared)?Worker${GAP}\(${GAP}(?:new\s+URL${GAP}\(${GAP})?${JS_STRING}`, "g"),
  ],
];
/** ``importScripts`` takes several URLs: its argument list of string literals. */
const IMPORT_SCRIPTS = new RegExp(String.raw`${KEYWORD}importScripts${GAP}\(\s*((?:${JS_STRING}\s*,\s*)*${JS_STRING})`, "g");
const JS_STRINGS = new RegExp(JS_STRING, "g");
/** A JavaScript escape: \xHH, \uHHHH, \u{H...}, or the escaped character itself. */
const JS_ESCAPE = /\\(?:x([0-9a-f]{2})|u([0-9a-f]{4})|u\{([0-9a-f]+)\}|([\s\S]))/gi;

const SW_IMPORT = /importScripts\(\s*['"]((?:https?:)?\/\/[^'"]+)['"]/g;
const SW_PRECACHE = /["']?url["']?\s*:\s*["']((?:https?:)?\/\/[^"']+)["']/g;
const REFRESH_URL = /url\s*=\s*['"]?([^'";]+)/i;
const SERVICE_WORKER_NAMES = new Set(["sw.js", "registerSW.js"]);

/** The host a URL names; "" when it names none that can be read (as in the original). */
function hostOf(url) {
  try {
    return new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
  } catch {
    return "";
  }
}

/** The character a numeric escape names; U+FFFD for zero, a surrogate or past U+10FFFF (CSS Syntax 4.3.7). */
function characterOf(hex) {
  const codePoint = Number.parseInt(hex, 16);
  const valid = codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
  return String.fromCodePoint(valid ? codePoint : 0xfffd);
}

/** A CSS string or ``url()`` value with its escapes resolved. */
function cssUnescape(text) {
  return text.replace(CSS_ESCAPE, (_, hex, character) => (hex === undefined ? character : characterOf(hex)));
}

/** A JavaScript string literal's value with its escapes resolved. */
function jsUnescape(text) {
  return text.replace(JS_ESCAPE, (_, byte, unit, codePoint, character) => {
    const hex = byte ?? unit ?? codePoint;
    return hex === undefined ? character : characterOf(hex);
  });
}

/** The value of the one alternative that matched, among a pattern's capture groups. */
function matchedValue(groups) {
  return groups.find((group) => group !== undefined) ?? "";
}

/** The page context of a file of the site: its own URL is its base URL. */
function ownPage(file) {
  const pageUrl = new URL(file.split("/").map(encodeURIComponent).join("/"), OWN_SITE).href;
  return { file, pageUrl, baseUrl: pageUrl, prefix: "" };
}

/**
 * The finding for one reference on ``page``, or null when it stays on the
 * site. A reference foreign on its own is reported as written; one that a
 * ``<base href>`` on another host makes foreign is reported resolved.
 */
function referenceFinding(page, kind, reference) {
  if (typeof reference !== "string" || reference.trim() === "") return null;
  const direct = foreignUrl(reference, page.pageUrl);
  if (direct) return { file: page.file, kind: `${page.prefix}${kind}`, url: reference.trim(), host: direct.host };
  const viaBase = foreignUrl(reference, page.baseUrl);
  if (viaBase) return { file: page.file, kind: `${page.prefix}${kind} via <base href>`, url: viaBase.href, host: viaBase.host };
  return null;
}

/** Findings for the foreign ones among ``references``; empty, local and non-string values are skipped. */
function referenceFindings(page, kind, references) {
  return references.map((reference) => referenceFinding(page, kind, reference)).filter((found) => found !== null);
}

/** One finding per line of the report: ``file: kind -> url``. */
export function describeFinding(found) {
  return `${found.file}: ${found.kind} -> ${found.url}`;
}

function cssValues(css, pattern) {
  return [...css.matchAll(pattern)].map((match) => cssUnescape(matchedValue(match.slice(1))));
}

function findingsInCss(css, page, where) {
  return [
    ...referenceFindings(page, `${where} url()`, cssValues(css, CSS_URL)),
    ...referenceFindings(page, `${where} @import`, cssValues(css, CSS_IMPORT)),
  ];
}

/** The URL candidates of a ``srcset`` or ``imagesrcset`` value. */
function srcsetUrls(srcset) {
  return (srcset ?? "").split(",").map((candidate) => candidate.trim().split(/\s+/)[0]);
}

/** The loads a script names, in source order: ``{ kind, value }``. */
function scriptLoads(script) {
  const singleUrlLoads = SCRIPT_LOADS.flatMap(([kind, pattern]) =>
    [...script.matchAll(pattern)].map((match) => ({ index: match.index, kind, value: matchedValue(match.slice(1)) })),
  );
  const importScriptsLoads = [...script.matchAll(IMPORT_SCRIPTS)].flatMap((match) =>
    [...match[1].matchAll(JS_STRINGS)].map((literal) => ({
      index: match.index,
      kind: "importScripts()",
      value: matchedValue(literal.slice(1)),
    })),
  );
  return [...singleUrlLoads, ...importScriptsLoads].sort((a, b) => a.index - b.index);
}

function importMapTargets(text) {
  let importMap;
  try {
    importMap = JSON.parse(text);
  } catch {
    return [];
  }
  const isMap = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isMap(importMap)) return [];
  const scopes = isMap(importMap.scopes) ? Object.values(importMap.scopes) : [];
  return [importMap.imports, ...scopes].filter(isMap).flatMap((specifierMap) => Object.values(specifierMap));
}

function linkFindings(element, page) {
  if (element.localName !== "link") return [];
  const rels = new Set((element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  if (![...rels].some((rel) => FETCHING_LINK_RELS.has(rel))) return [];
  const kind = `<link rel=${[...rels].sort().join(" ")}`;
  return [
    ...referenceFindings(page, `${kind}>`, [element.getAttribute("href")]),
    ...referenceFindings(page, `${kind} imagesrcset>`, srcsetUrls(element.getAttribute("imagesrcset"))),
  ];
}

function srcFindings(element, page) {
  const tag = element.localName;
  if (!SRC_TAGS.has(tag)) return [];
  return [
    ...referenceFindings(page, `<${tag} src>`, [element.getAttribute("src")]),
    ...referenceFindings(page, `<${tag} srcset>`, srcsetUrls(element.getAttribute("srcset"))),
  ];
}

function posterFindings(element, page) {
  return element.localName === "video" ? referenceFindings(page, "<video poster>", [element.getAttribute("poster")]) : [];
}

/** Only an image button fetches its ``src``; every other input type ignores it. */
function inputImageFindings(element, page) {
  if (element.localName !== "input") return [];
  if ((element.getAttribute("type") ?? "").trim().toLowerCase() !== "image") return [];
  return referenceFindings(page, "<input type=image src>", [element.getAttribute("src")]);
}

function objectFindings(element, page) {
  return element.localName === "object" ? referenceFindings(page, "<object data>", [element.getAttribute("data")]) : [];
}

function svgHrefFindings(element, page) {
  const tag = element.localName;
  if (element.namespaceURI !== SVG_NS || !SVG_FETCHING_TAGS.has(tag)) return [];
  return [
    ...referenceFindings(page, `<${tag} href>`, [element.getAttribute("href")]),
    ...referenceFindings(page, `<${tag} xlink:href>`, [element.getAttributeNS(XLINK_NS, "href")]),
  ];
}

function refreshFindings(element, page) {
  if (element.localName !== "meta") return [];
  if ((element.getAttribute("http-equiv") ?? "").toLowerCase() !== "refresh") return [];
  const match = REFRESH_URL.exec(element.getAttribute("content") ?? "");
  return match ? referenceFindings(page, "<meta refresh>", [match[1]]) : [];
}

function styleElementFindings(element, page) {
  return element.localName === "style" ? findingsInCss(element.textContent ?? "", page, "css") : [];
}

function styleAttributeFindings(element, page) {
  const style = element.getAttribute("style");
  return style ? findingsInCss(style, page, `<${element.localName} style>`) : [];
}

function scriptFindings(element, page) {
  if (element.localName !== "script") return [];
  const text = element.textContent ?? "";
  if ((element.getAttribute("type") ?? "").trim().toLowerCase() === "importmap") {
    return referenceFindings(page, "<script type=importmap>", importMapTargets(text));
  }
  return scriptLoads(text).flatMap(({ kind, value }) => referenceFindings(page, `<script> ${kind}`, [jsUnescape(value)]));
}

/** An ``<iframe srcdoc>`` is a page of its own; relative references in it resolve against this page's base URL. */
function srcdocFindings(element, page) {
  if (element.localName !== "iframe" || !element.hasAttribute("srcdoc")) return [];
  return findingsInDocument(element.getAttribute("srcdoc"), { ...page, prefix: `${page.prefix}<iframe srcdoc> ` }, page.baseUrl);
}

const ELEMENT_RULES = [
  linkFindings,
  srcFindings,
  posterFindings,
  inputImageFindings,
  objectFindings,
  svgHrefFindings,
  refreshFindings,
  styleElementFindings,
  styleAttributeFindings,
  scriptFindings,
  srcdocFindings,
];

/** Elements in document order, a ``<template>``'s content included: the
 *  original's tag scanner reads those tags too. */
function* elementsOf(root) {
  for (const element of root.querySelectorAll("*")) {
    yield element;
    if (element.localName === "template") yield* elementsOf(element.content);
  }
}

/** The findings of one HTML document whose own URL is ``documentUrl``; ``page`` names the file and the kind prefix. */
function findingsInDocument(html, page, documentUrl) {
  // A silent console: jsdom reports CSS it cannot parse, which is not a finding.
  const dom = new JSDOM(html, { url: documentUrl, virtualConsole: new VirtualConsole() });
  try {
    const inDocument = { ...page, baseUrl: dom.window.document.baseURI };
    return [...elementsOf(dom.window.document)].flatMap((element) => ELEMENT_RULES.flatMap((rule) => rule(element, inDocument)));
  } finally {
    dom.window.close();
  }
}

function findingsInHtml(html, file) {
  const page = ownPage(file);
  return findingsInDocument(html, page, page.pageUrl);
}

function findingsInStylesheet(css, file) {
  return findingsInCss(css, ownPage(file), "css");
}

function findingsInServiceWorker(script, file) {
  const page = ownPage(file);
  return [
    ...referenceFindings(page, "sw importScripts", [...script.matchAll(SW_IMPORT)].map((match) => match[1])),
    ...referenceFindings(page, "sw precache entry", [...script.matchAll(SW_PRECACHE)].map((match) => match[1])),
  ];
}

function findingsInWebManifest(text, file) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return [];
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return [];
  const page = ownPage(file);
  const listed = ["icons", "screenshots", "shortcuts"].flatMap((key) =>
    (Array.isArray(manifest[key]) ? manifest[key] : []).flatMap((entry) =>
      ["src", "url"].flatMap((field) =>
        referenceFindings(page, `manifest ${key}[].${field}`, [entry !== null && typeof entry === "object" ? entry[field] : null]),
      ),
    ),
  );
  const own = ["start_url", "scope"].flatMap((field) => referenceFindings(page, `manifest ${field}`, [manifest[field]]));
  return [...listed, ...own];
}

function isServiceWorker(name) {
  return SERVICE_WORKER_NAMES.has(name) || name.startsWith("workbox-") || name.endsWith("-sw.js");
}

/** The scanner for one file of the site; null for a file this scan does not read. */
function scannerFor(file) {
  const name = basename(file);
  const suffix = extname(name).toLowerCase();
  if (suffix === ".html" || suffix === ".htm") return findingsInHtml;
  if (suffix === ".css") return findingsInStylesheet;
  if (suffix === ".webmanifest" || name === "manifest.json") return findingsInWebManifest;
  if (suffix === ".js" && isServiceWorker(name)) return findingsInServiceWorker;
  return null;
}

/** Every file under ``root`` as a "/"-separated relative path; ``node_modules`` is skipped. */
function filesUnder(root, dir = "") {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : filesUnder(root, path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * The third-party references under ``root`` in the forms this module reads
 * (its docstring lists them), the host of ``origin`` excluded, with the files
 * that were read (sorted relative paths). JavaScript is read for those forms,
 * never run: a request a script assembles at runtime is not among the
 * findings. Throws when ``root`` cannot be read.
 */
export function scanSite(root, origin) {
  const ownHost = origin ? hostOf(origin) || null : null;
  const scanned = [];
  const findings = [];
  for (const file of filesUnder(root).sort()) {
    const scanner = scannerFor(file);
    if (scanner === null) continue;
    scanned.push(file);
    findings.push(...scanner(readFileSync(join(root, file), "utf8"), file));
  }
  return { scanned, findings: findings.filter((found) => found.host !== ownHost) };
}

/** Findings whose host is not allowlisted. Throws on an entry with a blank reason. */
export function unallowed(findings, allowed) {
  for (const [host, reason] of Object.entries(allowed)) {
    if (!reason.trim()) throw new Error(`ALLOWED_HOSTS[${JSON.stringify(host)}] has no reason`);
  }
  return findings.filter((found) => !Object.hasOwn(allowed, found.host));
}
