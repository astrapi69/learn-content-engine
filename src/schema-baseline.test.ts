import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Byte baseline for the schema-authority flip (Roadmap stage 4). The canonical
 * schema moved from the app (vendored) to this engine (authored). The flip is
 * byte-equivalent: ONLY the `$id` changes (and nothing else - same types,
 * fields, enums, constraints, and the same `x-schema-version`). This test
 * freezes the pre-flip bytes and proves exactly that, so any accidental content
 * drift during or after the flip turns CI red.
 */

const NEW_ID_BASE = "https://astrapi69.github.io/learn-content-engine/schema";

/** The current, deliberately-set schema version. Bumping it is a conscious
 *  release decision (new exercise type = minor); update it together with the
 *  frozen baseline in the same commit. */
const EXPECTED_SCHEMA_VERSION = "1.6";

const readText = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

/** Replace the `$id` value so two schema texts can be compared byte-for-byte
 *  everywhere EXCEPT `$id`. */
const normalizeId = (schemaText: string): string => schemaText.replace(/"\$id": "[^"]*"/, '"$id": "<ID>"');

const CASES = [
  { name: "lesson.schema.json" },
  { name: "content-manifest.schema.json" },
] as const;

describe("schema baseline - the flip changes only $id", () => {
  for (const { name } of CASES) {
    const live = readText(`../schema/${name}`);
    const baseline = readText(`./__fixtures__/schema-baseline/${name}`);

    it(`${name}: byte-identical to the frozen baseline except $id`, () => {
      expect(normalizeId(live)).toBe(normalizeId(baseline));
    });

    it(`${name}: x-schema-version matches the deliberate pin (${EXPECTED_SCHEMA_VERSION})`, () => {
      const version = (schema: string): string => JSON.parse(schema)["x-schema-version"] as string;
      expect(version(live)).toBe(version(baseline));
      expect(version(live)).toBe(EXPECTED_SCHEMA_VERSION);
    });

    it(`${name}: $id is the new engine-owned identifier`, () => {
      expect(JSON.parse(live).$id).toBe(`${NEW_ID_BASE}/${name}`);
    });
  }
});
