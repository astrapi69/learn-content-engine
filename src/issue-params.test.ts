import { describe, it, expect } from "vitest";

import { lessonIdOrderingIssues } from "./set-ordering.js";
import { ISSUE_EMITTING_SOURCES, readSource } from "./test-support/emitters.js";
import { validateLesson, validateManifest, type ValidationIssue } from "./validate.js";

/**
 * engine#201: the values a rule interpolates into its message also travel as
 * structured ``params``, so a consumer that keeps its own wording (the
 * reference app, adaptive-learner#3222) can rebuild its message without
 * parsing English text. And no two issues the engine's own rules report are
 * indistinguishable: where several problems could share a path, each points at
 * its element, and a relation between several elements is told apart by its
 * params. E-SCHEMA (ajv's messages) and extension issues (paths relative to
 * their exercise) are outside that promise.
 */

interface StepInput {
  id: string;
  type: "theory" | "exercise";
  body?: string;
  exercise?: Record<string, unknown>;
}
const lesson = (steps: StepInput[], cards: Record<string, unknown>[] = []): Record<string, unknown> => ({
  id: "l1",
  title: "Lesson",
  steps,
  cards,
});
const ex = (exercise: Record<string, unknown>): StepInput => ({ id: "s1", type: "exercise", exercise });
const all = (lessonInput: Record<string, unknown>): ValidationIssue[] => {
  const { errors, warnings } = validateLesson(lessonInput);
  return [...errors, ...warnings];
};
const withId = (issues: ValidationIssue[], id: string): ValidationIssue[] => issues.filter((issue) => issue.id === id);

describe("reproductions (engine#201, adaptive-learner#3247)", () => {
  it("two duplicate-left groups in one exercise carry the term and positions of each", () => {
    const issues = withId(
      all(
        lesson([
          ex({
            id: "m1",
            type: "matching",
            prompt: "?",
            pairs: [
              { left: "Empathie", right: "a" },
              { left: "Salut", right: "b" },
              { left: "empathie", right: "c" },
              { left: "salut", right: "d" },
            ],
          }),
        ]),
      ),
      "E-MATCH-DUP-LEFT",
    );
    expect(issues.map((issue) => issue.params)).toEqual([
      { term: "Empathie", positions: [1, 3] },
      { term: "Salut", positions: [2, 4] },
    ]);
  });

  it("two unknown card references get one path each and carry the card id", () => {
    const issues = withId(
      all(
        lesson(
          [ex({ id: "f1", type: "free_text", prompt: "?", accept: ["x"], card_ids: ["c1", "keopi", "other"] })],
          [{ id: "c1", front: "a", back: "b" }],
        ),
      ),
      "E-CARD-REF",
    );
    expect(issues.map((issue) => [issue.path, issue.params])).toEqual([
      ["/steps/0/exercise/card_ids/1", { cardId: "keopi" }],
      ["/steps/0/exercise/card_ids/2", { cardId: "other" }],
    ]);
  });
});

// --- Every id that interpolates a value exposes it ------------------------


const manifest = (setExtras: Record<string, unknown> = {}, metadata?: Record<string, unknown>): Record<string, unknown> => ({
  schema_version: "1.2",
  name: "M",
  ...(metadata ? { metadata } : {}),
  sets: [{ id: "fr-a1", title: "X", target_language: "fr", level: "A1", version: "1.0.0", lesson_count: 1, ...setExtras }],
});
const manifestIssues = (input: Record<string, unknown>): ValidationIssue[] => {
  const { errors, warnings } = validateManifest(input);
  return [...errors, ...warnings];
};
const parametric = (variables: unknown, prompt = "{{a}}"): Record<string, unknown> =>
  lesson([ex({ id: "e1", type: "free_text", prompt, accept: ["x"], variables })]);

interface ParamCase {
  id: string;
  label: string;
  issues: () => ValidationIssue[];
  path: string;
  params: Record<string, unknown>;
}

