/**
 * The semantic rules and author lints of the format, without the structural
 * layer (engine#191).
 *
 * ``validateLesson`` / ``validateManifest`` (``validate.ts``) check the shape
 * with ajv against the bundled schema and then run exactly these functions.
 * This module imports neither ajv nor ``node:*``, so a browser consumer that
 * has already shape-checked its input can call the rules directly instead of
 * re-implementing them (the package subpath ``learn-content-engine/rules``):
 * ajv is most of ``validateLesson``'s bundle size, and the schema is read with
 * ``node:fs``, which a browser does not have. ``src/rules.test.ts`` keeps that
 * boundary, and the parity with ``validateLesson`` / ``validateManifest``.
 *
 * Layers here (the structural one lives in ``validate.ts``):
 *   2. SEMANTIC (errors) - cross-field rules the JSON-Schema cannot express
 *      (per-type required fields, cloze marker/blank count, multiselect
 *      disjointness, picture "exactly one correct", referential integrity).
 *   3. AUTHOR LINTS (warnings) - never block (``valid`` stays errors-only).
 */
import { KNOWN_CONTENT_DOMAINS, isKnownContentDomain, isKnownLevel } from "./content-domains.js";
import type { ExtensionRegistry } from "./extensions.js";
import {
  describeInvisibleChars,
  findInvisibleChars,
  invisibleCharKinds,
  type InvisibleCharFinding,
} from "./invisible-chars.js";
import {
  err,
  makeIssue,
  splitIssues,
  warn,
  type ValidationIssue,
  type ValidationParamValue,
  type ValidationResult,
} from "./issues.js";
import { lessonIdOrderingIssues } from "./set-ordering.js";
import { collectStableIds } from "./stable-ids.js";
import type { Exercise, Lesson, LessonStep } from "./types/lesson-schema.generated.js";
import { variableIssues } from "./variables.js";

// The quality minimums (engine#185) are a second question next to validity,
// asked of the same shape-checked lesson, so a browser consumer gets both here.
export { QUALITY_MINIMUMS, validateLessonQuality } from "./quality.js";

/** The schema's ``$defs/SlugId`` pattern (lesson ids, set ids, tags), kept
 *  here as a string so a consumer can check a slug without a schema
 *  validator. ``src/rules.test.ts`` pins it to the bundled schema. */
export const SLUG_ID_PATTERN = "^[\\p{Ll}\\p{Nd}]+(-[\\p{Ll}\\p{Nd}]+)*$";
/** The schema's ``$defs/SlugId`` ``maxLength``, in characters (Unicode code
 *  points, as JSON Schema counts them), not UTF-16 code units (engine#205). */
export const SLUG_ID_MAX_LENGTH = 120;
const SLUG_ID = new RegExp(SLUG_ID_PATTERN, "u");

/** Whether ``value`` is a slug id as the schema's ``$defs/SlugId`` defines it:
 *  lowercase Unicode letters and digits in hyphen-separated runs, 1 to
 *  ``SLUG_ID_MAX_LENGTH`` characters. Characters are code points, as the
 *  schema counts them: a letter outside the Basic Multilingual Plane is one
 *  character, although ``String.length`` counts it as two (engine#205).
 *  Anything that is not a string is not. */
export function isSlugId(value: unknown): boolean {
  return typeof value === "string" && [...value].length <= SLUG_ID_MAX_LENGTH && SLUG_ID.test(value);
}

/** Count non-overlapping ``___`` markers (matches Python ``str.count('___')``). */
const markerCount = (sentence: string): number => sentence.split("___").length - 1;

/** True when a cloze sentence still reads as a sentence once its blanks are
 *  removed: at least one letter or digit is left. A sentence of blanks,
 *  spaces and punctuation alone carries no context for the learner. */
const carriesClozeText = (sentence: string): boolean =>
  /[\p{L}\p{N}]/u.test(sentence.split("___").join(" "));

/** True when an array has a repeated value. */
const hasDuplicate = <T>(values: T[]): boolean => new Set(values).size !== values.length;

/** Text as an author reads it: Unicode NFC (a decomposed umlaut equals its
 *  precomposed form) with the surrounding whitespace dropped. Case is kept:
 *  a case difference is a different text. */
const readableText = (text: string): string => text.normalize("NFC").trim();

// W-HINT-LENGTH (engine#186): a count directly before a length noun. The
// boundaries are Unicode-aware (JavaScript's \b is ASCII only), so word parts
// stay silent: "Achte" is not "acht", "bestimmten" not "ten", "Fragezeichen"
// and "Leerzeichen" not "Zeichen", "characteristic" not "character".
const NOT_WORD_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;
/** Numbers from two on: digits and number words up to twelve. */
const PLURAL_COUNT = String.raw`\d+|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|neun|zehn|elf|zw(?:ö|oe)lf|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve`;
/** Answer length one: the article forms ("mit einem Buchstaben"), "one" and
 *  the single-character adjectives ("ein einzelnes Zeichen", "a single
 *  character"). */
