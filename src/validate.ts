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
 *      duplicate word tiles, answer-as-distractor, length-revealing hints).
 *
 * Every issue carries a stable ``id``, a ``severity``, and a ``docAnchor`` so
 * the message is actionable and a thin downstream validator can mirror the rule
 * without drifting. The rule catalog lives in ``docs/lesson-format.md``.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import type { ExtensionRegistry } from "./extensions.js";
import type { Exercise, Lesson, LessonStep } from "./types/lesson-schema.generated.js";

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
const warn = (id: string, path: string, message: string, anchor: string): ValidationIssue =>
  makeIssue("warning", id, path, message, anchor);

const loadSchema = (fileName: string): object =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../schema/${fileName}`, import.meta.url)), "utf8"),
  ) as object;

// strict:false so ajv tolerates the schema's ``x-schema-version`` annotation
// keyword; allErrors so a single call surfaces every problem at once.
const ajv = new Ajv2020({ allErrors: true, strict: false });
const structuralLesson: ValidateFunction = ajv.compile(loadSchema("lesson.schema.json"));
const structuralManifest: ValidateFunction = ajv.compile(loadSchema("content-manifest.schema.json"));

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
  if (hasDuplicate(pairs.map((pair) => pair.left)) || hasDuplicate(pairs.map((pair) => pair.right))) {
    issues.push(
      warn("W-MATCH-AMBIG", path, "MATCHING has duplicate 'left' or 'right' values (ambiguous pairing)", "matching"),
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
  }
  if (step.body != null) {
    issues.push(err("E-STEP-EXERCISE-BODY", path, "EXERCISE step must not carry 'body' (use the exercise prompt instead)", "steps"));
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
  return issues;
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
  if (!structuralLesson(input)) {
    return { valid: false, errors: toStructuralIssues(structuralLesson.errors as ErrorObject[]), warnings: [] };
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
  if (!structuralManifest(normalized)) {
    return { valid: false, errors: toStructuralIssues(structuralManifest.errors as ErrorObject[]), warnings: [] };
  }
  return { valid: true, errors: [], warnings: [] };
}
