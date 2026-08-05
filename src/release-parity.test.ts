import { describe, it, expect } from "vitest";

import { checkReleaseParity, KNOWN_NPM_GAPS } from "./release-parity.js";

/**
 * engine#111: per-tag parity - every git tag vX.Y.Z must have BOTH the
 * GitHub release page and the npm version X.Y.Z. The class "version
 * without publication" has three proven occurrences on the npm axis
 * (0.1.0, 0.3.0, 0.10.0 - tag and release page exist, the package was
 * never published) and one on the release-page axis (v0.17.0, healed
 * four days late). The check applies from now on, never backwards: the
 * three historical npm gaps are allowlisted, not republished.
 *
 * Written RED-first.
 */

const FULL_PARITY = {
  tags: ["v0.17.0", "v0.18.0"],
  releaseTags: ["v0.17.0", "v0.18.0"],
  npmVersions: ["0.17.0", "0.18.0"],
};

describe("checkReleaseParity (engine#111)", () => {
  it("reproduction: a tag without a release page is reported (the v0.17.0 case)", () => {
    const parity = checkReleaseParity({
      ...FULL_PARITY,
      releaseTags: ["v0.18.0"],
    });
    expect(parity.ok).toBe(false);
    expect(parity.missingReleasePages).toEqual(["v0.17.0"]);
  });

  it("a tag without its npm version is reported", () => {
    const parity = checkReleaseParity({
      ...FULL_PARITY,
      npmVersions: ["0.18.0"],
    });
    expect(parity.ok).toBe(false);
    expect(parity.missingNpmVersions).toEqual(["v0.17.0"]);
  });

  it("happy path: full parity is ok with empty findings", () => {
    const parity = checkReleaseParity(FULL_PARITY);
    expect(parity.ok).toBe(true);
    expect(parity.missingReleasePages).toEqual([]);
    expect(parity.missingNpmVersions).toEqual([]);
  });

  it("the three historical npm gaps stay allowlisted - checked from now on, not backwards", () => {
    expect(KNOWN_NPM_GAPS).toEqual(["0.1.0", "0.3.0", "0.10.0"]);
    const parity = checkReleaseParity({
      tags: ["v0.1.0", "v0.3.0", "v0.10.0", "v0.18.0"],
      releaseTags: ["v0.1.0", "v0.3.0", "v0.10.0", "v0.18.0"],
      npmVersions: ["0.18.0"],
    });
    expect(parity.ok).toBe(true);
    expect(parity.missingNpmVersions).toEqual([]);
  });

  it("boundary: only vX.Y.Z tags count - other tag shapes are ignored", () => {
    const parity = checkReleaseParity({
      ...FULL_PARITY,
      tags: [...FULL_PARITY.tags, "latest", "v1.0", "release-candidate"],
    });
    expect(parity.ok).toBe(true);
  });

  it("edge: no tags at all is ok (nothing to be out of parity)", () => {
    const parity = checkReleaseParity({ tags: [], releaseTags: [], npmVersions: [] });
    expect(parity.ok).toBe(true);
  });
});
