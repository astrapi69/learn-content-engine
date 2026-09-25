/**
 * Parametric exercises (engine#151, schema 1.14): an exercise may declare
 * ``variables``, each either SAMPLED (``min``/``max``, optional ``step``) or
 * COMPUTED (``expression`` over earlier variables, optional ``tolerance``),
 * and reference them as ``{{name}}`` from any of its string fields.
 *
 * The engine checks the contract and nothing more: names, the range shape,
 * that every expression parses and only names variables declared before it
 * (which also rules out cycles), that every ``{{reference}}`` resolves, and
 * that no variable is dead. Since engine#220 it also evaluates an
 * expression (``evaluateExpression``), on the same parser that validates it,
 * and ``resolve-variables.ts`` samples and substitutes: one grammar, one
 * implementation, instead of a copy per consumer. Grading with ``tolerance``
 * stays the consumer's.
 *
 * Expression language, deliberately small: decimal numbers, variable names,
 * ``+ - * /``, parentheses, unary minus. No functions, no powers, no
 * comparison. It grows additively when content needs it.
 */

export type VariableIssueSeverity = "error" | "warning";

export interface VariableIssue {
  severity: VariableIssueSeverity;
  id: string;
  path: string;
  message: string;
  /** The values the message interpolates (engine#201). */
  params?: Readonly<Record<string, string | number>>;
}

/** A `{{...}}` reference in a string field: a plain variable name, or, when
 *  the braces hold something else, `name: null` and the text between them. */
export type VariableReference = { path: string; name: string } | { path: string; name: null; raw: string };

export type ParsedExpression = { names: string[] } | { error: string };

/** A variable name, and the text a ``{{...}}`` reference must hold (after
 *  trimming) to reference one. */
export const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
/** A ``{{...}}`` reference; group 1 is the text between the braces. */
export const REFERENCE = /\{\{([^{}]*)\}\}/g;

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" }
  | { kind: "open" }
  | { kind: "close" };

/** The syntax tree of an expression: what the validator reads names from and
 *  what ``evaluateExpression`` computes. */
type ExpressionNode =
  | { kind: "number"; value: number }
  | { kind: "name"; name: string }
  | { kind: "negate"; operand: ExpressionNode }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/"; left: ExpressionNode; right: ExpressionNode };

function tokenize(expression: string): Token[] | string {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = rest.match(/^\d+(\.\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const name = rest.match(/^[a-z][a-z0-9_]*/);
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      index += name[0].length;
      continue;
    }
    const char = rest[0]!;
    if (char === "+" || char === "-" || char === "*" || char === "/") tokens.push({ kind: "operator", value: char });
    else if (char === "(") tokens.push({ kind: "open" });
    else if (char === ")") tokens.push({ kind: "close" });
    else return `unexpected character '${char}' at position ${index}`;
    index += 1;
  }
  return tokens;
}

/** Raised inside the parser to unwind to ``parseExpressionTree``. */
class ParseFailure extends Error {}

/** Parse an expression into its tree, or report why it does not parse. */
function parseExpressionTree(expression: string): { tree: ExpressionNode } | { error: string } {
  const tokens = tokenize(expression);
  if (typeof tokens === "string") return { error: tokens };
  if (tokens.length === 0) return { error: "expression is empty" };

  let position = 0;
  const peek = (): Token | undefined => tokens[position];

  const parseFactor = (): ExpressionNode => {
    const token = peek();
    if (!token) throw new ParseFailure("unexpected end of expression");
    position += 1;
    if (token.kind === "operator" && token.value === "-") return { kind: "negate", operand: parseFactor() };
    if (token.kind === "number") return { kind: "number", value: token.value };
    if (token.kind === "name") return { kind: "name", name: token.value };
    if (token.kind === "open") {
      const inner = parseSum();
      if (peek()?.kind !== "close") throw new ParseFailure("missing ')'");
      position += 1;
      return inner;
    }
    throw new ParseFailure("expected a number, a name or '('");
  };

  const parseBinary = (operators: ReadonlyArray<"+" | "-" | "*" | "/">, parseOperand: () => ExpressionNode): ExpressionNode => {
    let left = parseOperand();
    for (let token = peek(); token?.kind === "operator" && operators.includes(token.value); token = peek()) {
      position += 1;
      left = { kind: "binary", operator: token.value, left, right: parseOperand() };
    }
    return left;
  };
  const parseProduct = (): ExpressionNode => parseBinary(["*", "/"], parseFactor);
  const parseSum = (): ExpressionNode => parseBinary(["+", "-"], parseProduct);

  try {
    const tree = parseSum();
    if (position < tokens.length) return { error: "unexpected token after the end of the expression" };
    return { tree };
  } catch (failure) {
    if (failure instanceof ParseFailure) return { error: failure.message };
    throw failure;
  }
}

