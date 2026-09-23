/**
 * Schema validation + author lints against the bundled canonical artifacts.
 *
 * ``parse`` stays permissive (JSON.parse + spread); validation is an EXPLICIT,
 * opt-in step the consumer runs when it wants the format contract enforced.
 *
 * Layers (field validation before the cross-field validators, matching the
 * pipeline of adaptive-learner, the reference consumer), plus a non-blocking
 * author-lint layer on top:
 *   1. STRUCTURAL - ajv against the bundled ``schema/lesson.schema.json``
 *      (draft 2020-12, STRICT: ``additionalProperties: false`` everywhere).
 *   2. SEMANTIC (errors) - cross-field rules the JSON-Schema cannot express,
 *      mirroring the reference consumer's validators (per-type required
 *      fields, cloze marker/blank count, multiselect disjointness, picture
 *      "exactly one correct", referential integrity).
 *   3. AUTHOR LINTS (warnings) - never block (``valid`` stays errors-only), but
 *      catch common authoring mistakes early (unused cards, ambiguous matching,
 *      duplicate word tiles, answer-as-distractor, length-revealing hints, a
 *      prompt that repeats the sentence or the step title).
 *
 * Every issue carries a stable ``id``, a ``severity``, and a ``docAnchor`` so
 * the message is actionable and a thin downstream validator can mirror the rule
 * without drifting. The rule catalog lives in ``docs/lesson-format.md``.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import { KNOWN_CONTENT_DOMAINS, isKnownContentDomain, isKnownLevel } from "./content-domains.js";
import type { ExtensionRegistry } from "./extensions.js";
import { describeInvisibleChars, findInvisibleChars } from "./invisible-chars.js";
import { lessonIdOrderingIssues } from "./set-ordering.js";
import { collectStableIds } from "./stable-ids.js";
import type { Exercise, Lesson, LessonStep } from "./types/lesson-schema.generated.js";
import { variableIssues } from "./variables.js";

/** Whether an issue blocks (``error``) or merely advises (``warning``). */
export type ValidationSeverity = "error" | "warning";

/** One validation problem: a JSON-pointer-ish path, a human-readable reason, a
 *  stable rule ``id``, its ``severity``, and a ``docAnchor`` into the docs. */
export interface ValidationIssue {
  path: string;
  message: string;
  id: string;
  severity: ValidationSeverity;
  docAnchor: string;
}

/** The outcome of a validate call. ``valid`` is errors-only - ``warnings``
 *  never block. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const DOC = "docs/lesson-format.md";

function makeIssue(
  severity: ValidationSeverity,
  id: string,
  path: string,
  message: string,
  anchor: string,
): ValidationIssue {
  return { path, message, id, severity, docAnchor: `${DOC}#${anchor}` };
}
const err = (id: string, path: string, message: string, anchor: string): ValidationIssue =>
  makeIssue("error", id, path, message, anchor);
export const warn = (id: string, path: string, message: string, anchor: string): ValidationIssue =>
  makeIssue("warning", id, path, message, anchor);

const loadSchema = (fileName: string): object =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../schema/${fileName}`, import.meta.url)), "utf8"),
  ) as object;

// strict:false so ajv tolerates the schema's ``x-schema-version`` annotation
// keyword; allErrors so a single call surfaces every problem at once.
const ajv = new Ajv2020({ allErrors: true, strict: false });

// Compiled lazily on the FIRST validate call, never at import time: loadSchema
// reads from node:fs, which does not exist in a browser. A browser consumer
// that only parses must be able to import the entry (a dev bundler executes it
// eagerly, unlike a tree-shaken production build) - engine#59.
let structuralLessonCache: ValidateFunction | null = null;
let structuralManifestCache: ValidateFunction | null = null;
const structuralLesson = (): ValidateFunction =>
  (structuralLessonCache ??= ajv.compile(loadSchema("lesson.schema.json")));
const structuralManifest = (): ValidateFunction =>
  (structuralManifestCache ??= ajv.compile(loadSchema("content-manifest.schema.json")));

/** Map ajv's error objects to error issues, naming the offending key for
 *  ``additionalProperties`` rejections so the message is actionable. */
