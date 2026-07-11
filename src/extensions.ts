/**
 * Extension exercise types (schema 1.7). The core exercise-type enum stays the
 * single, portable authority; an extension adds a NON-core type in the
 * ``ext:<vendor>-<name>`` namespace WITHOUT widening that enum. Portability is
 * preserved by an honest contract: a lesson must DECLARE the extensions it uses
 * in ``requires_extensions``, and a consumer that has not registered a declared
 * extension refuses the lesson loudly (``E-EXT-UNSUPPORTED``) instead of
 * mis-rendering it. Core lessons never touch this path, so pre-1.7 content
 * validates and parses byte-identically.
 *
 * This is the ENGINE half of an extension (schema-side validation + an optional
 * parse-time resolve). The CONSUMER half (renderer / grader) lives in the
 * consumer and is registered there; the two ship together so "validates =>
 * renderable" holds when both sides install the same extension. adaptive-learner
 * is one such consumer, but nothing here is app-specific.
 */

import type { ContentLesson } from "./types/index.js";
import type { Exercise } from "./types/lesson-schema.generated.js";
import type { ValidationIssue } from "./validate.js";

/**
 * The engine-side implementation of one ``ext:`` exercise type.
 *
 * ``type`` is the full namespaced id (e.g. ``ext:acme-ordering``); ``major`` is
 * the major version this implementation supports, matched against the
 * ``@<major>`` a lesson pins in ``requires_extensions``.
 */
export interface ExerciseExtension {
  /** The ext type this handles, e.g. ``ext:acme-ordering``. */
  type: string;
  /** Major version supported; matched against the lesson's ``@<major>`` pin. */
  major: number;
  /** Validate one exercise of this ext type (its ``ext_payload``). Returns an
   *  empty array when the exercise is valid. */
  validate(exercise: Exercise): ValidationIssue[];
  /** Optional parse-time transform, applied by ``parseLesson`` after the core
   *  ``from_cards`` resolution - the extension analogue of a core resolver. Must
   *  return a new lesson (no in-place mutation). */
  resolve?(lesson: ContentLesson): ContentLesson;
}

/** The set of extensions a caller registers with ``validateLesson`` /
 *  ``parseLesson``. Absent / empty means core-only behaviour. */
export type ExtensionRegistry = ExerciseExtension[];
