/**
 * Schema validation against the bundled canonical artifacts (TEIL B).
 *
 * ``parse`` stays permissive (JSON.parse + spread); validation is an EXPLICIT,
 * opt-in step the consumer runs when it wants the format contract enforced.
 *
 * Two layers, mirroring the app's Pydantic pipeline (field validation before
 * the model_validators):
 *   1. STRUCTURAL - ajv against the bundled ``schema/lesson.schema.json``
 *      (draft 2020-12). The schema is STRICT (``additionalProperties: false``
 *      everywhere), so unknown fields are rejected - deliberate parity with the
 *      app, which is what makes the engine a trustworthy format reference.
 *   2. SEMANTIC - cross-field rules the JSON-Schema cannot express (per-type
 *      required fields, cloze marker/blank count, multiselect disjointness,
 *      picture "exactly one correct", referential integrity). These mirror the
 *      app's ``model_validator`` methods verbatim and run only once the input
 *      is structurally valid.
 *
 * The same ``schema/lesson.schema.json`` is the shipped artifact content-repos
 * will later mirror against (the decoupling follow-up).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import type { Exercise, Lesson, LessonStep } from "./types/lesson-schema.generated.js";

/** One validation problem: a JSON-pointer-ish path plus a human-readable reason. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** The outcome of a validate call: ``valid`` plus the (possibly empty) issues. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}

const loadSchema = (fileName: string): object =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../schema/${fileName}`, import.meta.url)), "utf8"),
  ) as object;

// strict:false so ajv tolerates the schema's ``x-schema-version`` annotation
// keyword; allErrors so a single call surfaces every problem at once.
const ajv = new Ajv2020({ allErrors: true, strict: false });
const structuralLesson: ValidateFunction = ajv.compile(loadSchema("lesson.schema.json"));
const structuralManifest: ValidateFunction = ajv.compile(loadSchema("content-manifest.schema.json"));

/** Map ajv's error objects to our issue shape, naming the offending key for
 *  ``additionalProperties`` rejections so the message is actionable. */
function toIssues(errors: ErrorObject[]): ValidationIssue[] {
  return errors.map((error) => {
    const params = error.params as { additionalProperty?: unknown };
    const extra = typeof params.additionalProperty === "string" ? ` (${params.additionalProperty})` : "";
    return { path: error.instancePath || "/", message: `${error.message}${extra}` };
  });
}

/** Count non-overlapping ``___`` markers (matches Python ``str.count('___')``). */
const markerCount = (sentence: string): number => sentence.split("___").length - 1;

function checkMatching(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.pairs || exercise.pairs.length === 0) {
    issues.push({ path, message: "MATCHING exercise requires non-empty 'pairs'" });
  }
}

function checkPictureChoice(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const images = exercise.images;
  if (!images || images.length < 2) {
    issues.push({ path, message: "PICTURE_CHOICE requires at least 2 'images'" });
    return;
  }
  const correct = images.filter((image) => image.is_correct === "true").length;
  if (correct !== 1) {
    issues.push({
      path,
      message: "PICTURE_CHOICE must have exactly one image marked 'is_correct': 'true'",
    });
  }
}

function checkFreeText(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.accept || exercise.accept.length === 0) {
    issues.push({ path, message: "FREE_TEXT exercise requires non-empty 'accept'" });
  }
}

function checkWordTiles(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const tiles = exercise.tiles;
  if (!tiles || tiles.length < 2) {
    issues.push({ path, message: "WORD_TILES requires at least 2 'tiles'" });
    return;
  }
  if (!exercise.accept_orderings) return;
  const expected = tiles.map((_tile, index) => index);
  for (const ordering of exercise.accept_orderings) {
    const sorted = [...ordering].sort((a, b) => a - b);
    const isPermutation = sorted.length === expected.length && sorted.every((value, index) => value === expected[index]);
    if (!isPermutation) {
      issues.push({
        path,
        message: `accept_orderings entry ${JSON.stringify(ordering)} must be a permutation of [0..${tiles.length - 1}]`,
      });
    }
  }
}

function checkClozeMultiselect(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.sentence) {
    issues.push({ path, message: "CLOZE multiselect requires a non-empty 'sentence' (the question)" });
  }
  const accept = exercise.accept ?? [];
  if (accept.length === 0) {
    issues.push({ path, message: "CLOZE multiselect requires non-empty 'accept' (the correct options)" });
  }
  const distractors = exercise.distractors ?? [];
  if (distractors.length === 0) {
    issues.push({ path, message: "CLOZE multiselect requires non-empty 'distractors'" });
  }
  const overlap = accept.filter((option) => distractors.includes(option));
  if (overlap.length > 0) {
    issues.push({
      path,
      message: `CLOZE multiselect 'accept' and 'distractors' must be disjoint; shared option(s): ${JSON.stringify(overlap)}`,
    });
  }
}

