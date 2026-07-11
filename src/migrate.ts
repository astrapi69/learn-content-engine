/**
 * cloze select/multiselect -> native multiple_choice migration core (#14).
 *
 * The conversion every content repo scripted by hand, once, validated:
 * the legacy cloze vehicle (select = single answer #890, multiselect =
 * "select all that apply" #1195) maps mechanically onto the native
 * `multiple_choice` type (0.8.0). Filesystem-free like the lint core; the
 * bin shim reads/writes files. Dry-run is the default - a rewritten lesson
 * is only worth writing after `validateLesson` accepted it, which
 * `migrateContent` enforces.
 *
 * Deliberately NOT converted (left in place, coexistence is a feature):
 * - `cloze_mode: "type"` (typed answers have no MC equivalent)
 * - multi-blank selects (one gap = one question does not hold there)
 */

import { exitCodeFor, parseErrorLine, parseFileArgs, type FileReport } from "./file-command.js";
import { validateLesson, type ValidationResult } from "./validate.js";

/** Parsed `migrate` invocation, or a usage error. */
export type MigrateArgs =
  | { paths: string[]; write: boolean; json: boolean }
  | { error: string };

/** Parse `migrate <file...> [--write] [--json]`. Pure; no filesystem access. */
export function parseMigrateArgs(argv: string[]): MigrateArgs {
  const parsed = parseFileArgs(
    "migrate",
    argv,
    ["--write", "--json"],
    "migrate <file...> [--write] [--json]",
    "usage: learn-content-engine migrate <file...> [--write] [--json]",
  );
  if ("error" in parsed) return parsed;
  return { paths: parsed.paths, write: parsed.flags.has("--write"), json: parsed.flags.has("--json") };
}

/** Outcome for one candidate exercise (cloze select/multiselect). */
export interface ExerciseChange {
  id: string;
  status: "converted" | "skipped";
  reason?: string;
  notes?: string[];
}

/** A migrated lesson plus the per-exercise audit trail. */
export interface MigrateOutcome {
  lesson: unknown;
  changes: ExerciseChange[];
  converted: number;
}

type LooseExercise = Record<string, unknown>;

interface McOption {
  text: string;
  correct?: boolean;
}

const CLOZE_FIELDS = ["cloze_mode", "sentence", "blanks", "accept", "distractors"] as const;

function mergedPrompt(exercise: LooseExercise): string {
  const prompt = typeof exercise["prompt"] === "string" ? exercise["prompt"] : "";
  const sentence = typeof exercise["sentence"] === "string" ? exercise["sentence"] : "";
  if (!sentence || sentence === "___") return prompt || sentence;
  return prompt ? `${prompt}\n\n${sentence}` : sentence;
}

function stripClozeFields(exercise: LooseExercise): LooseExercise {
  const kept = { ...exercise };
  for (const field of CLOZE_FIELDS) delete kept[field];
  return kept;
}

/** Distractors minus the ones colliding with a correct text (E-MC-DUP-OPTION). */
function dedupedDistractors(
  distractors: string[],
  correctTexts: string[],
  notes: string[],
): string[] {
  const kept: string[] = [];
  for (const distractor of distractors) {
    if (correctTexts.includes(distractor)) {
      notes.push(`dropped distractor '${distractor}' (equals a correct option)`);
    } else {
      kept.push(distractor);
    }
  }
  return kept;
}

function convertSelect(exercise: LooseExercise): { migrated?: LooseExercise; change: ExerciseChange } {
  const exerciseId = String(exercise["id"] ?? "?");
  const blanks = Array.isArray(exercise["blanks"]) ? (exercise["blanks"] as { accept?: string[] }[]) : [];
  if (blanks.length !== 1) {
    return {
      change: {
        id: exerciseId,
        status: "skipped",
        reason: `select with ${blanks.length} blanks - only single-blank selects map onto one multiple_choice question`,
      },
    };
  }
  const accepts = blanks[0]!.accept ?? [];
  const correctText = accepts[0];
  if (!correctText) {
    return { change: { id: exerciseId, status: "skipped", reason: "blank has no accept entries" } };
  }
  const notes: string[] = [];
  for (const alternate of accepts.slice(1)) {
    notes.push(`dropped alternate accept '${alternate}' (multiple_choice options have exactly one text)`);
  }
  const distractors = Array.isArray(exercise["distractors"]) ? (exercise["distractors"] as string[]) : [];
  const options: McOption[] = [
    { text: correctText, correct: true },
    ...dedupedDistractors(distractors, [correctText], notes).map((text) => ({ text })),
  ];
  const migrated: LooseExercise = {
    ...stripClozeFields(exercise),
    type: "multiple_choice",
    prompt: mergedPrompt(exercise),
    options,
  };
  return { migrated, change: { id: exerciseId, status: "converted", ...(notes.length ? { notes } : {}) } };
}

