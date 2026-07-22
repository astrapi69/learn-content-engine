/**
 * Detection of invisible Unicode characters in lesson content (#75).
 *
 * Text pasted out of a PDF or a web page carries characters that cannot be
 * seen: zero-width spaces, byte-order marks, directional marks, soft hyphens.
 * They are legal JSON string content, so no structural check rejects them, and
 * no one notices them by reading the file. The app's book-text wizard asks the
 * author to paste a textbook section, which is precisely how they arrive.
 *
 * The rule is deliberately NARROW. Only characters that render as nothing at
 * all are listed. A no-break space (``U+00A0``) and a narrow no-break space
 * (``U+202F``) are excluded on purpose: they render as whitespace and are
 * legitimate typography, notably in the French content this ecosystem carries
 * ("Comment ca va ?" sets one before the question mark by convention).
 * Flagging them would make the lint usually-wrong, and a lint that is usually
 * wrong stops being read.
 */

/** Invisible codepoints, with the Unicode name reported to the author. */
const INVISIBLE_CHARACTERS = new Map<string, string>([
  ["­", "SOFT HYPHEN"],
  ["​", "ZERO WIDTH SPACE"],
  ["‌", "ZERO WIDTH NON-JOINER"],
  ["‍", "ZERO WIDTH JOINER"],
  ["‎", "LEFT-TO-RIGHT MARK"],
  ["‏", "RIGHT-TO-LEFT MARK"],
  [" ", "LINE SEPARATOR"],
  [" ", "PARAGRAPH SEPARATOR"],
  ["‪", "LEFT-TO-RIGHT EMBEDDING"],
  ["‫", "RIGHT-TO-LEFT EMBEDDING"],
  ["‬", "POP DIRECTIONAL FORMATTING"],
  ["‭", "LEFT-TO-RIGHT OVERRIDE"],
  ["‮", "RIGHT-TO-LEFT OVERRIDE"],
  ["⁠", "WORD JOINER"],
  ["﻿", "BYTE ORDER MARK"],
]);

/** One invisible character found at one place in the lesson. */
export interface InvisibleCharFinding {
  /** JSON-pointer-ish location, e.g. ``/cards/0/front``. */
  path: string;
  /** The offending character itself. */
  character: string;
  /** ``U+200B`` style label. */
  codepoint: string;
  /** The Unicode name, e.g. ``ZERO WIDTH SPACE``. */
  name: string;
}

/** ``U+200B``-style label for a single character. */
function toCodepointLabel(character: string): string {
  return `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Collect every invisible character in one string value. */
function findingsInString(value: string, path: string): InvisibleCharFinding[] {
  const findings: InvisibleCharFinding[] = [];
  for (const character of value) {
    const name = INVISIBLE_CHARACTERS.get(character);
    if (name) {
      findings.push({ path, character, codepoint: toCodepointLabel(character), name });
    }
  }
  return findings;
}

/**
 * Walk every string in an arbitrary value, reporting invisible characters with
 * the path they sit at. Walking the whole object rather than a field list is
 * what lets this cover ``ext_payload`` (whose shape the engine does not know)
 * and any field a later schema version adds.
 */
export function findInvisibleChars(value: unknown, path = ""): InvisibleCharFinding[] {
  if (typeof value === "string") return findingsInString(value, path);
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findInvisibleChars(entry, `${path}/${index}`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      findInvisibleChars(entry, `${path}/${key}`),
    );
  }
  return [];
}

/** How many distinct paths to name before trailing off. Enough to start
 *  fixing, short enough that a heavily-affected pasted chapter stays readable. */
const MAX_PATHS_LISTED = 5;

/**
 * One human-readable sentence describing every finding, or null when the
 * content is clean. Aggregated per lesson rather than emitted per occurrence:
 * a pasted chapter can carry dozens, and per-occurrence emission is the alert
 * fatigue W-CARD-UNUSED was aggregated away from (#49).
 */
export function describeInvisibleChars(findings: readonly InvisibleCharFinding[]): string | null {
  if (findings.length === 0) return null;
  const byCodepoint = new Map<string, string>();
  for (const finding of findings) byCodepoint.set(finding.codepoint, finding.name);
  const kinds = [...byCodepoint]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([codepoint, name]) => `${codepoint} ${name}`)
    .join(", ");
  const paths = [...new Set(findings.map((finding) => finding.path))];
  const shown = paths.slice(0, MAX_PATHS_LISTED).join(", ");
  const rest = paths.length > MAX_PATHS_LISTED ? `, and ${paths.length - MAX_PATHS_LISTED} more` : "";
  const plural = findings.length === 1 ? "occurrence" : "occurrences";
  return (
    `lesson text contains invisible characters (${kinds}): ` +
    `${findings.length} ${plural} at ${shown}${rest}. ` +
    "These usually arrive by pasting from a PDF or a web page; they are invisible when reading the file."
  );
}
