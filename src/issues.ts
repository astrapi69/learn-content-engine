/**
 * The shape of a validation issue and the helpers that build one. Shared by
 * the structural layer (``validate.ts``), the semantic rules (``rules.ts``)
 * and the modules that contribute rules (``set-ordering.ts``,
 * ``extensions.ts``), so none of them has to import another's layer.
 */

/** Whether an issue blocks (``error``) or merely advises (``warning``). */
export type ValidationSeverity = "error" | "warning";

/** One value a rule interpolates into its message, before formatting: lists
 *  stay arrays, numbers stay numbers, strings stay as the author wrote them. */
export type ValidationParamValue = string | number | readonly string[] | readonly number[];

/** The values of one issue, keyed per rule id (the rule catalog in
 *  docs/lesson-format.md lists the keys of each). */
export type ValidationParams = Readonly<Record<string, ValidationParamValue>>;

/** One validation problem: a JSON-pointer-ish path, a human-readable reason, a
 *  stable rule ``id``, its ``severity``, and a ``docAnchor`` into the docs.
 *  ``params`` carries the values the message interpolates, so a consumer can
 *  word the problem itself; it is absent when the rule has none (engine#201). */
export interface ValidationIssue {
  path: string;
  message: string;
  id: string;
  severity: ValidationSeverity;
  docAnchor: string;
  params?: ValidationParams;
}

/** The outcome of a validate call. ``valid`` is errors-only - ``warnings``
 *  never block. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const DOC = "docs/lesson-format.md";

export function makeIssue(
  severity: ValidationSeverity,
  id: string,
  path: string,
  message: string,
  anchor: string,
  params?: ValidationParams,
): ValidationIssue {
  const issue: ValidationIssue = { path, message, id, severity, docAnchor: `${DOC}#${anchor}` };
  return params === undefined ? issue : { ...issue, params };
}
export const err = (id: string, path: string, message: string, anchor: string, params?: ValidationParams): ValidationIssue =>
  makeIssue("error", id, path, message, anchor, params);
export const warn = (id: string, path: string, message: string, anchor: string, params?: ValidationParams): ValidationIssue =>
  makeIssue("warning", id, path, message, anchor, params);

/** Split issues into a result: ``valid`` is errors-only, warnings never block. */
export const splitIssues = (issues: ValidationIssue[]): ValidationResult => {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
};
