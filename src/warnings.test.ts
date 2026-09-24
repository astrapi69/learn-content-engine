import { describe, it, expect } from "vitest";

import { validateLesson, type ValidationIssue, type ValidationResult } from "./validate.js";

/**
 * Author-ergonomics: the non-blocking warning layer + stable rule IDs.
 * Warnings never change `valid` (errors-only) and never appear in `errors`;
 * they live in `warnings`. Every issue (error or warning) carries a stable
 * `id`, a `severity`, and a `docAnchor`.
 */

interface StepInput {
  id: string;
  type: "theory" | "exercise";
  title?: string;
  body?: string;
  exercise?: Record<string, unknown>;
}
const lesson = (steps: StepInput[], cards: Record<string, unknown>[] = []): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps,
  cards,
});
const ex = (exercise: Record<string, unknown>): StepInput => ({ id: "s1", type: "exercise", exercise });

const byId = (issues: ValidationIssue[], id: string): ValidationIssue | undefined =>
  issues.find((issue) => issue.id === id);
const hasWarning = (result: ValidationResult, id: string): boolean => byId(result.warnings, id) !== undefined;

const CLEAN = lesson(
  [ex({ id: "e1", type: "free_text", prompt: "Say hello.", card_ids: ["c1"], accept: ["bonjour"] })],
  [{ id: "c1", front: "bonjour", back: "hello" }],
);

