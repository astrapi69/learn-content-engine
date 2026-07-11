import { describe, it, expect } from "vitest";

import {
  applyWiringSuggestions,
  formatSuggestWiringReports,
  parseSuggestWiringArgs,
  suggestWiring,
  suggestWiringContent,
  type WiringSuggestion,
} from "./suggest-wiring.js";

/**
 * Suggest mode for W-CARD-UNUSED (#20): propose card -> exercise wirings from
 * EXACT text containment only (card front/back appears verbatim in an exercise
 * text field). Anything ambiguous or unmatched is "manual review", never a
 * guess; --write applies only explicitly accepted suggestions and only after
 * the rewired lesson passed validateLesson (the migrate write gate).
 */

interface CardFixture {
  id: string;
  front: string;
  back: string;
}

type ExerciseFixture = Record<string, unknown>;

const card = (id: string, front: string, back: string): CardFixture => ({ id, front, back });

const freeText = (id: string, prompt: string, cardIds?: string[]): ExerciseFixture => ({
  id,
  type: "free_text",
  prompt,
  accept: ["richtig"],
  ...(cardIds ? { card_ids: cardIds } : {}),
});

const lessonWith = (cards: CardFixture[], exercises: ExerciseFixture[]) => ({
  id: "l1",
  title: "T",
  cards,
  steps: [
    { id: "t1", type: "theory", body: "Theorie." },
    ...exercises.map((exercise, i) => ({ id: `s${i}`, type: "exercise", exercise })),
  ],
});

const usedCard = card("timing", "das Timing", "gutes Timing beim Belohnen");

describe("suggestWiring: unique verbatim match -> suggestion with evidence", () => {
  it("proposes the one exercise whose prompt contains the card front verbatim", () => {
    const lesson = lessonWith(
      [usedCard, card("belohnung", "die Belohnung", "reward")],
      [
        freeText("ex-timing", "Wann gibst du die Belohnung?", ["timing"]),
        freeText("ex-other", "Was tust du bei Fehlern?", ["timing"]),
      ],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.manualReview).toEqual([]);
    expect(outcome.suggestions).toEqual([
      {
        suggestionId: "belohnung:ex-timing",
        cardId: "belohnung",
        exerciseId: "ex-timing",
        evidence: [
          {
            field: "prompt",
            cardSide: "front",
            matchedText: "die Belohnung",
            quote: "Wann gibst du die Belohnung?",
          },
        ],
      },
    ]);
  });

  it("finds matches in non-prompt text fields (options, pairs, tiles, accept, sentence)", () => {
    const lesson = lessonWith(
      [card("sitz", "Sitz", "sit")],
      [
        {
          id: "ex-mc",
          type: "multiple_choice",
          prompt: "Welches Kommando kommt zuerst?",
          options: [
            { text: "Sitz vor dem Futter", correct: true },
            { text: "Gar keins" },
          ],
        },
      ],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.suggestions).toHaveLength(1);
    expect(outcome.suggestions[0]!.evidence).toEqual([
      {
        field: "options[0].text",
        cardSide: "front",
        matchedText: "Sitz",
        quote: "Sitz vor dem Futter",
      },
    ]);
  });

  it("treats several matching fields in ONE exercise as one suggestion, not ambiguity", () => {
    const lesson = lessonWith(
      [card("platz", "Platz", "down")],
      [
        {
          id: "ex-cloze",
          type: "cloze",
          prompt: "Setze das Kommando ein: Platz!",
          sentence: "Der Hund macht ___.",
          blanks: [{ accept: ["Platz"] }],
        },
      ],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.manualReview).toEqual([]);
    expect(outcome.suggestions).toHaveLength(1);
    const fields = outcome.suggestions[0]!.evidence.map((entry) => entry.field);
    expect(fields).toContain("prompt");
    expect(fields).toContain("blanks[0].accept[0]");
  });
});

describe("suggestWiring: no guessing", () => {
  it("reports a card without any verbatim match as manual review, no suggestion", () => {
    const lesson = lessonWith(
      [usedCard, card("koerpersprache", "die Körpersprache", "body language")],
      [freeText("ex-timing", "Wann belohnst du?", ["timing"])],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.suggestions).toEqual([]);
    expect(outcome.manualReview).toEqual([
      {
        cardId: "koerpersprache",
        reason: "no verbatim match in any exercise text field",
      },
    ]);
  });

  it("reports an ambiguous card (two exercises match equally) as manual review with candidates", () => {
    const lesson = lessonWith(
      [usedCard, card("leine", "die Leine", "leash")],
      [
        freeText("ex-a", "Nimm die Leine kurz.", ["timing"]),
        freeText("ex-b", "Häng die Leine an den Haken.", ["timing"]),
      ],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.suggestions).toEqual([]);
    expect(outcome.manualReview).toEqual([
      {
        cardId: "leine",
        reason: "ambiguous: verbatim match in 2 exercises - pick one manually",
        candidateExerciseIds: ["ex-a", "ex-b"],
      },
    ]);
  });

  it("never lets an empty card text match everything", () => {
    const lesson = lessonWith(
      [usedCard, { id: "leer", front: "", back: "zzz-nirgends" }],
      [freeText("ex-timing", "Wann belohnst du?", ["timing"])],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.suggestions).toEqual([]);
    expect(outcome.manualReview).toEqual([
      { cardId: "leer", reason: "no verbatim match in any exercise text field" },
    ]);
  });
});

