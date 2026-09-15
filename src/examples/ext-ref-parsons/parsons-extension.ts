/**
 * Example extension ``ext:ref-parsons`` - a Parsons problem: the lines of a
 * short program are handed to the learner scrambled, and the task is to put
 * them back in order AND at the right indentation (Denny, Luxton-Reilly and
 * Simon 2008). It is ``ext:ref-ordering`` with a second dimension: for code,
 * WHERE a line sits (its indent level) carries as much meaning as its
 * position, so grading checks both.
 *
 * The payload is self-contained (Option A, engine#68): ``lines`` is the
 * program in its CORRECT order with each line's indent level (0-based, one
 * level = one block); the consumer shuffles for presentation. ``language`` is
 * an optional hint for syntax highlighting the engine does not interpret.
 *
 * Deliberately NO uniqueness rule, unlike ``ext:ref-ordering``: a real
 * program legitimately contains the same statement twice (two ``return``
 * lines, a repeated ``print``), and a Parsons UI identifies tiles by position,
 * not by text, so a repeated line is not ambiguous the way a repeated
 * ordering item is.
 *
 * Excluded from the published build (tsconfig.build); a production adoption
 * uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-parsons";

const INDENT_UNIT = "    ";

interface ParsonsLine {
  code: string;
  indent: number;
}

/** The ``ext_payload`` shape ``ext:ref-parsons`` expects. */
interface ParsonsPayload {
  lines: ParsonsLine[];
  language?: string;
}

/** A learner's arrangement: tile indices in placed order, and the indent chosen for each placed tile. */
export interface ParsonsAttempt {
  order: number[];
  indents: number[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

function isParsonsLine(value: unknown): value is ParsonsLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as { code?: unknown; indent?: unknown };
  return typeof line.code === "string" && typeof line.indent === "number";
}

/** Read the payload, or null when it is not shaped right. */
function asParsonsPayload(exercise: Exercise): ParsonsPayload | null {
  const payload = exercise.ext_payload as { lines?: unknown; language?: unknown } | undefined;
  if (!payload) return null;
  if (!Array.isArray(payload.lines) || !payload.lines.every(isParsonsLine)) return null;
  if (payload.language !== undefined && typeof payload.language !== "string") return null;
  return { lines: payload.lines as ParsonsLine[], language: payload.language as string | undefined };
}

/** ENGINE half: validate one ``ext:ref-parsons`` payload. */
export const refParsonsExtension: ExerciseExtension = {
  type: "ext:ref-parsons",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asParsonsPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFPARSONS-SHAPE",
          "ext:ref-parsons requires 'ext_payload' with lines ([{code, indent}]) and an optional language (string)",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.lines.length < 2) {
      issues.push(issue("E-EXT-REFPARSONS-MIN", "ext:ref-parsons requires at least 2 lines"));
    }
    if (payload.lines.some((line) => line.code.trim() === "")) {
      issues.push(issue("E-EXT-REFPARSONS-CODE", "ext:ref-parsons lines must carry non-empty code"));
    }
    if (payload.lines.some((line) => !Number.isInteger(line.indent) || line.indent < 0)) {
      issues.push(issue("E-EXT-REFPARSONS-INDENT", "ext:ref-parsons indent must be a non-negative integer"));
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the prompt over the program in its authored order,
 * indented four spaces per level. A real consumer would shuffle the lines
 * into draggable tiles; this string form keeps the demo framework-agnostic
 * and testable. Falls back to the bare prompt when the payload is malformed.
 */
export function renderRefParsons(exercise: Exercise): string {
  const payload = asParsonsPayload(exercise);
  if (!payload) return exercise.prompt;
  const rendered = payload.lines.map((line) => `${INDENT_UNIT.repeat(line.indent)}${line.code}`);
  return [exercise.prompt, ...rendered].join("\n");
}

/**
 * CONSUMER half: grade an arrangement. Correct only when the placed order is
 * exactly the authored order AND every placed tile carries its authored
 * indent - a right sequence at the wrong depth is still a wrong program. A
 * malformed payload or a partial arrangement grades as incorrect rather
 * than throwing.
 */
export function gradeRefParsons(exercise: Exercise, attempt: ParsonsAttempt): boolean {
  const payload = asParsonsPayload(exercise);
  if (!payload) return false;
  const lineCount = payload.lines.length;
  if (attempt.order.length !== lineCount || attempt.indents.length !== lineCount) return false;
  return attempt.order.every((lineIndex, position) => {
    const authored = payload.lines[lineIndex];
    return authored !== undefined && lineIndex === position && attempt.indents[position] === authored.indent;
  });
}