function checkCloze(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (exercise.cloze_mode === "multiselect") {
    checkClozeMultiselect(exercise, path, issues);
    return;
  }
  const sentence = exercise.sentence;
  if (!sentence) {
    issues.push({ path, message: "CLOZE exercise requires non-empty 'sentence'" });
    return;
  }
  const blanks = exercise.blanks;
  if (!blanks || blanks.length === 0) {
    issues.push({ path, message: "CLOZE exercise requires non-empty 'blanks'" });
    return;
  }
  const markers = markerCount(sentence);
  if (markers !== blanks.length) {
    issues.push({
      path,
      message: `CLOZE marker count mismatch: sentence has ${markers} '___' markers but blanks has ${blanks.length} entries`,
    });
  }
  if (exercise.cloze_mode === "select" && (!exercise.distractors || exercise.distractors.length === 0)) {
    issues.push({ path, message: "CLOZE with cloze_mode='select' requires non-empty 'distractors'" });
  }
}

const EXERCISE_CHECKS: Record<string, (exercise: Exercise, path: string, issues: ValidationIssue[]) => void> = {
  matching: checkMatching,
  picture_choice: checkPictureChoice,
  free_text: checkFreeText,
  word_tiles: checkWordTiles,
  cloze: checkCloze,
};

function checkExercise(
  exercise: Exercise,
  path: string,
  knownCardIds: Set<string>,
  issues: ValidationIssue[],
): void {
  for (const cardId of exercise.card_ids ?? []) {
    if (!knownCardIds.has(cardId)) {
      issues.push({ path: `${path}/card_ids`, message: `exercise references unknown card '${cardId}'` });
    }
  }
  const check = EXERCISE_CHECKS[exercise.type];
  if (check) check(exercise, path, issues);
}

function checkStep(step: LessonStep, path: string, knownCardIds: Set<string>, issues: ValidationIssue[]): void {
  if (step.type === "theory") {
    if (!step.body) issues.push({ path, message: "THEORY step requires non-empty 'body'" });
    if (step.exercise != null) issues.push({ path, message: "THEORY step must not carry 'exercise'" });
    return;
  }
  // EXERCISE step
  if (step.exercise == null) {
    issues.push({ path, message: "EXERCISE step requires an 'exercise' payload" });
  } else {
    checkExercise(step.exercise, `${path}/exercise`, knownCardIds, issues);
  }
  if (step.body != null) {
    issues.push({ path, message: "EXERCISE step must not carry 'body' (use the exercise prompt instead)" });
  }
}

/** Semantic pass mirroring the app's model_validators. Assumes the input is
 *  already structurally valid (so the schema-typed shape is trustworthy). */
function semanticIssues(lesson: Lesson): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownCardIds = new Set<string>((lesson.cards ?? []).map((card) => card.id));
  lesson.steps.forEach((step, index) => {
    checkStep(step, `/steps/${index}`, knownCardIds, issues);
  });
  return issues;
}

/**
 * Validate a lesson object against the bundled canonical schema + the semantic
 * cross-field rules. Returns ``{ valid, errors }``; ``errors`` carries a path
 * and a human-readable message for each problem. Does not throw.
 */
export function validateLesson(input: unknown): ValidationResult {
  if (!structuralLesson(input)) {
    return { valid: false, errors: toIssues(structuralLesson.errors as ErrorObject[]) };
  }
  const errors = semanticIssues(input as Lesson);
  return { valid: errors.length === 0, errors };
}

/** Drop the legacy ``language`` alias into ``target_language`` on each set
 *  BEFORE schema validation - mirrors the app's ``_accept_language_alias``
 *  (mode="before"), so a pre-v1.2 manifest validates instead of tripping the
 *  strict ``additionalProperties`` / missing-``target_language`` rules. */
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
 * ``language`` alias. Returns ``{ valid, errors }``; does not throw.
 */
export function validateManifest(input: unknown): ValidationResult {
  const normalized = normalizeManifestAliases(input);
  if (!structuralManifest(normalized)) {
    return { valid: false, errors: toIssues(structuralManifest.errors as ErrorObject[]) };
  }
  return { valid: true, errors: [] };
}
