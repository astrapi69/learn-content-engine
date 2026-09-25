/**
 * Resolving a parametric exercise into a concrete instance (engine#220):
 * sample every SAMPLED variable, evaluate every COMPUTED one in declaration
 * order, round each to its display precision, and substitute every
 * ``{{name}}`` reference in the exercise's string fields.
 *
 * The engine defines this contract (schema 1.14, engine#151) and validates it
 * in ``variables.ts``; until engine#220 each consumer carried its own
 * evaluator for it (the reference app a second parser for the same grammar).
 * The contract here is the app's (adaptive-learner#3109), so the app can
 * switch without changing its call sites, with two differences that follow
 * from one grammar and one reference syntax: an expression the validator
 * rejects (``.5``, a unary ``+``) does not evaluate either, and a reference
 * written with spaces (``{{ a }}``), which the validator reads as ``a``, is
 * substituted too.
 *
 * Pure: the random source is a parameter, and a previous attempt's values can
 * be replayed. No ajv, no ``node:*``.
 */
import type { ExerciseVariable } from "./types/lesson-schema.generated.js";
import { REFERENCE, VARIABLE_NAME, evaluateExpression } from "./variables.js";

/** Options of {@link resolveExerciseVariables}. */
export interface ResolveExerciseVariablesOptions {
  /** Random source for SAMPLED variables, in ``[0, 1)``. Defaults to
   *  ``Math.random``; pass a deterministic one in tests. */
  random?: () => number;
  /** Values to reuse instead of sampling and evaluating again: the review
   *  replay, which shows the learner the instance they saw. A variable missing
   *  here (content changed since) is sampled or evaluated afresh. */
  values?: Readonly<Record<string, number>>;
}

/** What {@link resolveExerciseVariables} returns. */
export interface ResolvedExerciseVariables<T> {
  /** The concrete exercise: every reference to a declared variable
   *  substituted. The same object as the input when it declares no
   *  variables. */
  exercise: T;
  /** The value per declared variable, rounded to its display precision: the
   *  shape to persist with an attempt so a review can replay it. */
  values: Record<string, number>;
  /** The tolerance of every ``accept`` entry that is exactly one reference to
   *  a variable with a ``tolerance``, keyed by the entry's substituted text.
   *  A partial reference ("The answer is {{sum}}") grades as text. */
  toleranceByAcceptText: ReadonlyMap<string, number>;
}

/** The fields of an exercise the resolver reads. */
interface ParametricExercise {
  variables?: ExerciseVariable[] | null;
  accept?: string[] | null;
}

/** Decimal places of ``step`` in its shortest form (``0.5`` -> 1, ``0.25``
 *  -> 2, ``2`` -> 0). */
