/**
 * Suggest mode for W-CARD-UNUSED (#20): propose card -> exercise wirings for
 * unused cards, from EXACT text containment only.
 *
 * Detection reuses the W-CARD-UNUSED core ({@link unusedCardIds}); a card is a
 * candidate iff that lint would flag it. A suggestion is made only when the
 * card's `front` or `back` appears VERBATIM (case-sensitive substring) in a
 * text field of exactly ONE exercise - prompt, sentence, option texts, pair
 * sides, accept entries, blank accepts, tiles. No fuzzy matching, no
 * normalisation. Zero matches or matches in several exercises mean "manual
 * review", never a guess: `card_ids` drives SRS scheduling, so a wrong wiring
 * schedules the wrong card after a wrong answer.
 *
 * Governance (the migrate pattern, tightened): dry-run is the default and
 * prints stable suggestion ids (`<cardId>:<exerciseId>`); `--write` applies
 * ONLY suggestions the author explicitly accepted via `--accept <id>` - there
 * is no bulk apply. Every rewired lesson must pass `validateLesson` before it
 * is written; an invalid result is reported and discarded. Filesystem-free
 * like the other CLI cores; the bin shim owns file I/O.
 */

import { exitCodeFor, parseErrorLine, parseFileArgs, type FileReport } from "./file-command.js";
import { unusedCardIds, validateLesson, type ValidationResult } from "./validate.js";
import type { Card, Exercise, Lesson } from "./types/lesson-schema.generated.js";

/** Parsed `suggest-wiring` invocation, or a usage error. */
export type SuggestWiringArgs =
  | { paths: string[]; write: boolean; json: boolean; accept: string[] }
  | { error: string };

const USAGE =
  "usage: learn-content-engine suggest-wiring <file...> [--json] [--write --accept <suggestion-id>...]";

/**
 * Parse `suggest-wiring <file...> [--json] [--write --accept <id>...]`.
 * Pure; no filesystem access. `--write` without at least one `--accept` is a
 * usage error (suggestions are applied one by one, never in bulk), and
 * `--accept` without `--write` is one too (accepting is a write decision).
 */
export function parseSuggestWiringArgs(argv: string[]): SuggestWiringArgs {
  const accept: string[] = [];
  const remaining: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== "--accept") {
      remaining.push(argv[index]!);
      continue;
    }
    const suggestionId = argv[index + 1];
    if (!suggestionId || suggestionId.startsWith("--")) {
      return { error: "--accept requires a suggestion id (run without --write to list them)" };
    }
    accept.push(suggestionId);
    index++;
  }
  const parsed = parseFileArgs(
    "suggest-wiring",
    remaining,
    ["--write", "--json"],
    "suggest-wiring <file...> [--json] [--write --accept <id>...]",
    USAGE,
  );
  if ("error" in parsed) return parsed;
  const write = parsed.flags.has("--write");
  if (write && accept.length === 0) {
    return { error: "--write applies only explicitly accepted suggestions - pass --accept <suggestion-id> per suggestion (run without --write to list them)" };
  }
  if (!write && accept.length > 0) {
    return { error: "--accept requires --write (a dry run always lists every suggestion)" };
  }
  return { paths: parsed.paths, write, json: parsed.flags.has("--json"), accept };
}

/** Where a card text was found: the exercise field plus the verbatim quote. */
export interface WiringEvidence {
  /** Field path within the exercise, e.g. `prompt`, `options[1].text`. */
  field: string;
  /** Which card side matched. */
  cardSide: "front" | "back";
  /** The card text that was found verbatim. */
  matchedText: string;
  /** The full field text containing the match. */
  quote: string;
}

/** One proposed wiring: add `cardId` to `exerciseId`'s `card_ids`. */
export interface WiringSuggestion {
  /** Stable accept token: `<cardId>:<exerciseId>`. */
  suggestionId: string;
  cardId: string;
  exerciseId: string;
  evidence: WiringEvidence[];
}

/** An unused card the heuristic cannot wire safely - the author decides. */
export interface ManualReviewCard {
  cardId: string;
  reason: string;
  /** Present on ambiguous cards: every exercise that matched. */
  candidateExerciseIds?: string[];
}

/** The dry-run payload for one lesson. */
export interface SuggestWiringOutcome {
  suggestions: WiringSuggestion[];
  manualReview: ManualReviewCard[];
}