const SINGULAR_COUNT = String.raw`ein(?:e[nmrs]?)?|one|einzeln\p{L}*|single`;
const LENGTH_NOUN = String.raw`buchstaben?|zeichen|letters?|characters?`;
const ANSWER_LENGTH = new RegExp(
  [
    // "vier Buchstaben", "a five-letter word", "ein einzelnes Zeichen"
    `${NOT_WORD_BEFORE}(?:${PLURAL_COUNT}|${SINGULAR_COUNT})[-\\s]+(?:${LENGTH_NOUN})${NOT_WORD_AFTER}`,
    // "Anzahl der Buchstaben: vier", "Länge in Zeichen: 5"; the reversed form
    // takes plural counts only, so "das Zeichen: ein Kreis" stays silent
    `${NOT_WORD_BEFORE}(?:${LENGTH_NOUN})\\s*:\\s*(?:${PLURAL_COUNT})${NOT_WORD_AFTER}`,
    // "fünfbuchstabig", "dreibuchstabige"
    String.raw`\p{L}*buchstabig`,
  ].join("|"),
  "iu",
);

/** True when a hint reveals the answer length: a count directly before a
 *  length noun ("vier Buchstaben", "4 letters", "a five-letter word", "ein
 *  einzelnes Zeichen"), the reversed form with a colon ("Buchstaben: 4"), or
 *  a "-buchstabig" adjective. Compounds and word parts do not count. */
const mentionsAnswerLength = (hint: string): boolean => ANSWER_LENGTH.test(hint);

function checkMatching(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (exercise.from_cards) {
    if (!exercise.card_ids || exercise.card_ids.length === 0) {
      issues.push(err("E-MATCH-FROMCARDS-CARDS", path, "MATCHING with 'from_cards' requires non-empty 'card_ids'", "matching"));
    }
    if (exercise.pairs && exercise.pairs.length > 0) {
      issues.push(err("E-MATCH-FROMCARDS-PAIRS", path, "MATCHING with 'from_cards' must not also list explicit 'pairs'", "matching"));
    }
    return;
  }
  const pairs = exercise.pairs;
  if (!pairs || pairs.length === 0) {
    issues.push(err("E-MATCH-PAIRS", path, "MATCHING exercise requires non-empty 'pairs'", "matching"));
    return;
  }
  // E-MATCH-DUP-LEFT: each left term must be unique within the exercise
  // (case-insensitive, whitespace-trimmed). A repeated left maps to two
  // different rights, which is objectively unsolvable for the learner. The
  // content fix is the author's - there is no safe automatic rename. Origin:
  // alc-die-waehrung-des-geistes#27 (three independent occurrences).
  const leftGroups = new Map<string, { term: string; positions: number[] }>();
  pairs.forEach((pair, index) => {
    const key = pair.left.trim().toLowerCase();
    const group = leftGroups.get(key);
    if (group) group.positions.push(index + 1);
    else leftGroups.set(key, { term: pair.left, positions: [index + 1] });
  });
  for (const { term, positions } of leftGroups.values()) {
    if (positions.length > 1) {
      issues.push(
        err(
          "E-MATCH-DUP-LEFT",
          path,
          `MATCHING left value '${term}' is repeated at positions ${positions.join(", ")}; each left term must be unique (case-insensitive) so the pairing is solvable`,
          "matching",
          { term, positions },
        ),
      );
    }
  }
  // A duplicate 'right' is ambiguous but not necessarily unsolvable, so it stays
  // a warning; 'left' duplicates are the hard E-MATCH-DUP-LEFT above.
  if (hasDuplicate(pairs.map((pair) => pair.right))) {
    issues.push(
      warn("W-MATCH-AMBIG", path, "MATCHING has duplicate 'right' values (ambiguous pairing)", "matching"),
    );
  }
}

function checkPictureChoice(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const images = exercise.images;
  if (!images || images.length < 2) {
    issues.push(err("E-PIC-MIN", path, "PICTURE_CHOICE requires at least 2 'images'", "picture_choice"));
    return;
  }
  const correct = images.filter((image) => image.is_correct === "true");
  if (correct.length !== 1) {
    issues.push(
      err("E-PIC-ONE-CORRECT", path, "PICTURE_CHOICE must have exactly one image marked 'is_correct': 'true'", "picture_choice"),
    );
  }
  const correctLabels = new Set(correct.map((image) => image.label));
  if (images.some((image) => image.is_correct !== "true" && correctLabels.has(image.label))) {
    issues.push(
      warn("W-PIC-DUP-LABEL", path, "PICTURE_CHOICE distractor shares a 'label' with the correct image", "picture_choice"),
    );
  }
  if (images.some((image) => image.src.startsWith("data:"))) {
    issues.push(
      warn(
        "W-PIC-DATA-URI",
        path,
        "PICTURE_CHOICE image uses an inline data URI; repo content should prefer a relative assets/ path (data URIs bloat the lesson JSON and the git history)",
        "picture_choice",
      ),
    );
  }
}

function checkFreeText(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.accept || exercise.accept.length === 0) {
    issues.push(err("E-FREETEXT-ACCEPT", path, "FREE_TEXT exercise requires non-empty 'accept'", "free_text"));
  }
}