function toStructuralIssues(errors: ErrorObject[]): ValidationIssue[] {
  return errors.map((error) => {
    const params = error.params as { additionalProperty?: unknown };
    const path = error.instancePath || "/";
    if (typeof params.additionalProperty === "string") {
      return err("E-UNKNOWN-FIELD", path, `${error.message} (${params.additionalProperty})`, "rule-catalog");
    }
    return err("E-SCHEMA", path, `${error.message}`, "rule-catalog");
  });
}

/** Count non-overlapping ``___`` markers (matches Python ``str.count('___')``). */
const markerCount = (sentence: string): number => sentence.split("___").length - 1;

/** True when an array has a repeated value. */
const hasDuplicate = <T>(values: T[]): boolean => new Set(values).size !== values.length;

/** Text as an author reads it: Unicode NFC (a decomposed umlaut equals its
 *  precomposed form) with the surrounding whitespace dropped. Case is kept:
 *  a case difference is a different text. */
const readableText = (text: string): string => text.normalize("NFC").trim();

/** True when a hint reveals the answer length (e.g. "vier Buchstaben" / "4 letters"). */
const mentionsAnswerLength = (hint: string): boolean =>
  /(\d+|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|two|three|four|five|six|seven|eight|nine|ten)/i.test(hint) &&
  /(buchstabe|zeichen|letter|character)/i.test(hint);

function checkMatching(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (exercise.from_cards) {
    if (!exercise.card_ids || exercise.card_ids.length === 0) {
      issues.push(err("E-MATCH-FROMCARDS-CARDS", path, "MATCHING with 'from_cards' requires non-empty 'card_ids'", "matching"));
    }
    if (exercise.pairs && exercise.pairs.length > 0) {
      issues.push(err("E-MATCH-FROMCARDS-PAIRS", path, "MATCHING with 'from_cards' must not also list explicit 'pairs'", "matching"));
    }
    return;
  }
  const pairs = exercise.pairs;
  if (!pairs || pairs.length === 0) {
    issues.push(err("E-MATCH-PAIRS", path, "MATCHING exercise requires non-empty 'pairs'", "matching"));
    return;
  }
  // E-MATCH-DUP-LEFT: each left term must be unique within the exercise
  // (case-insensitive, whitespace-trimmed). A repeated left maps to two
  // different rights, which is objectively unsolvable for the learner. The
  // content fix is the author's - there is no safe automatic rename. Origin:
  // alc-die-waehrung-des-geistes#27 (three independent occurrences).
  const leftGroups = new Map<string, { term: string; positions: number[] }>();
  pairs.forEach((pair, index) => {
    const key = pair.left.trim().toLowerCase();
    const group = leftGroups.get(key);
    if (group) group.positions.push(index + 1);
    else leftGroups.set(key, { term: pair.left, positions: [index + 1] });
  });
  for (const { term, positions } of leftGroups.values()) {
    if (positions.length > 1) {
      issues.push(
        err(
          "E-MATCH-DUP-LEFT",
          path,
          `MATCHING left value '${term}' is repeated at positions ${positions.join(", ")}; each left term must be unique (case-insensitive) so the pairing is solvable`,
          "matching",
        ),
      );
    }
  }
  // A duplicate 'right' is ambiguous but not necessarily unsolvable, so it stays
  // a warning; 'left' duplicates are the hard E-MATCH-DUP-LEFT above.
  if (hasDuplicate(pairs.map((pair) => pair.right))) {
    issues.push(
      warn("W-MATCH-AMBIG", path, "MATCHING has duplicate 'right' values (ambiguous pairing)", "matching"),
    );
  }
}

function checkPictureChoice(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const images = exercise.images;
  if (!images || images.length < 2) {
    issues.push(err("E-PIC-MIN", path, "PICTURE_CHOICE requires at least 2 'images'", "picture_choice"));
    return;
  }
  const correct = images.filter((image) => image.is_correct === "true");
  if (correct.length !== 1) {
    issues.push(
      err("E-PIC-ONE-CORRECT", path, "PICTURE_CHOICE must have exactly one image marked 'is_correct': 'true'", "picture_choice"),
    );
  }
  const correctLabels = new Set(correct.map((image) => image.label));
  if (images.some((image) => image.is_correct !== "true" && correctLabels.has(image.label))) {
    issues.push(
      warn("W-PIC-DUP-LABEL", path, "PICTURE_CHOICE distractor shares a 'label' with the correct image", "picture_choice"),
    );
  }
  if (images.some((image) => image.src.startsWith("data:"))) {
    issues.push(
      warn(
        "W-PIC-DATA-URI",
        path,
        "PICTURE_CHOICE image uses an inline data URI; repo content should prefer a relative assets/ path (data URIs bloat the lesson JSON and the git history)",
        "picture_choice",
      ),
    );
  }
}

