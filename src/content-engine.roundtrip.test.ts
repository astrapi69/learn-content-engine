import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import {
  asContentSetEntry,
  parseLesson,
  parseManifest,
  resolveLanguagePair,
  setBasePath,
  type LessonSetContext,
} from "./content-engine.js";
import type { ContentLessonInlineExample, ContentSetSource } from "./types/index.js";

/**
 * Round-trip / integration test for the content-engine boundary.
 *
 * Where content-engine.test.ts unit-tests each function in isolation, this
 * exercises the whole seam end to end on realistic vendored fixtures
 * (src/__fixtures__/): a multi-set manifest.yaml -> canonical set entries ->
 * per-lesson context -> canonical lessons. It iterates over SEVERAL examples
 * so the "engine actually drives", not just "starts".
 */

const readFixture = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${relativePath}`, import.meta.url)), "utf8");

const SOURCE: ContentSetSource = {
  source: "astrapi69/round-trip-fixture",
  branch: "main",
};

/** Build the context a lesson inherits from its (already canonical) set entry. */
function contextFromEntry(entry: {
  language: string;
  target_language: string;
  source_language: string;
  domain: string;
}): LessonSetContext {
  return {
    language: entry.language,
    target_language: entry.target_language,
    source_language: entry.source_language,
    domain: entry.domain,
  };
}

describe("Content-Engine round-trip — manifest to canonical set entries", () => {
  const manifest = parseManifest(readFixture("manifest.yaml"));

  it("parses every set declared in the manifest", () => {
    expect(manifest?.name).toBe("Round-trip Fixture Repo");
    expect(manifest?.sets?.map((setItem) => setItem.id)).toEqual([
      "fr-a1",
      "es-a1",
      "psych-intro",
    ]);
  });

  it("projects all sets to canonical entries in one pass (multiple examples)", () => {
    const entries = (manifest?.sets ?? []).map((parsedSet) =>
      asContentSetEntry(SOURCE, parsedSet, null),
    );
    expect(entries).toHaveLength(3);
    // Every entry carries the shared source and a resolved language pair.
    for (const entry of entries) {
      expect(entry.source).toBe(SOURCE.source);
      expect(entry.target_language.length).toBeGreaterThan(0);
      expect(entry.source_language.length).toBeGreaterThan(0);
      expect(entry.update_available).toBe(false);
    }
  });

  it("resolves the full modern set including its book block and path", () => {
    const frA1 = asContentSetEntry(SOURCE, manifest!.sets![0]!, null);
    expect(frA1.target_language).toBe("fr");
    expect(frA1.source_language).toBe("de");
    expect(frA1.domain).toBe("language");
    expect(setBasePath(manifest!.sets![0]!)).toBe("sets/de/fr-a1");
    expect(frA1.book).toEqual({
      title: "Assimil Französisch",
      author: "Anthony Bulger",
      url: "https://example.test/assimil-fr",
      asin: "B0000FR001",
    });
  });

  it("applies legacy-alias and default rules to the legacy set", () => {
    const esA1 = asContentSetEntry(SOURCE, manifest!.sets![1]!, null);
    // Legacy ``language`` mirrors into both target fields; source defaults to
    // ``en`` and domain to ``language``; no path -> ``sets/{id}``.
    expect(esA1.language).toBe("es");
    expect(esA1.target_language).toBe("es");
    expect(esA1.source_language).toBe("en");
    expect(esA1.domain).toBe("language");
    expect(esA1.book).toBeNull();
    expect(setBasePath(manifest!.sets![1]!)).toBe("sets/es-a1");
  });
});

describe("Content-Engine round-trip — set context drives lesson parse", () => {
  const manifest = parseManifest(readFixture("manifest.yaml"));
  const frA1 = asContentSetEntry(SOURCE, manifest!.sets![0]!, null);
  const frContext = contextFromEntry(frA1);

  it("injects the set's language pair + domain into a lesson that omits them", () => {
    const lesson = parseLesson(readFixture("lessons/inherits-context.json"), frContext);
    expect(lesson.id).toBe("01-greetings");
    // The fr-a1 set context flows all the way into the canonical lesson.
    expect(lesson.target_language).toBe("fr");
    expect(lesson.source_language).toBe("de");
    expect(lesson.domain).toBe("language");
  });

  it("keeps a standalone lesson's own language pair + domain over the set context", () => {
    const lesson = parseLesson(readFixture("lessons/standalone-export.json"), frContext);
    expect(lesson.id).toBe("02-standalone");
    expect(lesson.target_language).toBe("es");
    expect(lesson.source_language).toBe("en");
    expect(lesson.domain).toBe("programming");
  });

  it("parses a minimal lesson end to end under the same context", () => {
    const lesson = parseLesson(readFixture("lessons/minimal.json"), frContext);
    expect(lesson.id).toBe("03-minimal");
    expect(lesson.target_language).toBe("fr");
    expect(lesson.cards).toEqual([]);
  });

  it("routes each lesson through the context of ITS own manifest set", () => {
    // The real end-to-end shape: iterate (set, lesson) pairs and confirm each
    // canonical lesson inherits from the matching set, across examples.
    const pairs = [
      { setIndex: 0, lesson: "lessons/inherits-context.json", expectTarget: "fr", expectSource: "de" },
      { setIndex: 2, lesson: "lessons/inherits-context.json", expectTarget: "de", expectSource: "de" },
    ];
    for (const pair of pairs) {
      const entry = asContentSetEntry(SOURCE, manifest!.sets![pair.setIndex]!, null);
      const lesson = parseLesson(readFixture(pair.lesson), contextFromEntry(entry));
      expect(lesson.target_language).toBe(pair.expectTarget);
      expect(lesson.source_language).toBe(pair.expectSource);
      // Sanity: the resolved pair matches what resolveLanguagePair reports.
      expect(resolveLanguagePair(manifest!.sets![pair.setIndex]!)).toEqual({
        target: pair.expectTarget,
        source: pair.expectSource,
      });
    }
  });
});

describe("Content-Engine round-trip — v1.5 inline examples (additive)", () => {
  const manifest = parseManifest(readFixture("manifest.yaml"));
  const frContext = contextFromEntry(asContentSetEntry(SOURCE, manifest!.sets![0]!, null));

  it("carries examples unchanged onto a theory step (text + code), typed", () => {
    const lesson = parseLesson(readFixture("lessons/with-examples.json"), frContext);
    const theory = lesson.steps[0]!;
    // The canonical type now exposes ``examples`` — typed access, not a cast.
    const examples: ContentLessonInlineExample[] = theory.examples ?? [];
    expect(examples).toEqual([
      { title: "Plain sentence", content: "Squares of 0..4 are 0, 1, 4, 9, 16." },
      { title: "Python", language: "python", content: "squares = [n * n for n in range(5)]" },
    ]);
    // The code example is distinguished from plain text by its ``language``.
    expect(examples[0]!.language).toBeUndefined();
    expect(examples[1]!.language).toBe("python");
  });

  it("coexists with the v1.4 example_url on the same step", () => {
    const lesson = parseLesson(readFixture("lessons/with-examples.json"), frContext);
    const theory = lesson.steps[0]!;
    expect(theory.example_url).toBe("https://example.test/list-comprehensions");
    expect(theory.examples).toHaveLength(2);
  });

  it("carries examples onto an exercise as well", () => {
    const lesson = parseLesson(readFixture("lessons/with-examples.json"), frContext);
    const exercise = lesson.steps[1]!.exercise!;
    const examples: ContentLessonInlineExample[] = exercise.examples ?? [];
    expect(examples).toEqual([
      { language: "python", content: "cubes = [n ** 3 for n in range(5)]" },
    ]);
  });

  it("stays backward-compatible: a 1.4 lesson without examples is unchanged", () => {
    // Abwaertskompatibilitaet as an assertion: an existing fixture that predates
    // v1.5 parses fine and simply has no ``examples`` on its steps.
    const lesson = parseLesson(readFixture("lessons/inherits-context.json"), frContext);
    expect(lesson.steps[0]!.examples).toBeUndefined();
    expect(lesson.id).toBe("01-greetings");
  });
});