function checkWordTiles(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const tiles = exercise.tiles;
  if (!tiles || tiles.length < 2) {
    issues.push(err("E-TILES-MIN", path, "WORD_TILES requires at least 2 'tiles'", "word_tiles"));
    return;
  }
  if (hasDuplicate(tiles) && !exercise.accept_orderings) {
    issues.push(
      warn(
        "W-TILES-DUP",
        path,
        "WORD_TILES has duplicate tiles but no 'accept_orderings' - consumers that grade word tiles by tile index may grade a string-identical answer as wrong; consumers grading the token sequence need no annotation",
        "word_tiles",
      ),
    );
  }
  if (!exercise.accept_orderings) return;
  const expected = tiles.map((_tile, index) => index);
  exercise.accept_orderings.forEach((ordering, orderingIndex) => {
    const sorted = [...ordering].sort((a, b) => a - b);
    const isPermutation = sorted.length === expected.length && sorted.every((value, index) => value === expected[index]);
    if (!isPermutation) {
      issues.push(
        err(
          "E-TILES-ORDERING",
          `${path}/accept_orderings/${orderingIndex}`,
          `accept_orderings entry ${JSON.stringify(ordering)} must be a permutation of [0..${tiles.length - 1}]`,
          "word_tiles",
          { ordering: [...ordering], maxIndex: tiles.length - 1 },
        ),
      );
    }
  });
}

function checkClozeMultiselect(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (!exercise.sentence) {
    issues.push(err("E-CLOZE-MS-SENTENCE", path, "CLOZE multiselect requires a non-empty 'sentence' (the question)", "cloze"));
  }
  const accept = exercise.accept ?? [];
  if (accept.length === 0) {
    issues.push(err("E-CLOZE-MS-ACCEPT", path, "CLOZE multiselect requires non-empty 'accept' (the correct options)", "cloze"));
  }
  const distractors = exercise.distractors ?? [];
  if (distractors.length === 0) {
    issues.push(err("E-CLOZE-MS-DISTRACTORS", path, "CLOZE multiselect requires non-empty 'distractors'", "cloze"));
  }
  const overlap = accept.filter((option) => distractors.includes(option));
  if (overlap.length > 0) {
    issues.push(
      err(
        "E-CLOZE-MS-DISJOINT",
        path,
        `CLOZE multiselect 'accept' and 'distractors' must be disjoint; shared option(s): ${JSON.stringify(overlap)}`,
        "cloze",
        { shared: overlap },
      ),
    );
  }
}

function checkCloze(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (exercise.cloze_mode === "multiselect") {
    checkClozeMultiselect(exercise, path, issues);
    return;
  }
  const sentence = exercise.sentence;
  if (!sentence) {
    issues.push(err("E-CLOZE-SENTENCE", path, "CLOZE exercise requires non-empty 'sentence'", "cloze"));
    return;
  }
  const blanks = exercise.blanks;
  if (!blanks || blanks.length === 0) {
    issues.push(err("E-CLOZE-BLANKS", path, "CLOZE exercise requires non-empty 'blanks'", "cloze"));
    return;
  }
  const markers = markerCount(sentence);
  if (markers !== blanks.length) {
    issues.push(
      err(
        "E-CLOZE-MARKERS",
        path,
        `CLOZE marker count mismatch: sentence has ${markers} '___' markers but blanks has ${blanks.length} entries`,
        "cloze",
        { markers, blanks: blanks.length },
      ),
    );
  }
  if (!carriesClozeText(sentence)) {
    // A gap text without text is not a gap text. The learner reads the
    // question in the prompt and fills a blank that teaches nothing, and the
    // native type says the same thing directly - which is why this is a
    // warning and not a style note: the shape predates `multiple_choice`
    // (schema 1.6) and keeps being produced.
    const nativeType = exercise.cloze_mode === "select" ? "multiple_choice" : "free_text";
    issues.push(
      warn(
        "W-CLOZE-NO-CARRIER",
        `${path}/sentence`,
        `the sentence carries nothing but its blanks, so the exercise is a question with an answer, not a gap text; the native '${nativeType}' type expresses it directly and a consumer renders it as such (a cloze renders a gap for the learner to read around)`,
        "cloze",
        { nativeType },
      ),
    );
  }
  if (exercise.cloze_mode === "select") {
    if (!exercise.distractors || exercise.distractors.length === 0) {
      issues.push(err("E-CLOZE-SELECT-DISTRACTORS", path, "CLOZE with cloze_mode='select' requires non-empty 'distractors'", "cloze"));
      return;
    }
    const accepted = new Set(blanks.flatMap((blank) => blank.accept));
    if (exercise.distractors.some((distractor) => accepted.has(distractor))) {
      issues.push(
        warn("W-DISTRACTOR-ANSWER", path, "CLOZE select has a distractor equal to an accepted answer", "cloze"),
      );
    }
  }
}

