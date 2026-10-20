import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
 * are its pytest cases, plus the branches the original leaves untested, plus
 * the nine fetch forms astrapi69/bibliogon#1124 lists, with the pages seeded
 * there as fixtures (src/__fixtures__/external-hosts/).
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

/** The report lines of one page, scanned with the Pages site's own origin. */
const reportLines = (html: string): string[] =>
  scanSite(siteWith({ "index.html": html }), "https://astrapi69.github.io").findings.map(describeFinding);

/**
 * The pages seeded for astrapi69/bibliogon#1124, one fetch form each, copied
 * byte for byte. Headless Chromium requested the foreign URL on every one of
 * them (2026-10-20); the original scanner, and this port before the fix,
 * passed all but the control.
 */
const SEEDED = fileURLToPath(new URL("./__fixtures__/external-hosts/", import.meta.url));
const seededLines = (name: string): string[] =>
  scanSite(join(SEEDED, name), "https://astrapi69.github.io").findings.map(describeFinding);

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

describe("scanSite: the nine fetch forms the original passes (astrapi69/bibliogon#1124)", () => {
  it("reads a CSS url() in an inline style attribute", () => {
    expect(seededLines("inline-style-url")).toEqual(["index.html: <div style> url() -> https://cdn.example/hero.jpg"]);
  });

  it("reads a <video poster>", () => {
    expect(seededLines("video-poster")).toEqual(["index.html: <video poster> -> https://cdn.example/poster.jpg"]);
  });

  it("reads an <input type=image src>", () => {
    expect(seededLines("input-image")).toEqual(["index.html: <input type=image src> -> https://cdn.example/button.png"]);
  });

  it("reads an SVG <image href>", () => {
    expect(seededLines("svg-image-href")).toEqual(["index.html: <image href> -> https://cdn.example/i.png"]);
  });

  it("resolves a relative reference against a <base href> on another host", () => {
    expect(seededLines("base-href")).toEqual(["index.html: <script src> via <base href> -> https://cdn.example/app.js"]);
  });

  it("reads the candidates of <link rel=preload imagesrcset>", () => {
    expect(seededLines("preload-imagesrcset")).toEqual([
      "index.html: <link rel=preload imagesrcset> -> https://cdn.example/a.png",
    ]);
  });

  it("parses an <iframe srcdoc> as the page it is", () => {
    expect(seededLines("iframe-srcdoc")).toEqual(["index.html: <iframe srcdoc> <img src> -> https://cdn.example/x.png"]);
  });

  it("reads a backslash URL as the browser does: \\\\host\\x.js is //host/x.js", () => {
    const { findings } = scanSite(join(SEEDED, "backslash-src"), "https://astrapi69.github.io");
    expect(findings.map(describeFinding)).toEqual([String.raw`index.html: <script src> -> \\cdn.example\x.js`]);
    expect(hosts(findings)).toEqual(new Set(["cdn.example"]));
  });

  it("reads a static import in an inline module script (Mermaid's documented ESM embed)", () => {
    expect(seededLines("esm-import-mermaid")).toEqual([
      "index.html: <script> import -> https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs",
    ]);
  });

  it("still reports the control: a <script src> from a CDN", () => {
    expect(seededLines("control-script-src")).toEqual([
      "index.html: <script src> -> https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
    ]);
  });
});

