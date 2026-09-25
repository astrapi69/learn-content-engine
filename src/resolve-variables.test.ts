import { describe, expect, it } from "vitest";

import * as engine from "./index.js";
import { formatVariableValue, resolveExerciseVariables, sampleVariable } from "./resolve-variables.js";
import type { ContentLessonExercise } from "./types/index.js";
import { evaluateExpression, parseVariableExpression } from "./variables.js";

/**
 * engine#220: the engine evaluates what it defines. It validated parametric
 * exercises (schema 1.14, engine#151) and left sampling, evaluation and
 * substitution to each consumer, so the reference app carried a second parser
 * for the same expression language. The first four describe blocks are the
 * app's own test cases (adaptive-learner
 * frontend/src/lib/exercises/variables/resolve-exercise-variables.test.ts on
 * develop), ported unchanged as the parity oracle; the blocks after them pin
 * what one grammar and one reference syntax change.
 */

/** A minimal free_text exercise, mirroring the docs' worked example
 *  (docs/lesson-format.md#variables-parametric-exercises). */
function makeParametricExercise(overrides: Partial<ContentLessonExercise> = {}): ContentLessonExercise {
  return {
    id: "e1",
    type: "free_text",
    prompt: "Was ist {{a}} + {{b}}?",
    card_ids: [],
    distractors: [],
    variables: [
      { name: "a", min: 1, max: 20 },
      { name: "b", min: 1, max: 20, step: 0.5 },
      { name: "sum", expression: "a + b", tolerance: 0.01 },
    ],
    accept: ["{{sum}}"],
    explanation: "Die Summe von {{a}} und {{b}} ist {{sum}}.",
    ...overrides,
  } as ContentLessonExercise;
}