function checkMultipleChoice(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const options = exercise.options;
  if (!options || options.length < 2) {
    issues.push(err("E-MC-OPTIONS", path, "MULTIPLE_CHOICE requires at least 2 'options'", "multiple_choice"));
    return;
  }
  const correctCount = options.filter((option) => option.correct === true).length;
  if (exercise.multiple === true) {
    if (correctCount === 0) {
      issues.push(
        err("E-MC-MIN-CORRECT", path, "MULTIPLE_CHOICE with 'multiple' requires at least one option marked 'correct'", "multiple_choice"),
      );
    }
  } else if (correctCount !== 1) {
    issues.push(
      err("E-MC-ONE-CORRECT", path, "MULTIPLE_CHOICE (single) must have exactly one option marked 'correct'", "multiple_choice"),
    );
  }
  if (hasDuplicate(options.map((option) => option.text))) {
    issues.push(
      err("E-MC-DUP-OPTION", path, "MULTIPLE_CHOICE option texts must be unique (the text IS the option)", "multiple_choice"),
    );
  }
}

const EXERCISE_CHECKS: Record<string, (exercise: Exercise, path: string, issues: ValidationIssue[]) => void> = {
  matching: checkMatching,
  picture_choice: checkPictureChoice,
  free_text: checkFreeText,
  word_tiles: checkWordTiles,
  cloze: checkCloze,
  multiple_choice: checkMultipleChoice,
};

/** Registered-extension lookup context threaded through the semantic pass. */
interface ExtContext {
  /** ext type -> required major, parsed from the lesson's ``requires_extensions``. */
  required: Map<string, number>;
  registry: ExtensionRegistry;
}

/** An ``ext:`` extension type carries no core check; it is validated by a
 *  registered extension after the declaration + registration contract holds. */
const isExtType = (type: string): boolean => type.startsWith("ext:");

/** Parse ``requires_extensions`` entries (``ext:<vendor>-<name>@<major>``) into
 *  a type -> major map. Malformed entries are ignored (ajv already rejected
 *  them structurally). */
function requiredExtensions(lesson: Lesson): Map<string, number> {
  const required = new Map<string, number>();
  for (const entry of lesson.requires_extensions ?? []) {
    const at = entry.lastIndexOf("@");
    if (at === -1) continue;
    const major = Number(entry.slice(at + 1));
    if (Number.isInteger(major)) required.set(entry.slice(0, at), major);
  }
  return required;
}

/** Enforce the extension contract for one ``ext:`` exercise: declared in
 *  ``requires_extensions`` (else E-EXT-UNDECLARED), registered at the pinned
 *  major (else E-EXT-UNSUPPORTED), then delegate to the extension's validator. */
function checkExtExercise(exercise: Exercise, path: string, ext: ExtContext, issues: ValidationIssue[]): void {
  const type = exercise.type;
  const requiredMajor = ext.required.get(type);
  if (requiredMajor === undefined) {
    issues.push(
      err("E-EXT-UNDECLARED", path, `exercise uses extension type '${type}' but the lesson does not declare it in 'requires_extensions'`, "extensions", { type }),
    );
    return;
  }
  const extension = ext.registry.find((candidate) => candidate.type === type && candidate.major === requiredMajor);
  if (!extension) {
    issues.push(
      err("E-EXT-UNSUPPORTED", path, `no registered extension for '${type}@${requiredMajor}'; the consumer cannot render this lesson`, "extensions", { type, major: requiredMajor }),
    );
    return;
  }
  issues.push(...extension.validate(exercise));
}

const HINT_LENGTH_MESSAGE =
  "hint reveals the answer length - redundant on consumers that display the answer length automatically, revealing on the rest";

/** W-HINT-LENGTH on the exercise hint and on every blank's hint, each at its
 *  own path. A card's hint is not checked: a character count there can be
 *  teaching content ("s[0:3] liefert 3 Zeichen"). */
function checkHintLengths(exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  if (exercise.hint && mentionsAnswerLength(exercise.hint)) {
    issues.push(warn("W-HINT-LENGTH", path, HINT_LENGTH_MESSAGE, "rule-catalog"));
  }
  (exercise.blanks ?? []).forEach((blank, index) => {
    if (blank.hint && mentionsAnswerLength(blank.hint)) {
      issues.push(warn("W-HINT-LENGTH", `${path}/blanks/${index}`, HINT_LENGTH_MESSAGE, "rule-catalog"));
    }
  });
}

function checkExercise(
  exercise: Exercise,
  path: string,
  knownCardIds: Set<string>,
  ext: ExtContext,
  issues: ValidationIssue[],
): void {
  (exercise.card_ids ?? []).forEach((cardId, cardIndex) => {
    if (!knownCardIds.has(cardId)) {
      issues.push(err("E-CARD-REF", `${path}/card_ids/${cardIndex}`, `exercise references unknown card '${cardId}'`, "cards", { cardId }));
    }
  });
  checkHintLengths(exercise, path, issues);
  for (const issue of variableIssues(exercise, path)) {
    issues.push(makeIssue(issue.severity, issue.id, issue.path, issue.message, "variables-parametric-exercises", issue.params));
  }
  if (isExtType(exercise.type)) {
    checkExtExercise(exercise, path, ext, issues);
    return;
  }
  const check = EXERCISE_CHECKS[exercise.type];
  if (check) check(exercise, path, issues);
}