/** One triggering input per id (and per variant) that carries values. */
const CASES: ParamCase[] = [
  {
    id: "E-TILES-ORDERING",
    label: "a non-permutation ordering, at its own index",
    issues: () => all(lesson([ex({ id: "w1", type: "word_tiles", prompt: "?", tiles: ["je", "suis", "ici"], accept_orderings: [[0, 1, 2], [0, 1]] })])),
    path: "/steps/0/exercise/accept_orderings/1",
    params: { ordering: [0, 1], maxIndex: 2 },
  },
  {
    id: "E-CLOZE-MS-DISJOINT",
    label: "an option in both accept and distractors",
    issues: () => all(lesson([ex({ id: "c1", type: "cloze", cloze_mode: "multiselect", prompt: "?", sentence: "Which are prime?", accept: ["2", "3"], distractors: ["3", "4"] })])),
    path: "/steps/0/exercise",
    params: { shared: ["3"] },
  },
  {
    id: "E-CLOZE-MARKERS",
    label: "one marker, two blanks",
    issues: () => all(lesson([ex({ id: "c1", type: "cloze", cloze_mode: "type", prompt: "?", sentence: "Paris is the capital of ___.", blanks: [{ accept: ["France"] }, { accept: ["x"] }] })])),
    path: "/steps/0/exercise",
    params: { markers: 1, blanks: 2 },
  },
  {
    id: "W-CLOZE-NO-CARRIER",
    label: "a select cloze of nothing but its blank",
    issues: () => all(lesson([ex({ id: "c1", type: "cloze", cloze_mode: "select", prompt: "Capital of France?", sentence: "___", blanks: [{ accept: ["Paris"] }], distractors: ["Lyon"] })])),
    path: "/steps/0/exercise/sentence",
    params: { nativeType: "multiple_choice" },
  },
  {
    id: "E-EXT-UNDECLARED",
    label: "an extension type the lesson does not declare",
    issues: () => all(lesson([ex({ id: "e1", type: "ext:test-order", prompt: "?", ext_payload: { items: ["a", "b"] } })])),
    path: "/steps/0/exercise",
    params: { type: "ext:test-order" },
  },
  {
    id: "E-EXT-UNSUPPORTED",
    label: "a declared extension without a registered validator",
    issues: () => all({ ...lesson([ex({ id: "e1", type: "ext:test-order", prompt: "?", ext_payload: { items: ["a", "b"] } })]), requires_extensions: ["ext:test-order@2"] }),
    path: "/steps/0/exercise",
    params: { type: "ext:test-order", major: 2 },
  },
  {
    id: "W-PROMPT-DUP",
    label: "variant sentence",
    issues: () => all(lesson([ex({ id: "c1", type: "cloze", cloze_mode: "multiselect", prompt: "Which are prime?", sentence: "Which are prime?", accept: ["2"], distractors: ["4"] })])),
    path: "/steps/0/exercise/prompt",
    params: { field: "sentence" },
  },
  {
    id: "W-PROMPT-DUP",
    label: "variant title",
    issues: () => all(lesson([{ id: "s1", type: "exercise", title: "Say hello.", exercise: { id: "f1", type: "free_text", prompt: "Say hello.", accept: ["bonjour"] } } as StepInput])),
    path: "/steps/0/exercise/prompt",
    params: { field: "title" },
  },
  {
    id: "W-CARD-UNUSED",
    label: "two cards no exercise references",
    issues: () => all(lesson([ex({ id: "f1", type: "free_text", prompt: "?", accept: ["x"] })], [{ id: "c1", front: "a", back: "b" }, { id: "c2", front: "c", back: "d" }])),
    path: "/cards",
    params: { count: 2, cardIds: ["c1", "c2"] },
  },
  {
    id: "W-INVISIBLE-CHAR",
    label: "two codepoints, the higher one first in the text: params follow the message's numeric order",
    issues: () => all(lesson([ex({ id: "f1", type: "free_text", prompt: "Say\uFEFFhello\u200B.", accept: ["x"] })])),
    path: "",
    params: {
      codepoints: ["U+200B", "U+FEFF"],
      names: ["ZERO WIDTH SPACE", "BYTE ORDER MARK"],
      occurrences: 2,
      paths: ["/steps/0/exercise/prompt"],
    },
  },
  {
    id: "E-STABLE-ID-DUP",
    label: "one stable_id on two exercises",
    issues: () =>
      all(
        lesson([
          { id: "s1", type: "exercise", exercise: { id: "f1", type: "free_text", prompt: "?", accept: ["x"], stable_id: "dup-m5k2p8qa" } },
          { id: "s2", type: "exercise", exercise: { id: "f2", type: "free_text", prompt: "!", accept: ["y"], stable_id: "dup-m5k2p8qa" } },
        ]),
      ),
    path: "/",
    params: { stableId: "dup-m5k2p8qa", elementKinds: ["exercise", "exercise"], elementIds: ["f1", "f2"] },
  },
  {
    id: "W-DOMAIN-UNKNOWN",
    label: "a lesson domain outside the vocabulary",
    issues: () => all({ ...lesson([ex({ id: "f1", type: "free_text", prompt: "?", accept: ["x"] })]), domain: "gardening" }),
    path: "/domain",
    params: { domain: "gardening" },
  },
  {
    id: "E-UNKNOWN-FIELD",
    label: "a field the lesson schema does not know",
    issues: () => all({ ...lesson([ex({ id: "f1", type: "free_text", prompt: "?", accept: ["x"] })]), colour: "blue" }),
    path: "/",
    params: { field: "colour" },
  },
  {
    id: "E-VAR-KIND",
    label: "variant both",
    issues: () => all(parametric([{ name: "a", min: 1, max: 3, expression: "1" }])),
    path: "/steps/0/exercise/variables/0",
    params: { name: "a", reason: "both" },
  },
  {
    id: "E-VAR-KIND",
    label: "variant neither",
    issues: () => all(parametric([{ name: "a", min: 1 }])),
    path: "/steps/0/exercise/variables/0",
    params: { name: "a", reason: "neither" },
  },
  {
    id: "E-VAR-DUP",
    label: "a name declared twice",
    issues: () => all(parametric([{ name: "a", min: 1, max: 3 }, { name: "a", min: 1, max: 3 }])),
    path: "/steps/0/exercise/variables/1",
    params: { name: "a" },
  },
  {
    id: "E-VAR-RANGE",
    label: "min above max",
    issues: () => all(parametric([{ name: "a", min: 5, max: 2 }])),
    path: "/steps/0/exercise/variables/0",
    params: { name: "a", min: 5, max: 2 },
  },
  {
    id: "E-VAR-EXPR",
    label: "an expression that does not parse",
    issues: () => all(parametric([{ name: "a", expression: "1 +" }])),
    path: "/steps/0/exercise/variables/0",
    params: { name: "a", parseError: expect.any(String) },
  },
  {
    id: "E-VAR-UNDEFINED",
    label: "variant expression",
    issues: () => all(parametric([{ name: "a", expression: "b * 2" }])),
    path: "/steps/0/exercise/variables/0",
    params: { name: "b", site: "expression", variable: "a" },
  },
  {
    id: "E-VAR-UNDEFINED",
    label: "variant reference",
    issues: () => all(parametric([{ name: "a", min: 1, max: 3 }], "{{a}} and {{b}}")),
    path: "/steps/0/exercise/prompt",
    params: { name: "b", site: "reference" },
  },
  {
    id: "E-VAR-REF",
    label: "a reference that is not a name",
    issues: () => all(parametric([{ name: "a", min: 1, max: 3 }], "{{a}} and {{a + 1}}")),
    path: "/steps/0/exercise/prompt",
    params: { raw: "a + 1" },
  },
  {
    id: "W-VAR-UNUSED",
    label: "a declared variable nothing uses, at its own index",
    issues: () => all(parametric([{ name: "a", min: 1, max: 3 }, { name: "z", min: 1, max: 3 }])),
    path: "/steps/0/exercise/variables/1",
    params: { name: "z" },
  },
  {
    id: "W-EVAL-GRADES-NO-FLOOR",
    label: "a grade table starting above 0",
    issues: () => manifestIssues(manifest({ evaluation: { scheme: "grades", grades: [{ min_percent: 90, label: "A" }, { min_percent: 50, label: "B" }] } })),
    path: "/sets/0/evaluation/grades",
    params: { floor: 50 },
  },
  {
    id: "W-RETIRED-IDS-DUP",
    label: "a retired id listed twice",
    issues: () => manifestIssues(manifest({}, { retired_ids: ["old-card-1", "old-card-1"] })),
    path: "/metadata/retired_ids",
    params: { retiredIds: ["old-card-1"] },
  },
  {
    id: "W-DOMAIN-UNKNOWN",
    label: "a set domain outside the vocabulary",
    issues: () => manifestIssues(manifest({ domain: "gardening" })),
    path: "/sets/0/domain",
    params: { domain: "gardening" },
  },
  {
    id: "W-LEVEL-UNKNOWN",
    label: "a free-text level",
    issues: () => manifestIssues(manifest({ level: "einsteiger" })),
    path: "/sets/0/level",
    params: { level: "einsteiger" },
  },
  {
    id: "W-SET-ORDER-MIXED-PREFIX",
    label: "prefixed and unprefixed ids",
    issues: () => lessonIdOrderingIssues(["01-a", "intro"]),
    path: "",
    params: { unprefixedIds: ["intro"] },
  },
  {
    id: "W-SET-ORDER-PREFIX-WIDTH",
    label: "prefixes of two widths",
    issues: () => lessonIdOrderingIssues(["001-a", "02-b"]),
    path: "",
    params: { widths: [2, 3] },
  },
  {
    id: "W-SET-ORDER-NUMERIC",
    label: "a lexicographic order that differs from the numeric one",
    issues: () => lessonIdOrderingIssues(["lesson-2", "lesson-10"]),
    path: "",
    params: { displayedFirst: "lesson-10", numericFirst: "lesson-2" },
  },
];

