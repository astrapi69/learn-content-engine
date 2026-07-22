/**
 * Detection of invisible Unicode characters in lesson content (#75).
 *
 * Text pasted out of a PDF or a web page carries characters that cannot be
 * seen: zero-width spaces, byte-order marks, directional marks, soft hyphens,
 * and control characters that a JSON escape smuggled through. They are legal
 * JSON string content, so no structural check rejects them, and no one notices
 * them by reading the file. The app's book-text wizard asks the author to
 * paste a textbook section, which is precisely how they arrive.
 *
 * Two deliberate exclusions keep the rule from crying wolf:
 *
 * - Tab, newline and carriage return are ordinary text. Theory bodies are full
 *   of newlines, so flagging them would warn on nearly every knowledge lesson.
 * - ``U+00A0`` NO-BREAK SPACE and ``U+202F`` NARROW NO-BREAK SPACE render as
 *   whitespace and are legitimate typography, notably in the French content
 *   this ecosystem carries ("Comment ca va ?" sets one before the question
 *   mark). A lint that is usually wrong stops being read.
 *
 * The table below is keyed by NUMERIC codepoint on purpose. Keying it by the
 * characters themselves made the source unreadable: a reviewer saw an empty
 * string and had to take the label on trust, in the one file where that is
 * least acceptable.
 *
 * Codepoints and names follow the Unicode Character Database; the format
 * ranges are those of general category Cf. The starting set was taken from
 * the sanitizer of `manuscript-tools`
 * (https://github.com/astrapi69/manuscript-tools), whose checker had the same
 * gap this module closed.
 *
 * Scope note: the walker below reads plain JSON shapes only. ``Map`` and
 * ``Set`` values would be walked as empty objects, which sounds like a silent
 * false negative but cannot happen here. ``validateLesson`` returns early when
 * the structural check fails, so the lint only ever sees a schema-valid
 * lesson, and this module is not exported from the package entry. Both would
 * have to change before the gap is reachable; if this is ever made public,
 * handle those two types before doing so.
 */

/** A codepoint, or an inclusive range of them, that renders as nothing. */
interface InvisibleRange {
  /** First codepoint in the range. */
  from: number;
  /** Last codepoint, inclusive. Equal to ``from`` for a single character. */
  to: number;
  /** Unicode name reported to the author. */
  name: string;
}

/**
 * Every codepoint the lint flags. C0 skips 0x09/0x0A/0x0D (tab, newline,
 * carriage return); C1 has no such exceptions, none of it is text.
 */
const INVISIBLE_RANGES: readonly InvisibleRange[] = [
  { from: 0x0000, to: 0x0008, name: "CONTROL CHARACTER" },
  { from: 0x000b, to: 0x000c, name: "CONTROL CHARACTER" },
  { from: 0x000e, to: 0x001f, name: "CONTROL CHARACTER" },
  { from: 0x007f, to: 0x007f, name: "DELETE" },
  { from: 0x0080, to: 0x009f, name: "CONTROL CHARACTER" },
  { from: 0x00ad, to: 0x00ad, name: "SOFT HYPHEN" },
  { from: 0x200b, to: 0x200b, name: "ZERO WIDTH SPACE" },
  { from: 0x200c, to: 0x200c, name: "ZERO WIDTH NON-JOINER" },
  { from: 0x200d, to: 0x200d, name: "ZERO WIDTH JOINER" },
  { from: 0x200e, to: 0x200e, name: "LEFT-TO-RIGHT MARK" },
  { from: 0x200f, to: 0x200f, name: "RIGHT-TO-LEFT MARK" },
  { from: 0x2028, to: 0x2028, name: "LINE SEPARATOR" },
  { from: 0x2029, to: 0x2029, name: "PARAGRAPH SEPARATOR" },
  { from: 0x202a, to: 0x202a, name: "LEFT-TO-RIGHT EMBEDDING" },
  { from: 0x202b, to: 0x202b, name: "RIGHT-TO-LEFT EMBEDDING" },
  { from: 0x202c, to: 0x202c, name: "POP DIRECTIONAL FORMATTING" },
  { from: 0x202d, to: 0x202d, name: "LEFT-TO-RIGHT OVERRIDE" },
  { from: 0x202e, to: 0x202e, name: "RIGHT-TO-LEFT OVERRIDE" },
  // The whole U+2060-206F format block: word joiner, the invisible math
  // operators a formula editor pastes, the bidi isolates that modern editors
  // emit in place of the older embeddings, and the deprecated format
  // characters. All are Unicode general category Cf and all render as nothing.
  { from: 0x2060, to: 0x206f, name: "INVISIBLE FORMAT CHARACTER" },
  { from: 0xfeff, to: 0xfeff, name: "BYTE ORDER MARK" },
];