function checkStep(step: LessonStep, path: string, knownCardIds: Set<string>, ext: ExtContext, issues: ValidationIssue[]): void {
  if (step.type === "theory") {
    if (!step.body) issues.push(err("E-STEP-THEORY-BODY", path, "THEORY step requires non-empty 'body'", "steps"));
    if (step.exercise != null) issues.push(err("E-STEP-THEORY-EXERCISE", path, "THEORY step must not carry 'exercise'", "steps"));
    return;
  }
  // EXERCISE step
  if (step.exercise == null) {
    issues.push(err("E-STEP-EXERCISE-PAYLOAD", path, "EXERCISE step requires an 'exercise' payload", "steps"));
  } else {
    checkExercise(step.exercise, `${path}/exercise`, knownCardIds, ext, issues);
    checkPromptDuplication(step, step.exercise, `${path}/exercise/prompt`, issues);
  }
  if (step.body != null) {
    issues.push(err("E-STEP-EXERCISE-BODY", path, "EXERCISE step must not carry 'body' (use the exercise prompt instead)", "steps"));
  }
}

/** W-PROMPT-DUP (engine#169): the prompt must not repeat the exercise's
 *  ``sentence`` (the cloze sentence, or the question stem in multiselect
 *  mode) nor the step's ``title``. Consumers render the prompt as the
 *  heading and the sentence as the question box (the title in the step
 *  list), so an equal text is read twice on screen. The pattern arises
 *  naturally while authoring (the question typed once as the prompt, once
 *  as the sentence), hence a rule instead of a one-off correction. One
 *  warning per matching comparison, each naming the field and its fix;
 *  compared after NFC + trim, never blocks. */
function checkPromptDuplication(step: LessonStep, exercise: Exercise, path: string, issues: ValidationIssue[]): void {
  const prompt = readableText(exercise.prompt);
  if (prompt === "") return;
  if (typeof exercise.sentence === "string" && readableText(exercise.sentence) === prompt) {
    issues.push(
      warn(
        "W-PROMPT-DUP",
        path,
        "prompt equals the exercise 'sentence' (compared after trimming and Unicode NFC normalisation); consumers show the prompt as the heading and the sentence as the question, so the learner reads the same text twice - phrase the prompt as the instruction and keep the question in 'sentence'",
        "rule-catalog",
        { field: "sentence" },
      ),
    );
  }
  if (typeof step.title === "string" && readableText(step.title) === prompt) {
    issues.push(
      warn(
        "W-PROMPT-DUP",
        path,
        "prompt equals the step 'title' (compared after trimming and Unicode NFC normalisation); consumers show the title in the step list or header and the prompt as the heading, so the learner reads the same text twice - shorten the title to a heading or phrase the prompt as the concrete task",
        "rule-catalog",
        { field: "title" },
      ),
    );
  }
}

/**
 * Ids of cards no exercise's `card_ids` references - the detection core of the
 * W-CARD-UNUSED lint, shared with the suggest-wiring CLI (#20). Returns ids in
 * card-definition order; a lesson without cards yields an empty list.
 */
export function unusedCardIds(lesson: Lesson): string[] {
  const used = new Set<string>();
  for (const step of lesson.steps) {
    for (const cardId of step.exercise?.card_ids ?? []) used.add(cardId);
  }
  return (lesson.cards ?? []).map((card) => card.id).filter((cardId) => !used.has(cardId));
}

/** Warn about cards that no exercise ever drills (dead learning material).
 *  Aggregated to ONE warning per lesson listing every unused id: a card-rich
 *  set (cards as a broad knowledge base, exercises a curated subset) is a
 *  common, valid shape, so a line per orphan card would bury the rare real
 *  author mistake under noise (alert fatigue). The suggest-wiring CLI keeps
 *  consuming the per-id `unusedCardIds` list for its proposals. */
function checkUnusedCards(lesson: Lesson, issues: ValidationIssue[]): void {
  const unused = unusedCardIds(lesson);
  if (unused.length === 0) return;
  const noun = unused.length === 1 ? "card is" : "cards are";
  issues.push(
    warn(
      "W-CARD-UNUSED",
      "/cards",
      `${unused.length} ${noun} defined but never referenced by an exercise: ${unused.join(", ")}`,
      "cards",
      { count: unused.length, cardIds: unused },
    ),
  );
}

/** The values of W-INVISIBLE-CHAR, from the same findings the message is
 *  built from: every distinct codepoint with its name (numeric order), the
 *  occurrence count and every distinct path (the message lists five). */
function invisibleCharParams(findings: readonly InvisibleCharFinding[]): Record<string, ValidationParamValue> {
  const sorted = invisibleCharKinds(findings);
  return {
    codepoints: sorted.map(([codepoint]) => codepoint),
    names: sorted.map(([, name]) => name),
    occurrences: findings.length,
    paths: [...new Set(findings.map((finding) => finding.path))],
  };
}

/** Warn about invisible Unicode characters anywhere in the lesson's text
 *  (#75). Aggregated to ONE warning per lesson listing every distinct
 *  codepoint and where it sits: pasted text can carry dozens, and a warning
 *  per occurrence is the alert fatigue W-CARD-UNUSED was aggregated away from
 *  (#49). Never an error - the content is structurally valid, it just carries
 *  characters the author cannot see. */