describe("suggestWiring: already-used cards are not touched (regression)", () => {
  it("produces no suggestion for a card that an exercise already references", () => {
    const lesson = lessonWith(
      [usedCard],
      [
        freeText("ex-timing", "Wie wichtig ist das Timing?", ["timing"]),
        freeText("ex-other", "Auch hier: das Timing zählt.", ["timing"]),
      ],
    );
    const outcome = suggestWiring(lesson as never);
    expect(outcome.suggestions).toEqual([]);
    expect(outcome.manualReview).toEqual([]);
  });
});

describe("parseSuggestWiringArgs: governance at the arg level", () => {
  it("parses paths, --json and repeated --write --accept pairs", () => {
    expect(
      parseSuggestWiringArgs([
        "suggest-wiring",
        "a.json",
        "b.json",
        "--json",
        "--write",
        "--accept",
        "belohnung:ex-timing",
        "--accept",
        "sitz:ex-mc",
      ]),
    ).toEqual({
      paths: ["a.json", "b.json"],
      write: true,
      json: true,
      accept: ["belohnung:ex-timing", "sitz:ex-mc"],
    });
  });

  it("is dry-run by default", () => {
    expect(parseSuggestWiringArgs(["suggest-wiring", "a.json"])).toEqual({
      paths: ["a.json"],
      write: false,
      json: false,
      accept: [],
    });
  });

  it("rejects --write without --accept (no bulk apply, ever)", () => {
    expect(parseSuggestWiringArgs(["suggest-wiring", "a.json", "--write"])).toEqual({
      error: expect.stringContaining("--accept"),
    });
  });

  it("rejects --accept without --write and --accept without a value", () => {
    expect(parseSuggestWiringArgs(["suggest-wiring", "a.json", "--accept", "x:y"])).toEqual({
      error: expect.stringContaining("--write"),
    });
    expect(parseSuggestWiringArgs(["suggest-wiring", "a.json", "--write", "--accept"])).toEqual({
      error: expect.stringContaining("suggestion id"),
    });
  });

  it("errors when no files are given", () => {
    expect(parseSuggestWiringArgs(["suggest-wiring"])).toEqual({
      error: expect.stringContaining("usage"),
    });
  });
});

describe("suggestWiringContent: accepted suggestions only, write-gated", () => {
  const twoSuggestionLesson = lessonWith(
    [usedCard, card("belohnung", "die Belohnung", "reward"), card("sitz", "Sitz üben", "sit")],
    [
      freeText("ex-timing", "Wann gibst du die Belohnung?", ["timing"]),
      freeText("ex-sitz", "Wie oft solltest du Sitz üben?", ["timing"]),
    ],
  );

  it("dry-run (no accepted ids) never produces a writable lesson", () => {
    const report = suggestWiringContent(JSON.stringify(twoSuggestionLesson), "l.json");
    expect(report.ok).toBe(true);
    expect(report.suggestions).toHaveLength(2);
    expect(report.accepted).toEqual([]);
    expect(report.lesson).toBeUndefined();
  });

  it("applies exactly the accepted suggestion and leaves the other exercise untouched", () => {
    const report = suggestWiringContent(JSON.stringify(twoSuggestionLesson), "l.json", [
      "belohnung:ex-timing",
    ]);
    expect(report.ok).toBe(true);
    expect(report.accepted).toEqual(["belohnung:ex-timing"]);
    const steps = (report.lesson as { steps: { exercise?: { id: string; card_ids?: string[] } }[] }).steps;
    const exTiming = steps.find((step) => step.exercise?.id === "ex-timing")!.exercise!;
    const exSitz = steps.find((step) => step.exercise?.id === "ex-sitz")!.exercise!;
    expect(exTiming.card_ids).toEqual(["timing", "belohnung"]);
    expect(exSitz.card_ids).toEqual(["timing"]);
  });

  it("discards the write when the rewired lesson fails validateLesson", () => {
    const fiftyCards = Array.from({ length: 50 }, (_card, i) => card(`c${i}`, `vorn-${i}`, `hinten-${i}`));
    const lesson = lessonWith(
      [...fiftyCards, card("extra", "die Zusatzkarte", "extra card")],
      [
        {
          ...freeText("ex-voll", "Was ist die Zusatzkarte?"),
          card_ids: fiftyCards.map((cardFixture) => cardFixture.id),
        },
      ],
    );
    const report = suggestWiringContent(JSON.stringify(lesson), "l.json", ["extra:ex-voll"]);
    expect(report.suggestions).toHaveLength(1);
    expect(report.ok).toBe(false);
    expect(report.lesson).toBeUndefined();
    expect(report.validation?.valid).toBe(false);
  });

  it("reports invalid JSON as a parse error", () => {
    const report = suggestWiringContent("{nope", "broken.json");
    expect(report.ok).toBe(false);
    expect(report.parseError).toBeTruthy();
  });

  it("refuses to suggest on a lesson that fails validation itself", () => {
    const report = suggestWiringContent(JSON.stringify({ id: "x" }), "invalid.json");
    expect(report.ok).toBe(false);
    expect(report.suggestions).toEqual([]);
    expect(report.validation?.valid).toBe(false);
  });
});

