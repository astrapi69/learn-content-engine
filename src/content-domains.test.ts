import { describe, expect, it } from "vitest";

import {
  CEFR_LEVELS,
  KNOWN_CONTENT_DOMAINS,
  LEVEL_NONE,
  isKnownContentDomain,
  isKnownLevel,
} from "./content-domains.js";

/**
 * engine#127 - the controlled vocabulary contract (RED-first). The schema
 * keeps ``domain`` and ``level`` as free strings (additive, no break to
 * existing content); THIS module is the documented "known values + other"
 * contract consumers group on, and the source the W-DOMAIN-UNKNOWN /
 * W-LEVEL-UNKNOWN lints read.
 */

describe("KNOWN_CONTENT_DOMAINS (engine#127)", () => {
  it("carries the default language domain plus every registry domain", () => {
    for (const domain of [
      "language",
      "knowledge",
      "programming",
      "software",
      "psychology",
      "math",
      "ai",
      "technology",
      "philosophy",
      "dog-training",
      "traffic-knowledge",
    ]) {
      expect(KNOWN_CONTENT_DOMAINS).toContain(domain);
    }
  });

  it("is lowercase and duplicate-free (stable grouping keys)", () => {
    const domainList = [...KNOWN_CONTENT_DOMAINS];
    expect(domainList).toEqual(domainList.map((value) => value.toLowerCase()));
    expect(new Set(domainList).size).toBe(domainList.length);
  });
});

describe("isKnownContentDomain", () => {
  it("accepts known domains case-insensitively", () => {
    expect(isKnownContentDomain("psychology")).toBe(true);
    expect(isKnownContentDomain("Psychology")).toBe(true);
  });

  it("treats absent/empty as the language default (known)", () => {
    expect(isKnownContentDomain(undefined)).toBe(true);
    expect(isKnownContentDomain("")).toBe(true);
  });

  it("reports an unknown value ('other' stays valid, but is not known)", () => {
    expect(isKnownContentDomain("gardening")).toBe(false);
  });
});

describe("isKnownLevel (engine#127)", () => {
  it("accepts CEFR levels for the language domain, case-insensitively", () => {
    expect(isKnownLevel("language", "A1")).toBe(true);
    expect(isKnownLevel("language", "a1")).toBe(true);
    expect(isKnownLevel(undefined, "C2")).toBe(true);
  });

  it("rejects the live junk values the registry carries today", () => {
    expect(isKnownLevel("language", "a0")).toBe(false);
    expect(isKnownLevel("psychology", "einsteiger")).toBe(false);
    expect(isKnownLevel("knowledge", "reflexion")).toBe(false);
  });

  it("accepts the explicit no-level sentinel for non-language domains only", () => {
    expect(LEVEL_NONE).toBe("none");
    expect(isKnownLevel("psychology", "none")).toBe(true);
    expect(isKnownLevel("language", "none")).toBe(false);
  });

  it("accepts CEFR for non-language domains too (a graded course stays expressible)", () => {
    expect(isKnownLevel("programming", "B1")).toBe(true);
  });

  it("exposes the CEFR bands for consumers", () => {
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });
});
