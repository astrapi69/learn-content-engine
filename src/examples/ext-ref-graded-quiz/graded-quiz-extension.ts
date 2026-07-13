/**
 * Example extension ``ext:ref-graded-quiz`` - the school-test decision basis
 * (engine#46). A self-contained scored question set: each question carries
 * ``points``, multi-select questions may award ``partial_credit``
 * (proportional), and an optional ``pass_threshold`` (percent) decides
 * pass/fail. Questions reuse the core ``multiple_choice`` / ``free_text``
 * shapes.
 *
 * This demonstrates that the points / partial-credit / pass-threshold concern
 * fits the extension tier WITHOUT a core-schema change: the payload carries
 * only the grading METADATA; the grading POLICY (how partial credit is
 * computed, how pass/fail is decided) lives in the consumer half. A production
 * adoption would pick its own vendor and could route free_text through its own
 * matcher. Excluded from the published build (tsconfig.build).
 *
 * Note: "points on an exercise" is a cross-cutting concern, not an interaction
 * type - so it is modelled here as a bounded graded-quiz payload rather than a
 * core ``points`` field on every exercise (which would be a full core ripple).
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-graded-quiz";

/** One answer option of a ``multiple_choice`` question. */
interface QuizOption {
  text: string;
  correct?: boolean;
}

/** One scored question. */
interface QuizQuestion {
  prompt: string;
  type: string;
  options?: QuizOption[];
  accept?: string[];
  points: number;
  partial_credit?: boolean;
}

/** The ``ext_payload`` shape ``ext:ref-graded-quiz`` expects. */
interface GradedQuizPayload {
  pass_threshold?: number;
  questions: QuizQuestion[];
}

const KNOWN_QUESTION_TYPES = new Set(["multiple_choice", "free_text"]);

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

/** True when ``value`` is a structurally-shaped scored question. */
function isQuizQuestionShape(value: unknown): value is QuizQuestion {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.prompt !== "string" || typeof candidate.type !== "string") return false;
  if (typeof candidate.points !== "number") return false;
  if (candidate.options !== undefined && !Array.isArray(candidate.options)) return false;
  if (candidate.accept !== undefined && !Array.isArray(candidate.accept)) return false;
  return true;
}

/** Read the payload, or null when it is not shaped right. */
function asGradedQuizPayload(exercise: Exercise): GradedQuizPayload | null {
  const payload = exercise.ext_payload as { pass_threshold?: unknown; questions?: unknown } | undefined;
  if (!payload) return null;
  if (payload.pass_threshold !== undefined && typeof payload.pass_threshold !== "number") return null;
  if (!Array.isArray(payload.questions) || !payload.questions.every(isQuizQuestionShape)) return null;
  return {
    pass_threshold: payload.pass_threshold as number | undefined,
    questions: payload.questions as QuizQuestion[],
  };
}

/** Validate one question's type-specific payload + points. */
function quizQuestionError(question: QuizQuestion): string | null {
  if (question.prompt.trim() === "") return "E-EXT-REFGQ-PROMPT";
  if (!KNOWN_QUESTION_TYPES.has(question.type)) return "E-EXT-REFGQ-QTYPE";
  if (question.type === "multiple_choice") {
    const options = question.options ?? [];
    if (options.length < 2 || options.filter((option) => option.correct === true).length < 1) {
      return "E-EXT-REFGQ-MC";
    }
  }
  if (question.type === "free_text") {
    if ((question.accept ?? []).filter((entry) => entry.trim() !== "").length === 0) {
      return "E-EXT-REFGQ-FT";
    }
  }
  if (!(question.points > 0)) return "E-EXT-REFGQ-POINTS";
  return null;
}

const MESSAGES: Record<string, string> = {
  "E-EXT-REFGQ-PROMPT": "ext:ref-graded-quiz questions need a non-empty prompt",
  "E-EXT-REFGQ-QTYPE": "ext:ref-graded-quiz question type must be multiple_choice or free_text",
  "E-EXT-REFGQ-MC": "ext:ref-graded-quiz multiple_choice question needs >=2 options and >=1 correct",
  "E-EXT-REFGQ-FT": "ext:ref-graded-quiz free_text question needs a non-empty accept list",
  "E-EXT-REFGQ-POINTS": "ext:ref-graded-quiz questions need positive points",
};