/** The variable names a tree uses, in order of first use. */
function namesIn(node: ExpressionNode, names: string[] = []): string[] {
  if (node.kind === "name" && !names.includes(node.name)) names.push(node.name);
  if (node.kind === "negate") namesIn(node.operand, names);
  if (node.kind === "binary") {
    namesIn(node.left, names);
    namesIn(node.right, names);
  }
  return names;
}

/**
 * Check a computed variable's expression and report the variable names it
 * uses, in order of first use. Never evaluates anything.
 */
export function parseVariableExpression(expression: string): ParsedExpression {
  const parsed = parseExpressionTree(expression);
  return "error" in parsed ? parsed : { names: namesIn(parsed.tree) };
}

function evaluateTree(node: ExpressionNode, values: Readonly<Record<string, number>>, expression: string): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "name": {
      const value = values[node.name];
      if (value === undefined) throw new Error(`expression '${expression}' uses '${node.name}', which has no value`);
      return value;
    }
    case "negate":
      return -evaluateTree(node.operand, values, expression);
    case "binary": {
      const left = evaluateTree(node.left, values, expression);
      const right = evaluateTree(node.right, values, expression);
      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      return left / right;
    }
  }
}

/**
 * Evaluate a computed variable's expression with ``values`` for its names
 * (engine#220): the grammar the validator checks (``E-VAR-EXPR``), parsed by
 * the same parser. Returns the IEEE result, so a division by zero gives
 * ``Infinity`` or ``NaN`` rather than an exception. Throws when the
 * expression does not parse (the message names the parse error, as
 * ``E-VAR-EXPR`` does) or uses a name without a value.
 */
export function evaluateExpression(expression: string, values: Readonly<Record<string, number>>): number {
  const parsed = parseExpressionTree(expression);
  if ("error" in parsed) throw new Error(`expression '${expression}' does not parse (${parsed.error})`);
  return evaluateTree(parsed.tree, values, expression);
}

/**
 * Every ``{{name}}`` in the string fields of a value, depth-first, with the
 * JSON-pointer path of the string that carries it. The top-level
 * ``variables`` block is skipped: an expression is not a reference.
 */
