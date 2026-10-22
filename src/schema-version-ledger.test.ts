import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ledgerFindings, schemaSetDigest } from "../scripts/schema-version-ledger.mjs";

/**
 * engine#279: `x-schema-version` moves with every change of the schema set's
 * content and only then. The ledger maps each version to the content's
 * digest; see scripts/schema-version-ledger.mjs.
 */

const LEDGER_PATH = "src/__fixtures__/schema-baseline/schema-version-ledger.json";

const readLedger = (): Record<string, string> => JSON.parse(readFileSync(LEDGER_PATH, "utf-8")) as Record<string, string>;

const current = {
  lesson: readFileSync("schema/lesson.schema.json", "utf-8"),
  manifest: readFileSync("schema/content-manifest.schema.json", "utf-8"),
};

const withVersion = (text: string, version: string): string =>
  text.replace(/"x-schema-version": "[^"]*"/, `"x-schema-version": "${version}"`);

const nextVersion = (version: string): string => {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return `${major}.${minor + 1}`;
};

const currentVersion = (JSON.parse(current.lesson) as { "x-schema-version": string })["x-schema-version"];

/** The negative probes run against a ledger that is consistent by
 *  construction, so they prove the gate can fail whatever the repository's
 *  own state is. Only the first test reads the committed ledger. */
const consistentLedger = (): Record<string, string> => ({ [currentVersion]: schemaSetDigest(current) });

describe("schema version ledger (engine#279)", () => {
  it("the current version's ledger row holds exactly the current content", () => {
    expect(ledgerFindings(readLedger(), current)).toEqual([]);
  });

  it("a content change under the same version fails", () => {
    const edited = { ...current, lesson: current.lesson.replace("The smallest learnable unit", "The smallest unit") };
    expect(edited.lesson).not.toBe(current.lesson);
    expect(ledgerFindings(consistentLedger(), edited)).toEqual([
      `the schema content changed but x-schema-version is still ${currentVersion}: bump it in both files and add a ledger row`,
    ]);
  });

  it("a version that rises without a content change fails, even with a ledger row for it", () => {
    const bumped = nextVersion(currentVersion);
    const raised = { lesson: withVersion(current.lesson, bumped), manifest: withVersion(current.manifest, bumped) };
    const ledger = { ...consistentLedger(), [bumped]: schemaSetDigest(raised) };
    expect(ledgerFindings(ledger, raised)).toContain(
      `x-schema-version rose to ${bumped}, but the content equals ${currentVersion}: a version moves only with a change`,
    );
  });

  it("a version that rises without a content change fails when its row is missing too", () => {
    const bumped = nextVersion(currentVersion);
    const raised = { lesson: withVersion(current.lesson, bumped), manifest: withVersion(current.manifest, bumped) };
    expect(ledgerFindings(consistentLedger(), raised)).toEqual([
      `x-schema-version rose to ${bumped}, but the content equals ${currentVersion}: a version moves only with a change`,
    ]);
  });

  it("a real change with a bump but no ledger row fails and names the row to add", () => {
    const bumped = nextVersion(currentVersion);
    const changed = {
      lesson: withVersion(current.lesson.replace("The smallest learnable unit", "The smallest unit"), bumped),
      manifest: withVersion(current.manifest, bumped),
    };
    expect(ledgerFindings(consistentLedger(), changed)).toEqual([
      `x-schema-version ${bumped} has no ledger row; add "${bumped}": "${schemaSetDigest(changed)}"`,
    ]);
  });

  it("files out of lockstep fail", () => {
    const split = { ...current, manifest: withVersion(current.manifest, nextVersion(currentVersion)) };
    expect(ledgerFindings(consistentLedger(), split)).toContain(
      `the schema files are out of lockstep: lesson.schema.json is ${currentVersion}, content-manifest.schema.json is ${nextVersion(currentVersion)}`,
    );
  });

  it("two ledger rows with one digest fail", () => {
    const ledger = consistentLedger();
    const duplicate = { ...ledger, "0.0": schemaSetDigest(current) };
    expect(ledgerFindings(duplicate, current)).toContain(`ledger rows ${currentVersion} and 0.0 hold the same content`);
  });

  it("the digest ignores $id and x-schema-version and nothing else", () => {
    const moved = {
      lesson: current.lesson.replace(/"\$id": "[^"]*"/, '"$id": "https://example.invalid/lesson.schema.json"'),
      manifest: withVersion(current.manifest, "9.9"),
    };
    expect(schemaSetDigest(moved)).toBe(schemaSetDigest(current));
    expect(schemaSetDigest({ ...current, lesson: current.lesson.replace("Card", "Kard") })).not.toBe(
      schemaSetDigest(current),
    );
  });
});