describe("params per rule id (engine#201)", () => {
  it.each(CASES.map((testCase) => [`${testCase.id}: ${testCase.label}`, testCase] as const))("%s", (_label, testCase) => {
    const matching = withId(testCase.issues(), testCase.id);
    expect(matching).toHaveLength(1);
    expect(matching[0]!.path).toBe(testCase.path);
    expect(matching[0]!.params).toEqual(testCase.params);
  });

  it("an id without values carries no params key at all", () => {
    const issues = all(lesson([ex({ id: "m1", type: "matching", prompt: "?", pairs: [] })]));
    const pairsIssue = withId(issues, "E-MATCH-PAIRS")[0]!;
    expect(pairsIssue).toBeDefined();
    expect("params" in pairsIssue).toBe(false);
  });

  it.each([
    [
      "a term and positions (E-MATCH-DUP-LEFT)",
      () => all(lesson([ex({ id: "m1", type: "matching", prompt: "?", pairs: [{ left: "a", right: "1" }, { left: "A", right: "2" }] })])),
      "E-MATCH-DUP-LEFT",
      "MATCHING left value 'a' is repeated at positions 1, 2; each left term must be unique (case-insensitive) so the pairing is solvable",
    ],
    [
      "numbers (E-CLOZE-MARKERS)",
      () => all(lesson([ex({ id: "c1", type: "cloze", cloze_mode: "type", prompt: "?", sentence: "a ___ b", blanks: [{ accept: ["x"] }, { accept: ["y"] }] })])),
      "E-CLOZE-MARKERS",
      "CLOZE marker count mismatch: sentence has 1 '___' markers but blanks has 2 entries",
    ],
    [
      "a list (W-CARD-UNUSED)",
      () => all(lesson([ex({ id: "f1", type: "free_text", prompt: "?", accept: ["x"] })], [{ id: "c1", front: "a", back: "b" }, { id: "c2", front: "c", back: "d" }])),
      "W-CARD-UNUSED",
      "2 cards are defined but never referenced by an exercise: c1, c2",
    ],
    [
      "a variables rule (E-VAR-RANGE)",
      () => all(parametric([{ name: "a", min: 5, max: 2 }])),
      "E-VAR-RANGE",
      "variable 'a': min (5) must be below max (2)",
    ],
  ])("the message is unchanged by the params: %s", (_label, issues, id, message) => {
    expect(withId(issues(), id)[0]!.message).toBe(message);
  });
});