function checkInvisibleChars(lesson: Lesson, issues: ValidationIssue[]): void {
  const findings = findInvisibleChars(lesson);
  const description = describeInvisibleChars(findings);
  if (description) issues.push(warn("W-INVISIBLE-CHAR", "", description, "author-lints", invisibleCharParams(findings)));
}

/** Semantic + lint pass. Assumes the input is already structurally valid (so the
 *  schema-typed shape is trustworthy). Returns a mixed error/warning list. */
function semanticIssues(lesson: Lesson, registry: ExtensionRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownCardIds = new Set<string>((lesson.cards ?? []).map((card) => card.id));
  const ext: ExtContext = { required: requiredExtensions(lesson), registry };
  lesson.steps.forEach((step, index) => {
    checkStep(step, `/steps/${index}`, knownCardIds, ext, issues);
  });
  checkUnusedCards(lesson, issues);
  checkInvisibleChars(lesson, issues);
  checkStableIdDuplicates(lesson, issues);
  checkElementIdDuplicates(lesson, issues);
  // engine#183: a lesson's own domain (absent or null inherits the set's).
  issues.push(...unknownDomainIssues(typeof lesson.domain === "string" ? lesson.domain : undefined, "/domain"));
  return issues;
}

/** Each id that occurs more than once among ``entries`` (id, 1-based
 *  position), with all its positions, in the order of its first occurrence. */
function duplicatePositions(entries: Array<[string, number]>): Array<{ id: string; positions: number[] }> {
  const positionsById = new Map<string, number[]>();
  for (const [id, position] of entries) {
    const positions = positionsById.get(id);
    if (positions) positions.push(position);
    else positionsById.set(id, [position]);
  }
  return [...positionsById]
    .filter(([, positions]) => positions.length > 1)
    .map(([id, positions]) => ({ id, positions }));
}

/** E-CARD-ID-DUP / E-STEP-ID-DUP / E-EXERCISE-ID-DUP (engine#202): card, step
 *  and exercise ids are each unique within the lesson, as the schema's
 *  descriptions say. Three namespaces, not one: a step and its exercise
 *  sharing an id is the norm in real content. One error per duplicated id,
 *  naming every position; an exercise's position is its step's. Exact string
 *  comparison: the slug pattern already rejects case and NFD variants. */
function checkElementIdDuplicates(lesson: Lesson, issues: ValidationIssue[]): void {
  const cards = (lesson.cards ?? []).map((card, index): [string, number] => [card.id, index + 1]);
  for (const { id, positions } of duplicatePositions(cards)) {
    issues.push(
      err("E-CARD-ID-DUP", "/cards", `card id '${id}' is used at positions ${positions.join(", ")}; card ids must be unique within the lesson`, "cards", {
        cardId: id,
        positions,
      }),
    );
  }
  const steps = lesson.steps.map((step, index): [string, number] => [step.id, index + 1]);
  for (const { id, positions } of duplicatePositions(steps)) {
    issues.push(
      err("E-STEP-ID-DUP", "/steps", `step id '${id}' is used at positions ${positions.join(", ")}; step ids must be unique within the lesson`, "steps", {
        stepId: id,
        positions,
      }),
    );
  }
  const exercises = lesson.steps.flatMap((step, index): Array<[string, number]> =>
    step.exercise ? [[step.exercise.id, index + 1]] : [],
  );
  for (const { id, positions } of duplicatePositions(exercises)) {
    issues.push(
      err(
        "E-EXERCISE-ID-DUP",
        "/steps",
        `exercise id '${id}' is used by the exercises of the steps at positions ${positions.join(", ")}; exercise ids must be unique within the lesson`,
        "exercises",
        { exerciseId: id, positions },
      ),
    );
  }
}

/** E-STABLE-ID-DUP: a stable_id must be unique across the exercises and
 *  cards of this lesson (one shared namespace). The set-wide half of the
 *  engine#90 uniqueness promise lives in the repo gate via
 *  {@link collectStableIds}; the schema and this rule can only see one
 *  document. */
function checkStableIdDuplicates(lesson: Lesson, issues: ValidationIssue[]): void {
  for (const duplicate of collectStableIds([lesson]).duplicates) {
    const where = duplicate.locations
      .map((location) => `${location.kind} '${location.elementId}'`)
      .join(", ");
    issues.push(
      err(
        "E-STABLE-ID-DUP",
        "/",
        `stable_id '${duplicate.stableId}' is used more than once in this lesson (${where}); a stable_id identifies exactly one element`,
        "rule-catalog",
        {
          stableId: duplicate.stableId,
          elementKinds: duplicate.locations.map((location) => location.kind),
          elementIds: duplicate.locations.map((location) => location.elementId),
        },
      ),
    );
  }
}


/**
 * The semantic rules and author lints of a lesson, for input that already
 * has the schema's shape (checked by ``validateLesson`` or by the consumer's
 * own shape check). Returns ``{ valid, errors, warnings }`` exactly as
 * ``validateLesson`` does for a structurally valid lesson; does not throw on
 * such input. ``options.extensions`` registers ``ext:`` exercise types, as
 * for ``validateLesson``.
 */
export function validateLessonRules(
  lesson: Lesson,
  options: { extensions?: ExtensionRegistry } = {},
): ValidationResult {
  return splitIssues(semanticIssues(lesson, options.extensions ?? []));
}