export function collectVariableReferences(value: unknown): VariableReference[] {
  const references: VariableReference[] = [];
  const walk = (node: unknown, path: string, isRoot: boolean): void => {
    if (typeof node === "string") {
      for (const match of node.matchAll(REFERENCE)) {
        const inner = match[1]!.trim();
        if (VARIABLE_NAME.test(inner)) references.push({ path, name: inner });
        else references.push({ path, name: null, raw: inner });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}/${index}`, false));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        if (isRoot && key === "variables") continue;
        walk(child, `${path}/${key}`, false);
      }
    }
  };
  walk(value, "", true);
  return references;
}

interface DeclaredVariable {
  name: string;
  min?: unknown;
  max?: unknown;
  step?: unknown;
  expression?: unknown;
}

/** The semantic rules over one exercise's ``variables`` and its references. */
export function variableIssues(exercise: object, path: string): VariableIssue[] {
  const issues: VariableIssue[] = [];
  // One issue per (id, path, params): a name repeated in one expression or one
  // field is one problem, not one per occurrence (engine#201).
  const reported = new Set<string>();
  const error = (id: string, at: string, message: string, params: Record<string, string | number>): void => {
    const key = JSON.stringify([id, at, params]);
    if (reported.has(key)) return;
    reported.add(key);
    issues.push({ severity: "error", id, path: at, message, params });
  };
  const declaredRaw = (exercise as { variables?: unknown }).variables;
  const declared: DeclaredVariable[] = Array.isArray(declaredRaw) ? (declaredRaw as DeclaredVariable[]) : [];
  // Only a parametric exercise is scanned: without variables, {{ is ordinary
  // text (a Jinja2 lesson has {{ server }} in its prompt and is not parametric).
  if (declared.length === 0) return issues;

  const known = new Set<string>();
  const used = new Set<string>();

  declared.forEach((variable, index) => {
    const at = `${path}/variables/${index}`;
    const hasRangeField = variable.min !== undefined || variable.max !== undefined || variable.step !== undefined;
    const rangeComplete = variable.min !== undefined && variable.max !== undefined;
    const hasExpression = typeof variable.expression === "string";

    if (hasExpression && hasRangeField) {
      error("E-VAR-KIND", at, `variable '${variable.name}' is either a range (min/max/step) or an expression, not both`, {
        name: variable.name,
        reason: "both",
      });
    } else if (!hasExpression && !rangeComplete) {
      error("E-VAR-KIND", at, `variable '${variable.name}' needs either 'min' and 'max' (sampled) or an 'expression' (computed)`, {
        name: variable.name,
        reason: "neither",
      });
    }
    if (known.has(variable.name)) {
      error("E-VAR-DUP", at, `variable '${variable.name}' is declared more than once`, { name: variable.name });
    }
    if (rangeComplete && !hasExpression && typeof variable.min === "number" && typeof variable.max === "number") {
      if (variable.min >= variable.max) {
        error("E-VAR-RANGE", at, `variable '${variable.name}': min (${variable.min}) must be below max (${variable.max})`, {
          name: variable.name,
          min: variable.min,
          max: variable.max,
        });
      }
    }
    if (hasExpression) {
      const parsed = parseVariableExpression(variable.expression as string);
      if ("error" in parsed) {
        error("E-VAR-EXPR", at, `variable '${variable.name}': expression does not parse (${parsed.error})`, {
          name: variable.name,
          parseError: parsed.error,
        });
      } else {
        for (const name of parsed.names) {
          if (known.has(name)) used.add(name);
          else {
            error(
              "E-VAR-UNDEFINED",
              at,
              `variable '${variable.name}' uses '${name}', which is not declared before it (an expression may only use earlier variables)`,
              { name, site: "expression", variable: variable.name },
            );
          }
        }
      }
    }
    known.add(variable.name);
  });

  for (const reference of collectVariableReferences(exercise)) {
    const at = `${path}${reference.path}`;
    if (reference.name === null) {
      error("E-VAR-REF", at, `'{{${reference.raw}}}' is not a variable name; put the expression into a computed variable and reference that`, {
        raw: reference.raw,
      });
    } else if (known.has(reference.name)) {
      used.add(reference.name);
    } else {
      error("E-VAR-UNDEFINED", at, `'{{${reference.name}}}' references a variable the exercise does not declare`, {
        name: reference.name,
        site: "reference",
      });
    }
  }

  declared.forEach((variable, index) => {
    if (!used.has(variable.name)) {
      issues.push({
        severity: "warning",
        id: "W-VAR-UNUSED",
        path: `${path}/variables/${index}`,
        message: `variable '${variable.name}' is declared but no field references it and no later expression uses it`,
        params: { name: variable.name },
      });
    }
  });
  return issues;
}
