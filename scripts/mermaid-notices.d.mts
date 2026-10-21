/** Type surface of mermaid-notices.mjs for the Vitest suite (src/docs-site.test.ts). */

import type { BundleRules, PackageId } from "./third-party-notices.mjs";

export const VENDOR_DIR: string;
export function mermaidRules(mermaidDir: string): BundleRules;
export function mermaidBundlePackages(mermaidDir: string): PackageId[];
export function mermaidNotices(mermaidDir: string, bundle: string, options?: { searchFrom?: string; vendorDir?: string }): string;
