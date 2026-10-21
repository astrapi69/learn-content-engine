/** Type surface of third-party-notices.mjs for the Vitest suite (src/third-party-notices.test.ts, src/docs-site.test.ts). */

export interface PackageId {
  name: string;
  version: string;
}

export interface NoticeFile {
  name: string;
  text: string;
}

export interface PackageNotices extends PackageId {
  license: string | null;
  files: NoticeFile[];
}

export interface SiblingRule extends PackageId {
  prefix: string;
  dir: string;
  own: RegExp[];
}

export interface BundleRules {
  root: PackageId & { own: RegExp[] };
  siblings: SiblingRule[];
  aliases: { prefix: string; id: string }[];
}

export function isNoticeFile(name: string): boolean;
export function isLicenceFile(name: string): boolean;
export function licenceSectionOf(readme: string): string | null;
export function sourcePackage(source: string): { name: string; version: string | null } | null;
export function bundledPackages(mapPath: string, rules: BundleRules): PackageId[];
export function findPackageDir(fromDir: string, name: string): string | null;
export function vendorDirName(pkg: PackageId): string;
export function missingNoticeTexts(packages: PackageId[], options: { searchFrom: string; vendorDir: string }): string[];
export function noticeTexts(packages: PackageId[], options: { searchFrom: string; vendorDir: string }): PackageNotices[];
export function renderNotices(packages: PackageNotices[], bundle: string): string;
