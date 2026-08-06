import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every source file must be TEXT to every tool (engine#135). A raw control
 * byte - the shipped case: four raw NULs as key separators in
 * stable-id-stability.ts - flips the file to "binary" for grep and friends,
 * and a binary file makes every search in it SILENT. Silence is
 * indistinguishable from "no hit", so inventories built on search go
 * fail-open. The engine lints exactly this character class in content
 * (W-INVISIBLE-CHAR); this gate holds its own sources to the same rule.
 * An escape sequence such as backslash-u0000 expresses the same runtime
 * value and keeps the file text.
 */

const ALLOWED_CONTROL_BYTES = new Set([0x09, 0x0a]);

const sourceFilesUnder = (rootDir: string, extensions: string[]): string[] => {
  const collected: string[] = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = `${rootDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__fixtures__") continue;
      collected.push(...sourceFilesUnder(entryPath, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      collected.push(entryPath);
    }
  }
  return collected;
};

const controlBytePositions = (raw: Buffer): number[] => {
  const positions: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const byte = raw[i]!;
    if (byte < 0x20 && !ALLOWED_CONTROL_BYTES.has(byte)) positions.push(i);
  }
  return positions;
};

describe("source files are text to every tool (engine#135)", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const sourceFiles = [
    ...sourceFilesUnder(`${repoRoot}src`, [".ts"]),
    ...sourceFilesUnder(`${repoRoot}bin`, [".mjs"]),
    ...sourceFilesUnder(`${repoRoot}scripts`, [".mjs"]),
  ];

  it("scans a non-empty file set (the checked quantity)", () => {
    expect(sourceFiles.length).toBeGreaterThan(30);
  });

  it.each(sourceFiles.map((filePath) => filePath.slice(repoRoot.length)))(
    "%s carries no raw control bytes",
    (relativePath) => {
      const positions = controlBytePositions(readFileSync(`${repoRoot}${relativePath}`));
      expect(
        positions,
        `raw control bytes at byte offset(s) ${positions.join(", ")} - use escape sequences instead`,
      ).toEqual([]);
    },
  );

  it("negative control: the scan flags a seeded raw NUL", () => {
    const seededSource = Buffer.from("const key = `a\u0000b`;", "utf8");
    expect(controlBytePositions(seededSource)).toHaveLength(1);
  });
});