function checkFreeText(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.accept || exercise.accept.length === 0) {
    issues.push(err("E-FREETEXT-ACCEPT", path, "FREE_TEXT exercise requires non-empty 'accept'", "free_text"));
  }
}

function checkWordTiles(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const tiles = exercise.tiles;
  if (!tiles || tiles.length < 2) {
    issues.push(err("E-TILES-MIN", path, "WORD_TILES requires at least 2 'tiles'", "word_tiles"));
    return;
  }
  if (hasDuplicate(tiles) && !exercise.accept_orderings) {
    issues.push(
      warn(
        "W-TILES-DUP",
        path,
        "WORD_TILES has duplicate tiles but no 'accept_orderings' - consumers that grade word tiles by tile index may grade a string-identical answer as wrong; consumers grading the token sequence need no annotation",
        "word_tiles",
      ),
    );
  }
  if (!exercise.accept_orderings) return;
  const expected = tiles.map((_tile, index) => index);
  for (const ordering of exercise.accept_orderings) {
    const sorted = [...ordering].sort((a, b) => a - b);
    const isPermutation = sorted.length === expected.length && sorted.every((value, index) => value === expected[index]);
    if (!isPermutation) {
      issues.push(
        err(
          "E-TILES-ORDERING",
          path,
          `accept_orderings entry ${JSON.stringify(ordering)} must be a permutation of [0..${tiles.length - 1}]`,
          "word_tiles",
        ),
      );
    }
  }
}

function checkClozeMultiselect(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.sentence) {
    issues.push(err("E-CLOZE-MS-SENTENCE", path, "CLOZE multiselect requires a non-empty 'sentence' (the question)", "cloze"));
  }
  const accept = exercise.accept ?? [];
  if (accept.length === 0) {
    issues.push(err("E-CLOZE-MS-ACCEPT", path, "CLOZE multiselect requires non-empty 'accept' (the correct options)", "cloze"));
  }
  const distractors = exercise.distractors ?? [];
  if (distractors.length === 0) {
    issues.push(err("E-CLOZE-MS-DISTRACTORS", path, "CLOZE multiselect requires non-empty 'distractors'", "cloze"));
  }
  const overlap = accept.filter((option) => distractors.includes(option));
  if (overlap.length > 0) {
    issues.push(
      err(
        "E-CLOZE-MS-DISJOINT",
        path,
        `CLOZE multiselect 'accept' and 'distractors' must be disjoint; shared option(s): ${JSON.stringify(overlap)}`,
        "cloze",
      ),
    );
  }
}

function checkCloze(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (exercise.cloze_mode === "multiselect") {
    checkClozeMultiselect(exercise, path, issues);
    return;
  }
  const sentence = exercise.sentence;
  if (!sentence) {
    issues.push(err("E-CLOZE-SENTENCE", path, "CLOZE exercise requires non-empty 'sentence'", "cloze"));
    return;
  }
  const blanks = exercise.blanks;
  if (!blanks || blanks.length === 0) {
    issues.push(err("E-CLOZE-BLANKS", path, "CLOZE exercise requires non-empty 'blanks'", "cloze"));
    return;
  }
  const markers = markerCount(sentence);
  if (markers !== blanks.length) {
    issues.push(
      err(
        "E-CLOZE-MARKERS",
        path,
        `CLOZE marker count mismatch: sentence has ${markers} '___' markers but blanks has ${blanks.length} entries`,
        "cloze",
      ),
    );
  }
  if (exercise.cloze_mode === "select") {
    if (!exercise.distractors || exercise.distractors.length === 0) {
      issues.push(err("E-CLOZE-SELECT-DISTRACTORS", path, "CLOZE with cloze_mode='select' requires non-empty 'distractors'", "cloze"));
      return;
    }
    const accepted = new Set(blanks.flatMap((blank) => blank.accept));
    if (exercise.distractors.some((distractor) => accepted.has(distractor))) {
      issues.push(
        warn("W-DISTRACTOR-ANSWER", path, "CLOZE select has a distractor equal to an accepted answer", "cloze"),
      );
    }
  }
}

