import { describe, it, expect } from "vitest";

import { validateLessonRules } from "./rules.js";
import type { Lesson } from "./types/lesson-schema.generated.js";
import { validateLesson, validateManifest, type ValidationIssue } from "./validate.js";

/**
 * engine#190: the language-pair and set-metadata rules move from the content
 * template's validator into the engine, in the canonical version the owner
 * decided on 2026-09-25 (decision brief in the issue):
 *   1. a malformed BCP 47 tag is an error, a well-formed but non-canonical one
 *      a warning; three-letter primary subtags (gsw, yue, fil) are valid;
 *   2. source equals target in a `language` set is a warning;
 *   3. a `language` set without `title_native` is a warning;
 *   4. a card back without a letter of the source language's script is a
 *      warning, for any non-Latin script (not a table of six languages).
 */

const LANGUAGE_IDS = ["E-LANG-TAG", "W-LANG-TAG-CANONICAL", "W-LANG-PAIR-SAME", "W-SET-TITLE-NATIVE", "W-CARD-BACK-SCRIPT"];

const set = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "fr-a1",
  title: "French A1",
  title_native: "Français A1",
  target_language: "fr",
  source_language: "de",
  level: "A1",
  version: "1.0.0",
  lesson_count: 1,
  ...extra,
});
const manifestIssues = (...sets: Record<string, unknown>[]): ValidationIssue[] => {
  const { errors, warnings } = validateManifest({ schema_version: "1.2", name: "M", sets });
  return [...errors, ...warnings].filter((issue) => LANGUAGE_IDS.includes(issue.id));
};

const lesson = (extra: Record<string, unknown> = {}, cards: Array<{ id: string; back: string }> = []): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps: [
    { id: "t1", type: "theory", body: "Read this." },
    { id: "s1", type: "exercise", exercise: { id: "e1", type: "free_text", prompt: "?", accept: ["a"], card_ids: cards.map((card) => card.id) } },
  ],
  cards: cards.map((card) => ({ id: card.id, front: card.id, back: card.back })),
  ...extra,
});
const lessonIssues = (input: Record<string, unknown>, sourceLanguage?: string): ValidationIssue[] => {
  const { errors, warnings } = validateLesson(input, sourceLanguage ? { sourceLanguage } : {});
  return [...errors, ...warnings].filter((issue) => LANGUAGE_IDS.includes(issue.id));
};

describe("reproductions (engine#190)", () => {
  it("a three-letter primary subtag is valid: the template's two-letter cut rejected gsw", () => {
    expect(manifestIssues(set({ target_language: "gsw" }))).toEqual([]);
  });

  it("a malformed tag, schema-valid today, is an error", () => {
    const result = validateManifest({ schema_version: "1.2", name: "M", sets: [set({ target_language: "en_US" })] });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ id: "E-LANG-TAG", path: "/sets/0/target_language", params: { field: "target_language", tag: "en_US" } }),
    ]);
  });

  it("a Hindi source language is checked too: the template's table knew six languages", () => {
    const issues = lessonIssues(lesson({ source_language: "hi" }, [{ id: "c1", back: "water" }]));
    expect(issues.map((issue) => issue.id)).toEqual(["W-CARD-BACK-SCRIPT"]);
  });
});

describe("1. language tags", () => {
  it.each(["de", "de-AT", "pt-BR", "zh-Hant", "yue", "fil", "sr-Latn"])("accepts the canonical tag %s", (tag) => {
    expect(manifestIssues(set({ target_language: tag, source_language: "en" }))).toEqual([]);
  });

  it.each([
    ["deu", "de"],
    ["EN", "en"],
    ["iw", "he"],
    ["zh-hant-tw", "zh-Hant-TW"],
  ])("warns on the non-canonical %s and names %s", (tag, canonical) => {
    expect(manifestIssues(set({ source_language: tag }))).toEqual([
      expect.objectContaining({
        id: "W-LANG-TAG-CANONICAL",
        severity: "warning",
        path: "/sets/0/source_language",
        params: { field: "source_language", tag, canonical },
      }),
    ]);
  });

  it.each(["en_US", "", "a", "toolongtag-x"])("rejects the malformed tag %j", (tag) => {
    expect(manifestIssues(set({ source_language: tag })).map((issue) => issue.id)).toEqual(["E-LANG-TAG"]);
  });

  it("checks the legacy `language` alias as the target", () => {
    const legacy = set({ language: "EN" });
    delete legacy.target_language;
    expect(manifestIssues(legacy)).toEqual([
      expect.objectContaining({ id: "W-LANG-TAG-CANONICAL", path: "/sets/0/target_language", params: { field: "target_language", tag: "EN", canonical: "en" } }),
    ]);
  });

  it("checks a lesson's own tags, at the lesson's paths", () => {
    expect(lessonIssues(lesson({ target_language: "fr", source_language: "deu" }))).toEqual([
      expect.objectContaining({ id: "W-LANG-TAG-CANONICAL", path: "/source_language" }),
    ]);
    const result = validateLesson(lesson({ target_language: "fr_FR" }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.id)).toContain("E-LANG-TAG");
  });

  it("leaves absent and null lesson tags alone", () => {
    expect(lessonIssues(lesson({ target_language: null }))).toEqual([]);
  });
});

