import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, afterAll } from "vitest";

import { ALLOWED_HOSTS, describeFinding, scanSite, unallowed } from "../scripts/external-hosts-lib.mjs";
import type { Finding } from "../scripts/external-hosts-lib.mjs";

/**
 * The third-party host gate for the Pages site (engine#272). A resource the
 * browser loads on its own (a stylesheet, a script, an image, a font) sends
 * the visitor's IP address to whoever hosts it, before the visitor has done
 * anything. The scanner is a port of bibliogon's
 * scripts/check_external_hosts.py (bibliogon#874); the synthetic cases below
 * are its pytest cases, plus the branches the original leaves untested.
 *
 * Hyperlinks, rel=canonical, Open-Graph metadata and a JSON-LD @context are
 * strings, not fetches: the scanner must not report them, or every real
 * finding drowns in noise.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRATCH = mkdtempSync(join(tmpdir(), "lce-external-hosts-"));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

let siteCount = 0;
/** A fresh site directory holding the given files (relative path -> content). */
function siteWith(files: Record<string, string>): string {
  siteCount += 1;
  const root = join(SCRATCH, `site-${siteCount}`);
  mkdirSync(root, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, "utf8");
  }
  return root;
}

const hosts = (findings: Finding[]): Set<string> => new Set(findings.map((finding) => finding.host));

describe("scanSite: the original's synthetic artifacts (bibliogon#874)", () => {
  it("reports an external stylesheet and a font preconnect, not rel=canonical or a hyperlink", () => {
    const root = siteWith({
      "index.html":
        '<html><head><link rel="preconnect" href="https://fonts.gstatic.com">' +
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' +
        '<link rel="canonical" href="https://astrapi69.github.io/learn-content-engine/">' +
        '<a href="https://github.com/astrapi69/learn-content-engine">repo</a></head></html>',
    });
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["fonts.gstatic.com", "fonts.googleapis.com"]));
  });

  it("reports an external script, image and iframe, not JSON-LD or an og:image", () => {
    const root = siteWith({
      "index.html":
        '<script src="https://cdn.example.com/analytics.js"></script>' +
        '<img src="//images.example.net/pixel.gif">' +
        '<iframe src="https://maps.example.org/embed"></iframe>' +
        '<script type="application/ld+json">{"@context": "https://schema.org"}</script>' +
        '<meta property="og:image" content="https://astrapi69.github.io/learn-content-engine/og.png">',
    });
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["cdn.example.com", "images.example.net", "maps.example.org"]));
  });

  it("reports CSS url() and @import in a stylesheet, not a local url()", () => {
    const root = siteWith({
      "assets/app.css":
        "@import url('https://fonts.googleapis.com/css2?family=Lora');\n" +
        ".hero { background: url(https://cdn.example.com/hero.jpg); }\n" +
        ".local { background: url(/learn-content-engine/fonts/x.woff2); }\n",
    });
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["fonts.googleapis.com", "cdn.example.com"]));
  });

  it("reports a service worker's precache entries and importScripts, not a URL in a string", () => {
    const root = siteWith({
      "sw.js":
        'importScripts("https://cdn.example.com/wb.js");' +
        'precacheAndRoute([{"revision":"1","url":"index.html"},' +
        '{"revision":null,"url":"https://fonts.example.com/inter.woff2"}]);' +
        "const t = `see https://bit.ly/wb-precache`;",
    });
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["cdn.example.com", "fonts.example.com"]));
  });

  it("reports a web manifest icon, not a local icon or start_url", () => {
    const root = siteWith({
      "manifest.webmanifest":
        '{"icons":[{"src":"https://cdn.example.com/icon.png"},{"src":"icon-192.png"}],' +
        '"start_url":"/learn-content-engine/"}',
    });
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["cdn.example.com"]));
  });

  it("does not report the site's own origin or local paths", () => {
    const root = siteWith({
      "index.html":
        '<link rel="icon" href="/learn-content-engine/favicon.svg">' +
        '<link rel="stylesheet" href="https://astrapi69.github.io/learn-content-engine/assets/a.css">' +
        '<script type="module" src="/learn-content-engine/assets/index.js"></script>',
    });
    expect(scanSite(root, "https://astrapi69.github.io").findings).toEqual([]);
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["astrapi69.github.io"]));
  });

  it("does not scan JavaScript bundles for string constants: a base URL is not a fetch", () => {
    const root = siteWith({ "assets/index-abc.js": 'const base = "https://api.openai.com/v1";' });
    expect(scanSite(root).findings).toEqual([]);
  });

  it("needs a written reason for an allowlisted host, and then does not fail on it", () => {
    const root = siteWith({ "index.html": '<link rel="stylesheet" href="https://allowed.example.com/a.css">' });
    const { findings } = scanSite(root);
    expect(hosts(findings)).toEqual(new Set(["allowed.example.com"]));
    expect(unallowed(findings, { "allowed.example.com": "written reason" })).toEqual([]);
    expect(() => unallowed(findings, { "allowed.example.com": " " })).toThrow(/reason/);
  });

  it("keeps every ALLOWED_HOSTS entry backed by a written reason", () => {
    for (const [host, reason] of Object.entries(ALLOWED_HOSTS)) {
      expect(reason.trim(), `${host}: allowlist entry without a reason`).not.toBe("");
    }
  });
});