function convertMultiselect(exercise: LooseExercise): { migrated?: LooseExercise; change: ExerciseChange } {
  const exerciseId = String(exercise["id"] ?? "?");
  const accepts = Array.isArray(exercise["accept"]) ? (exercise["accept"] as string[]) : [];
  if (accepts.length === 0) {
    return { change: { id: exerciseId, status: "skipped", reason: "multiselect has no accept entries" } };
  }
  const notes: string[] = [];
  const distractors = Array.isArray(exercise["distractors"]) ? (exercise["distractors"] as string[]) : [];
  const options: McOption[] = [
    ...accepts.map((text) => ({ text, correct: true })),
    ...dedupedDistractors(distractors, accepts, notes).map((text) => ({ text })),
  ];
  const migrated: LooseExercise = {
    ...stripClozeFields(exercise),
    type: "multiple_choice",
    prompt: mergedPrompt(exercise),
    options,
    multiple: true,
  };
  return { migrated, change: { id: exerciseId, status: "converted", ...(notes.length ? { notes } : {}) } };
}

function convertExercise(exercise: LooseExercise): { migrated?: LooseExercise; change?: ExerciseChange } {
  if (exercise["type"] !== "cloze") return {};
  if (exercise["cloze_mode"] === "select") return convertSelect(exercise);
  if (exercise["cloze_mode"] === "multiselect") return convertMultiselect(exercise);
  return {};
}

/**
 * Rewrite every cloze select/multiselect exercise in the lesson to the native
 * `multiple_choice` type. Returns the (new) lesson plus one change record per
 * candidate; non-candidates (other types, `cloze_mode: "type"`) are untouched
 * and unreported. The input is never mutated.
 */
export function migrateLesson(lesson: unknown): MigrateOutcome {
  const changes: ExerciseChange[] = [];
  if (typeof lesson !== "object" || lesson === null || !Array.isArray((lesson as { steps?: unknown[] }).steps)) {
    return { lesson, changes, converted: 0 };
  }
  const source = lesson as { steps: Record<string, unknown>[] };
  const steps = source.steps.map((step) => {
    const exercise = step["exercise"];
    if (typeof exercise !== "object" || exercise === null) return step;
    const { migrated, change } = convertExercise(exercise as LooseExercise);
    if (change) changes.push(change);
    return migrated ? { ...step, exercise: migrated } : step;
  });
  return {
    lesson: { ...source, steps },
    changes,
    converted: changes.filter((change) => change.status === "converted").length,
  };
}

/** One file's migration outcome. `ok` means: parseable AND still schema-valid. */
export interface MigrateReport extends FileReport {
  converted: number;
  changes: ExerciseChange[];
  lesson?: unknown;
  validation?: ValidationResult;
}

/**
 * Parse + migrate one file's raw JSON and gate the result behind
 * `validateLesson`: a migration that produces an invalid lesson reports
 * `ok: false` (and must never be written).
 */
export function migrateContent(rawJson: string, path: string): MigrateReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return { path, ok: false, converted: 0, changes: [], parseError: String(error) };
  }
  const outcome = migrateLesson(parsed);
  const validation = validateLesson(outcome.lesson);
  return {
    path,
    ok: validation.valid,
    converted: outcome.converted,
    changes: outcome.changes,
    lesson: outcome.lesson,
    validation,
  };
}

/** Render migrate reports; exit code 1 iff any file failed parse/validation. */
export function formatMigrateReports(
  reports: MigrateReport[],
  options: { json: boolean; write: boolean },
): { text: string; exitCode: number } {
  const exitCode = exitCodeFor(reports);
  if (options.json) {
    const serializable = reports.map((report) => {
      const { lesson, ...rest } = report;
      void lesson;
      return rest;
    });
    return { text: JSON.stringify(serializable, null, 2), exitCode };
  }
  const lines: string[] = [];
  for (const report of reports) {
    if (report.parseError) {
      lines.push(parseErrorLine(report));
      continue;
    }
    if (!report.ok) {
      lines.push(`ERROR ${report.path}: migrated lesson fails validation (not written)`);
      for (const issue of report.validation?.errors ?? []) {
        lines.push(`  [${issue.id}] ${issue.path} ${issue.message}`);
      }
      continue;
    }
    const verb = options.write ? "wrote" : "would convert";
    lines.push(`OK    ${report.path}: ${verb} ${report.converted} exercise(s)`);
    for (const change of report.changes) {
      lines.push(`  ${change.status === "converted" ? "converted" : "skipped  "} ${change.id}${change.reason ? ` - ${change.reason}` : ""}`);
      for (const note of change.notes ?? []) lines.push(`    note: ${note}`);
    }
  }
  if (!options.write && reports.some((report) => report.converted > 0)) {
    lines.push("dry run - pass --write to apply");
  }
  return { text: lines.join("\n"), exitCode };
}
