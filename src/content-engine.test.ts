import { describe, it, expect } from "vitest";

import {
  asContentSetBook,
  asContentSetEntry,
  parseLesson,
  parseManifest,
  resolveLanguagePair,
  setBasePath,
  singleJsonLessonAdapter,
  type LessonSetContext,
  type LessonSourceAdapter,
  type ParsedSetBook,
} from "./content-engine.js";
import type { ContentSetSource } from "./types/index.js";

const SET_CONTEXT: LessonSetContext = {
  language: "fr",
  target_language: "fr",
  source_language: "de",
  domain: "language",
};

const SOURCE: ContentSetSource = {
  source: "astrapi69/adaptive-learner-content",
  branch: "main",
};

describe("Content-Engine — single-JSON lesson adapter", () => {
  it("parses raw JSON into the canonical lesson", () => {
    const raw = JSON.stringify({ id: "01", title: "Greetings", steps: [], cards: [] });
    const lesson = parseLesson(raw, SET_CONTEXT);
    expect(lesson.id).toBe("01");
    expect(lesson.title).toBe("Greetings");
  });

  it("injects the set-inherited language pair + domain when the lesson omits them", () => {
    const raw = JSON.stringify({ id: "01", title: "Greetings", steps: [], cards: [] });
    const lesson = parseLesson(raw, SET_CONTEXT);
    expect(lesson.target_language).toBe("fr");
    expect(lesson.source_language).toBe("de");
    expect(lesson.domain).toBe("language");
  });

  it("keeps the lesson's own language pair + domain when present (standalone export)", () => {
    const raw = JSON.stringify({
      id: "01",
      title: "Greetings",
      steps: [],
      cards: [],
      target_language: "es",
      source_language: "en",
      domain: "programming",
    });
    const lesson = parseLesson(raw, SET_CONTEXT);
    expect(lesson.target_language).toBe("es");
    expect(lesson.source_language).toBe("en");
    expect(lesson.domain).toBe("programming");
  });

  it("falls back to the legacy set ``language`` alias for the target", () => {
    // A legacy set row carries only ``language`` (no ``target_language``); the
    // adapter's ``?? context.language`` reaches it because both prior operands
    // are nullish.
    const legacyContext = {
      language: "it",
      source_language: "en",
      domain: "language",
    } as unknown as LessonSetContext;
    const raw = JSON.stringify({ id: "01", title: "X", steps: [], cards: [] });
    const lesson = parseLesson(raw, legacyContext);
    expect(lesson.target_language).toBe("it");
  });

  it("routes through a custom source adapter (the multi-file seam)", () => {
    const fakeMultiFile: LessonSourceAdapter = () =>
      ({ id: "merged", title: "from four files" }) as never;
    const lesson = parseLesson("ignored", SET_CONTEXT, fakeMultiFile);
    expect(lesson.id).toBe("merged");
  });

  it("exposes the single-JSON adapter under the shared concept name", () => {
    const raw = JSON.stringify({ id: "01", title: "X", steps: [], cards: [] });
    expect(singleJsonLessonAdapter(raw, SET_CONTEXT).id).toBe("01");
  });

  it("throws on invalid JSON input", () => {
    expect(() => parseLesson("{ not valid json", SET_CONTEXT)).toThrow();
  });
});

describe("Content-Engine — manifest parse", () => {
  it("parses a manifest YAML document", () => {
    const manifest = parseManifest("name: Pilot\nsets:\n  - id: fr-a1\n    title: French A1\n");
    expect(manifest?.name).toBe("Pilot");
    expect(manifest?.sets?.[0]?.id).toBe("fr-a1");
  });

  it("returns null for an empty document", () => {
    expect(parseManifest("")).toBeNull();
  });
});