function decimalPlaces(step: number): number {
  const text = step.toString();
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** The display precision of a variable: its ``step``'s decimals, else six
 *  (enough for a computed value, short of float noise). */
const precisionOf = (step: number | undefined): number => (step !== undefined ? decimalPlaces(step) : 6);

function roundToPrecision(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A value as the learner reads it: an integer without decimals, a decimal
 *  with the precision ``step`` implies (so ``1.5000000001`` reads ``1.5``),
 *  a computed value (no ``step``) rounded to six places. */
export function formatVariableValue(value: number, step: number | undefined): string {
  return String(roundToPrecision(value, precisionOf(step)));
}

/** Draw a value for a SAMPLED variable: without ``step`` an integer in
 *  ``[min, max]``; with it one of ``min``, ``min + step``, ... up to, never
 *  past, ``max``. */
export function sampleVariable(variable: Pick<ExerciseVariable, "name" | "min" | "max" | "step">, random: () => number): number {
  const min = variable.min ?? 0;
  const max = variable.max ?? min;
  if (variable.step !== undefined && variable.step > 0) {
    // The epsilon keeps a max that lies exactly on the grid from being lost
    // to float error in the division.
    const steps = Math.floor((max - min) / variable.step + 1e-9);
    return min + Math.floor(random() * (steps + 1)) * variable.step;
  }
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return low + Math.floor(random() * Math.max(high - low + 1, 1));
}

/** The declared name a ``{{...}}`` reference names, trimmed as the validator
 *  reads it, or ``null``. */
function referencedName(inner: string, formatted: Readonly<Record<string, string>>): string | null {
  const name = inner.trim();
  return VARIABLE_NAME.test(name) && Object.hasOwn(formatted, name) ? name : null;
}

function substituteString(text: string, formatted: Readonly<Record<string, string>>): string {
  return text.replace(REFERENCE, (whole, inner: string) => {
    const name = referencedName(inner, formatted);
    return name === null ? whole : formatted[name]!;
  });
}

/** Substitute references in every string of a JSON-like value, depth-first
 *  and type-preserving. The top-level ``variables`` block is kept as it is:
 *  its expressions are not references. */
function deepSubstitute<T>(value: T, formatted: Readonly<Record<string, string>>, isRoot = false): T {
  if (typeof value === "string") return substituteString(value, formatted) as T;
  if (Array.isArray(value)) return value.map((element) => deepSubstitute(element, formatted)) as T;
  if (value !== null && typeof value === "object") {
    const substituted: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      substituted[key] = isRoot && key === "variables" ? child : deepSubstitute(child, formatted);
    }
    return substituted as T;
  }
  return value;
}

/** The variable an ``accept`` entry consists of entirely (``{{sum}}`` or
 *  ``{{ sum }}``), or ``null``. */
function pureReferenceName(text: string, formatted: Readonly<Record<string, string>>): string | null {
  const match = /^\{\{([^{}]*)\}\}$/.exec(text.trim());
  return match ? referencedName(match[1]!, formatted) : null;
}

/**
 * Resolve an exercise's ``variables`` into a concrete instance: each variable
 * in declaration order is taken from ``options.values`` if present, else
 * evaluated (``expression``) or sampled (``min``/``max``/``step``), then
 * rounded to its display precision; every reference to a declared variable
 * is substituted across the whole exercise. Returns the concrete exercise,
 * the values and the tolerances of pure-reference ``accept`` entries. An
 * exercise without ``variables`` (absent, ``null`` or empty) comes back as
 * the same object, literal ``{{...}}`` included (a Jinja2 lesson is not
 * parametric). Never mutates the input. Throws when an expression does not
 * evaluate (it does not parse, or uses a name declared after it); a lesson
 * that passes ``validateLesson`` has neither.
 */
export function resolveExerciseVariables<T extends ParametricExercise>(
  exercise: T,
  options: ResolveExerciseVariablesOptions = {},
): ResolvedExerciseVariables<T> {
  const variables = exercise.variables ?? [];
  if (variables.length === 0) return { exercise, values: {}, toleranceByAcceptText: new Map() };
  const random = options.random ?? Math.random;

  const values: Record<string, number> = {};
  const formatted: Record<string, string> = {};
  const toleranceByName = new Map<string, number>();
  for (const variable of variables) {
    const replayed = options.values?.[variable.name];
    const raw =
      replayed !== undefined
        ? replayed
        : variable.expression !== undefined
          ? evaluateExpression(variable.expression, values)
          : sampleVariable(variable, random);
    values[variable.name] = roundToPrecision(raw, precisionOf(variable.step));
    formatted[variable.name] = formatVariableValue(values[variable.name]!, variable.step);
    if (variable.tolerance !== undefined) toleranceByName.set(variable.name, variable.tolerance);
  }

  const toleranceByAcceptText = new Map<string, number>();
  for (const acceptEntry of exercise.accept ?? []) {
    const name = pureReferenceName(acceptEntry, formatted);
    if (name !== null && toleranceByName.has(name)) toleranceByAcceptText.set(formatted[name]!, toleranceByName.get(name)!);
  }
  return { exercise: deepSubstitute(exercise, formatted, true), values, toleranceByAcceptText };
}