describe("applyWiringSuggestions", () => {
  it("appends the card id and creates card_ids when absent, without mutating the input", () => {
    const lesson = lessonWith(
      [card("solo", "allein", "alone")],
      [freeText("ex-frei", "Bleib mal allein hier.")],
    );
    const suggestion: WiringSuggestion = {
      suggestionId: "solo:ex-frei",
      cardId: "solo",
      exerciseId: "ex-frei",
      evidence: [],
    };
    const rewired = applyWiringSuggestions(lesson as never, [suggestion]) as typeof lesson;
    const rewiredExercise = rewired.steps[1]! as { exercise?: { card_ids?: string[] } };
    expect(rewiredExercise.exercise?.card_ids).toEqual(["solo"]);
    const originalExercise = lesson.steps[1]! as { exercise?: { card_ids?: string[] } };
    expect(originalExercise.exercise?.card_ids).toBeUndefined();
  });
});

describe("formatSuggestWiringReports", () => {
  const suggestionLesson = lessonWith(
    [usedCard, card("belohnung", "die Belohnung", "reward"), card("insel", "die Insel", "island")],
    [freeText("ex-timing", "Wann gibst du die Belohnung?", ["timing"])],
  );

  it("dry-run output lists suggestion ids, evidence and the manual-review cards, exit 0", () => {
    const reports = [suggestWiringContent(JSON.stringify(suggestionLesson), "l.json")];
    const { text, exitCode } = formatSuggestWiringReports(reports, { json: false, write: false, accept: [] });
    expect(exitCode).toBe(0);
    expect(text).toContain("belohnung:ex-timing");
    expect(text).toContain("prompt");
    expect(text).toContain("Wann gibst du die Belohnung?");
    expect(text).toContain("insel");
    expect(text).toContain("manual");
    expect(text).toContain("dry run");
  });

  it("write output reports the applied suggestion, exit 0", () => {
    const reports = [
      suggestWiringContent(JSON.stringify(suggestionLesson), "l.json", ["belohnung:ex-timing"]),
    ];
    const { text, exitCode } = formatSuggestWiringReports(reports, {
      json: false,
      write: true,
      accept: ["belohnung:ex-timing"],
    });
    expect(exitCode).toBe(0);
    expect(text).toContain("applied");
    expect(text).toContain("belohnung:ex-timing");
  });

  it("an accepted id that matches no suggestion in any file is reported and fails, nothing applied", () => {
    const reports = [
      suggestWiringContent(JSON.stringify(suggestionLesson), "l.json", ["tippfehler:ex-timing"]),
    ];
    const { text, exitCode } = formatSuggestWiringReports(reports, {
      json: false,
      write: true,
      accept: ["tippfehler:ex-timing"],
    });
    expect(exitCode).toBe(1);
    expect(text).toContain("tippfehler:ex-timing");
    expect(text).toContain("matches no suggestion");
    expect(reports[0]!.accepted).toEqual([]);
    expect(reports[0]!.lesson).toBeUndefined();
  });

  it("json output is machine-readable and omits the lesson payload", () => {
    const reports = [
      suggestWiringContent(JSON.stringify(suggestionLesson), "l.json", ["belohnung:ex-timing"]),
    ];
    const { text } = formatSuggestWiringReports(reports, {
      json: true,
      write: true,
      accept: ["belohnung:ex-timing"],
    });
    const parsed = JSON.parse(text) as Record<string, unknown>[];
    expect(parsed[0]!["path"]).toBe("l.json");
    expect(parsed[0]!["suggestions"]).toBeTruthy();
    expect(parsed[0]!["lesson"]).toBeUndefined();
  });

  it("a gate-rejected write renders as ERROR with the validation issue, exit 1", () => {
    const fiftyCards = Array.from({ length: 50 }, (_card, i) => card(`c${i}`, `vorn-${i}`, `hinten-${i}`));
    const overflow = lessonWith(
      [...fiftyCards, card("extra", "die Zusatzkarte", "extra card")],
      [
        {
          ...freeText("ex-voll", "Was ist die Zusatzkarte?"),
          card_ids: fiftyCards.map((cardFixture) => cardFixture.id),
        },
      ],
    );
    const reports = [suggestWiringContent(JSON.stringify(overflow), "l.json", ["extra:ex-voll"])];
    const { text, exitCode } = formatSuggestWiringReports(reports, {
      json: false,
      write: true,
      accept: ["extra:ex-voll"],
    });
    expect(exitCode).toBe(1);
    expect(text).toContain("ERROR");
    expect(text).toContain("not written");
  });
});