describe("warning layer — shape and severity", () => {
  it("adds an empty warnings array on a clean lesson", () => {
    const result = validateLesson(CLEAN);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("tags every error with a stable id, severity 'error', and a doc anchor", () => {
    const result = validateLesson(lesson([ex({ id: "e1", type: "matching", prompt: "?", pairs: [] })]));
    expect(result.valid).toBe(false);
    const issue = result.errors[0]!;
    expect(issue.id).toMatch(/^E-/);
    expect(issue.severity).toBe("error");
    expect(issue.docAnchor).toContain("docs/lesson-format.md#");
    // errors never leak into warnings and vice-versa
    expect(result.warnings.every((warning) => warning.severity === "warning")).toBe(true);
  });

  it("warnings never flip `valid` or appear as errors", () => {
    const withUnusedCard = lesson(
      [ex({ id: "e1", type: "free_text", prompt: "?", card_ids: ["c1"], accept: ["a"] })],
      [
        { id: "c1", front: "x", back: "y" },
        { id: "c2", front: "orphan", back: "z" },
      ],
    );
    const result = validateLesson(withUnusedCard);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(hasWarning(result, "W-CARD-UNUSED")).toBe(true);
  });
});

describe("analysis warnings", () => {
  it("W-CARD-UNUSED names the unreferenced card", () => {
    const result = validateLesson(
      lesson(
        [ex({ id: "e1", type: "free_text", prompt: "?", card_ids: ["c1"], accept: ["a"] })],
        [
          { id: "c1", front: "x", back: "y" },
          { id: "orphan", front: "o", back: "p" },
        ],
      ),
    );
    expect(byId(result.warnings, "W-CARD-UNUSED")?.message).toContain("orphan");
  });

  it("W-CARD-UNUSED aggregates a lesson's unused cards into ONE warning", () => {
    const result = validateLesson(
      lesson(
        [ex({ id: "e1", type: "free_text", prompt: "?", card_ids: ["c1"], accept: ["a"] })],
        [
          { id: "c1", front: "x", back: "y" },
          { id: "o1", front: "a", back: "b" },
          { id: "o2", front: "c", back: "d" },
          { id: "o3", front: "e", back: "f" },
        ],
      ),
    );
    // One aggregated warning per lesson, not one per orphan card: a card-rich
    // set (cards as knowledge base, exercises a curated subset) must not bury
    // the rare real author mistake under dozens of lines (alert fatigue).
    const cardWarnings = result.warnings.filter((warning) => warning.id === "W-CARD-UNUSED");
    expect(cardWarnings).toHaveLength(1);
    const message = cardWarnings[0]!.message;
    expect(message).toContain("3");
    for (const id of ["o1", "o2", "o3"]) expect(message).toContain(id);
  });

  it("W-MATCH-AMBIG warns on a duplicated RIGHT value (ambiguous, never blocks)", () => {
    const dupRight = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "matching",
          prompt: "?",
          pairs: [
            { left: "a", right: "1" },
            { left: "b", right: "1" },
          ],
        }),
      ]),
    );
    expect(hasWarning(dupRight, "W-MATCH-AMBIG")).toBe(true);
    expect(dupRight.valid).toBe(true);
  });

  const matchLefts = (a: string, b: string): ValidationResult =>
    validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "matching",
          prompt: "?",
          pairs: [
            { left: a, right: "1" },
            { left: "Ohne Grenzen", right: "2" },
            { left: b, right: "3" },
          ],
        }),
      ]),
    );

  it("E-MATCH-DUP-LEFT: a repeated left term is a HARD error, naming the term and positions", () => {
    const exact = matchLefts("Empathie", "Empathie");
    expect(exact.valid).toBe(false);
    const issue = byId(exact.errors, "E-MATCH-DUP-LEFT");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("Empathie");
    expect(issue?.message).toContain("1");
    expect(issue?.message).toContain("3");
    // the hard error replaces the softer warning for the left case (no double report)
    expect(hasWarning(exact, "W-MATCH-AMBIG")).toBe(false);
  });

  it("E-MATCH-DUP-LEFT: comparison is case-insensitive and whitespace-trimmed", () => {
    expect(byId(matchLefts("Empathie", "empathie").errors, "E-MATCH-DUP-LEFT")).toBeDefined();
    expect(byId(matchLefts("Empathie", " Empathie ").errors, "E-MATCH-DUP-LEFT")).toBeDefined();
  });

  it("E-MATCH-DUP-LEFT: unique left terms produce no error", () => {
    const unique = matchLefts("Empathie", "Gelebtes Mitgefühl");
    expect(byId(unique.errors, "E-MATCH-DUP-LEFT")).toBeUndefined();
    expect(unique.valid).toBe(true);
  });

  it("E-MATCH-DUP-LEFT: the three alc#27 fixtures would have failed before the fix", () => {
    // Reconstructed from alc-die-waehrung-des-geistes#27 (the "alt (doppelt)" column):
    // the same left term appeared twice for two different definitions.
    for (const term of ["Empathie", "Präsenz", "Integration"]) {
      const result = validateLesson(
        lesson([
          ex({
            id: "e-bilder",
            type: "matching",
            prompt: "Ordne jeder Aussage den Begriff zu.",
            pairs: [
              { left: term, right: "Definition A" },
              { left: "Ohne Grenzen", right: "Definition B" },
              { left: term, right: "Definition C" },
            ],
          }),
        ]),
      );
      expect(result.valid).toBe(false);
      expect(byId(result.errors, "E-MATCH-DUP-LEFT")?.message).toContain(term);
    }
  });

  it("W-TILES-DUP on duplicate tiles without accept_orderings", () => {
    const result = validateLesson(
      lesson([ex({ id: "e1", type: "word_tiles", prompt: "?", tiles: ["und", "kurz", "und", "oft"] })]),
    );
    expect(hasWarning(result, "W-TILES-DUP")).toBe(true);
    // ...but not when accept_orderings is present (author handled it)
    const handled = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "word_tiles",
          prompt: "?",
          tiles: ["und", "kurz", "und", "oft"],
          accept_orderings: [[0, 1, 2, 3]],
        }),
      ]),
    );
    expect(hasWarning(handled, "W-TILES-DUP")).toBe(false);
  });

  it("W-TILES-DUP message is engine-neutral: rule + index-grading consequence, no consumer tickets", () => {
    const result = validateLesson(
      lesson([ex({ id: "e1", type: "word_tiles", prompt: "?", tiles: ["und", "kurz", "und", "oft"] })]),
    );
    const message = byId(result.warnings, "W-TILES-DUP")?.message ?? "";
    expect(message).toContain("accept_orderings");
    expect(message).toContain("tile index");
    // engine-neutral: no consumer names, no consumer-internal ticket references
    expect(message).not.toMatch(/adaptive-learner|#\d+|\bapp\b/i);
  });

  it("W-HINT-LENGTH message is engine-neutral (no consumer internals)", () => {
    const result = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["tree"], hint: "It is 4 letters long." })]),
    );
    const message = byId(result.warnings, "W-HINT-LENGTH")?.message ?? "";
    expect(message).toContain("answer length");
    expect(message).not.toMatch(/adaptive-learner|#\d+|\bapp\b/i);
  });

  it("W-DISTRACTOR-ANSWER when a select cloze distractor equals the answer", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "select",
          prompt: "?",
          sentence: "Paris is in ___.",
          blanks: [{ accept: ["France"] }],
          distractors: ["France", "Spain"],
        }),
      ]),
    );
    expect(hasWarning(result, "W-DISTRACTOR-ANSWER")).toBe(true);
  });

  it("W-CLOZE-NO-CARRIER: a select cloze whose sentence is only blanks is a multiple_choice", () => {
    // The reproduction case: the question lives in the prompt, the sentence
    // carries nothing but the blank. 190 exercises across three content repos
    // have this shape, all produced before the native type existed.
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "select",
          prompt: "Which greeting fits the evening?",
          sentence: "___",
          blanks: [{ accept: ["bonsoir"] }],
          distractors: ["bonjour", "salut"],
        }),
      ]),
    );
    expect(hasWarning(result, "W-CLOZE-NO-CARRIER")).toBe(true);
    const message = byId(result.warnings, "W-CLOZE-NO-CARRIER")?.message ?? "";
    expect(message).toContain("multiple_choice");
    expect(result.valid).toBe(true);
  });

  it("W-CLOZE-NO-CARRIER names free_text for a typed cloze", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "type",
          prompt: "What is the French word for hello?",
          sentence: "___",
          blanks: [{ accept: ["bonjour"] }],
        }),
      ]),
    );
    const message = byId(result.warnings, "W-CLOZE-NO-CARRIER")?.message ?? "";
    expect(message).toContain("free_text");
    expect(message).not.toContain("multiple_choice");
  });

  it("stays silent on a cloze that has a carrier sentence", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "select",
          prompt: "Fill the gap.",
          sentence: "Le ___.",
          blanks: [{ accept: ["soir"] }],
          distractors: ["matin"],
        }),
      ]),
    );
    expect(hasWarning(result, "W-CLOZE-NO-CARRIER")).toBe(false);
  });

  it("boundary: blanks plus punctuation only still count as no carrier", () => {
    // Two blanks and nothing to read between them: the sentence teaches
    // nothing, so the exercise is a question with options, not a gap text.
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "select",
          prompt: "Pick both forms.",
          sentence: "___ / ___",
          blanks: [{ accept: ["un"] }, { accept: ["une"] }],
          distractors: ["des"],
        }),
      ]),
    );
    expect(hasWarning(result, "W-CLOZE-NO-CARRIER")).toBe(true);
  });

  it("boundary: one word beside the blank is a carrier", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "type",
          prompt: "Complete it.",
          sentence: "Bonjour ___",
          blanks: [{ accept: ["Marie"] }],
        }),
      ]),
    );
    expect(hasWarning(result, "W-CLOZE-NO-CARRIER")).toBe(false);
  });

  it("leaves multiselect alone - its sentence IS the question by design", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "multiselect",
          prompt: "Select all that apply.",
          sentence: "Which words are greetings?",
          accept: ["bonjour", "salut"],
          distractors: ["merci"],
        }),
      ]),
    );
    expect(hasWarning(result, "W-CLOZE-NO-CARRIER")).toBe(false);
  });

  it("W-PIC-DUP-LABEL when a distractor image label equals the correct label", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "picture_choice",
          prompt: "?",
          images: [
            { src: "a.png", label: "Cat", is_correct: "true" },
            { src: "b.png", label: "Cat" },
          ],
        }),
      ]),
    );
    expect(hasWarning(result, "W-PIC-DUP-LABEL")).toBe(true);
  });

  it("W-PIC-DATA-URI when an image src is an inline data URI", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "picture_choice",
          prompt: "?",
          images: [
            { src: `data:image/png;base64,${"A".repeat(800)}`, label: "Cat", is_correct: "true" },
            { src: "b.png", label: "Dog" },
          ],
        }),
      ]),
    );
    expect(hasWarning(result, "W-PIC-DATA-URI")).toBe(true);
  });

  it("no W-PIC-DATA-URI for repo-path srcs", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "picture_choice",
          prompt: "?",
          images: [
            { src: "assets/img/cat.png", label: "Cat", is_correct: "true" },
            { src: "assets/img/dog.png", label: "Dog" },
          ],
        }),
      ]),
    );
    expect(hasWarning(result, "W-PIC-DATA-URI")).toBe(false);
  });

  it("W-HINT-LENGTH when a hint mentions the answer length", () => {
    const german = validateLesson(
      lesson([
        ex({ id: "e1", type: "free_text", prompt: "?", accept: ["Baum"], hint: "Die Antwort hat vier Buchstaben." }),
      ]),
    );
    expect(hasWarning(german, "W-HINT-LENGTH")).toBe(true);
    const english = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["tree"], hint: "It is 4 letters long." })]),
    );
    expect(hasWarning(english, "W-HINT-LENGTH")).toBe(true);
  });

  it("does not warn on a hint that reveals no length", () => {
    const noNumber = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["Tier"], hint: "Denke an ein Tier." })]),
    );
    expect(hasWarning(noNumber, "W-HINT-LENGTH")).toBe(false);
    const numberButNoLengthNoun = validateLesson(
      lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["a"], hint: "Es gibt drei Optionen." })]),
    );
    expect(hasWarning(numberButNoLengthNoun, "W-HINT-LENGTH")).toBe(false);
  });
});