// --- The coverage gate ------------------------------------------------------

/** Every emission site whose message can carry a value must pass params.
 *  Scanned from the source, so a new rule cannot ship a value in its text
 *  without exposing it. The default is strict: a message counts as constant
 *  only when it is one plain string literal, a template without `${`, or an
 *  UPPER_SNAKE constant; anything else (a template with values, a
 *  concatenation, a call, a variable) needs params. E-SCHEMA is exempt on
 *  purpose: its message is ajv's, and passing ajv's params through would make
 *  them engine API. */
const EXEMPT = new Set(["E-SCHEMA"]);

/** Argument positions per constructor: the message, and params when passed. */
const MESSAGE_ARG = { err: 2, warn: 2, makeIssue: 3, error: 2 } as const;
const PARAMS_ARG = { err: 4, warn: 4, makeIssue: 5, error: 3 } as const;

type Frame = { kind: "code"; depth: number } | { kind: "string"; quote: string } | { kind: "template" };

/**
 * Walk `text` from `from` and split it at top-level commas until the bracket
 * that closes the starting level. Aware of strings, template literals and
 * `${...}` expressions nested inside them, so a `)` or `,` inside a message
 * never ends an argument. Returns the pieces and the index after the closer.
 */
function splitTopLevel(text: string, from: number): { parts: string[]; end: number } {
  const stack: Frame[] = [{ kind: "code", depth: 0 }];
  const parts: string[] = [];
  let current = "";
  for (let i = from; i < text.length; i++) {
    const char = text[i]!;
    const top = stack[stack.length - 1]!;
    if (top.kind === "string" || top.kind === "template") {
      current += char;
      if (char === "\\") {
        current += text[++i] ?? "";
        continue;
      }
      if (top.kind === "string" && char === top.quote) stack.pop();
      else if (top.kind === "template" && char === "`") stack.pop();
      else if (top.kind === "template" && char === "$" && text[i + 1] === "{") {
        current += "{";
        i++;
        stack.push({ kind: "code", depth: 0 });
      }
      continue;
    }
    if (char === '"' || char === "'") {
      stack.push({ kind: "string", quote: char });
      current += char;
      continue;
    }
    if (char === "`") {
      stack.push({ kind: "template" });
      current += char;
      continue;
    }
    if ("([{".includes(char)) {
      top.depth++;
      current += char;
      continue;
    }
    if (")]}".includes(char)) {
      if (top.depth === 0 && stack.length === 1) {
        if (current.trim()) parts.push(current.trim());
        return { parts, end: i + 1 };
      }
      if (top.depth === 0 && char === "}") {
        stack.pop();
        current += char;
        continue;
      }
      top.depth--;
      current += char;
      continue;
    }
    if (char === "," && top.depth === 0 && stack.length === 1) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  throw new Error("unterminated argument list");
}

const CONSTANT_MESSAGE = [/^"(?:[^"\\]|\\.)*"$/, /^'(?:[^'\\]|\\.)*'$/, /^`(?:[^`\\$]|\\.|\$(?!\{))*`$/, /^[A-Z][A-Z0-9_]*$/];
const isConstantMessage = (message: string): boolean => CONSTANT_MESSAGE.some((form) => form.test(message));