/** The text fields of an exercise the containment heuristic searches. */
function exerciseTextFields(exercise: Exercise): { field: string; quote: string }[] {
  const fields: { field: string; quote: string }[] = [{ field: "prompt", quote: exercise.prompt }];
  if (exercise.sentence) fields.push({ field: "sentence", quote: exercise.sentence });
  (exercise.options ?? []).forEach((option, index) => {
    fields.push({ field: `options[${index}].text`, quote: option.text });
  });
  (exercise.pairs ?? []).forEach((pair, index) => {
    fields.push({ field: `pairs[${index}].left`, quote: pair.left });
    fields.push({ field: `pairs[${index}].right`, quote: pair.right });
  });
  (exercise.accept ?? []).forEach((accepted, index) => {
    fields.push({ field: `accept[${index}]`, quote: accepted });
  });
  (exercise.blanks ?? []).forEach((blank, blankIndex) => {
    blank.accept.forEach((accepted, acceptIndex) => {
      fields.push({ field: `blanks[${blankIndex}].accept[${acceptIndex}]`, quote: accepted });
    });
  });
  (exercise.tiles ?? []).forEach((tile, index) => {
    fields.push({ field: `tiles[${index}]`, quote: tile });
  });
  return fields;
}

/** Evidence for one card against one exercise: every field containing the
 *  card's `front` or `back` verbatim. Empty card texts never match. */
function matchEvidence(card: Card, exercise: Exercise): WiringEvidence[] {
  const sides: { cardSide: "front" | "back"; matchedText: string }[] = [
    { cardSide: "front", matchedText: card.front },
    { cardSide: "back", matchedText: card.back },
  ];
  const evidence: WiringEvidence[] = [];
  for (const { field, quote } of exerciseTextFields(exercise)) {
    for (const { cardSide, matchedText } of sides) {
      if (matchedText.length > 0 && quote.includes(matchedText)) {
        evidence.push({ field, cardSide, matchedText, quote });
      }
    }
  }
  return evidence;
}

const NO_MATCH_REASON = "no verbatim match in any exercise text field";

/** All exercises of a lesson (steps without an exercise payload are skipped). */
function lessonExercises(lesson: Lesson): Exercise[] {
  return lesson.steps.flatMap((step) => (step.exercise ? [step.exercise] : []));
}

function suggestForCard(card: Card, exercises: Exercise[]): { suggestion?: WiringSuggestion; manual?: ManualReviewCard } {
  const matches = exercises
    .map((exercise) => ({ exercise, evidence: matchEvidence(card, exercise) }))
    .filter((candidate) => candidate.evidence.length > 0);
  if (matches.length === 1) {
    const { exercise, evidence } = matches[0]!;
    return {
      suggestion: {
        suggestionId: `${card.id}:${exercise.id}`,
        cardId: card.id,
        exerciseId: exercise.id,
        evidence,
      },
    };
  }
  if (matches.length === 0) {
    return { manual: { cardId: card.id, reason: NO_MATCH_REASON } };
  }
  return {
    manual: {
      cardId: card.id,
      reason: `ambiguous: verbatim match in ${matches.length} exercises - pick one manually`,
      candidateExerciseIds: matches.map((candidate) => candidate.exercise.id),
    },
  };
}

/**
 * Propose wirings for every unused card (the W-CARD-UNUSED set) of a
 * structurally valid lesson. A card lands in `suggestions` only on a UNIQUE
 * verbatim match; otherwise in `manualReview` with the reason (no match, or
 * the ambiguous candidate list). Cards already referenced by any exercise are
 * never analysed. The input is not mutated.
 */
export function suggestWiring(lesson: Lesson): SuggestWiringOutcome {
  const cardsById = new Map((lesson.cards ?? []).map((card) => [card.id, card]));
  const exercises = lessonExercises(lesson);
  const suggestions: WiringSuggestion[] = [];
  const manualReview: ManualReviewCard[] = [];
  for (const cardId of unusedCardIds(lesson)) {
    const { suggestion, manual } = suggestForCard(cardsById.get(cardId)!, exercises);
    if (suggestion) suggestions.push(suggestion);
    if (manual) manualReview.push(manual);
  }
  return { suggestions, manualReview };
}

/**
 * Apply accepted suggestions: append each `cardId` to its exercise's
 * `card_ids` (created when absent). Pure; returns a new lesson object, the
 * input is never mutated. Callers MUST gate the result behind `validateLesson`
 * before writing - `suggestWiringContent` does.
 */
export function applyWiringSuggestions(lesson: Lesson, suggestions: WiringSuggestion[]): Lesson {
  const cardIdsByExercise = new Map<string, string[]>();
  for (const suggestion of suggestions) {
    const pending = cardIdsByExercise.get(suggestion.exerciseId) ?? [];
    cardIdsByExercise.set(suggestion.exerciseId, [...pending, suggestion.cardId]);
  }
  const steps = lesson.steps.map((step) => {
    const exercise = step.exercise;
    const addedCardIds = exercise ? cardIdsByExercise.get(exercise.id) : undefined;
    if (!exercise || !addedCardIds) return step;
    return { ...step, exercise: { ...exercise, card_ids: [...(exercise.card_ids ?? []), ...addedCardIds] } };
  });
  return { ...lesson, steps };
}

/** One file's suggest-wiring outcome. `lesson` is present ONLY when accepted
 *  suggestions were applied and the result passed `validateLesson`. */
export interface SuggestWiringReport extends FileReport {
  suggestions: WiringSuggestion[];
  manualReview: ManualReviewCard[];
  /** The accepted suggestion ids that matched this file's suggestions. */
  accepted: string[];
  lesson?: unknown;
  validation?: ValidationResult;
}