describe("2. source equals target", () => {
  it("warns for a language set, comparing primary languages (de-AT is German)", () => {
    expect(manifestIssues(set({ target_language: "de-AT", source_language: "de" }))).toEqual([
      expect.objectContaining({ id: "W-LANG-PAIR-SAME", severity: "warning", path: "/sets/0", params: { language: "de" } }),
    ]);
  });

  it("an absent source defaults to en, as everywhere in the engine", () => {
    const englishForEnglish = set({ target_language: "en" });
    delete englishForEnglish.source_language;
    expect(manifestIssues(englishForEnglish).map((issue) => issue.id)).toEqual(["W-LANG-PAIR-SAME"]);
  });

  it("stays silent for a non-language set, whose material is written in its own language", () => {
    expect(manifestIssues(set({ domain: "psychology", target_language: "de", source_language: "de", level: "none" }))).toEqual([]);
  });

  it("stays silent when a tag is malformed (the error says enough)", () => {
    expect(manifestIssues(set({ target_language: "de_DE", source_language: "de" })).map((issue) => issue.id)).toEqual(["E-LANG-TAG"]);
  });
});

describe("3. title_native", () => {
  it("warns for a language set without it", () => {
    const withoutNative = set();
    delete withoutNative.title_native;
    expect(manifestIssues(withoutNative)).toEqual([
      expect.objectContaining({ id: "W-SET-TITLE-NATIVE", severity: "warning", path: "/sets/0" }),
    ]);
  });

  it("warns for an empty or null one", () => {
    expect(manifestIssues(set({ title_native: "" })).map((issue) => issue.id)).toEqual(["W-SET-TITLE-NATIVE"]);
    expect(manifestIssues(set({ title_native: null })).map((issue) => issue.id)).toEqual(["W-SET-TITLE-NATIVE"]);
  });

  it("stays silent for a non-language set", () => {
    const psychology = set({ domain: "psychology", target_language: "de", source_language: "de", level: "none" });
    delete psychology.title_native;
    expect(manifestIssues(psychology)).toEqual([]);
  });
});

describe("4. card backs in the source language's script", () => {
  it("warns once per lesson, naming every card whose back has letters but none of the script", () => {
    const cards = [
      { id: "c1", back: "νερό" },
      { id: "c2", back: "water" },
      { id: "c3", back: "house" },
    ];
    expect(lessonIssues(lesson({ source_language: "el" }, cards))).toEqual([
      expect.objectContaining({
        id: "W-CARD-BACK-SCRIPT",
        severity: "warning",
        path: "/cards",
        params: { sourceLanguage: "el", script: "Grek", count: 2, cardIds: ["c2", "c3"] },
      }),
    ]);
  });

  it("takes the source language from the caller when the lesson has none of its own", () => {
    expect(lessonIssues(lesson({}, [{ id: "c1", back: "water" }]), "ru").map((issue) => issue.id)).toEqual(["W-CARD-BACK-SCRIPT"]);
  });

  it("the lesson's own source language wins over the caller's", () => {
    expect(lessonIssues(lesson({ source_language: "de" }, [{ id: "c1", back: "Wasser" }]), "ru")).toEqual([]);
  });

  it.each([
    ["ja", "みず"],
    ["ja", "水"],
    ["ko", "물"],
    ["zh", "水"],
    ["zh-TW", "水"],
    ["hi", "पानी"],
    ["he", "מים"],
    ["ka", "წყალი"],
  ])("accepts a %s back written in its script: %s", (source, back) => {
    expect(lessonIssues(lesson({ source_language: source }, [{ id: "c1", back }]))).toEqual([]);
  });

  it("a back with a Latin loanword next to the script is fine: one letter of the script suffices", () => {
    expect(lessonIssues(lesson({ source_language: "ru" }, [{ id: "c1", back: "компьютер (computer)" }]))).toEqual([]);
  });

  it("a back without any letter (a number, a formula) is not flagged", () => {
    const backs = [
      { id: "c1", back: "42" },
      { id: "c2", back: "x = 3.5" },
    ];
    expect(lessonIssues(lesson({ source_language: "el" }, backs)).map((issue) => issue.params)).toEqual([
      { sourceLanguage: "el", script: "Grek", count: 1, cardIds: ["c2"] },
    ]);
  });

  it("stays silent for a Latin-script source, an unknown source and a malformed one", () => {
    const cards = [{ id: "c1", back: "νερό" }];
    expect(lessonIssues(lesson({ source_language: "de" }, cards))).toEqual([]);
    expect(lessonIssues(lesson({}, cards))).toEqual([]);
    expect(lessonIssues(lesson({}, [{ id: "c1", back: "water" }]), "el_GR")).toEqual([]);
  });

  it("validateLessonRules takes the same option", () => {
    const input = lesson({}, [{ id: "c1", back: "water" }]) as unknown as Lesson;
    expect(validateLessonRules(input, { sourceLanguage: "el" }).warnings.map((issue) => issue.id)).toContain("W-CARD-BACK-SCRIPT");
  });
});