function checkMultipleChoice(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const options = exercise.options;
  if (!options || options.length < 2) {
    issues.push(err("E-MC-OPTIONS", path, "MULTIPLE_CHOICE requires at least 2 'options'", "multiple_choice"));
    return;
  }
  const correctCount = options.filter((option) => option.correct === true).length;
  if (exercise.multiple === true) {
    if (correctCount === 0) {
      issues.push(
        err("E-MC-MIN-CORRECT", path, "MULTIPLE_CHOICE with 'multiple' requires at least one option marked 'correct'", "multiple_choice"),
      );
    }
  } else if (correctCount !== 1) {
    issues.push(
      err("E-MC-ONE-CORRECT", path, "MULTIPLE_CHOICE (single) must have exactly one option marked 'correct'", "multiple_choice"),
    );
  }
  if (hasDuplicate(options.map((option) => option.text))) {
    issues.push(
      err("E-MC-DUP-OPTION", path, "MULTIPLE_CHOICE option texts must be unique (the text IS the option)", "multiple_choice"),
    );
  }
}

const EXERCISE_CHECKS: Record<string, (exercise: Exercise, path: string, issues: ValidationIssue[]) => void> = {
  matching: checkMatching,
  picture_choice: checkPictureChoice,
  free_text: checkFreeText,
  word_tiles: checkWordTiles,
  cloze: checkCloze,
  multiple_choice: checkMultipleChoice,
};

/** Registered-extension lookup context threaded through the semantic pass. */
interface ExtContext {
  /** ext type -> required major, parsed from the lesson's ``requires_extensions``. */
  required: Map<string, number>;
  registry: ExtensionRegistry;
}

/** An ``ext:`` extension type carries no core check; it is validated by a
 *  registered extension after the declaration + registration contract holds. */
const isExtType = (type: string): boolean => type.startsWith("ext:");

/** Parse ``requires_extensions`` entries (``ext:<vendor>-<name>@<major>``) into
 *  a type -> major map. Malformed entries are ignored (ajv already rejected
 *  them structurally). */
function requiredExtensions(lesson: Lesson): Map<string, number> {
  const required = new Map<string, number>();
  for (const entry of lesson.requires_extensions ?? []) {
    const at = entry.lastIndexOf("@");
    if (at === -1) continue;
    const major = Number(entry.slice(at + 1));
    if (Number.isInteger(major)) required.set(entry.slice(0, at), major);
  }
  return required;
}

/** Enforce the extension contract for one ``ext:`` exercise: declared in
 *  ``requires_extensions`` (else E-EXT-UNDECLARED), registered at the pinned
 *  major (else E-EXT-UNSUPPORTED), then delegate to the extension's validator. */
function checkExtExercise(exercise: Exercise, path: string, ext: ExtContext, issues: ValidationIssue[]): void {
  const type = exercise.type;
  const requiredMajor = ext.required.get(type);
  if (requiredMajor === undefined) {
    issues.push(
      err("E-EXT-UNDECLARED", path, `exercise uses extension type '${type}' but the lesson does not declare it in 'requires_extensions'`, "extensions"),
    );
    return;
  }
  const extension = ext.registry.find((candidate) => candidate.type === type && candidate.major === requiredMajor);
  if (!extension) {
    issues.push(
      err("E-EXT-UNSUPPORTED", path, `no registered extension for '${type}@${requiredMajor}'; the consumer cannot render this lesson`, "extensions"),
    );
    return;
  }
  issues.push(...extension.validate(exercise));
}

function checkExercise(
  exercise: Exercise,
  path: string,
  knownCardIds: Set<string>,
  ext: ExtContext,
  issues: ValidationIssue[],
): void {
  for (const cardId of exercise.card_ids ?? []) {
    if (!knownCardIds.has(cardId)) {
      issues.push(err("E-CARD-REF", `${path}/card_ids`, `exercise references unknown card '${cardId}'`, "cards"));
    }
  }
  if (exercise.hint && mentionsAnswerLength(exercise.hint)) {
    issues.push(
      warn("W-HINT-LENGTH", path, "hint reveals the answer length - redundant on consumers that display the answer length automatically, revealing on the rest", "rule-catalog"),
    );
  }
  for (const issue of variableIssues(exercise, path)) {
    issues.push(makeIssue(issue.severity, issue.id, issue.path, issue.message, "variables-parametric-exercises"));
  }
  if (isExtType(exercise.type)) {
    checkExtExercise(exercise, path, ext, issues);
    return;
  }
  const check = EXERCISE_CHECKS[exercise.type];
  if (check) check(exercise, path, issues);
}