describe("W-HINT-LENGTH: one rule for engine and template (engine#186)", () => {
  // The case table joins the engine's cases and the template's
  // (adaptive-learner-content#100/#102), which checked the same thing twice
  // with different results. The rule: a count word directly before a length
  // noun, with word boundaries, so compounds and word parts stay silent.
  const withHint = (hint: string) =>
    validateLesson(lesson([ex({ id: "e1", type: "free_text", prompt: "?", accept: ["x"], hint })]));

  it.each([
    "Vier Buchstaben.",
    "Zwei Zeichen, das zweite klein.",
    "Genau drei Buchstaben tippen.",
    "Nur 8 Zeichen lang.",
    "Die Antwort hat vier Buchstaben.",
    "It is 4 letters long.",
    "Two letters.",
    "Two short words; the first is two letters long.",
    "Four letters, starts with C.",
    "A five-letter word.",
    // the template's forms the engine missed
    "Eine Kurzform mit einem Buchstaben.",
    "A single character is enough.",
    "Ein einzelnes Zeichen, kein Doppelzeichen.",
    "Elf Buchstaben, beginnt mit K.",
    "Twelve letters.",
    "Ein fünfbuchstabiges Wort.",
    // the reversed form the engine found and the template missed
    "Anzahl der Buchstaben: vier.",
    "Länge in Zeichen: 5",
  ])("warns on %j", (hint) => {
    expect(hasWarning(withHint(hint), "W-HINT-LENGTH")).toBe(true);
  });

  it.each([
    "Einrückung: vier Leerzeichen pro Ebene.",
    "Object pronoun: *The letter she wrote…*",
    "Ein einzelner Kleinbuchstabe, für 'general'.",
    "Erster Buchstabe von 'write'.",
    "Montag: im Englischen IMMER mit großem Anfangsbuchstaben.",
    "Es gibt drei Optionen, der erste Buchstabe ist groß.",
    "Das Wort hat 3 Silben und beginnt mit dem Buchstaben K.",
    "Achte auf das Zeichen: ein Kreis.",
    // the 44 live false positives of engine 0.28.0 (word parts read as
    // count words or length nouns), one per trigger
    "Achte auf ähnlich aussehende Zeichen.",
    "Das zweite Zeichen steht im neutralen Ton.",
    "Two parts: alta = characteristic (ser → soy), feliz = feeling (estar → estoy).",
    "Die Kurve hat die Form eines bestimmten Buchstabens.",
    "Jeder Buchstabe steht für ein Merkmal der überrepräsentierten Gesellschaften.",
    "Ja/Nein-Frage: normale Satzstellung, kein Fragezeichen; Zeitenverschiebung.",
    "Drei Teile: Höflichkeitseinstieg + die Frage + höflicher Abschluss, am Ende ein Fragezeichen.",
  ])("stays silent on %j", (hint) => {
    expect(hasWarning(withHint(hint), "W-HINT-LENGTH")).toBe(false);
  });

  it("checks the hint of a single blank too, at that blank", () => {
    const result = validateLesson(
      lesson([
        ex({
          id: "e1",
          type: "cloze",
          cloze_mode: "type",
          prompt: "Fill in the blank.",
          sentence: "Je ___ ici.",
          blanks: [{ accept: ["suis"], hint: "Vier Buchstaben." }],
        }),
      ]),
    );
    const warning = byId(result.warnings, "W-HINT-LENGTH");
    expect(warning).toBeDefined();
    expect(warning?.path).toBe("/steps/0/exercise/blanks/0");
  });

  it("does not check a card's hint: a character count can be teaching content there", () => {
    const result = validateLesson(
      lesson(
        [ex({ id: "e1", type: "free_text", prompt: "Slice it.", card_ids: ["c1"], accept: ["abc"] })],
        [{ id: "c1", front: "s[0:3]", back: "die ersten drei Zeichen", hint: "s[0:3] liefert 3 Zeichen." }],
      ),
    );
    expect(hasWarning(result, "W-HINT-LENGTH")).toBe(false);
  });
});