describe("Content-Engine — canonical set-entry projection", () => {
  it("resolves the language pair honouring the legacy alias + ``en`` default", () => {
    expect(resolveLanguagePair({ language: "fr" })).toEqual({ target: "fr", source: "en" });
    expect(
      resolveLanguagePair({ target_language: "es", source_language: "de" }),
    ).toEqual({ target: "es", source: "de" });
  });

  it("falls back to an empty target and ``en`` source when nothing is declared", () => {
    // Boundary: neither ``target_language`` nor the ``language`` alias is
    // present, so target resolves to the final ``?? ""`` fallback.
    expect(resolveLanguagePair({})).toEqual({ target: "", source: "en" });
  });

  it("falls back to ``sets/{id}`` when no path is declared", () => {
    expect(setBasePath({ id: "fr-a1" })).toBe("sets/fr-a1");
    expect(setBasePath({ id: "fr-a1", path: "sets/de/fr-a1" })).toBe("sets/de/fr-a1");
  });

  it("returns null for a book block without a title", () => {
    expect(asContentSetBook(undefined)).toBeNull();
    expect(asContentSetBook({ title: "  " })).toBeNull();
    expect(asContentSetBook({ title: "A Book", author: "X" })).toEqual({
      title: "A Book",
      author: "X",
      url: null,
      asin: null,
    });
  });

  it("keeps string url + asin and coerces a non-string author to null", () => {
    // Boundary between the ``typeof === "string" ? ... : null`` arms:
    // url/asin hit the string arm, author (null) hits the null arm.
    const book = asContentSetBook({
      title: "A Book",
      author: null,
      url: "https://example.test/book",
      asin: "B000000000",
    } as ParsedSetBook);
    expect(book).toEqual({
      title: "A Book",
      author: null,
      url: "https://example.test/book",
      asin: "B000000000",
    });
  });

  it("projects a parsed set into a canonical entry with defaults", () => {
    const entry = asContentSetEntry(
      SOURCE,
      {
        id: "fr-a1",
        title: "French A1",
        target_language: "fr",
        source_language: "de",
        level: "A1",
        version: "1.0.0",
        lesson_count: 10,
      },
      null,
    );
    expect(entry.id).toBe("fr-a1");
    expect(entry.source).toBe(SOURCE.source);
    expect(entry.target_language).toBe("fr");
    expect(entry.source_language).toBe("de");
    expect(entry.language).toBe("fr");
    expect(entry.domain).toBe("language");
    expect(entry.update_available).toBe(false);
    expect(entry.status).toBe("active");
    expect(entry.book).toBeNull();
  });

  it("defaults the domain to ``language`` and source to ``en`` when omitted", () => {
    const entry = asContentSetEntry(
      SOURCE,
      { id: "fr-a1", title: "French A1", language: "fr", level: "A1", version: "1.0.0", lesson_count: 3 },
      null,
    );
    expect(entry.domain).toBe("language");
    expect(entry.source_language).toBe("en");
    expect(entry.language).toBe("fr");
  });

  it("marks update_available when the cached version differs", () => {
    const entry = asContentSetEntry(
      SOURCE,
      {
        id: "fr-a1",
        title: "French A1",
        target_language: "fr",
        level: "A1",
        version: "1.1.0",
        lesson_count: 10,
      },
      "1.0.0",
    );
    expect(entry.update_available).toBe(true);
    expect(entry.cached_version).toBe("1.0.0");
  });

  it("does not mark update_available when the cached version matches (boundary)", () => {
    // The boundary between "no cache -> false" and "differs -> true":
    // a non-null cache equal to the current version stays false.
    const entry = asContentSetEntry(
      SOURCE,
      { id: "fr-a1", title: "French A1", target_language: "fr", level: "A1", version: "1.0.0", lesson_count: 10 },
      "1.0.0",
    );
    expect(entry.update_available).toBe(false);
    expect(entry.cached_version).toBe("1.0.0");
  });

  it("passes through downloaded_at, explicit status and optional set fields", () => {
    const entry = asContentSetEntry(
      SOURCE,
      {
        id: "fr-a1",
        title: "French A1",
        title_native: "Français A1",
        target_language: "fr",
        source_language: "de",
        level: "A1",
        version: "1.0.0",
        lesson_count: 10,
        description: "Beginner French",
        tags: ["french", "a1"],
        cover_image: "cover.png",
      },
      null,
      "2026-07-01T00:00:00Z",
      "deferred",
    );
    expect(entry.downloaded_at).toBe("2026-07-01T00:00:00Z");
    expect(entry.status).toBe("deferred");
    expect(entry.title_native).toBe("Français A1");
    expect(entry.description).toBe("Beginner French");
    expect(entry.tags).toEqual(["french", "a1"]);
    expect(entry.cover_image).toBe("cover.png");
  });
});