function checkStep(step: LessonStep, path: string, knownCardIds: Set<string>, ext: ExtContext, issues: ValidationIssue[]): void {
  if (step.type === "theory") {
    if (!step.body) issues.push(err("E-STEP-THEORY-BODY", path, "THEORY step requires non-empty 'body'", "steps"));
    if (step.exercise != null) issues.push(err("E-STEP-THEORY-EXERCISE", path, "THEORY step must not carry 'exercise'", "steps"));
    return;
  }
  // EXERCISE step
  if (step.exercise == null) {
    issues.push(err("E-STEP-EXERCISE-PAYLOAD", path, "EXERCISE step requires an 'exercise' payload", "steps"));
  } else {
    checkExercise(step.exercise, `${path}/exercise`, knownCardIds, ext, issues);
    checkPromptDuplication(step, step.exercise, `${path}/exercise/prompt`, issues);
  }
  if (step.body != null) {
    issues.push(err("E-STEP-EXERCISE-BODY", path, "EXERCISE step must not carry 'body' (use the exercise prompt instead)", "steps"));
  }
}

/** W-PROMPT-DUP (engine#169): the prompt must not repeat the exercise's
 *  ``sentence`` (the cloze sentence, or the question stem in multiselect
 *  mode) nor the step's ``title``. Consumers render the prompt as the
 *  heading and the sentence as the question box (the title in the step
 *  list), so an equal text is read twice on screen. The pattern arises
 *  naturally while authoring (the question typed once as the prompt, once
 *  as the sentence), hence a rule instead of a one-off correction. One
 *  warning per matching comparison, each naming the field and its fix;
 *  compared after NFC + trim, never blocks. */
function checkPromptDuplication(step: LessonStep, exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const prompt = readableText(exercise.prompt);
  if (prompt === "") return;
  if (typeof exercise.sentence === "string" && readableText(exercise.sentence) === prompt) {
    issues.push(
      warn(
        "W-PROMPT-DUP",
        path,
        "prompt equals the exercise 'sentence' (compared after trimming and Unicode NFC normalisation); consumers show the prompt as the heading and the sentence as the question, so the learner reads the same text twice - phrase the prompt as the instruction and keep the question in 'sentence'",
        "rule-catalog",
      ),
    );
  }
  if (typeof step.title === "string" && readableText(step.title) === prompt) {
    issues.push(
      warn(
        "W-PROMPT-DUP",
        path,
        "prompt equals the step 'title' (compared after trimming and Unicode NFC normalisation); consumers show the title in the step list or header and the prompt as the heading, so the learner reads the same text twice - shorten the title to a heading or phrase the prompt as the concrete task",
        "rule-catalog",
      ),
    );
  }
}

/**
 * Ids of cards no exercise's `card_ids` references - the detection core of the
 * W-CARD-UNUSED lint, shared with the suggest-wiring CLI (#20). Returns ids in
 * card-definition order; a lesson without cards yields an empty list.
 */
export function unusedCardIds(lesson: Lesson): string[] {
  const used = new Set<string>();
  for (const step of lesson.steps) {
    for (const cardId of step.exercise?.card_ids ?? []) used.add(cardId);
  }
  return (lesson.cards ?? []).map((card) => card.id).filter((cardId) => !used.has(cardId));
}

/** Warn about cards that no exercise ever drills (dead learning material).
 *  Aggregated to ONE warning per lesson listing every unused id: a card-rich
 *  set (cards as a broad knowledge base, exercises a curated subset) is a
 *  common, valid shape, so a line per orphan card would bury the rare real
 *  author mistake under noise (alert fatigue). The suggest-wiring CLI keeps
 *  consuming the per-id `unusedCardIds` list for its proposals. */
function checkUnusedCards(lesson: Lesson, issues: ValidationIssue[]): void {
  const unused = unusedCardIds(lesson);
  if (unused.length === 0) return;
  const noun = unused.length === 1 ? "card is" : "cards are";
  issues.push(
    warn(
      "W-CARD-UNUSED",
      "/cards",
      `${unused.length} ${noun} defined but never referenced by an exercise: ${unused.join(", ")}`,
      "cards",
    ),
  );
}