/** Drop the legacy ``language`` alias into ``target_language`` on each set
 *  BEFORE schema validation (the pre-v1.2 alias rule, see
 *  ``docs/concepts.md``), so a legacy manifest validates instead of tripping
 *  the strict ``additionalProperties`` / missing-``target_language`` rules. */
export function normalizeManifestAliases(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const manifest = input as { sets?: unknown };
  if (!Array.isArray(manifest.sets)) return input;
  const sets = manifest.sets.map((rawSet) => {
    if (typeof rawSet !== "object" || rawSet === null) return rawSet;
    const set = rawSet as Record<string, unknown>;
    if (!("language" in set)) return set;
    const { language, ...rest } = set;
    if ("target_language" in rest) return rest;
    return { ...rest, target_language: language };
  });
  return { ...manifest, sets };
}


/**
 * The semantic rules and author lints of a manifest, for input that already
 * has the schema's shape. The legacy ``language`` alias is normalized first,
 * as ``validateManifest`` does. Returns ``{ valid, errors, warnings }``
 * exactly as ``validateManifest`` does for a structurally valid manifest.
 */
export function validateManifestRules(input: unknown): ValidationResult {
  const normalized = normalizeManifestAliases(input);
  // 'metadata.retired_ids' (deliberate retirement, engine#90 stability gate)
  // was locked behind E-RETIRED-IDS-LOCKED until the app-side consequence of
  // retiring an id was decided AND shipped; both happened (archive, not
  // delete or orphan - adaptive-learner#2188, PR #2458), so the lock was
  // removed deliberately (engine#131). Entries match the exercise/card
  // identity (stable_id, author-slug fallback); add-only for existing
  // entries and the retired-yet-alive contradiction are the stability
  // core's checks (V5/V6) - only IT sees the lesson inventory. This
  // validator keeps what a single manifest can prove: the list's shape.
  const manifestMetadata = (normalized as { metadata?: Record<string, unknown> }).metadata;
  if (manifestMetadata && "retired_ids" in manifestMetadata) {
    const retiredIds = manifestMetadata["retired_ids"];
    const isStringList =
      Array.isArray(retiredIds) && retiredIds.every((entry) => typeof entry === "string");
    if (!isStringList) {
      return {
        valid: false,
        errors: [
          err(
            "E-RETIRED-IDS-TYPE",
            "/metadata/retired_ids",
            "'retired_ids' must be a list of strings (each entry the stable_id - author slug for pre-stable_id elements - of a retired exercise or card)",
            "stable-identity-stable_id",
          ),
        ],
        warnings: [],
      };
    }
  }
  const evaluationIssues = checkSetEvaluations(normalized);
  const evaluationErrors = evaluationIssues.filter((issue) => issue.severity === "error");
  return {
    valid: evaluationErrors.length === 0,
    errors: evaluationErrors,
    warnings: [
      ...evaluationIssues.filter((issue) => issue.severity === "warning"),
      ...checkManifestLessonOrdering(manifestMetadata),
      ...checkManifestDomainVocabulary(normalized),
      ...checkRetiredIdsDuplicates(manifestMetadata),
    ],
  };
}


/**
 * engine#171: the parts of a set's ``evaluation`` block the JSON Schema
 * cannot state. Two of them are "this scheme needs that field" (JSON Schema
 * could express them with if/then, at the price of an error message naming
 * a branch instead of the missing field); the third is a grade table that
 * maps one score to two grades, which no schema keyword covers. The fourth
 * is the only warning here: a table with no row at 0 leaves the runs below
 * its lowest row without a grade, which a consumer can only paper over with
 * a fallback label of its own - the opposite of what the block is for. It
 * stays a warning because "below 50 there is no grade" is a defensible
 * authoring choice, unlike the ambiguity the DUP rule catches.
 */
function checkSetEvaluations(manifest: unknown): ValidationIssue[] {
  const sets = (manifest as { sets?: unknown }).sets;
  if (!Array.isArray(sets)) return [];
  const issues: ValidationIssue[] = [];
  sets.forEach((rawSet, index) => {
    const evaluation = (rawSet as { evaluation?: unknown } | null)?.evaluation;
    if (typeof evaluation !== "object" || evaluation === null) return;
    const { scheme, grades, pass_percent: passPercent } = evaluation as {
      scheme?: unknown;
      grades?: unknown;
      pass_percent?: unknown;
    };
    const path = `/sets/${index}/evaluation`;
    if (scheme === "grades" && !Array.isArray(grades)) {
      issues.push(
        err("E-EVAL-GRADES-MISSING", path, "evaluation scheme 'grades' requires a 'grades' table", "evaluation"),
      );
    }
    if (scheme === "pass_fail" && typeof passPercent !== "number") {
      issues.push(
        err("E-EVAL-PASS-MISSING", path, "evaluation scheme 'pass_fail' requires 'pass_percent'", "evaluation"),
      );
    }
    if (Array.isArray(grades)) {
      const thresholds = grades
        .map((row) => (row as { min_percent?: unknown } | null)?.min_percent)
        .filter((value): value is number => typeof value === "number");
      if (hasDuplicate(thresholds)) {
        issues.push(
          err(
            "E-EVAL-GRADES-DUP",
            `${path}/grades`,
            "two grade rows share a 'min_percent'; one score would earn two grades, so the table must use a distinct threshold per row",
            "evaluation",
          ),
        );
      }
      const floor = thresholds.length > 0 ? Math.min(...thresholds) : 0;
      if (floor > 0) {
        issues.push(
          warn(
            "W-EVAL-GRADES-NO-FLOOR",
            `${path}/grades`,
            `the lowest grade row starts at ${floor} percent, so a run below it earns no grade and the consumer has to invent a label the author never wrote; add a row at 0 unless "no grade down here" is the intent`,
            "evaluation",
            { floor },
          ),
        );
      }
    }
  });
  return issues;
}

