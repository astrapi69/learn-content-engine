import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * engine#117: the two SCHEMA-DERIVED diagrams must not drift.
 *
 * A diagram is a second place for the same truth. The edit is cheap; noticing
 * that the edit is due is not. So the generator is the source and this suite
 * is the gate, in the shape the version-claims and schema-mirror gates
 * already use.
 *
 * Written RED-first: the drift check failed against the hand-written page
 * before the generator ever ran.
 */

const repoFile = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const DOC = readFileSync(repoFile("../docs/schema-diagrams.md"), "utf8");
const SCHEMA = JSON.parse(readFileSync(repoFile("../schema/lesson.schema.json"), "utf8")) as {
  $defs: Record<string, { enum?: string[]; pattern?: string }>;
  "x-schema-version": string;
};

/** Run the generator; returns stdout, or throws with the drift message. */
function runGenerator(...args: string[]): string {
  return execFileSync("node", [repoFile("../scripts/generate-schema-diagrams.mjs"), ...args], {
    encoding: "utf8",
    cwd: repoFile(".."),
  }).trim();
}

describe("schema diagrams - drift gate (engine#117)", () => {
  it("the committed page matches what the schema produces today", () => {
    expect(() => runGenerator("--check")).not.toThrow();
  });

  it("reports the SIZE of what it checked, so an empty run cannot read as OK", () => {
    // The floor rule from engine#93: "100% (0/0)" with exit 0 is not a
    // measurement. The check names the number of exercise types it saw.
    const output = runGenerator("--check");
    const coreTypeCount = SCHEMA.$defs.ExerciseType!.enum!.length;
    expect(coreTypeCount).toBeGreaterThan(0);
    expect(output).toContain(`${coreTypeCount} exercise types`);
  });

  it("carries the schema version it was generated from", () => {
    expect(DOC).toContain(`<!-- schema x-schema-version: ${SCHEMA["x-schema-version"]} -->`);
  });
});

describe("schema diagrams - content is schema-backed, not invented", () => {
  it("every core exercise type appears, and no invented one does", () => {
    const coreTypes = SCHEMA.$defs.ExerciseType!.enum!;
    const generatedBlock = DOC.slice(
      DOC.indexOf("GENERATED:schema-diagrams BEGIN"),
      DOC.indexOf("GENERATED:schema-diagrams END"),
    );
    for (const typeName of coreTypes) {
      expect(generatedBlock, `type ${typeName} missing from the diagram`).toContain(`"${typeName}"`);
    }
    // Node labels T0..Tn are one per enum value: no extra type box exists.
    const typeNodes = generatedBlock.match(/Core --> T\d+\[/g) ?? [];
    expect(typeNodes).toHaveLength(coreTypes.length);
  });

  it("the extension pattern is quoted from the schema, not paraphrased", () => {
    expect(DOC).toContain(SCHEMA.$defs.ExtExerciseType!.pattern!);
  });
});

describe("schema diagrams - each diagram declares its kind", () => {
  const HEADINGS = [
    ["1. Content structure", "generated"],
    ["2. Exercise types", "generated"],
    ["3. The database view as a thinking model", "coarse"],
    ["4. From repository to learner", "coarse"],
  ] as const;

  for (const [heading, kind] of HEADINGS) {
    it(`"${heading}" is marked ${kind}`, () => {
      expect(DOC).toContain(`${heading} (${kind})`);
    });
  }

  it("all four diagrams are present as mermaid blocks", () => {
    expect(DOC.match(/```mermaid/g) ?? []).toHaveLength(HEADINGS.length);
  });

  it("the thinking model is labelled as one - there is no such database", () => {
    expect(DOC).toContain("There is no such database");
  });
});