/** Warn about invisible Unicode characters anywhere in the lesson's text
 *  (#75). Aggregated to ONE warning per lesson listing every distinct
 *  codepoint and where it sits: pasted text can carry dozens, and a warning
 *  per occurrence is the alert fatigue W-CARD-UNUSED was aggregated away from
 *  (#49). Never an error - the content is structurally valid, it just carries
 *  characters the author cannot see. */
function checkInvisibleChars(lesson: Lesson, issues: ValidationIssue[]): void {
  const description = describeInvisibleChars(findInvisibleChars(lesson));
  if (description) issues.push(warn("W-INVISIBLE-CHAR", "", description, "author-lints"));
}

/** Semantic + lint pass. Assumes the input is already structurally valid (so the
 *  schema-typed shape is trustworthy). Returns a mixed error/warning list. */
function semanticIssues(lesson: Lesson, registry: ExtensionRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownCardIds = new Set<string>((lesson.cards ?? []).map((card) => card.id));
  const ext: ExtContext = { required: requiredExtensions(lesson), registry };
  lesson.steps.forEach((step, index) => {
    checkStep(step, `/steps/${index}`, knownCardIds, ext, issues);
  });
  checkUnusedCards(lesson, issues);
  checkInvisibleChars(lesson, issues);
  checkStableIdDuplicates(lesson, issues);
  return issues;
}

/** E-STABLE-ID-DUP: a stable_id must be unique across the exercises and
 *  cards of this lesson (one shared namespace). The set-wide half of the
 *  engine#90 uniqueness promise lives in the repo gate via
 *  {@link collectStableIds}; the schema and this rule can only see one
 *  document. */
function checkStableIdDuplicates(lesson: Lesson, issues: ValidationIssue[]): void {
  for (const duplicate of collectStableIds([lesson]).duplicates) {
    const where = duplicate.locations
      .map((location) => `${location.kind} '${location.elementId}'`)
      .join(", ");
    issues.push(
      err(
        "E-STABLE-ID-DUP",
        "/",
        `stable_id '${duplicate.stableId}' is used more than once in this lesson (${where}); a stable_id identifies exactly one element`,
        "rule-catalog",
      ),
    );
  }
}

const split = (issues: ValidationIssue[]): ValidationResult => {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
};

/**
 * Validate a lesson against the bundled canonical schema, the semantic
 * cross-field rules, and the author lints. Returns ``{ valid, errors, warnings
 * }``; ``valid`` is errors-only (warnings never block). Does not throw.
 *
 * ``options.extensions`` registers ``ext:`` exercise-type extensions. Without
 * it, an ``ext:`` exercise that a lesson declares is refused (E-EXT-UNSUPPORTED);
 * CORE content (no ``ext:`` types) validates identically regardless of the
 * registry.
 */
export function validateLesson(
  input: unknown,
  options: { extensions?: ExtensionRegistry } = {},
): ValidationResult {
  const structural = structuralLesson();
  if (!structural(input)) {
    return { valid: false, errors: toStructuralIssues(structural.errors as ErrorObject[]), warnings: [] };
  }
  return split(semanticIssues(input as Lesson, options.extensions ?? []));
}

/** Drop the legacy ``language`` alias into ``target_language`` on each set
 *  BEFORE schema validation (the pre-v1.2 alias rule, see
 *  ``docs/concepts.md``), so a legacy manifest validates instead of tripping
 *  the strict ``additionalProperties`` / missing-``target_language`` rules. */
function normalizeManifestAliases(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const manifest = input as { sets?: unknown };
  if (!Array.isArray(manifest.sets)) return input;
  const sets = manifest.sets.map((rawSet) => {
    if (typeof rawSet !== "object" || rawSet === null) return rawSet;
    const set = rawSet as Record<string, unknown>;
    if (!("language" in set)) return set;
    const { language, ...rest } = set;
    if ("target_language" in rest) return rest;
    return { ...rest, target_language: language };
  });
  return { ...manifest, sets };
}

/**
 * Validate a raw parsed manifest against the bundled
 * ``content-manifest.schema.json`` (strict), after normalizing the legacy
 * ``language`` alias. Returns ``{ valid, errors, warnings }``; does not throw.
 */