interface EmissionSite {
  id: string;
  where: string;
  interpolates: boolean;
  passesParams: boolean;
}

/** The emission sites in one source text: calls of the issue constructors
 *  with a literal rule id, and object literals pushed with an `id:` key. */
function sitesIn(source: string, file: string): EmissionSite[] {
  const sites: EmissionSite[] = [];
  const lineOf = (index: number): number => source.slice(0, index).split("\n").length;
  const call = /\b(err|warn|makeIssue|error)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source))) {
    const { parts } = splitTopLevel(source, match.index + match[0].length);
    const idArg = parts.find((part) => /^"[EW]-[A-Z0-9-]+"$/.test(part));
    if (!idArg) continue;
    const kind = match[1] as keyof typeof MESSAGE_ARG;
    sites.push({
      id: idArg.slice(1, -1),
      where: `${file}:${lineOf(match.index)}`,
      interpolates: !isConstantMessage(parts[MESSAGE_ARG[kind]] ?? ""),
      passesParams: parts.length > PARAMS_ARG[kind],
    });
  }
  const pushed = /\bpush\(\s*\{/g;
  while ((match = pushed.exec(source))) {
    const { parts } = splitTopLevel(source, match.index + match[0].length);
    const property = (name: string): string | undefined => {
      const entry = parts.find((part) => part === name || part.startsWith(`${name}:`));
      return entry === undefined ? undefined : entry === name ? name : entry.slice(name.length + 1).trim();
    };
    const id = property("id");
    if (id === undefined || !/^"[EW]-[A-Z0-9-]+"$/.test(id)) continue;
    sites.push({
      id: id.slice(1, -1),
      where: `${file}:${lineOf(match.index)}`,
      interpolates: !isConstantMessage(property("message") ?? ""),
      passesParams: property("params") !== undefined,
    });
  }
  return sites;
}

const emissionSites = (): EmissionSite[] =>
  ISSUE_EMITTING_SOURCES.flatMap((file) => sitesIn(readSource(file), file));

const missingParams = (sites: EmissionSite[]): string[] =>
  sites.filter((site) => site.interpolates && !site.passesParams && !EXEMPT.has(site.id)).map((site) => `${site.id} at ${site.where}`);

describe("coverage gate: a value in the message means params (engine#201)", () => {
  const sites = emissionSites();

  it("finds exactly one site per rule id literal in the emitting sources (nothing is missed)", () => {
    const literals = ISSUE_EMITTING_SOURCES.flatMap((file) => [...readSource(file).matchAll(/"[EW]-[A-Z0-9-]+"/g)]).length;
    expect(literals).toBeGreaterThan(50);
    expect(sites).toHaveLength(literals);
  });

  it("every site that can carry a value passes params, except the declared exemption", () => {
    expect(missingParams(sites)).toEqual([]);
  });

  it("every id with params has a triggering case above", () => {
    const withParams = new Set(sites.filter((site) => site.passesParams).map((site) => site.id));
    const covered = new Set([...CASES.map((testCase) => testCase.id), "E-MATCH-DUP-LEFT", "E-CARD-REF"]);
    expect([...withParams].filter((id) => !covered.has(id)).sort()).toEqual([]);
  });

  it.each([
    ["a template with a value", 'issues.push(err("E-SEED", path, `value ${x}`, "a"));'],
    ["a concatenation", 'issues.push(warn("W-SEED", path, "unknown key " + key, "a"));'],
    ["a call", 'issues.push(err("E-SEED", path, describeFoo(items), "a"));'],
    ["a variable", 'issues.push(warn("W-SEED", path, description, "a"));'],
    ["a ) inside the template", 'issues.push(err("E-SEED", path, `step 1) ${x}`, "a"));'],
    ["an object literal with shorthand message", 'issues.push({ severity: "warning", id: "W-SEED", path, message });'],
    ["an object literal with ${path} before id", 'issues.push({ severity: "warning", path: `${path}/x`, id: "W-SEED", message: `v ${x}` });'],
  ])("flags a seeded site without params: %s", (_label, seeded) => {
    const found = sitesIn(seeded, "seed.ts");
    expect(found).toHaveLength(1);
    expect(missingParams(found)).toHaveLength(1);
  });

  it.each([
    ["a plain string", 'issues.push(err("E-SEED", path, "constant text", "a"));'],
    ["a constant", 'issues.push(warn("W-SEED", path, SEED_MESSAGE, "a"));'],
    ["a value with params", 'issues.push(err("E-SEED", path, `value ${x}`, "a", { x }));'],
    ["an object literal with params", 'issues.push({ severity: "warning", id: "W-SEED", path, message: `v ${x}`, params: { x } });'],
  ])("passes a seeded site that needs nothing more: %s", (_label, seeded) => {
    const found = sitesIn(seeded, "seed.ts");
    expect(found).toHaveLength(1);
    expect(missingParams(found)).toEqual([]);
  });
});

// --- The params table in the docs matches the code -------------------------

/** The `### Issue parameters` table of docs/lesson-format.md as id -> keys.
 *  Keys are the backticked lowercase identifiers of the second cell; quoted
 *  values and constants in it are not keys. */
function paramsTable(markdown: string): Map<string, string[]> {
  const start = markdown.indexOf("### Issue parameters");
  const section = markdown.slice(start, markdown.indexOf("\n## ", start));
  const table = new Map<string, string[]>();
  for (const line of section.split("\n")) {
    const row = /^\| `([EW]-[A-Z0-9-]+)` \| (.+) \|$/.exec(line);
    if (!row) continue;
    const keys = [...row[2]!.matchAll(/`([a-z][A-Za-z]*)`/g)].map((key) => key[1]!);
    table.set(row[1]!, [...new Set(keys)].sort());
  }
  return table;
}

/** The keys the code passes per id, from the triggering cases (all variants). */
function keysFromCases(): Map<string, string[]> {
  const keys = new Map<string, Set<string>>([
    ["E-MATCH-DUP-LEFT", new Set(["term", "positions"])],
    ["E-CARD-REF", new Set(["cardId"])],
  ]);
  for (const testCase of CASES) {
    const set = keys.get(testCase.id) ?? new Set<string>();
    for (const key of Object.keys(testCase.params)) set.add(key);
    keys.set(testCase.id, set);
  }
  return new Map([...keys].map(([id, set]) => [id, [...set].sort()]));
}

const tableDrift = (documented: Map<string, string[]>, coded: Map<string, string[]>): string[] => [
  ...[...coded.keys()].filter((id) => !documented.has(id)).map((id) => `${id}: missing from the table`),
  ...[...documented.keys()].filter((id) => !coded.has(id)).map((id) => `${id}: in the table, no params in the code`),
  ...[...coded]
    .filter(([id, keys]) => documented.has(id) && documented.get(id)!.join() !== keys.join())
    .map(([id, keys]) => `${id}: table says ${documented.get(id)!.join(", ")}, code passes ${keys.join(", ")}`),
];

describe("the Issue parameters table in lesson-format.md matches the code (engine#201)", () => {
  const documented = paramsTable(readSource("../docs/lesson-format.md"));

  it("reads the table (the scan is not blind)", () => {
    expect(documented.size).toBeGreaterThan(20);
  });

  it("lists exactly the ids that pass params, with exactly their keys", () => {
    const passing = new Set(emissionSites().filter((site) => site.passesParams).map((site) => site.id));
    expect([...documented.keys()].sort()).toEqual([...passing].sort());
    expect(tableDrift(documented, keysFromCases())).toEqual([]);
  });

  it("detects a seeded missing row and a seeded wrong key", () => {
    const seeded = "### Issue parameters\n\n| ID | `params` |\n|---|---|\n| `E-CARD-REF` | `cardIdx` |\n\n## Next\n";
    const coded = new Map([
      ["E-CARD-REF", ["cardId"]],
      ["E-TILES-ORDERING", ["maxIndex", "ordering"]],
    ]);
    expect(tableDrift(paramsTable(seeded), coded)).toEqual([
      "E-TILES-ORDERING: missing from the table",
      "E-CARD-REF: table says cardIdx, code passes cardId",
    ]);
  });
});

// --- No two issues of one result are indistinguishable -----------------------

const key = (issue: ValidationIssue): string => JSON.stringify([issue.id, issue.path, issue.params ?? null]);

describe("every issue of a result is distinguishable by id, path and params (engine#201)", () => {
  const MULTI: [string, () => ValidationIssue[]][] = [
    [
      "two duplicate-left groups",
      () =>
        all(lesson([ex({ id: "m1", type: "matching", prompt: "?", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }, { left: "A", right: "3" }, { left: "B", right: "4" }] })])),
    ],
    [
      "two bad orderings",
      () => all(lesson([ex({ id: "w1", type: "word_tiles", prompt: "?", tiles: ["a", "b", "c"], accept_orderings: [[0, 1], [2, 2, 2]] })])),
    ],
    [
      "two unknown card references",
      () => all(lesson([ex({ id: "f1", type: "free_text", prompt: "?", accept: ["x"], card_ids: ["p", "q"] })])),
    ],
    [
      "two duplicate stable_ids",
      () =>
        all(
          lesson([
            { id: "s1", type: "exercise", exercise: { id: "f1", type: "free_text", prompt: "?", accept: ["x"], stable_id: "dup-aaaaaaaa" } },
            { id: "s2", type: "exercise", exercise: { id: "f2", type: "free_text", prompt: "!", accept: ["y"], stable_id: "dup-aaaaaaaa" } },
            { id: "s3", type: "exercise", exercise: { id: "f3", type: "free_text", prompt: "?", accept: ["x"], stable_id: "dup-bbbbbbbb" } },
            { id: "s4", type: "exercise", exercise: { id: "f4", type: "free_text", prompt: "!", accept: ["y"], stable_id: "dup-bbbbbbbb" } },
          ]),
        ),
    ],
    ["two unused variables", () => all(parametric([{ name: "a", min: 1, max: 3 }, { name: "y", min: 1, max: 3 }, { name: "z", min: 1, max: 3 }]))],
    ["prompt equal to both sentence and title", () => all(lesson([{ id: "s1", type: "exercise", title: "Which are prime?", exercise: { id: "c1", type: "cloze", cloze_mode: "multiselect", prompt: "Which are prime?", sentence: "Which are prime?", accept: ["2"], distractors: ["4"] } } as StepInput]))],
  ];

  it.each(MULTI)("%s", (_label, issues) => {
    const produced = issues();
    expect(produced.length).toBeGreaterThan(1);
    expect(new Set(produced.map(key)).size).toBe(produced.length);
  });

  // A name repeated in one field or one expression is one problem: before
  // engine#201 each occurrence gave an identical issue.
  it("one undefined name used twice in one field is reported once", () => {
    expect(withId(all(parametric([{ name: "a", min: 1, max: 3 }], "{{a}} {{b}} {{b}}")), "E-VAR-UNDEFINED")).toHaveLength(1);
  });

  it("one non-name reference used twice in one field is reported once", () => {
    expect(withId(all(parametric([{ name: "a", min: 1, max: 3 }], "{{a}} {{a + 1}} {{a + 1}}")), "E-VAR-REF")).toHaveLength(1);
  });

  it("the same undefined name in two fields is reported once per field", () => {
    const issues = withId(
      all(lesson([ex({ id: "e1", type: "free_text", prompt: "{{a}} {{b}}", accept: ["{{b}}"], variables: [{ name: "a", min: 1, max: 3 }] })])),
      "E-VAR-UNDEFINED",
    );
    expect(issues.map((issue) => issue.path)).toEqual(["/steps/0/exercise/prompt", "/steps/0/exercise/accept/0"]);
  });
});
