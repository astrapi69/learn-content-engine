/** Type surface of external-hosts-lib.mjs for the Vitest suite (src/external-hosts.test.ts, src/docs-site.test.ts). */

export interface Finding {
  /** The scanned file, relative to the site root, "/"-separated. */
  file: string;
  /** How the browser would fetch it, e.g. ``<script src>``, ``css url()``. */
  kind: string;
  url: string;
  /** The host the URL names; "" when none can be read. */
  host: string;
}

export interface SiteScan {
  /** The files a scanner applied to, sorted. */
  scanned: string[];
  findings: Finding[];
}

export const ALLOWED_HOSTS: Readonly<Record<string, string>>;
export function describeFinding(found: Finding): string;
export function scanSite(root: string, origin?: string): SiteScan;
export function unallowed(findings: Finding[], allowed: Readonly<Record<string, string>>): Finding[];