describe("scanSite: around the nine forms (each variant Chromium fetched, 2026-10-20)", () => {
  it("reads every load of an inline script: dynamic import(), importScripts(), new Worker(), import and export from", () => {
    expect(
      reportLines(
        '<script>import("https://cdn.example/dynamic.js");</script>' +
          "<script>import(/* webpackIgnore: true */ 'https://cdn.example/commented.js');</script>" +
          "<script>new Worker(URL.createObjectURL(new Blob(['importScripts(\"https://cdn.example/a.js\", \"//cdn.example/b.js\")'])));</script>" +
          '<script>new Worker("https://cdn.example/w.js"); new SharedWorker(new URL("https://cdn.example/s.js", import.meta.url));</script>' +
          '<script type="module">export { x } from "//cdn.example/re-export.js"; import "https://cdn.example/side-effect.js";</script>',
      ),
    ).toEqual([
      "index.html: <script> import() -> https://cdn.example/dynamic.js",
      "index.html: <script> import() -> https://cdn.example/commented.js",
      "index.html: <script> importScripts() -> https://cdn.example/a.js",
      "index.html: <script> importScripts() -> //cdn.example/b.js",
      "index.html: <script> new Worker() -> https://cdn.example/w.js",
      "index.html: <script> new Worker() -> https://cdn.example/s.js",
      "index.html: <script> import -> //cdn.example/re-export.js",
      "index.html: <script> import -> https://cdn.example/side-effect.js",
    ]);
  });

  it("reads a script's string literal as JavaScript does: escapes resolved, a template literal only without substitutions", () => {
    expect(
      reportLines(
        "<script>" +
          'import("https:\\/\\/cdn.example\\x2fa.js");' +
          'import("\\u0068ttps://cdn.example/b.js");' +
          'import("\\u{68}ttps://cdn.example/c.js");' +
          "import(`https://cdn.example/d.js`);" +
          "import(`https://${host}/e.js`);" +
          "</script>",
      ),
    ).toEqual([
      "index.html: <script> import() -> https://cdn.example/a.js",
      "index.html: <script> import() -> https://cdn.example/b.js",
      "index.html: <script> import() -> https://cdn.example/c.js",
      "index.html: <script> import() -> https://cdn.example/d.js",
    ]);
  });

  it("reads a script element whatever its type: worker code is often kept in one", () => {
    expect(reportLines('<script type="text/js-worker">importScripts("https://cdn.example/w.js");</script>')).toEqual([
      "index.html: <script> importScripts() -> https://cdn.example/w.js",
    ]);
  });

  it("does not take a script's other strings and look-alike calls for loads", () => {
    expect(
      reportLines(
        '<script>const api = "https://api.example/v1"; location.href = "https://example.org/";' +
          'loader.import("https://cdn.example/method.js"); reimport("https://cdn.example/re.js");' +
          'const kind = "import"; new Worker(workerUrl); console.log(import.meta.url);</script>',
      ),
    ).toEqual([]);
  });

  it("reads an import map's entries, the URLs a bare import resolves to", () => {
    expect(
      reportLines(
        '<script type="importmap">{"imports": {"m": "https://cdn.example/m.js", "local": "./l.js"},' +
          ' "scopes": {"/x/": {"n": "//cdn.example/n.js"}}}</script>' +
          '<script type="importmap">{not json</script><script type="importmap">["https://cdn.example/array.js"]</script>',
      ),
    ).toEqual(["index.html: <script type=importmap> -> https://cdn.example/m.js", "index.html: <script type=importmap> -> //cdn.example/n.js"]);
  });

  it("reads the SVG elements that load what href or xlink:href names; an SVG <a> stays a hyperlink", () => {
    expect(
      reportLines(
        '<svg><image xlink:href="https://cdn.example/x.png"/><filter id="f"><feImage href="https://cdn.example/fe.png"/></filter>' +
          '<use href="https://cdn.example/s.svg#a"/><script href="https://cdn.example/s.js"></script>' +
          '<a href="https://cdn.example/link"><text>t</text></a></svg>',
      ),
    ).toEqual([
      "index.html: <image xlink:href> -> https://cdn.example/x.png",
      "index.html: <feImage href> -> https://cdn.example/fe.png",
      "index.html: <use href> -> https://cdn.example/s.svg#a",
      "index.html: <script href> -> https://cdn.example/s.js",
    ]);
  });

  it("reads <input src> only for type=image, the one input type that fetches it", () => {
    expect(
      reportLines(
        '<input type=" IMAGE " src="https://cdn.example/a.png"><input type="text" src="https://cdn.example/t.png">' +
          '<input src="https://cdn.example/u.png">',
      ),
    ).toEqual(["index.html: <input type=image src> -> https://cdn.example/a.png"]);
  });

  it("resolves other spellings by the URL standard, and keeps a root-relative backslash local", () => {
    const { findings } = scanSite(
      siteWith({
        "index.html":
          '<img src="/\\cdn.example/a.png"><img src="h&#9;ttps://cdn.example/b.png"><img src="http:\\\\cdn.example\\c.png">' +
          '<img src="\\local.png">',
      }),
    );
    expect(findings.map((finding) => finding.host)).toEqual(["cdn.example", "cdn.example", "cdn.example"]);
  });

  it("reads CSS escapes as CSS does: an escaped backslash makes a protocol-relative URL, a single one does not", () => {
    expect(
      reportLines(
        String.raw`<div style="background:url(\\\\cdn.example\\y.png)">a</div>` +
          String.raw`<div style="background:url(\\cdn.example\x.png)">b</div>` +
          String.raw`<div style="background:url(\2f\2f cdn.example/h.png)">c</div>` +
          String.raw`<div style="background:url(\110000 https://cdn.example/z.png)">d</div>`,
      ),
    ).toEqual([String.raw`index.html: <div style> url() -> \\cdn.example\y.png`, "index.html: <div style> url() -> //cdn.example/h.png"]);
  });

  it("lets a <base href> on another host reach every relative reference: <style>, style attributes, srcdoc, module imports", () => {
    expect(
      reportLines(
        '<base href="https://cdn.example/"><style>.a { background: url(s.png); }</style><div style="background: url(d.png)"></div>' +
          '<iframe srcdoc="&lt;img src=r.png&gt;"></iframe><script type="module">import "./m.js";</script>',
      ),
    ).toEqual([
      "index.html: css url() via <base href> -> https://cdn.example/s.png",
      "index.html: <div style> url() via <base href> -> https://cdn.example/d.png",
      "index.html: <iframe srcdoc> <img src> via <base href> -> https://cdn.example/r.png",
      "index.html: <script> import via <base href> -> https://cdn.example/m.js",
    ]);
  });

  it("keeps relative references local under a <base href> on the site itself", () => {
    expect(
      reportLines(
        '<base href="/learn-content-engine/"><script src="a.js"></script><img src="https://astrapi69.github.io/x.png">' +
          '<div style="background: url(b.png)"></div>',
      ),
    ).toEqual([]);
  });

  it("keeps hyperlinks non-findings in the new forms: backslash, SVG <a>, under a foreign <base href>, inside srcdoc", () => {
    expect(
      reportLines(
        String.raw`<base href="https://cdn.example/"><a href="rel.html">r</a><a href="\\cdn.example\x">b</a>` +
          '<svg><a href="https://cdn.example/svg-a"><text y="10">s</text></a></svg>' +
          '<iframe srcdoc="&lt;a href=&quot;https://cdn.example/in-srcdoc&quot;&gt;l&lt;/a&gt;"></iframe>',
      ),
    ).toEqual([]);
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

  it("exits 0 when nothing it reads names another host, and says what it read and what it does not", () => {
    const root = siteWith({ "index.html": '<a href="https://github.com/astrapi69">repo</a>', "a.css": "b {}" });
    const run = runCli([root]);
    expect(run.status).toBe(0);
    expect(run.output).toContain(`OK: no third-party reference in ${root} (2 file(s) read, 1 HTML page(s)).`);
    // The OK line must not claim more than the scan: it reads files, it runs no JavaScript.
    expect(run.output).toContain("scripts/external-hosts-lib.mjs lists the forms read; no JavaScript is run");
  });

  it("exits 1 and names file, kind and URL for each third-party resource", () => {
    const root = siteWith({ "docs/index.html": '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>' });
    const run = runCli([root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain(
      "EXTERNAL: docs/index.html: <script src> -> https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
    );
    expect(run.output).toContain("1 third-party reference(s).");
  });

  it("exits 1 on the pages seeded for bibliogon#1124 and names the foreign URL of each", () => {
    const cases = readdirSync(SEEDED).sort();
    expect(cases).toHaveLength(10);
    const run = runCli([SEEDED, "--origin", "https://astrapi69.github.io"]);
    expect(run.status).toBe(1);
    const reported = run.output
      .split("\n")
      .filter((line) => line.startsWith("EXTERNAL: "))
      .map((line) => line.slice("EXTERNAL: ".length).split("/")[0]);
    expect(reported.sort()).toEqual(cases);
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