describe("scanSite: the original's rules the pytest cases leave out", () => {
  it("reports srcset candidates and media sources, each candidate on its own", () => {
    const root = siteWith({
      "index.html":
        '<img src="/local.png" srcset="https://a.example/1x.png 1x, /local@2x.png 2x, //b.example/3x.png 3x">' +
        '<video><source src="https://media.example/v.mp4"><track src="https://subs.example/v.vtt"></video>',
    });
    const { findings } = scanSite(root);
    expect(findings.map(describeFinding)).toEqual([
      "index.html: <img srcset> -> https://a.example/1x.png",
      "index.html: <img srcset> -> //b.example/3x.png",
      "index.html: <source src> -> https://media.example/v.mp4",
      "index.html: <track src> -> https://subs.example/v.vtt",
    ]);
  });

  it("reports <object data>, a meta refresh to another host, and CSS inside a <style> element", () => {
    const root = siteWith({
      "index.html":
        '<meta http-equiv="Refresh" content="0; url=https://redirect.example/next">' +
        '<meta http-equiv="refresh" content="5">' +
        '<object data="https://embed.example/x.svg"></object>' +
        '<style>@import "https://styles.example/a.css"; .a { background: url( "//img.example/b.png" ); }</style>',
    });
    expect(hosts(scanSite(root).findings)).toEqual(
      new Set(["redirect.example", "embed.example", "styles.example", "img.example"]),
    );
  });

  it("names every fetching rel of a link, and ignores a link whose rels do not fetch", () => {
    const root = siteWith({
      "index.html":
        '<link rel="Preload StyleSheet" href="https://cdn.example/a.css">' +
        '<link rel="alternate" href="https://feeds.example/rss.xml">' +
        '<link rel="modulepreload" href="https://cdn.example/m.js">',
    });
    expect(scanSite(root).findings.map(describeFinding)).toEqual([
      "index.html: <link rel=preload stylesheet> -> https://cdn.example/a.css",
      "index.html: <link rel=modulepreload> -> https://cdn.example/m.js",
    ]);
  });

  it("reads tags inside <template> as the original's tag scanner did, and skips node_modules", () => {
    const root = siteWith({
      "index.html": '<template><img src="https://template.example/x.png"></template>',
      "node_modules/pkg/index.html": '<script src="https://vendored.example/x.js"></script>',
    });
    expect(hosts(scanSite(root).findings)).toEqual(new Set(["template.example"]));
  });

  it("reports a remote reference whose host cannot be read, rather than dropping it", () => {
    const root = siteWith({ "index.html": '<script src="https://"></script>' });
    expect(scanSite(root).findings).toEqual([{ file: "index.html", kind: "<script src>", url: "https://", host: "" }]);
  });

  it("lists the files it scanned: pages, stylesheets, manifests, service workers, nothing else", () => {
    const root = siteWith({
      "index.html": "<p>x</p>",
      "docs/page.htm": "<p>y</p>",
      "assets/style.css": "a {}",
      "assets/main.js": "",
      "manifest.json": "{}",
      "workbox-1234.js": "",
      "schema/lesson.schema.json": "{}",
    });
    expect(scanSite(root).scanned).toEqual([
      "assets/style.css",
      "docs/page.htm",
      "index.html",
      "manifest.json",
      "workbox-1234.js",
    ]);
  });
});

describe("scripts/check-external-hosts.mjs (the CLI the Pages workflows run)", () => {
  const CLI = join(REPO_ROOT, "scripts/check-external-hosts.mjs");

  /** Exit status and combined output of one CLI run. */
  function runCli(args: string[]): { status: number; output: string } {
    try {
      const output = execFileSync("node", [CLI, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { status: 0, output };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { status: failed.status, output: `${failed.stdout}${failed.stderr}` };
    }
  }

  it("exits 0 on a site that loads nothing from another host, and says what it scanned", () => {
    const root = siteWith({ "index.html": '<a href="https://github.com/astrapi69">repo</a>', "a.css": "b {}" });
    const run = runCli([root]);
    expect(run.status).toBe(0);
    expect(run.output).toContain(`OK: no third-party resource fetch in ${root} (2 file(s) scanned, 1 HTML page(s))`);
  });

  it("exits 1 and names file, kind and URL for each third-party resource", () => {
    const root = siteWith({ "docs/index.html": '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>' });
    const run = runCli([root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain(
      "EXTERNAL: docs/index.html: <script src> -> https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
    );
    expect(run.output).toContain("1 third-party resource fetch(es).");
  });

  it("does not count the site's own origin given with --origin", () => {
    const root = siteWith({ "index.html": '<img src="https://astrapi69.github.io/learn-content-engine/x.png">' });
    expect(runCli([root]).status).toBe(1);
    expect(runCli([root, "--origin", "https://astrapi69.github.io"]).status).toBe(0);
  });

  it("exits 2 when the run would prove nothing: no directory, or no HTML page in it", () => {
    const missing = runCli([join(SCRATCH, "not-assembled")]);
    expect(missing.status).toBe(2);
    expect(missing.output).toContain("does not exist");
    const noPages = runCli([siteWith({ "assets/style.css": "a {}" })]);
    expect(noPages.status).toBe(2);
    expect(noPages.output).toContain("no HTML page");
  });

  it("exits 2 on a usage error rather than reporting a result", () => {
    expect(runCli([]).status).toBe(2);
    expect(runCli([siteWith({ "index.html": "" }), "--orign", "x"]).status).toBe(2);
  });
});