/** ENGINE half: validate one ``ext:ref-graded-quiz`` payload. */
export const refGradedQuizExtension: ExerciseExtension = {
  type: "ext:ref-graded-quiz",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asGradedQuizPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFGQ-SHAPE",
          "ext:ref-graded-quiz requires 'ext_payload' with questions ([{prompt, type, points, options?/accept?, partial_credit?}]) and an optional numeric pass_threshold",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.questions.length === 0) {
      issues.push(issue("E-EXT-REFGQ-QUESTIONS", "ext:ref-graded-quiz requires at least 1 question"));
    }
    if (
      payload.pass_threshold !== undefined &&
      (payload.pass_threshold < 0 || payload.pass_threshold > 100)
    ) {
      issues.push(issue("E-EXT-REFGQ-THRESHOLD", "ext:ref-graded-quiz pass_threshold must be a percentage in 0..100"));
    }
    for (const question of payload.questions) {
      const errorId = quizQuestionError(question);
      if (errorId) issues.push(issue(errorId, MESSAGES[errorId]!));
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the questions with their point values and, when set,
 * the pass threshold. A real consumer would render each question with its
 * existing renderer; this string form keeps the demo framework-agnostic.
 */
export function renderRefGradedQuiz(exercise: Exercise): string {
  const payload = asGradedQuizPayload(exercise);
  if (!payload) return exercise.prompt;
  const lines = payload.questions.map(
    (question, index) => `${index + 1}. ${question.prompt} (${question.points} P.)`,
  );
  if (payload.pass_threshold !== undefined) {
    lines.push(`Bestehensschwelle: ${payload.pass_threshold}%`);
  }
  return [exercise.prompt, ...lines].join("\n");
}

/** Normalise a free-text answer for tolerant comparison (trim + case-fold). */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Points earned on one question given the learner's selected texts. */
function questionPoints(question: QuizQuestion, chosen: readonly string[]): number {
  if (question.type === "free_text") {
    const matched = (question.accept ?? []).some((entry) => normalize(entry) === normalize(chosen[0] ?? ""));
    return matched ? question.points : 0;
  }
  // multiple_choice
  const options = question.options ?? [];
  const correct = new Set(options.filter((option) => option.correct === true).map((option) => option.text));
  const picked = new Set(chosen);
  if (question.partial_credit === true) {
    const correctPicked = [...picked].filter((text) => correct.has(text)).length;
    const wrongPicked = [...picked].filter((text) => !correct.has(text)).length;
    const fraction = correct.size === 0 ? 0 : Math.max(0, correctPicked - wrongPicked) / correct.size;
    return fraction * question.points;
  }
  // exact-set match
  const exact = picked.size === correct.size && [...picked].every((text) => correct.has(text));
  return exact ? question.points : 0;
}

/**
 * CONSUMER half: grade the quiz. ``answers[i]`` is the set of chosen option
 * texts for a multiple_choice question, or ``[typedText]`` for a free_text
 * question. Returns points earned / total and, when a ``pass_threshold`` is
 * set, whether the percentage clears it (no threshold => always "passed").
 */
export function gradeRefGradedQuiz(
  exercise: Exercise,
  answers: readonly (readonly string[])[],
): { earned: number; total: number; passed: boolean } {
  const payload = asGradedQuizPayload(exercise);
  if (!payload) return { earned: 0, total: 0, passed: false };
  const earned = payload.questions.reduce(
    (sum, question, index) => sum + questionPoints(question, answers[index] ?? []),
    0,
  );
  const total = payload.questions.reduce((sum, question) => sum + question.points, 0);
  const passed =
    payload.pass_threshold === undefined ||
    (total > 0 && (earned / total) * 100 >= payload.pass_threshold);
  return { earned, total, passed };
}
