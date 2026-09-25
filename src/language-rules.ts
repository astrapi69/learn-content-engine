/**
 * Language-pair and set-metadata rules (engine#190), moved from the content
 * template's validator in the version the owner decided on 2026-09-25:
 *
 *   - ``E-LANG-TAG``: a language field is not a well-formed BCP 47 tag. Every
 *     ``Intl`` API throws on one, so a consumer's speech output or collation
 *     would fail at run time.
 *   - ``W-LANG-TAG-CANONICAL``: well-formed, but not the canonical form
 *     (``deu`` for ``de``, ``EN`` for ``en``). Three-letter primary subtags
 *     without a two-letter code (``gsw``, ``yue``, ``fil``) are canonical.
 *   - ``W-LANG-PAIR-SAME``: a ``language`` set teaches the language it is
 *     explained in; legitimate for a monolingual course, so a warning.
 *   - ``W-SET-TITLE-NATIVE``: a ``language`` set without ``title_native``.
 *   - ``W-CARD-BACK-SCRIPT``: card backs with letters, none of them in the
 *     script the source language is written in.
 *
 * Built on ``Intl.getCanonicalLocales`` and ``Intl.Locale`` (CLDR data in
 * every modern runtime), not on hand-kept tables. No ajv, no ``node:*``: the
 * ``learn-content-engine/rules`` entry reaches this module.
 */
import { err, warn, type ValidationIssue } from "./issues.js";
import type { Lesson } from "./types/lesson-schema.generated.js";

const TAG_ANCHOR = "language-tags";

/** The canonical form of a BCP 47 language tag (case and deprecated aliases
 *  normalised: ``deu`` -> ``de``, ``iw`` -> ``he``), or ``null`` when the tag
 *  is not well-formed. Checks well-formedness, not registration: ``xx``
 *  passes. */
