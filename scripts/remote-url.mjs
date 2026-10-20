/**
 * One definition of a remote URL for the Pages tooling (engine#272).
 *
 * An http(s) or protocol-relative URL makes the browser fetch from the host
 * the URL names; a relative, root-relative or data: URL stays on the page's
 * own site. The third-party host gate (``external-hosts-lib.mjs``) and the
 * TypeDoc plugin that turns remote images into text
 * (``typedoc-plugin-remote-images.mjs``) share it, so the two agree on what
 * counts as remote. Ported from ``_is_absolute`` in bibliogon's
 * ``scripts/check_external_hosts.py``.
 *
 * A module of its own so the TypeDoc plugin does not load the scanner's
 * HTML parser (jsdom) on every API docs build.
 */

/** True for an http(s) or protocol-relative URL, surrounding whitespace ignored. */
export function isRemoteUrl(url) {
  const lowered = url.trim().toLowerCase();
  return lowered.startsWith("http://") || lowered.startsWith("https://") || lowered.startsWith("//");
}