export function validateManifest(input: unknown): ValidationResult {
  const normalized = normalizeManifestAliases(input);
  const structural = structuralManifest();
  if (!structural(normalized)) {
    return { valid: false, errors: toStructuralIssues(structural.errors as ErrorObject[]), warnings: [] };
  }
  // 'metadata.retired_ids' (deliberate retirement, engine#90 stability gate)
  // was locked behind E-RETIRED-IDS-LOCKED until the app-side consequence of
  // retiring an id was decided AND shipped; both happened (archive, not
  // delete or orphan - adaptive-learner#2188, PR #2458), so the lock was
  // removed deliberately (engine#131). Entries match the exercise/card
  // identity (stable_id, author-slug fallback); add-only for existing
  // entries and the retired-yet-alive contradiction are the stability
  // core's checks (V5/V6) - only IT sees the lesson inventory. This
  // validator keeps what a single manifest can prove: the list's shape.
  const manifestMetadata = (normalized as { metadata?: Record<string, unknown> }).metadata;
  if (manifestMetadata && "retired_ids" in manifestMetadata) {
    const retiredIds = manifestMetadata["retired_ids"];
    const isStringList =
      Array.isArray(retiredIds) && retiredIds.every((entry) => typeof entry === "string");
    if (!isStringList) {
      return {
        valid: false,
        errors: [
          err(
            "E-RETIRED-IDS-TYPE",
            "/metadata/retired_ids",
            "'retired_ids' must be a list of strings (each entry the stable_id - author slug for pre-stable_id elements - of a retired exercise or card)",
            "stable-identity-stable_id",
          ),
        ],
        warnings: [],
      };
    }
  }
  const evaluationIssues = checkSetEvaluations(normalized);
  const evaluationErrors = evaluationIssues.filter((issue) => issue.severity === "error");
  return {
    valid: evaluationErrors.length === 0,
    errors: evaluationErrors,
    warnings: [
      ...evaluationIssues.filter((issue) => issue.severity === "warning"),
      ...checkManifestLessonOrdering(manifestMetadata),
      ...checkManifestDomainVocabulary(normalized),
      ...checkRetiredIdsDuplicates(manifestMetadata),
    ],
  };
}

/**
 * engine#171: the parts of a set's ``evaluation`` block the JSON Schema
 * cannot state. Two of them are "this scheme needs that field" (JSON Schema
 * could express them with if/then, at the price of an error message naming
 * a branch instead of the missing field); the third is a grade table that
 * maps one score to two grades, which no schema keyword covers. The fourth
 * is the only warning here: a table with no row at 0 leaves the runs below
 * its lowest row without a grade, which a consumer can only paper over with
 * a fallback label of its own - the opposite of what the block is for. It
 * stays a warning because "below 50 there is no grade" is a defensible
 * authoring choice, unlike the ambiguity the DUP rule catches.
 */
function checkSetEvaluations(manifest: unknown): ValidationIssue[] {
  const sets = (manifest as { sets?: unknown }).sets;
  if (!Array.isArray(sets)) return [];
  const issues: ValidationIssue[] = [];
  sets.forEach((rawSet, index) => {
    const evaluation = (rawSet as { evaluation?: unknown } | null)?.evaluation;
    if (typeof evaluation !== "object" || evaluation === null) return;
    const { scheme, grades, pass_percent: passPercent } = evaluation as {
      scheme?: unknown;
      grades?: unknown;
      pass_percent?: unknown;
    };
    const path = `/sets/${index}/evaluation`;
    if (scheme === "grades" && !Array.isArray(grades)) {
      issues.push(
        err("E-EVAL-GRADES-MISSING", path, "evaluation scheme 'grades' requires a 'grades' table", "evaluation"),
      );
    }
    if (scheme === "pass_fail" && typeof passPercent !== "number") {
      issues.push(
        err("E-EVAL-PASS-MISSING", path, "evaluation scheme 'pass_fail' requires 'pass_percent'", "evaluation"),
      );
    }
    if (Array.isArray(grades)) {
      const thresholds = grades
        .map((row) => (row as { min_percent?: unknown } | null)?.min_percent)
        .filter((value): value is number => typeof value === "number");
      if (hasDuplicate(thresholds)) {
        issues.push(
          err(
            "E-EVAL-GRADES-DUP",
            `${path}/grades`,
            "two grade rows share a 'min_percent'; one score would earn two grades, so the table must use a distinct threshold per row",
            "evaluation",
          ),
        );
      }
      const floor = thresholds.length > 0 ? Math.min(...thresholds) : 0;
      if (floor > 0) {
        issues.push(
          warn(
            "W-EVAL-GRADES-NO-FLOOR",
            `${path}/grades`,
            `the lowest grade row starts at ${floor} percent, so a run below it earns no grade and the consumer has to invent a label the author never wrote; add a row at 0 unless "no grade down here" is the intent`,
            "evaluation",
          ),
        );
      }
    }
  });
  return issues;
}