const asEscape = (codepoint: number): string =>
  `\\u{${codepoint.toString(16).padStart(4, "0")}}`;

/**
 * One character class covering every range, matched globally so the offenders
 * can be pulled straight out of a string instead of walking it character by
 * character. A pasted chapter is long and almost entirely clean, so skipping
 * the visible text matters.
 *
 * The ``u`` flag is not decoration: without it a pattern is matched in UTF-16
 * code units, so any future codepoint above the BMP would be compared against
 * half a surrogate pair. ``\u{...}`` syntax requires the flag in turn.
 */
const INVISIBLE_PATTERN = new RegExp(
  `[${INVISIBLE_RANGES.map((range) =>
    range.from === range.to
      ? asEscape(range.from)
      : `${asEscape(range.from)}-${asEscape(range.to)}`,
  ).join("")}]`,
  "gu",
);

/** The Unicode name for a codepoint, or null when it is ordinary text. */
function nameOf(codepoint: number): string | null {
  const range = INVISIBLE_RANGES.find(
    (candidate) => codepoint >= candidate.from && codepoint <= candidate.to,
  );
  return range ? range.name : null;
}

/** One invisible character found at one place in the lesson. */
export interface InvisibleCharFinding {
  /** JSON-pointer-ish location, e.g. ``/cards/0/front``. */
  path: string;
  /** ``U+200B`` style label. */
  codepoint: string;
  /** The Unicode name, e.g. ``ZERO WIDTH SPACE``. */
  name: string;
}

/** ``U+200B``-style label. */
const toCodepointLabel = (codepoint: number): string =>
  `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`;

/** Collect every invisible character in one string value. Only the matches are
 *  visited; the surrounding text is never inspected. */
function findingsInString(value: string, path: string): InvisibleCharFinding[] {
  const findings: InvisibleCharFinding[] = [];
  for (const match of value.matchAll(INVISIBLE_PATTERN)) {
    const codepoint = match[0].codePointAt(0);
    if (codepoint === undefined) continue;
    const name = nameOf(codepoint);
    if (name) findings.push({ path, codepoint: toCodepointLabel(codepoint), name });
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
  return walk(value, path, new Set());
}

/**
 * The recursion behind {@link findInvisibleChars}.
 *
 * ``ancestors`` holds the current PATH, not everything seen, so a node reached
 * twice without a cycle is still reported at each path it appears at. It is
 * one mutable set that is extended on the way down and restored on the way
 * back up: copying it per node would allocate one set per object in the
 * lesson, which for a pasted chapter is thousands of short-lived sets. The
 * ``finally`` keeps the set honest even if a callee throws.
 */
function walk(value: unknown, path: string, ancestors: Set<object>): InvisibleCharFinding[] {
  if (typeof value === "string") return findingsInString(value, path);
  if (typeof value !== "object" || value === null) return [];
  // A lesson from JSON.parse cannot be cyclic, but this API takes `unknown`,
  // so a hand-built object can be. Unguarded that is a stack overflow rather
  // than a diagnosis.
  if (ancestors.has(value)) return [];
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => walk(entry, `${path}/${index}`, ancestors));
    }
    // Object.entries, not for..in: only own enumerable keys, so nothing
    // inherited from a polluted prototype is ever walked.
    return Object.entries(value).flatMap(([key, entry]) =>
      walk(entry, `${path}/${key}`, ancestors),
    );
  } finally {
    ancestors.delete(value);
  }
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
  // Sort by numeric value, not by the label: once a codepoint needs five hex
  // digits, "U+10000" sorts before "U+FEFF" lexicographically and after it
  // numerically, and the numeric order is the one a reader expects.
  const kinds = [...byCodepoint]
    .sort(([left], [right]) => Number.parseInt(left.slice(2), 16) - Number.parseInt(right.slice(2), 16))
    .map(([codepoint, name]) => `${codepoint} ${name}`)
    .join(", ");
  const paths = [...new Set(findings.map((finding) => finding.path))];
  const shown = paths.slice(0, MAX_PATHS_LISTED).join(", ");
  const rest =
    paths.length > MAX_PATHS_LISTED ? `, and ${paths.length - MAX_PATHS_LISTED} more` : "";
  const plural = findings.length === 1 ? "occurrence" : "occurrences";
  return (
    `lesson text contains invisible characters (${kinds}): ` +
    `${findings.length} ${plural} at ${shown}${rest}. ` +
    "These usually arrive by pasting from a PDF or a web page; they are invisible when reading the file."
  );
}
