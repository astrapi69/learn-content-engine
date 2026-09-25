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

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import type { ExtensionRegistry } from "./extensions.js";
import { err, type ValidationIssue, type ValidationResult } from "./issues.js";
import { normalizeManifestAliases, validateLessonRules, validateManifestRules } from "./rules.js";
import { CONTENT_MANIFEST_SCHEMA, LESSON_SCHEMA } from "./schemas.generated.js";
import type { Lesson } from "./types/lesson-schema.generated.js";

export type { ValidationIssue, ValidationParams, ValidationParamValue, ValidationResult, ValidationSeverity } from "./issues.js";
export { warn } from "./issues.js";
export { unusedCardIds } from "./rules.js";

// strict:false so ajv tolerates the schema's ``x-schema-version`` annotation
// keyword; allErrors so a single call surfaces every problem at once.
const ajv = new Ajv2020({ allErrors: true, strict: false });

// The schemas are modules (schemas.generated.ts), not files read at run time,
// so a bundler copies nothing and the validators run in a browser (engine#203).
// They still compile lazily, on the FIRST validate call: an import that only
// parses pays nothing for ajv's compilation (engine#59).
let structuralLessonCache: ValidateFunction | null = null;
let structuralManifestCache: ValidateFunction | null = null;
const structuralLesson = (): ValidateFunction => (structuralLessonCache ??= ajv.compile(LESSON_SCHEMA));
const structuralManifest = (): ValidateFunction => (structuralManifestCache ??= ajv.compile(CONTENT_MANIFEST_SCHEMA));

/** Map ajv's error objects to error issues, naming the offending key for
 *  ``additionalProperties`` rejections so the message is actionable. */
function toStructuralIssues(errors: ErrorObject[]): ValidationIssue[] {
  return errors.map((error) => {
    const params = error.params as { additionalProperty?: unknown };
    const path = error.instancePath || "/";
    if (typeof params.additionalProperty === "string") {
      return err("E-UNKNOWN-FIELD", path, `${error.message} (${params.additionalProperty})`, "rule-catalog", {
        field: params.additionalProperty,
      });
    }
    return err("E-SCHEMA", path, `${error.message}`, "rule-catalog");
  });
}

/**
 * Validate a lesson against the bundled canonical schema, the semantic
 * cross-field rules, and the author lints. Returns ``{ valid, errors, warnings
 * }``; ``valid`` is errors-only (warnings never block). Does not throw.
 *
 * ``options.extensions`` registers ``ext:`` exercise-type extensions. Without
 * it, an ``ext:`` exercise that a lesson declares is refused (E-EXT-UNSUPPORTED);
 * CORE content (no ``ext:`` types) validates identically regardless of the
 * registry. ``options.sourceLanguage`` is the source language of the set the
 * lesson belongs to, for the card-back script lint (``W-CARD-BACK-SCRIPT``);
 * a lesson that declares its own ``source_language`` keeps it.
 */
export function validateLesson(
  input: unknown,
  options: { extensions?: ExtensionRegistry; sourceLanguage?: string } = {},
): ValidationResult {
  const structural = structuralLesson();
  if (!structural(input)) {
    return { valid: false, errors: toStructuralIssues(structural.errors as ErrorObject[]), warnings: [] };
  }
  return validateLessonRules(input as Lesson, options);
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
  return validateManifestRules(normalized);
}