describe("sampleVariable (app parity)", () => {
  it("draws an integer in [min, max] when step is absent", () => {
    for (let i = 0; i < 200; i++) {
      const value = sampleVariable({ name: "a", min: 1, max: 20 }, Math.random);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it("draws the minimum when random() returns 0", () => {
    expect(sampleVariable({ name: "a", min: 5, max: 9 }, () => 0)).toBe(5);
  });

  it("draws the maximum when random() approaches 1", () => {
    expect(sampleVariable({ name: "a", min: 5, max: 9 }, () => 0.999999)).toBe(9);
  });

  it("respects a fractional step, landing only on the grid", () => {
    for (let i = 0; i < 200; i++) {
      const value = sampleVariable({ name: "b", min: 1, max: 20, step: 0.5 }, Math.random);
      expect(Number.isInteger(Math.round((value - 1) / 0.5))).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it("never exceeds max on a step grid that doesn't divide evenly", () => {
    for (let i = 0; i < 100; i++) {
      const value = sampleVariable({ name: "c", min: 1, max: 10, step: 3 }, Math.random);
      expect(value).toBeLessThanOrEqual(10);
      expect([1, 4, 7, 10]).toContain(value);
    }
  });

  it("draws the sole value when min equals max", () => {
    expect(sampleVariable({ name: "a", min: 7, max: 7 }, Math.random)).toBe(7);
  });
});

describe("evaluateExpression (app parity)", () => {
  it("adds and subtracts left to right", () => {
    expect(evaluateExpression("a + b", { a: 1, b: 2 })).toBe(3);
    expect(evaluateExpression("a - b", { a: 5, b: 2 })).toBe(3);
    expect(evaluateExpression("a - b + a", { a: 5, b: 2 })).toBe(8);
  });

  it("multiplies and divides", () => {
    expect(evaluateExpression("a * b", { a: 3, b: 4 })).toBe(12);
    expect(evaluateExpression("a / b", { a: 12, b: 4 })).toBe(3);
  });

  it("respects multiplicative precedence over additive", () => {
    expect(evaluateExpression("a + b * c", { a: 1, b: 2, c: 3 })).toBe(7);
    expect(evaluateExpression("a * b + c", { a: 2, b: 3, c: 1 })).toBe(7);
  });

  it("respects parentheses", () => {
    expect(evaluateExpression("(a + b) * c", { a: 1, b: 2, c: 3 })).toBe(9);
    expect(evaluateExpression("a * (b + c)", { a: 3, b: 1, c: 2 })).toBe(9);
  });

  it("applies unary minus", () => {
    expect(evaluateExpression("-a", { a: 5 })).toBe(-5);
    expect(evaluateExpression("-a + b", { a: 5, b: 3 })).toBe(-2);
    expect(evaluateExpression("-(a + b)", { a: 5, b: 3 })).toBe(-8);
    expect(evaluateExpression("a - -b", { a: 5, b: 3 })).toBe(8);
  });

  it("parses decimal numeric literals", () => {
    expect(evaluateExpression("a + 0.5", { a: 1 })).toBe(1.5);
    expect(evaluateExpression("2.5 * 2", {})).toBe(5);
  });

  it("references variables declared earlier by name", () => {
    expect(evaluateExpression("price * quantity", { price: 3.5, quantity: 4 })).toBe(14);
  });

  it("throws on an undefined variable name", () => {
    expect(() => evaluateExpression("a + z", { a: 1 })).toThrow();
  });

  it("throws on malformed expressions", () => {
    expect(() => evaluateExpression("a +", { a: 1 })).toThrow();
    expect(() => evaluateExpression("(a + b", { a: 1, b: 2 })).toThrow();
    expect(() => evaluateExpression("a $ b", { a: 1, b: 2 })).toThrow();
  });
});

describe("formatVariableValue (app parity)", () => {
  it("formats a whole number without a decimal point", () => {
    expect(formatVariableValue(7, undefined)).toBe("7");
    expect(formatVariableValue(7, 0.5)).toBe("7");
  });

  it("formats a step-0.5 value with exactly one decimal, no float noise", () => {
    expect(formatVariableValue(1.5, 0.5)).toBe("1.5");
    expect(formatVariableValue(1.5000000001, 0.5)).toBe("1.5");
  });

  it("formats a step-0.25 value with exactly two decimals", () => {
    expect(formatVariableValue(1.25, 0.25)).toBe("1.25");
  });

  it("formats a computed (step-less) non-integer without long float noise", () => {
    expect(formatVariableValue(0.1 + 0.2, undefined)).toBe("0.3");
  });
});

describe("resolveExerciseVariables (app parity)", () => {
  it("passes an exercise without variables through unchanged (same reference)", () => {
    const exercise = makeParametricExercise({ variables: undefined });
    const resolved = resolveExerciseVariables(exercise);
    expect(resolved.exercise).toBe(exercise);
    expect(resolved.values).toEqual({});
  });

  it("passes an exercise with an empty variables array through unchanged", () => {
    const exercise = makeParametricExercise({ variables: [] });
    expect(resolveExerciseVariables(exercise).exercise).toBe(exercise);
  });

  it("does not mutate the input exercise", () => {
    const exercise = makeParametricExercise();
    const snapshot = JSON.parse(JSON.stringify(exercise));
    resolveExerciseVariables(exercise, { random: () => 0.5 });
    expect(exercise).toEqual(snapshot);
  });

  it("samples, evaluates in declaration order, and substitutes every occurrence", () => {
    const resolved = resolveExerciseVariables(makeParametricExercise(), { random: () => 0 });
    expect(resolved.values.a).toBe(1);
    expect(resolved.values.b).toBe(1);
    expect(resolved.values.sum).toBe(2);
    expect(resolved.exercise.prompt).toBe("Was ist 1 + 1?");
    expect(resolved.exercise.accept).toEqual(["2"]);
    expect(resolved.exercise.explanation).toBe("Die Summe von 1 und 1 ist 2.");
  });

  it("leaves no braces in the resolved exercise", () => {
    const resolved = resolveExerciseVariables(makeParametricExercise(), { random: () => 0.5 });
    expect(JSON.stringify(resolved.exercise)).not.toContain("{{");
  });

  it("never touches {{ in a lesson without variables (Jinja2 content stays literal)", () => {
    const exercise = makeParametricExercise({
      variables: undefined,
      prompt: "Render the template {{ server }} with Jinja2.",
      accept: ["{{ server }}"],
    });
    const resolved = resolveExerciseVariables(exercise);
    expect(resolved.exercise.prompt).toBe("Render the template {{ server }} with Jinja2.");
    expect(resolved.exercise.accept).toEqual(["{{ server }}"]);
  });

  it("substitutes across every string-bearing field, including nested structures", () => {
    const exercise = makeParametricExercise({
      type: "matching",
      prompt: "Match {{a}}",
      pairs: [{ left: "{{a}}", right: "{{b}}" }],
      hint: "hint {{a}}",
      sentence: "sentence {{b}}",
      distractors: ["{{a}} distractor"],
      ext_payload: { nested: { list: ["{{a}}", "plain"], value: "{{b}}" } },
    });
    const resolved = resolveExerciseVariables(exercise, { random: () => 0 });
    expect(resolved.exercise.prompt).toBe("Match 1");
    expect(resolved.exercise.pairs).toEqual([{ left: "1", right: "1" }]);
    expect(resolved.exercise.hint).toBe("hint 1");
    expect(resolved.exercise.sentence).toBe("sentence 1");
    expect(resolved.exercise.distractors).toEqual(["1 distractor"]);
    expect(resolved.exercise.ext_payload).toEqual({ nested: { list: ["1", "plain"], value: "1" } });
  });

  it("never substitutes id, stable_id or type", () => {
    const exercise = makeParametricExercise({ id: "e1", stable_id: "e1-stable" });
    const resolved = resolveExerciseVariables(exercise, { random: () => 0.5 });
    expect(resolved.exercise.id).toBe("e1");
    expect(resolved.exercise.stable_id).toBe("e1-stable");
    expect(resolved.exercise.type).toBe("free_text");
  });

  it("records the tolerance for an accept entry that is a pure variable reference", () => {
    const resolved = resolveExerciseVariables(makeParametricExercise(), { random: () => 0 });
    expect(resolved.toleranceByAcceptText.get("2")).toBe(0.01);
  });

  it("does not record a tolerance for an accept entry that only partially references a variable", () => {
    const resolved = resolveExerciseVariables(makeParametricExercise({ accept: ["The answer is {{sum}}"] }), { random: () => 0 });
    expect(resolved.toleranceByAcceptText.size).toBe(0);
  });

  it("replays persisted values instead of sampling fresh ones", () => {
    const resolved = resolveExerciseVariables(makeParametricExercise(), { values: { a: 4, b: 6, sum: 10 } });
    expect(resolved.values).toEqual({ a: 4, b: 6, sum: 10 });
    expect(resolved.exercise.prompt).toBe("Was ist 4 + 6?");
    expect(resolved.exercise.accept).toEqual(["10"]);
  });

  it("re-samples a variable missing from a partial replay payload", () => {
    const resolved = resolveExerciseVariables(makeParametricExercise(), { random: () => 0, values: { a: 4 } });
    expect(resolved.values.a).toBe(4);
    expect(resolved.values.b).toBe(1);
    expect(resolved.values.sum).toBe(5);
  });
});

describe("one grammar, one reference syntax (engine#220)", () => {
  it("evaluates exactly what the validator parses: every accepted expression evaluates", () => {
    const values = { a: 2, b: 4, c: 8 };
    for (const expression of ["a", "1", "0.25", "-a", "- - a", "a*(b-c)/2", "((a))", "a - -b * c", "  a+b  "]) {
      expect("names" in parseVariableExpression(expression), expression).toBe(true);
      expect(Number.isFinite(evaluateExpression(expression, values)), expression).toBe(true);
    }
  });

  it("rejects what the validator rejects (the app's copy accepted `.5` and a unary `+`)", () => {
    for (const expression of [".5", "+a", "a +", "a b", "2a", ""]) {
      expect("error" in parseVariableExpression(expression), expression).toBe(true);
      expect(() => evaluateExpression(expression, { a: 1, b: 2 }), expression).toThrow();
    }
  });

  it("names the parse error in the thrown message, as E-VAR-EXPR does", () => {
    expect(() => evaluateExpression("(a + b", { a: 1, b: 2 })).toThrow("missing ')'");
    expect(() => evaluateExpression("a + z", { a: 1 })).toThrow("'z'");
  });

  it("division by zero gives the IEEE value, as in the app (Infinity, not an exception)", () => {
    expect(evaluateExpression("a / b", { a: 1, b: 0 })).toBe(Infinity);
  });

  it("substitutes a reference written with spaces, `{{ a }}`, which the validator reads as `a` (the app left it literal)", () => {
    const exercise = makeParametricExercise({ prompt: "Was ist {{ a }} + {{b }}?", accept: ["{{ sum }}"] });
    const resolved = resolveExerciseVariables(exercise, { random: () => 0 });
    expect(resolved.exercise.prompt).toBe("Was ist 1 + 1?");
    expect(resolved.exercise.accept).toEqual(["2"]);
    expect(resolved.toleranceByAcceptText.get("2")).toBe(0.01);
  });

  it("leaves `{{...}}` that is not a variable name alone, as the validator does not read it as one", () => {
    const exercise = makeParametricExercise({ hint: "keep {{ a + b }} and {{unknown}}" });
    expect(resolveExerciseVariables(exercise, { random: () => 0 }).exercise.hint).toBe("keep {{ a + b }} and {{unknown}}");
  });

  it("keeps the declarations themselves unchanged", () => {
    const exercise = makeParametricExercise();
    expect(resolveExerciseVariables(exercise, { random: () => 0 }).exercise.variables).toEqual(exercise.variables);
  });

  it("is on the package root", () => {
    expect(engine.resolveExerciseVariables).toBe(resolveExerciseVariables);
    expect(engine.evaluateExpression).toBe(evaluateExpression);
  });
});