describe("W-PROMPT-DUP: the prompt repeats the sentence or the step title (engine#169)", () => {
  // The device finding: a multiselect cloze whose prompt and sentence carry
  // the same question. Consumers render the prompt as the heading and the
  // sentence as the question box, so the learner reads it twice.
  const QUESTION = "Welche Aussagen über useEffect treffen zu?";
  const INSTRUCTION = "Wähle alle zutreffenden Aussagen.";

  const multiselect = (prompt: string, sentence: string, title?: string): ValidationResult =>
    validateLesson(
      lesson([
        {
          id: "s1",
          type: "exercise",
          ...(title === undefined ? {} : { title }),
          exercise: { id: "e1", type: "cloze", cloze_mode: "multiselect", prompt, sentence, accept: ["a"], distractors: ["b"] },
        },
      ]),
    );
  const titled = (prompt: string, title: string): ValidationResult =>
    validateLesson(
      lesson([{ id: "s1", type: "exercise", title, exercise: { id: "e1", type: "free_text", prompt, accept: ["JavaScript XML"] } }]),
    );
  const promptDups = (result: ValidationResult): ValidationIssue[] =>
    result.warnings.filter((warning) => warning.id === "W-PROMPT-DUP");

  it("reproduction: prompt == sentence warns once, names 'sentence', points at the prompt, never blocks", () => {
    const result = multiselect(QUESTION, QUESTION);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    const dups = promptDups(result);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.severity).toBe("warning");
    expect(dups[0]!.path).toBe("/steps/0/exercise/prompt");
    expect(dups[0]!.message).toContain("'sentence'");
    expect(dups[0]!.docAnchor).toBe("docs/lesson-format.md#rule-catalog");
  });

  it("prompt == step title warns once, names 'title', on any exercise type", () => {
    const result = titled("Was ist JSX?", "Was ist JSX?");
    expect(result.valid).toBe(true);
    const dups = promptDups(result);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.message).toContain("'title'");
    expect(dups[0]!.message).not.toContain("'sentence'");
  });

  it("different texts: an instruction prompt over a question sentence under a short title is clean", () => {
    expect(promptDups(multiselect(INSTRUCTION, QUESTION, "useEffect"))).toEqual([]);
    expect(promptDups(titled("Was ist JSX?", "JSX"))).toEqual([]);
  });

  it.each([
    ["surrounding whitespace", `  ${QUESTION}  `],
    ["a trailing newline", `${QUESTION}\n`],
    ["NFD instead of NFC (decomposed umlaut)", QUESTION.normalize("NFD")],
    ["NFD plus surrounding whitespace", ` ${QUESTION.normalize("NFD")} `],
  ])("a sentence that differs only by %s still counts as the same text", (_label, sentence) => {
    expect(sentence).not.toBe(QUESTION);
    expect(promptDups(multiselect(QUESTION, sentence))).toHaveLength(1);
  });

  it("a title that differs only by NFC form and whitespace still counts as the same text", () => {
    const title = ` ${"Was ist Präsenz?".normalize("NFD")} `;
    expect(title).not.toBe("Was ist Präsenz?");
    expect(promptDups(titled("Was ist Präsenz?", title))).toHaveLength(1);
  });

  it("prompt equal to both sentence and title: one warning per comparison", () => {
    const dups = promptDups(multiselect(QUESTION, QUESTION, QUESTION));
    expect(dups).toHaveLength(2);
    expect(dups.map((warning) => warning.message).join(" ")).toContain("'sentence'");
    expect(dups.map((warning) => warning.message).join(" ")).toContain("'title'");
  });

  it("boundary: a case-only difference is a different text (exact beyond NFC + trim)", () => {
    expect(promptDups(titled("Was ist JSX?", "was ist JSX?"))).toEqual([]);
    expect(promptDups(multiselect(QUESTION, QUESTION.toUpperCase()))).toEqual([]);
  });

  it("edge: a whitespace-only prompt next to a whitespace-only sentence is not a repetition", () => {
    // Structurally valid (minLength 1 accepts a blank); the lesson has other
    // problems, but 'the prompt repeats the sentence' is not one of them.
    expect(promptDups(multiselect("   ", " "))).toEqual([]);
  });

  it("message is engine-neutral (no consumer names, no ticket numbers)", () => {
    for (const warning of promptDups(multiselect(QUESTION, QUESTION, QUESTION))) {
      expect(warning.message).not.toMatch(/adaptive-learner|#\d+|\bapp\b/i);
      expect(warning.message).toContain("twice");
    }
  });
});