/** engine#131: author lint on the retirement list. Duplicates never block -
 *  the retirement itself still works - but they are author noise that hides
 *  a real edit (usually a copy-paste of the previous entry). */
function checkRetiredIdsDuplicates(
  manifestMetadata: Record<string, unknown> | undefined,
): ValidationIssue[] {
  const retiredIds = manifestMetadata?.["retired_ids"];
  if (!Array.isArray(retiredIds)) return [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const entry of retiredIds) {
    if (typeof entry !== "string") continue;
    if (seenIds.has(entry)) duplicateIds.add(entry);
    seenIds.add(entry);
  }
  if (duplicateIds.size === 0) return [];
  return [
    warn(
      "W-RETIRED-IDS-DUP",
      "/metadata/retired_ids",
      `retired_ids lists ${[...duplicateIds].map((entry) => `'${entry}'`).join(", ")} more than once; a retirement is declared once - the duplicate usually hides a mis-edited entry`,
      "stable-identity-stable_id",
      { retiredIds: [...duplicateIds] },
    ),
  ];
}

/** W-DOMAIN-UNKNOWN for one ``domain`` value at ``path``: none when the
 *  value is absent, empty or known (case-insensitive). Shared by the set
 *  entry (manifest) and the lesson (engine#183), so both say the same. */
function unknownDomainIssues(domain: string | undefined, path: string): ValidationIssue[] {
  if (domain === undefined || isKnownContentDomain(domain)) return [];
  return [
    warn(
      "W-DOMAIN-UNKNOWN",
      path,
      `domain '${domain}' is outside the known vocabulary (${KNOWN_CONTENT_DOMAINS.join(", ")}); it stays valid ('other' contract), but consumers cannot group it with existing subjects - prefer a known domain or accept the fragmentation deliberately`,
      "content-domains",
      { domain },
    ),
  ];
}

/** engine#127: the "known values + other" vocabulary lints. Both are
 *  warnings - unknown values stay VALID (additive contract, no break to
 *  published content), but silent fragmentation of the subject facet
 *  (nine live domain values, two overlapping pairs) and free-text level
 *  junk (``a0``, ``einsteiger``, ``reflexion``) get flagged at authoring
 *  time. Vocabulary source: ``content-domains.ts``. */
function checkManifestDomainVocabulary(normalized: unknown): ValidationIssue[] {
  const manifestSets = (normalized as { sets?: unknown }).sets;
  if (!Array.isArray(manifestSets)) return [];
  const issues: ValidationIssue[] = [];
  manifestSets.forEach((rawSet, setIndex) => {
    if (typeof rawSet !== "object" || rawSet === null) return;
    const setEntry = rawSet as { domain?: unknown; level?: unknown };
    const domain = typeof setEntry.domain === "string" ? setEntry.domain : undefined;
    issues.push(...unknownDomainIssues(domain, `/sets/${setIndex}/domain`));
    if (typeof setEntry.level === "string" && !isKnownLevel(domain, setEntry.level)) {
      issues.push(
        warn(
          "W-LEVEL-UNKNOWN",
          `/sets/${setIndex}/level`,
          `level '${setEntry.level}' is neither a CEFR band (A1..C2) nor, for a non-language set, the explicit 'none' sentinel; a level facet would offer it as a category`,
          "content-domains",
          { level: setEntry.level },
        ),
      );
    }
  });
  return issues;
}

/** engine#110: the ordering gate's carrier. A per-set manifest lists its
 *  lesson files in ``metadata.lessons`` (download discovery); those file
 *  names minus ``.json`` ARE the lesson ids whose lexicographic sort is the
 *  display order (engine#106). Running ``lessonIdOrderingIssues`` here means
 *  every repo gate that already calls ``validateManifest`` carries the check
 *  after a pure engine pin bump - no per-repo script change. Warning tier,
 *  never blocks. */
function checkManifestLessonOrdering(
  manifestMetadata: Record<string, unknown> | undefined,
): ValidationIssue[] {
  const listedLessons = manifestMetadata?.lessons;
  if (!Array.isArray(listedLessons)) return [];
  const lessonIds = listedLessons
    .filter((entry): entry is string => typeof entry === "string")
    .map((fileName) => fileName.replace(/\.json$/, ""));
  return lessonIdOrderingIssues(lessonIds).map((issue) => ({
    ...issue,
    path: "/metadata/lessons",
  }));
}
