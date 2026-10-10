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
 * A typed cloze whose sentence is only its blank (`W-CLOZE-NO-CARRIER`)
 * becomes `free_text` (engine#254). A converted exercise keeps its `id` and
 * `stable_id`; the change names the `type_migrations` declaration the set
 * manifest needs so the stability gate accepts the kept id. The written
 * shape keeps the consumer's element key: the correct option (or the first
 * `accept`) is the blank's first accept, and no option gains a `stable_id`.
 *
 * Deliberately NOT converted (left in place, coexistence is a feature):
 * - a typed cloze with a carrier sentence (a real gap text)
 * - multi-blank selects and typed clozes (one gap = one question does not
 *   hold there)
 */

import { carriesClozeText } from "./cloze-carrier.js";
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

/** The ``metadata.type_migrations`` entry a converted exercise needs, so the
 *  stability gate accepts its kept ``stable_id`` (engine#254). */
export interface TypeMigrationDeclaration {
  stable_id: string;
  from: "cloze";
  to: "multiple_choice" | "free_text";
}

/** Outcome for one candidate exercise (a cloze select, multiselect, or a
 *  typed cloze without a carrier sentence). */
export interface ExerciseChange {
  id: string;
  status: "converted" | "skipped";
  reason?: string;
  notes?: string[];
  /** Present when the converted exercise keeps a ``stable_id``. */
  typeMigration?: TypeMigrationDeclaration;
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

/** The hint a free_text keeps: the exercise's, or the single blank's when the
 *  exercise has none. ``undefined`` with a reason when both carry one. */
function mergedHint(exercise: LooseExercise, blank: { hint?: unknown }): { hint?: unknown; conflict?: string } {
  const exerciseHint = exercise["hint"];
  if (blank.hint === undefined) return { hint: exerciseHint };
  if (exerciseHint === undefined) return { hint: blank.hint };
  return { conflict: "the blank and the exercise both carry a hint; free_text has one" };
}

function convertTyped(exercise: LooseExercise): { migrated?: LooseExercise; change?: ExerciseChange } {
  const sentence = typeof exercise["sentence"] === "string" ? exercise["sentence"] : "";
  if (carriesClozeText(sentence)) return {};
  const exerciseId = String(exercise["id"] ?? "?");
  const blanks = Array.isArray(exercise["blanks"]) ? (exercise["blanks"] as { accept?: string[]; hint?: unknown }[]) : [];
  if (blanks.length !== 1) {
    return {
      change: { id: exerciseId, status: "skipped", reason: `typed cloze with ${blanks.length} blanks - only a single blank maps onto one free_text answer` },
    };
  }
  const accept = blanks[0]!.accept ?? [];
  if (accept.length === 0) return { change: { id: exerciseId, status: "skipped", reason: "blank has no accept entries" } };
  const { hint, conflict } = mergedHint(exercise, blanks[0]!);
  if (conflict) return { change: { id: exerciseId, status: "skipped", reason: conflict } };
  const migrated: LooseExercise = { ...stripClozeFields(exercise), type: "free_text", prompt: mergedPrompt(exercise), accept: [...accept] };
  if (hint === undefined) delete migrated["hint"];
  else migrated["hint"] = hint;
  return { migrated, change: { id: exerciseId, status: "converted" } };
}

/** Attach the ``type_migrations`` entry a converted exercise needs and a note
 *  for each blank ``stable_id`` the new type cannot carry (engine#254). */
function declared(
  exercise: LooseExercise,
  result: { migrated?: LooseExercise; change?: ExerciseChange },
): { migrated?: LooseExercise; change?: ExerciseChange } {
  const { migrated, change } = result;
  if (!migrated || !change || change.status !== "converted") return result;
  const blanks = Array.isArray(exercise["blanks"]) ? (exercise["blanks"] as { stable_id?: unknown }[]) : [];
  const lostIds = blanks.map((blank) => blank.stable_id).filter((id): id is string => typeof id === "string" && id !== "");
  const notes = [
    ...(change.notes ?? []),
    ...lostIds.map((id) => `blank stable_id '${id}' does not survive the conversion; declare it in the set manifest's retired_ids`),
  ];
  const stableId = exercise["stable_id"];
  const to = migrated["type"] as TypeMigrationDeclaration["to"];
  return {
    migrated,
    change: {
      ...change,
      ...(notes.length ? { notes } : {}),
      ...(typeof stableId === "string" && stableId !== "" ? { typeMigration: { stable_id: stableId, from: "cloze", to } } : {}),
    },
  };
}

function convertExercise(exercise: LooseExercise): { migrated?: LooseExercise; change?: ExerciseChange } {
  if (exercise["type"] !== "cloze") return {};
  if (exercise["cloze_mode"] === "select") return declared(exercise, convertSelect(exercise));
  if (exercise["cloze_mode"] === "multiselect") return declared(exercise, convertMultiselect(exercise));
  if (exercise["cloze_mode"] === "type") return declared(exercise, convertTyped(exercise));
  return {};
}

/**
 * Rewrite every cloze select/multiselect exercise in the lesson to the native
 * `multiple_choice` type, and every typed cloze without a carrier sentence to
 * `free_text`. Returns the (new) lesson plus one change record per candidate;
 * non-candidates (other types, a typed cloze with a carrier) are untouched
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

/** The ``type_migrations`` entries every converted exercise with a
 *  ``stable_id`` needs, as a block to paste into the set manifest's
 *  ``metadata``; empty when there are none (engine#254). */
function declarationBlock(reports: MigrateReport[]): string[] {
  const entries = reports
    .filter((report) => report.ok)
    .flatMap((report) => report.changes.flatMap((change) => (change.typeMigration ? [change.typeMigration] : [])));
  if (entries.length === 0) return [];
  return [
    "declare in the set manifest's metadata (engine#254):",
    "  type_migrations:",
    ...entries.map((entry) => `    - { stable_id: ${entry.stable_id}, from: ${entry.from}, to: ${entry.to} }`),
  ];
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
  lines.push(...declarationBlock(reports));
  if (!options.write && reports.some((report) => report.converted > 0)) {
    lines.push("dry run - pass --write to apply");
  }
  return { text: lines.join("\n"), exitCode };
}
