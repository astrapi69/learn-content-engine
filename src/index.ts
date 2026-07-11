/**
 * learn-content-engine — framework-agnostic content parse/transform engine.
 *
 * Public API: the source→canonical boundary. A **source adapter**
 * turns raw content (today: a single-JSON lesson) into the canonical internal
 * lesson object ({@link ContentLesson}); the manifest transform projects a raw
 * ``manifest.yaml`` set into a canonical {@link ContentSetEntry}.
 *
 * The library is framework-agnostic: no fetch, no database, no UI. The
 * consumer supplies the raw bytes + set context and keeps network/persistence.
 */

// --- Engine: parse / transform + adapter surface ---------------------------
export {
  asContentSetBook,
  asContentSetEntry,
  parseLesson,
  parseManifest,
  resolveLanguagePair,
  setBasePath,
  singleJsonLessonAdapter,
} from "./content-engine.js";

// --- Conformance: explicit schema validation against the bundled artifact ---
export { validateLesson, validateManifest } from "./validate.js";
export type { ValidationIssue, ValidationResult, ValidationSeverity } from "./validate.js";

// --- Extension exercise types (schema 1.7): the registry contract ------------
export type { ExerciseExtension, ExtensionRegistry } from "./extensions.js";

export type {
  LessonSetContext,
  LessonSourceAdapter,
  ParsedManifest,
  ParsedSet,
  ParsedSetAsset,
  ParsedSetBook,
} from "./content-engine.js";

// --- Canonical types -------------------------------------------------------
export type {
  ContentCardMediaType,
  ContentExerciseDirection,
  ContentLesson,
  ContentLessonCard,
  ContentLessonCardTokenRole,
  ContentLessonCardTokenRoleName,
  ContentLessonClozeBlank,
  ContentLessonExercise,
  ContentLessonInlineExample,
  ContentLessonResource,
  ContentLessonStep,
  ContentSetBook,
  ContentSetEntry,
  ContentSetSource,
  SetStatus,
} from "./types/index.js";

// Underlying generated schema element types.
export type {
  Card,
  CardTokenRole,
  ClozeBlank,
  Direction,
  Exercise,
  ExerciseType,
  InlineExample,
  Lesson,
  LessonResource,
  LessonStep,
  MediaType,
  Pair,
  PictureImage,
  StepType,
  TokenRole,
} from "./types/index.js";