const emptyReport = (path: string, ok: boolean): SuggestWiringReport => ({
  path,
  ok,
  suggestions: [],
  manualReview: [],
  accepted: [],
});

/**
 * Parse one file's raw JSON, compute the wiring suggestions, and - when
 * `acceptedIds` name any of them - apply exactly those, gated behind
 * `validateLesson`: a rewired lesson that fails validation reports
 * `ok: false` and carries no `lesson` (so it is never written). A lesson that
 * fails validation on its own is refused up front (fix the errors first).
 */
export function suggestWiringContent(
  rawJson: string,
  path: string,
  acceptedIds: string[] = [],
): SuggestWiringReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return { ...emptyReport(path, false), parseError: String(error) };
  }
  const inputValidation = validateLesson(parsed);
  if (!inputValidation.valid) {
    return { ...emptyReport(path, false), validation: inputValidation };
  }
  const lesson = parsed as Lesson;
  const outcome = suggestWiring(lesson);
  const acceptedHere = outcome.suggestions.filter((suggestion) =>
    acceptedIds.includes(suggestion.suggestionId),
  );
  if (acceptedHere.length === 0) {
    return { ...emptyReport(path, true), ...outcome };
  }
  const rewired = applyWiringSuggestions(lesson, acceptedHere);
  const validation = validateLesson(rewired);
  return {
    ...emptyReport(path, validation.valid),
    ...outcome,
    accepted: acceptedHere.map((suggestion) => suggestion.suggestionId),
    ...(validation.valid ? { lesson: rewired } : {}),
    validation,
  };
}

const suggestionLine = (suggestion: WiringSuggestion): string[] => [
  `  suggest ${suggestion.suggestionId}`,
  ...suggestion.evidence.map(
    (entry) => `    ${entry.cardSide} '${entry.matchedText}' appears in ${entry.field}: "${entry.quote}"`,
  ),
];

const manualLine = (manual: ManualReviewCard): string =>
  `  manual  ${manual.cardId} - ${manual.reason}${
    manual.candidateExerciseIds ? ` (candidates: ${manual.candidateExerciseIds.join(", ")})` : ""
  }`;

function reportLines(report: SuggestWiringReport, write: boolean): string[] {
  if (report.parseError) return [parseErrorLine(report)];
  if (!report.ok && report.accepted.length === 0) {
    return [
      `ERROR ${report.path}: lesson fails validation - fix the errors before suggesting wirings`,
      ...(report.validation?.errors ?? []).map((issue) => `  [${issue.id}] ${issue.path} ${issue.message}`),
    ];
  }
  if (!report.ok) {
    return [
      `ERROR ${report.path}: rewired lesson fails validation (not written)`,
      ...(report.validation?.errors ?? []).map((issue) => `  [${issue.id}] ${issue.path} ${issue.message}`),
    ];
  }
  if (write) {
    if (report.accepted.length === 0) {
      return [`OK    ${report.path}: no accepted suggestion applies here - file unchanged`];
    }
    return [
      `OK    ${report.path}: applied ${report.accepted.length} suggestion(s)`,
      ...report.accepted.map((suggestionId) => `  applied ${suggestionId}`),
    ];
  }
  return [
    `OK    ${report.path}: ${report.suggestions.length} suggestion(s), ${report.manualReview.length} card(s) for manual review`,
    ...report.suggestions.flatMap(suggestionLine),
    ...report.manualReview.map(manualLine),
  ];
}

/**
 * Render suggest-wiring reports for humans or as JSON. Exit code 1 when any
 * file failed (parse/validation) or when a `--accept` id matched no suggestion
 * in any file - a stale or mistyped accept must fail loudly, not no-op.
 */
export function formatSuggestWiringReports(
  reports: SuggestWiringReport[],
  options: { json: boolean; write: boolean; accept: string[] },
): { text: string; exitCode: number } {
  const acceptedAnywhere = new Set(reports.flatMap((report) => report.accepted));
  const unmatchedAccepts = options.accept.filter((suggestionId) => !acceptedAnywhere.has(suggestionId));
  const exitCode = exitCodeFor(reports) || (unmatchedAccepts.length > 0 ? 1 : 0);
  if (options.json) {
    const serializable = reports.map((report) => {
      const { lesson, ...rest } = report;
      void lesson;
      return rest;
    });
    return { text: JSON.stringify(serializable, null, 2), exitCode };
  }
  const lines = reports.flatMap((report) => reportLines(report, options.write));
  for (const suggestionId of unmatchedAccepts) {
    lines.push(`ERROR --accept ${suggestionId} matches no suggestion in any given file - nothing applied for it`);
  }
  if (!options.write && reports.some((report) => report.suggestions.length > 0)) {
    lines.push("dry run - review each suggestion, then re-run with --write --accept <suggestion-id>");
  }
  return { text: lines.join("\n"), exitCode };
}
