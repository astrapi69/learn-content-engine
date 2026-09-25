/**
 * The quality minimums of a lesson (engine#185): the threshold for publishing
 * and sharing it, kept apart from validity.
 *
 * ``validateLesson`` answers whether a lesson is well-formed; a consumer that
 * generates short lessons (the reference app's adaptive lessons have fewer than
 * five exercises) must be able to accept its own output. Whether a lesson is
 * substantial enough to publish is a second question, answered here. Each
 * consumer decides what a shortfall means: the content repos' gate blocks, the
 * app blocks sharing.
 *
 * One version of the rule instead of three: the content template's gate,
 * alc-books' copy of it and the app's share check applied the numbers of
 * ``schema/quality-rules.json`` with different exemptions and a different count
 * for ``from_cards``. Here a lesson declares what it is for, and the minimums
 * follow from its ``purpose``; ``from_cards`` counts the pairs parsing derives.
 *
 * No ajv and no ``node:*`` (the ``learn-content-engine/rules`` entry exports
 * this module): the input must already have the schema's shape.
 */
import { err, splitIssues, type ValidationIssue, type ValidationResult } from "./issues.js";
import type { Exercise, Lesson, LessonPurpose } from "./types/lesson-schema.generated.js";

/** The shared quality minimums: the numbers of ``schema/quality-rules.json``
 *  (``src/quality.test.ts`` pins the two to each other). */
export const QUALITY_MINIMUMS = {
  minExerciseTypes: 2,
  minExercisesPerLesson: 5,
  minFreeTextAccepts: 2,
  minMatchingPairs: 3,
  minTheorySteps: 1,
} as const;

const ANCHOR = "quality-minimums";

interface LocatedExercise {
  exercise: Exercise;
  path: string;
}

/** The exercises of a lesson with their paths; a step without its payload is
 *  not an exercise (``validateLesson`` reports it). */
const exercisesOf = (lesson: Lesson): LocatedExercise[] =>
  lesson.steps.flatMap((step, index) =>
    step.type === "exercise" && step.exercise ? [{ exercise: step.exercise, path: `/steps/${index}/exercise` }] : [],
  );

/** The pairs a matching exercise has: with ``from_cards``, the ``card_ids``
 *  that resolve to a card of the lesson, one pair each, exactly as parsing
 *  derives them; otherwise its explicit ``pairs``. */
function matchingPairCount(exercise: Exercise, cardIds: ReadonlySet<string>): number {
  if (exercise.from_cards) return (exercise.card_ids ?? []).filter((cardId) => cardIds.has(cardId)).length;
  return exercise.pairs?.length ?? 0;
}

/** The lesson-wide minimums: number of exercises, of exercise types, of
 *  theory steps. ``bridge`` lifts the first, ``quiz`` the second. */
function lessonCountIssues(lesson: Lesson, exercises: LocatedExercise[]): ValidationIssue[] {
  const purpose: LessonPurpose = lesson.purpose ?? "practice";
  const issues: ValidationIssue[] = [];
  const exerciseCount = exercises.length;
  if (purpose !== "bridge" && exerciseCount < QUALITY_MINIMUMS.minExercisesPerLesson) {
    const min = QUALITY_MINIMUMS.minExercisesPerLesson;
    issues.push(
      err("E-QUALITY-EXERCISES", "/steps", `lesson has ${exerciseCount} exercises; it needs at least ${min} unless its purpose is "bridge"`, ANCHOR, {
        count: exerciseCount,
        min,
      }),
    );
  }
  const types = [...new Set(exercises.map(({ exercise }) => exercise.type))].sort();
  if (purpose !== "quiz" && types.length < QUALITY_MINIMUMS.minExerciseTypes) {
    const min = QUALITY_MINIMUMS.minExerciseTypes;
    issues.push(
      err("E-QUALITY-TYPES", "/steps", `lesson has ${types.length} exercise types; it needs at least ${min} unless its purpose is "quiz"`, ANCHOR, {
        count: types.length,
        min,
        types,
      }),
    );
  }
  const theoryCount = lesson.steps.filter((step) => step.type === "theory").length;
  if (theoryCount < QUALITY_MINIMUMS.minTheorySteps) {
    const min = QUALITY_MINIMUMS.minTheorySteps;
    issues.push(
      err("E-QUALITY-THEORY", "/steps", `lesson has ${theoryCount} theory steps; it needs at least ${min}`, ANCHOR, {
        count: theoryCount,
        min,
      }),
    );
  }
  return issues;
}

/** The per-exercise minimums: accepted answers of a ``free_text``, pairs of a
 *  ``matching``. They hold for every purpose. */
function exerciseIssues(located: LocatedExercise, cardIds: ReadonlySet<string>): ValidationIssue[] {
  const { exercise, path } = located;
  if (exercise.type === "free_text") {
    const count = exercise.accept?.length ?? 0;
    const min = QUALITY_MINIMUMS.minFreeTextAccepts;
    if (count >= min) return [];
    return [
      err("E-QUALITY-FREETEXT-ACCEPTS", path, `FREE_TEXT has ${count} accepted answers; it needs at least ${min}`, ANCHOR, { count, min }),
    ];
  }
  if (exercise.type === "matching") {
    const count = matchingPairCount(exercise, cardIds);
    const min = QUALITY_MINIMUMS.minMatchingPairs;
    if (count >= min) return [];
    return [err("E-QUALITY-MATCHING-PAIRS", path, `MATCHING has ${count} pairs; it needs at least ${min}`, ANCHOR, { count, min })];
  }
  return [];
}

/**
 * Check a lesson against the quality minimums (``QUALITY_MINIMUMS``, the
 * numbers of ``schema/quality-rules.json``), keyed to its ``purpose``: every
 * minimum for ``practice`` (the default), no exercise minimum for ``bridge``,
 * no exercise-type minimum for ``quiz``. Returns ``{ valid, errors, warnings }``
 * where ``errors`` are the shortfalls and ``warnings`` is always empty; the
 * consumer decides whether a shortfall blocks. A ``matching`` with
 * ``from_cards`` counts the pairs parsing derives, so a parsed lesson gets the
 * same answer as its source. For input that already has the schema's shape
 * (``validateLesson``); does not throw on such input.
 */
export function validateLessonQuality(lesson: Lesson): ValidationResult {
  const exercises = exercisesOf(lesson);
  const cardIds = new Set((lesson.cards ?? []).map((card) => card.id));
  return splitIssues([
    ...lessonCountIssues(lesson, exercises),
    ...exercises.flatMap((located) => exerciseIssues(located, cardIds)),
  ]);
}
