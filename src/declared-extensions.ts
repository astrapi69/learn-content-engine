/**
 * Synthesise a permissive extension registry from a lesson's OWN
 * ``requires_extensions`` (engine#70).
 *
 * This is ENGINE-LAYER tooling. Harnesses that drive FOREIGN content - the
 * real-content conformance run, the ``docs/extensions.md`` doc gate - cannot
 * know which extensions any given consumer has adopted: different consumers
 * adopt different sets, and the ``ext:<vendor>-<name>`` namespace is
 * deliberately open. Registering an adoption allowlist here would point the
 * dependency the wrong way (Consumer -> Engine) and force an engine commit for
 * every consumer-side adoption. So the only registry the engine can honestly
 * build is the one the content itself declares.
 *
 * What that still catches: ``E-EXT-UNDECLARED`` (an exercise using an ext type
 * the lesson never declared) runs BEFORE the registry lookup and is unaffected,
 * and a malformed declaration never reaches this code at all - the schema
 * pattern on ``requires_extensions`` rejects it structurally (``E-SCHEMA``).
 * What it cannot catch is "declared but adopted by nobody", which is not
 * decidable at this layer by construction.
 *
 * Payload correctness stays consumer-side (the stubs validate to ``[]``): the
 * engine will not invent rules a foreign vendor never published. A CONSUMER
 * gate is the place for an adoption allowlist plus real payload validators.
 */

import type { ExerciseExtension, ExtensionRegistry } from "./extensions.js";

/** Read ``requires_extensions`` off an unknown value, tolerating anything. */
function declaredEntries(lesson: unknown): string[] {
  if (typeof lesson !== "object" || lesson === null) return [];
  const declared = (lesson as { requires_extensions?: unknown }).requires_extensions;
  if (!Array.isArray(declared)) return [];
  return declared.filter((entry): entry is string => typeof entry === "string");
}

/** Split ``ext:<vendor>-<name>@<major>`` into a permissive stub, or null when
 *  the entry is malformed (mirrors the validator's own tolerance). */
function asStubExtension(entry: string): ExerciseExtension | null {
  const at = entry.lastIndexOf("@");
  if (at === -1) return null;
  const major = Number(entry.slice(at + 1));
  if (!Number.isInteger(major)) return null;
  return { type: entry.slice(0, at), major, validate: () => [] };
}

/**
 * Build the registry a lesson declares for itself. Returns an empty registry
 * for core lessons, non-lesson input, and malformed declarations - so passing
 * it to ``validateLesson`` is a no-op wherever no extension is in play.
 */
export function declaredExtensionRegistry(lesson: unknown): ExtensionRegistry {
  return declaredEntries(lesson)
    .map(asStubExtension)
    .filter((extension): extension is ExerciseExtension => extension !== null);
}
