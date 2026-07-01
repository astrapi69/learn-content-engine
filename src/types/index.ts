/**
 * Canonical content types — public type surface of the engine.
 *
 * Re-exports the canonical lesson / set-entry types plus the generated
 * schema element types (cards, exercises, steps, …) so consumers can type
 * against the exact same shapes the engine produces.
 */
export type {
  ContentCardMediaType,
  ContentExerciseDirection,
  ContentLesson,
  ContentLessonCard,
  ContentLessonCardTokenRole,
  ContentLessonCardTokenRoleName,
  ContentLessonClozeBlank,
  ContentLessonExercise,
  ContentLessonResource,
  ContentLessonStep,
  ContentSetBook,
  ContentSetEntry,
  ContentSetSource,
  SetStatus,
} from "./content.js";

// The generated schema element types (raw, pre-alias) — useful for consumers
// that need the underlying lesson/card/exercise interfaces directly.
export type {
  Card,
  CardTokenRole,
  ClozeBlank,
  Direction,
  Exercise,
  ExerciseType,
  Lesson,
  LessonResource,
  LessonStep,
  MediaType,
  Pair,
  PictureImage,
  StepType,
  TokenRole,
} from "./lesson-schema.generated.js";
