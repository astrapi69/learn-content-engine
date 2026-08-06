/**
 * Controlled content-domain + level vocabulary (engine#127).
 *
 * The schema keeps ``domain`` and ``level`` as free strings - an enum
 * would break existing published content, and additive-only is the
 * contract (the review_status precedent, engine#94). THIS module is the
 * documented "known values + other" half of that contract:
 *
 * - ``KNOWN_CONTENT_DOMAINS`` is the canonical grouping vocabulary a
 *   consumer's subject facet can rely on. Values outside it stay VALID
 *   (the "other" half) but draw the ``W-DOMAIN-UNKNOWN`` author lint so
 *   the registry does not fragment silently (nine live values already
 *   include two overlapping pairs - ``programming``/``software`` and
 *   ``ai``/``technology``; consolidating those is a content-repo
 *   decision, deliberately not forced here).
 * - ``LEVEL_NONE`` is the explicit no-level sentinel for non-language
 *   sets, so a level facet can distinguish "deliberately level-less"
 *   from free-text junk (live values include ``a0``, ``einsteiger``,
 *   ``reflexion``). Language sets declare a CEFR band.
 *
 * Consumers (the reference app's ``KNOWN_CONTENT_DOMAINS``) should read
 * this list instead of maintaining their own copy.
 */

/** Canonical content domains: the default ``language`` plus every domain
 *  published across the registered content repos. Lowercase, stable
 *  grouping keys. */
export const KNOWN_CONTENT_DOMAINS: readonly string[] = [
  "language",
  "knowledge",
  "programming",
  "software",
  "psychology",
  "math",
  "ai",
  "technology",
  "philosophy",
  "dog-training",
  "traffic-knowledge",
];

/** The CEFR proficiency bands a language set declares as its ``level``. */
export const CEFR_LEVELS: readonly string[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Explicit no-level sentinel for non-language sets (engine#127): a
 *  deliberately level-less knowledge set writes ``level: "none"``. */
export const LEVEL_NONE = "none";

/**
 * Whether ``domain`` is a known canonical domain. Case-insensitive;
 * absent/empty counts as the ``language`` default (known). Unknown
 * values are the valid-but-linted "other" half of the contract.
 */
export function isKnownContentDomain(domain: string | undefined): boolean {
  if (domain === undefined || domain === "") return true;
  return KNOWN_CONTENT_DOMAINS.includes(domain.toLowerCase());
}

/**
 * Whether ``level`` is a known value for a set of ``domain``:
 * a CEFR band (case-insensitive) for every domain, plus the explicit
 * ``"none"`` sentinel for non-language domains only - a language set
 * without a proficiency band is an authoring gap, not a category.
 */
export function isKnownLevel(domain: string | undefined, level: string): boolean {
  const normalizedLevel = level.trim().toUpperCase();
  if (CEFR_LEVELS.includes(normalizedLevel)) return true;
  const normalizedDomain = (domain || "language").toLowerCase();
  return normalizedDomain !== "language" && level.trim().toLowerCase() === LEVEL_NONE;
}
