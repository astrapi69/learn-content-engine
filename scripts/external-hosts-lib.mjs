/**
 * Report resources the browser would fetch from a third-party host
 * (engine#272).
 *
 * A JavaScript port of bibliogon's ``scripts/check_external_hosts.py``
 * (astrapi69/bibliogon#874, commit 3a92b3a7) with its rules unchanged. It
 * scans an assembled site for resources a browser loads on its own:
 * ``<link>`` (fetching rels only), ``<script src>``, ``<img>``, ``<iframe>``,
 * media sources and their ``srcset``, ``<object data>``,
 * ``<meta http-equiv=refresh>``, CSS ``url()`` / ``@import`` (in ``<style>``
 * and in ``.css`` files), a service worker's ``importScripts`` and precache
 * entries, and a web manifest's icons. Each such reference to a host other
 * than the site's own origin is a finding: it hands the visitor's IP address
 * to that host before the visitor has done anything.
 *
 * Not findings: hyperlinks (``<a href>``), ``rel=canonical``/``alternate``,
 * Open-Graph and other ``<meta>`` content, a JSON-LD ``@context``, and string
 * constants inside JavaScript bundles (a provider base URL is not a fetch;
 * a runtime capture decides what the JavaScript actually requests).
 *
 * Where the port differs: HTML is parsed with jsdom (a declared
 * devDependency, the HTML standard's parser as in the browser) instead of
 * Python's ``html.parser``; the original's ``--sources`` mode reads a Vite
 * frontend's sources, which this repository does not have. The CLI
 * (``check-external-hosts.mjs``) adds this repository's floor rule.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { URL } from "node:url";

import { JSDOM, VirtualConsole } from "jsdom";

import { isRemoteUrl } from "./remote-url.mjs";

/** ``host -> reason``. Empty on purpose: the Pages site fetches nothing from
 *  a third party (engine#272). An entry here is a decision with a reason, not
 *  a way to make the check pass. */
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
const CSS_URL = /url\(\s*['"]?\s*((?:https?:)?\/\/[^'")\s]+)/gi;
const CSS_IMPORT = /@import\s+['"]((?:https?:)?\/\/[^'"]+)['"]/gi;
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

function finding(file, kind, url) {
  const trimmed = url.trim();
  return { file, kind, url: trimmed, host: hostOf(trimmed) };
}

/** Findings for the remote ones among ``urls``; empty and local values are skipped. */
function remoteFindings(file, kind, urls) {
  return urls.filter((url) => typeof url === "string" && isRemoteUrl(url)).map((url) => finding(file, kind, url));
}

/** One finding per line of the report: ``file: kind -> url``. */
export function describeFinding(found) {
  return `${found.file}: ${found.kind} -> ${found.url}`;
}

function findingsInCss(css, file) {
  return [
    ...[...css.matchAll(CSS_URL)].map((match) => finding(file, "css url()", match[1])),
    ...[...css.matchAll(CSS_IMPORT)].map((match) => finding(file, "css @import", match[1])),
  ];
}

function linkFindings(element, file) {
  const rels = new Set((element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  if (![...rels].some((rel) => FETCHING_LINK_RELS.has(rel))) return [];
  return remoteFindings(file, `<link rel=${[...rels].sort().join(" ")}>`, [element.getAttribute("href")]);
}

function srcFindings(element, file) {
  const tag = element.localName;
  const candidates = (element.getAttribute("srcset") ?? "").split(",").map((candidate) => candidate.trim().split(" ")[0]);
  return [
    ...remoteFindings(file, `<${tag} src>`, [element.getAttribute("src")]),
    ...remoteFindings(file, `<${tag} srcset>`, candidates),
  ];
}

function refreshFindings(element, file) {
  if ((element.getAttribute("http-equiv") ?? "").toLowerCase() !== "refresh") return [];
  const match = REFRESH_URL.exec(element.getAttribute("content") ?? "");
  return match ? remoteFindings(file, "<meta refresh>", [match[1]]) : [];
}

function elementFindings(element, file) {
  const tag = element.localName;
  if (tag === "link") return linkFindings(element, file);
  if (SRC_TAGS.has(tag)) return srcFindings(element, file);
  if (tag === "object") return remoteFindings(file, "<object data>", [element.getAttribute("data")]);
  if (tag === "meta") return refreshFindings(element, file);
  if (tag === "style") return findingsInCss(element.textContent ?? "", file);
  return [];
}

/** Elements in document order, a ``<template>``'s content included: the
 *  original's tag scanner reads those tags too. */
function* elementsOf(root) {
  for (const element of root.querySelectorAll("*")) {
    yield element;
    if (element.localName === "template") yield* elementsOf(element.content);
  }
}

function findingsInHtml(html, file) {
  // A silent console: jsdom reports CSS it cannot parse, which is not a finding.
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  try {
    return [...elementsOf(dom.window.document)].flatMap((element) => elementFindings(element, file));
  } finally {
    dom.window.close();
  }
}

function findingsInServiceWorker(script, file) {
  return [
    ...[...script.matchAll(SW_IMPORT)].map((match) => finding(file, "sw importScripts", match[1])),
    ...[...script.matchAll(SW_PRECACHE)].map((match) => finding(file, "sw precache entry", match[1])),
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
  const listed = ["icons", "screenshots", "shortcuts"].flatMap((key) =>
    (Array.isArray(manifest[key]) ? manifest[key] : []).flatMap((entry) =>
      ["src", "url"].flatMap((field) =>
        remoteFindings(file, `manifest ${key}[].${field}`, [entry !== null && typeof entry === "object" ? entry[field] : null]),
      ),
    ),
  );
  const own = ["start_url", "scope"].flatMap((field) => remoteFindings(file, `manifest ${field}`, [manifest[field]]));
  return [...listed, ...own];
}

function isServiceWorker(name) {
  return SERVICE_WORKER_NAMES.has(name) || name.startsWith("workbox-") || name.endsWith("-sw.js");
}

/** The scanner for one file of the site; null for a file the browser fetches nothing because of. */
function scannerFor(file) {
  const name = basename(file);
  const suffix = extname(name).toLowerCase();
  if (suffix === ".html" || suffix === ".htm") return findingsInHtml;
  if (suffix === ".css") return findingsInCss;
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
 * Every third-party resource fetch under ``root``, the host of ``origin``
 * excluded, with the files that were scanned (sorted relative paths). Throws
 * when ``root`` cannot be read.
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
