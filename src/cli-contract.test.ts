import { describe, it, expect } from "vitest";

import { formatReports } from "./cli.js";
import { formatMigrateReports } from "./migrate.js";
import { formatMintReports, mintStableIds } from "./mint-stable-ids.js";
import { formatCoverageResult } from "./stable-id-coverage.js";
import { formatSuggestWiringReports } from "./suggest-wiring.js";

/**
 * The bin shim destructures ``{ text, exitCode }`` from every command's
 * format function. A formatter returning a bare string therefore prints
 * "undefined" and exits 0 REGARDLESS of the outcome - a silently passing
 * command. That is how mint-stable-ids shipped in 0.16.0-dev: its own unit
 * tests asserted on the string, so nothing saw the shim contract.
 *
 * This test pins the contract for every command in the table at once, so a
 * new command cannot repeat it.
 */

const FAILING_REPORT = { path: "broken.json", ok: false, parseError: "boom" };

const CASES = [
  {
    command: "lint",
    format: () => formatReports([FAILING_REPORT as never], false),
  },
  {
    command: "migrate",
    format: () =>
      formatMigrateReports([{ ...FAILING_REPORT, converted: 0, changes: [] } as never], {
        json: false,
        write: false,
      }),
  },
  {
    command: "mint-stable-ids",
    format: () => formatMintReports([{ ...FAILING_REPORT, minted: 0, eligible: 0 }], { json: false, write: false }),
  },
  {
    command: "suggest-wiring",
    format: () =>
      formatSuggestWiringReports(
        [{ ...FAILING_REPORT, suggestions: [], manualReview: [], accepted: [] } as never],
        { json: false, write: false, accept: [] },
      ),
  },
  {
    // Not a per-file command, but it reaches the shim through the same
    // destructuring, so it belongs under the same pin.
    command: "check-stable-id-coverage",
    format: () => formatCoverageResult({ covered: 1, total: 2, unminted: ["sets/de/b"] }, 1),
  },
] as const;

describe("bin shim contract: every formatter returns { text, exitCode }", () => {
  it.each(CASES)("$command", ({ format }) => {
    const result = format();
    expect(typeof result).toBe("object");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
    expect(typeof result.exitCode).toBe("number");
  });

  it.each(CASES)("$command signals failure with a non-zero exit code", ({ format }) => {
    expect(format().exitCode).toBe(1);
  });

  it("a clean mint run exits 0", () => {
    const clean = mintStableIds('{"id":"l","title":"t","steps":[]}', "l.json");
    expect(formatMintReports([clean], { json: false, write: false }).exitCode).toBe(0);
  });
});
