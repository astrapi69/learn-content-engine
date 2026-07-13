/**
 * Example extension ``ext:ref-reading-comprehension`` - a shared passage
 * (stimulus) bound to N sub-questions. This is the shape the flat core schema
 * cannot express (``LessonStep.exercise`` is singular; there is no
 * passage-with-questions grouping), so instead of a core-schema change it is
 * modelled as a SINGLE ext exercise whose ``ext_payload`` carries the passage
 * plus the questions (adaptive-learner#1579, engine#43 - decided as an
 * extension, not a core type, to avoid the full core ripple).
 *
 * Sub-questions reuse the core question SHAPES (``multiple_choice`` /
 * ``free_text``) inside the opaque payload. A consumer renders each with its
 * existing renderer; here the consumer half is a framework-agnostic
 * text renderer + grader.
 *
 * Note on stability: the payload is a first cut. Open sub-decisions (which
 * sub-question types beyond MC/free_text, one passage vs many, weighted vs
 * count scoring) are exactly why this is an extension - the ``@major`` pin
 * lets the payload evolve without migrating core content. Excluded from the
 * published build (tsconfig.build); a production adoption uses its own vendor.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-reading-comprehension";

/** One answer option of a ``multiple_choice`` sub-question. */
interface QuestionOption {
  text: string;
  correct?: boolean;
}

/** One sub-question: a prompt plus a core question shape. */
interface SubQuestion {
  prompt: string;
  type: string;
  options?: QuestionOption[];
  accept?: string[];
}

/** The ``ext_payload`` shape ``ext:ref-reading-comprehension`` expects. */
interface ReadingComprehensionPayload {
  passage: string;
  questions: SubQuestion[];
}

const KNOWN_QUESTION_TYPES = new Set(["multiple_choice", "free_text"]);

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** True when ``value`` is a structurally-shaped sub-question (finer semantic
 *  rules are checked in ``validate``). */
function isSubQuestionShape(value: unknown): value is SubQuestion {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.prompt !== "string" || typeof candidate.type !== "string") return false;
  if (candidate.options !== undefined && !Array.isArray(candidate.options)) return false;
  if (candidate.accept !== undefined && !Array.isArray(candidate.accept)) return false;
  return true;
}

/** Read the payload, or null when it is not shaped right. */
function asReadingComprehensionPayload(exercise: Exercise): ReadingComprehensionPayload | null {
  const payload = exercise.ext_payload as { passage?: unknown; questions?: unknown } | undefined;
  if (!payload) return null;
  if (typeof payload.passage !== "string") return null;
  if (!Array.isArray(payload.questions) || !payload.questions.every(isSubQuestionShape)) return null;
  return { passage: payload.passage, questions: payload.questions as SubQuestion[] };
}

/** Validate one sub-question's type-specific payload. */
function subQuestionIssues(question: SubQuestion): ValidationIssue[] {
  if (question.prompt.trim() === "") {
    return [issue("E-EXT-REFRC-PROMPT", "ext:ref-reading-comprehension questions need a non-empty prompt")];
  }
  if (!KNOWN_QUESTION_TYPES.has(question.type)) {
    return [
      issue(
        "E-EXT-REFRC-QTYPE",
        `ext:ref-reading-comprehension question type must be one of ${[...KNOWN_QUESTION_TYPES].join(", ")}`,
      ),
    ];
  }
  if (question.type === "multiple_choice") {
    const options = question.options ?? [];
    const correctCount = options.filter((option) => option.correct === true).length;
    if (options.length < 2 || correctCount < 1) {
      return [
        issue(
          "E-EXT-REFRC-MC",
          "ext:ref-reading-comprehension multiple_choice question needs >=2 options and >=1 correct",
        ),
      ];
    }
  }
  if (question.type === "free_text") {
    const accept = (question.accept ?? []).filter((entry) => entry.trim() !== "");
    if (accept.length === 0) {
      return [issue("E-EXT-REFRC-FT", "ext:ref-reading-comprehension free_text question needs a non-empty accept list")];
    }
  }
  return [];
}

/** ENGINE half: validate one ``ext:ref-reading-comprehension`` payload. */
export const refReadingComprehensionExtension: ExerciseExtension = {
  type: "ext:ref-reading-comprehension",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asReadingComprehensionPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFRC-SHAPE",
          "ext:ref-reading-comprehension requires 'ext_payload' with passage (string) and questions ([{prompt, type, options?/accept?}])",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.passage.trim() === "") {
      issues.push(issue("E-EXT-REFRC-PASSAGE", "ext:ref-reading-comprehension requires a non-empty passage"));
    }
    if (payload.questions.length === 0) {
      issues.push(issue("E-EXT-REFRC-QUESTIONS", "ext:ref-reading-comprehension requires at least 1 question"));
    }
    for (const question of payload.questions) {
      issues.push(...subQuestionIssues(question));
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the passage over the numbered question prompts. A real
 * consumer would render each sub-question with its existing renderer; this
 * string form keeps the demo framework-agnostic and testable.
 */
export function renderRefReadingComprehension(exercise: Exercise): string {
  const payload = asReadingComprehensionPayload(exercise);
  if (!payload) return exercise.prompt;
  const numbered = payload.questions.map((question, index) => `${index + 1}. ${question.prompt}`);
  return [exercise.prompt, payload.passage, ...numbered].join("\n");
}

/** Normalise a free-text answer for tolerant comparison (trim + case-fold). */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Grade one sub-question against the learner's answer. */
function isSubQuestionCorrect(question: SubQuestion, answer: string): boolean {
  if (question.type === "multiple_choice") {
    const correctTexts = (question.options ?? [])
      .filter((option) => option.correct === true)
      .map((option) => option.text);
    return correctTexts.includes(answer);
  }
  if (question.type === "free_text") {
    return (question.accept ?? []).some((entry) => normalize(entry) === normalize(answer));
  }
  return false;
}

/**
 * CONSUMER half: grade the learner's answers (one per question, in order).
 * multiple_choice is graded by exact option text, free_text tolerantly (trim +
 * case-fold; a production consumer would reuse its free-text matcher). Returns
 * the per-question tally.
 */
export function gradeRefReadingComprehension(
  exercise: Exercise,
  answers: readonly string[],
): { correct: number; total: number } {
  const payload = asReadingComprehensionPayload(exercise);
  if (!payload) return { correct: 0, total: 0 };
  const correct = payload.questions.reduce(
    (count, question, index) => count + (isSubQuestionCorrect(question, answers[index] ?? "") ? 1 : 0),
    0,
  );
  return { correct, total: payload.questions.length };
}