export function canonicalLanguageTag(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

/** E-LANG-TAG / W-LANG-TAG-CANONICAL for one language field; nothing for a
 *  value that is not a string (absent, ``null``). */
export function languageTagIssues(tag: unknown, path: string, field: string): ValidationIssue[] {
  if (typeof tag !== "string") return [];
  const canonical = canonicalLanguageTag(tag);
  if (canonical === null) {
    return [err("E-LANG-TAG", path, `${field} '${tag}' is not a well-formed BCP 47 language tag`, TAG_ANCHOR, { field, tag })];
  }
  if (canonical === tag) return [];
  return [
    warn("W-LANG-TAG-CANONICAL", path, `${field} '${tag}' is not in canonical form; write '${canonical}'`, TAG_ANCHOR, {
      field,
      tag,
      canonical,
    }),
  ];
}

/** The primary language of a tag (``de-AT`` -> ``de``), or ``null`` for a
 *  malformed one. */
const primaryLanguage = (tag: string): string | null => {
  const canonical = canonicalLanguageTag(tag);
  return canonical === null ? null : new Intl.Locale(canonical).language;
};

interface RawSet {
  target_language?: unknown;
  source_language?: unknown;
  domain?: unknown;
  title_native?: unknown;
}

/** Whether a set teaches a language (``domain`` absent or ``language``). */
const isLanguageSet = (set: RawSet): boolean =>
  typeof set.domain !== "string" || set.domain.trim().toLowerCase() === "language";

/** W-LANG-PAIR-SAME: a language set whose source and target are one primary
 *  language. An absent source is ``en``, the schema's default. */
function languagePairIssues(set: RawSet, path: string): ValidationIssue[] {
  if (!isLanguageSet(set) || typeof set.target_language !== "string") return [];
  const source = typeof set.source_language === "string" ? set.source_language : "en";
  const target = primaryLanguage(set.target_language);
  if (target === null || target !== primaryLanguage(source)) return [];
  return [
    warn("W-LANG-PAIR-SAME", path, `the set's source and target language are both '${target}'`, TAG_ANCHOR, { language: target }),
  ];
}

/** W-SET-TITLE-NATIVE: a language set without a title in the language it
 *  teaches. */
function titleNativeIssues(set: RawSet, path: string): ValidationIssue[] {
  if (!isLanguageSet(set)) return [];
  if (typeof set.title_native === "string" && set.title_native.trim() !== "") return [];
  return [warn("W-SET-TITLE-NATIVE", path, "a language set has no 'title_native' (its title in the target language)", TAG_ANCHOR)];
}

/** Every language rule of one manifest set entry (after the legacy
 *  ``language`` alias became ``target_language``). */
export function setLanguageIssues(rawSet: unknown, index: number): ValidationIssue[] {
  if (typeof rawSet !== "object" || rawSet === null) return [];
  const set = rawSet as RawSet;
  const path = `/sets/${index}`;
  return [
    ...languageTagIssues(set.target_language, `${path}/target_language`, "target_language"),
    ...languageTagIssues(set.source_language, `${path}/source_language`, "source_language"),
    ...languagePairIssues(set, path),
    ...titleNativeIssues(set, path),
  ];
}

/** Scripts that CLDR names for a language but that are not one Unicode
 *  Script value: Japanese writes Han, Hiragana and Katakana, Korean Hangul and
 *  Han, Chinese Han. */
const COMPOSITE_SCRIPTS: Readonly<Record<string, readonly string[]>> = {
  Jpan: ["Hani", "Hira", "Kana"],
  Kore: ["Hang", "Hani"],
  Hans: ["Hani"],
  Hant: ["Hani"],
  Hanb: ["Hani", "Bopo"],
};

/** The script a language is written in by default (CLDR likely subtags:
 *  ``el`` -> ``Grek``, ``sr`` -> ``Cyrl``, ``sr-Latn`` -> ``Latn``), or
 *  ``undefined`` for a malformed tag. */
function likelyScript(tag: string): string | undefined {
  const canonical = canonicalLanguageTag(tag);
  return canonical === null ? undefined : new Intl.Locale(canonical).maximize().script;
}

/** A pattern matching one letter of ``script``, or ``null`` when the runtime
 *  does not know the script. */
function scriptLetterPattern(script: string): RegExp | null {
  const parts = COMPOSITE_SCRIPTS[script] ?? [script];
  try {
    return new RegExp(parts.map((part) => `\\p{Script_Extensions=${part}}`).join("|"), "u");
  } catch {
    return null;
  }
}

const LETTER = /\p{L}/u;

/**
 * W-CARD-BACK-SCRIPT: card backs are written in the source language, so a
 * back that has letters but none of that language's script is most likely in
 * the wrong language. Checked only when the source language is not written in
 * Latin; one letter of the script suffices (a loanword in brackets is fine),
 * and a back without letters (a number, a symbol) is not judged. One warning
 * per lesson, naming the cards. The lesson's own ``source_language`` wins
 * over the caller's ``sourceLanguage`` (the set's).
 */
function cardBackScriptIssues(lesson: Lesson, sourceLanguage: string | undefined): ValidationIssue[] {
  const source = typeof lesson.source_language === "string" ? lesson.source_language : sourceLanguage;
  if (source === undefined) return [];
  const script = likelyScript(source);
  if (script === undefined || script === "Latn") return [];
  const pattern = scriptLetterPattern(script);
  if (pattern === null) return [];
  const cardIds = (lesson.cards ?? [])
    .filter((card) => LETTER.test(card.back) && !pattern.test(card.back))
    .map((card) => card.id);
  if (cardIds.length === 0) return [];
  return [
    warn(
      "W-CARD-BACK-SCRIPT",
      "/cards",
      `${cardIds.length} card backs contain no letter of the ${script} script, although the source language '${source}' is written in it: ${cardIds.join(", ")}`,
      "cards",
      { sourceLanguage: source, script, count: cardIds.length, cardIds },
    ),
  ];
}

/** Every language rule of one lesson: its own language tags and the script
 *  of its card backs. */
export function lessonLanguageIssues(lesson: Lesson, sourceLanguage: string | undefined): ValidationIssue[] {
  return [
    ...languageTagIssues(lesson.target_language, "/target_language", "target_language"),
    ...languageTagIssues(lesson.source_language, "/source_language", "source_language"),
    ...cardBackScriptIssues(lesson, sourceLanguage),
  ];
}
