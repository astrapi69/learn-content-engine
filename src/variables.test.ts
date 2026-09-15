import { describe, it, expect } from "vitest";

import { collectVariableReferences, parseVariableExpression } from "./variables.js";

/**
 * The two pure halves of parametric exercises (engine#151): the expression
 * parser the engine uses to CHECK a computed variable (never to evaluate
 * it), and the reference scanner that finds every ``{{name}}`` in an
 * exercise's string fields.
 */

describe("parseVariableExpression", () => {
  it("accepts arithmetic over declared names and reports the names it uses, in order of first use", () => {
    expect(parseVariableExpression("a + b")).toEqual({ names: ["a", "b"] });
    expect(parseVariableExpression("(a + b) * 2 / c - -d")).toEqual({ names: ["a", "b", "c", "d"] });
    expect(parseVariableExpression("3.5 * radius * radius")).toEqual({ names: ["radius"] });
  });

  it("accepts a bare number or a bare name", () => {
    expect(parseVariableExpression("42")).toEqual({ names: [] });
    expect(parseVariableExpression("a")).toEqual({ names: ["a"] });
  });

  it("rejects incomplete, adjacent, unknown-operator and unbalanced input", () => {
    expect(parseVariableExpression("a +")).toHaveProperty("error");
    expect(parseVariableExpression("a b")).toHaveProperty("error");
    expect(parseVariableExpression("a ^ 2")).toHaveProperty("error");
    expect(parseVariableExpression("(a")).toHaveProperty("error");
    expect(parseVariableExpression("a)")).toHaveProperty("error");
    expect(parseVariableExpression("")).toHaveProperty("error");
    expect(parseVariableExpression("   ")).toHaveProperty("error");
  });

  it("rejects function calls and names outside the variable-name pattern", () => {
    expect(parseVariableExpression("sqrt(a)")).toHaveProperty("error");
    expect(parseVariableExpression("A + 1")).toHaveProperty("error");
    expect(parseVariableExpression("a.b")).toHaveProperty("error");
  });
});

describe("collectVariableReferences", () => {
  it("finds every {{name}} in every string field, nested and in arrays, with its path", () => {
    const references = collectVariableReferences({
      prompt: "What is {{a}} + {{ b }}?",
      accept: ["{{sum}}"],
      nested: { text: "{{a}} again" },
    });
    expect(references).toEqual([
      { path: "/prompt", name: "a" },
      { path: "/prompt", name: "b" },
      { path: "/accept/0", name: "sum" },
      { path: "/nested/text", name: "a" },
    ]);
  });

  it("reports a reference whose inside is not a plain name as malformed instead of dropping it", () => {
    expect(collectVariableReferences({ prompt: "{{a + b}}" })).toEqual([{ path: "/prompt", name: null, raw: "a + b" }]);
  });

  it("ignores non-string values and strings without a reference", () => {
    expect(collectVariableReferences({ n: 3, flag: true, prompt: "plain", list: [1, null] })).toEqual([]);
  });

  it("does not descend into the variables block itself (an expression is not a reference)", () => {
    expect(collectVariableReferences({ variables: [{ name: "a", expression: "{{b}}" }], prompt: "x" })).toEqual([]);
  });
});
