/**
 * One definition of a remote URL for the Pages tooling (engine#272).
 *
 * A reference is remote when the browser, resolving it on a page of the site,
 * would fetch it from another host. It resolves by the URL standard, as the
 * browser does, so a backslash reads as a slash (``\\host\x.js`` is
 * ``//host/x.js``) and a tab or newline inside the value is dropped; a
 * relative, root-relative or data: reference stays on the page's own site.
 * The third-party host gate (``external-hosts-lib.mjs``) and the TypeDoc
 * plugin that turns remote images into text
 * (``typedoc-plugin-remote-images.mjs``) share it, so the two agree on what
 * counts as remote. For a reference that does not parse, the prefix test of
 * ``_is_absolute`` in bibliogon's ``scripts/check_external_hosts.py`` decides.
 *
 * A module of its own so the TypeDoc plugin does not load the scanner's
 * HTML parser (jsdom) on every API docs build.
 */

import { URL } from "node:url";

/** The site's own pages while a reference is resolved: a host under the
 *  reserved .invalid top-level domain (RFC 2606), so no real URL names it. */
export const OWN_SITE = "https://own-site.invalid/";
const OWN_HOST = new URL(OWN_SITE).hostname;

/** The original's prefix test, a backslash read as a slash. */
function looksRemote(reference) {
  const lowered = reference.trim().replaceAll("\\", "/").toLowerCase();
  return lowered.startsWith("http://") || lowered.startsWith("https://") || lowered.startsWith("//");
}

/**
 * Where the browser fetches ``reference`` from, on a page whose base URL is
 * ``base`` (the site's own root when omitted), when that is another host:
 * ``{ href, host }``. Null when the reference stays on the site or is not an
 * http(s) URL (data:, blob:, javascript:, mailto:). A reference that looks
 * remote but does not parse (``https://``) comes back as ``{ href: reference,
 * host: "" }``: reported, not dropped.
 */
export function foreignUrl(reference, base = OWN_SITE) {
  let resolved;
  try {
    resolved = new URL(reference, base);
  } catch {
    return looksRemote(reference) ? { href: reference.trim(), host: "" } : null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  return resolved.hostname === OWN_HOST ? null : { href: resolved.href, host: resolved.hostname };
}

/** True for a reference that a page of the site would fetch from another host. */
export function isRemoteUrl(url) {
  return foreignUrl(url) !== null;
}