/** engine#131: author lint on the retirement list. Duplicates never block -
 *  the retirement itself still works - but they are author noise that hides
 *  a real edit (usually a copy-paste of the previous entry). */
function checkRetiredIdsDuplicates(
  manifestMetadata: Record<string, unknown> | undefined,
): ValidationIssue[] {
  const retiredIds = manifestMetadata?.["retired_ids"];
  if (!Array.isArray(retiredIds)) return [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const entry of retiredIds) {
    if (typeof entry !== "string") continue;
    if (seenIds.has(entry)) duplicateIds.add(entry);
    seenIds.add(entry);
  }
  if (duplicateIds.size === 0) return [];
  return [
    warn(
      "W-RETIRED-IDS-DUP",
      "/metadata/retired_ids",
      `retired_ids lists ${[...duplicateIds].map((entry) => `'${entry}'`).join(", ")} more than once; a retirement is declared once - the duplicate usually hides a mis-edited entry`,
      "stable-identity-stable_id",
    ),
  ];
}

/** engine#127: the "known values + other" vocabulary lints. Both are
 *  warnings - unknown values stay VALID (additive contract, no break to
 *  published content), but silent fragmentation of the subject facet
 *  (nine live domain values, two overlapping pairs) and free-text level
 *  junk (``a0``, ``einsteiger``, ``reflexion``) get flagged at authoring
 *  time. Vocabulary source: ``content-domains.ts``. */
function checkManifestDomainVocabulary(normalized: unknown): ValidationIssue[] {
  const manifestSets = (normalized as { sets?: unknown }).sets;
  if (!Array.isArray(manifestSets)) return [];
  const issues: ValidationIssue[] = [];
  manifestSets.forEach((rawSet, setIndex) => {
    if (typeof rawSet !== "object" || rawSet === null) return;
    const setEntry = rawSet as { domain?: unknown; level?: unknown };
    const domain = typeof setEntry.domain === "string" ? setEntry.domain : undefined;
    if (domain !== undefined && !isKnownContentDomain(domain)) {
      issues.push(
        warn(
          "W-DOMAIN-UNKNOWN",
          `/sets/${setIndex}/domain`,
          `domain '${domain}' is outside the known vocabulary (${KNOWN_CONTENT_DOMAINS.join(", ")}); it stays valid ('other' contract), but consumers cannot group it with existing subjects - prefer a known domain or accept the fragmentation deliberately`,
          "content-domains",
        ),
      );
    }
    if (typeof setEntry.level === "string" && !isKnownLevel(domain, setEntry.level)) {
      issues.push(
        warn(
          "W-LEVEL-UNKNOWN",
          `/sets/${setIndex}/level`,
          `level '${setEntry.level}' is neither a CEFR band (A1..C2) nor, for a non-language set, the explicit 'none' sentinel; a level facet would offer it as a category`,
          "content-domains",
        ),
      );
    }
  });
  return issues;
}

/** engine#110: the ordering gate's carrier. A per-set manifest lists its
 *  lesson files in ``metadata.lessons`` (download discovery); those file
 *  names minus ``.json`` ARE the lesson ids whose lexicographic sort is the
 *  display order (engine#106). Running ``lessonIdOrderingIssues`` here means
 *  every repo gate that already calls ``validateManifest`` carries the check
 *  after a pure engine pin bump - no per-repo script change. Warning tier,
 *  never blocks. */
function checkManifestLessonOrdering(
  manifestMetadata: Record<string, unknown> | undefined,
): ValidationIssue[] {
  const listedLessons = manifestMetadata?.lessons;
  if (!Array.isArray(listedLessons)) return [];
  const lessonIds = listedLessons
    .filter((entry): entry is string => typeof entry === "string")
    .map((fileName) => fileName.replace(/\.json$/, ""));
  return lessonIdOrderingIssues(lessonIds).map((issue) => ({
    ...issue,
    path: "/metadata/lessons",
  }));
}
