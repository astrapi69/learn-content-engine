/**
 * `mint-stable-ids` - the add-only minting core for the engine#90 retrofit.
 *
 * The whole no-migration argument of the retrofit rests on old and new
 * identity coexisting in one file: existing ids, content and FORMATTING must
 * stay byte-identical, only `stable_id` members may appear. A plain
 * parse/stringify round-trip would reformat inline-array lessons (the ansible
 * style) wholesale, so this core inserts at byte offsets found by a minimal
 * JSON scanner and then PROVES the add-only property on its own output:
 * the result re-parsed must equal the input re-parsed once the freshly
 * minted `stable_id`s are stripped. A file that fails that proof is reported
 * as failed and never returned for writing.
 *
 * Dry-run by default (the bin shim writes only under `--write`), matching
 * the `migrate` and `suggest-wiring` precedent.
 */

import { parseFileArgs, exitCodeFor, parseErrorLine, type FileReport } from "./file-command.js";

export interface MintArgs {
  paths: string[];
  write: boolean;
  json: boolean;
}

export interface MintReport extends FileReport {
  /** Number of stable_ids inserted (0 = already fully minted). */
  minted: number;
  /** Number of elements that WERE eligible, derived structurally from the
   *  parsed lesson, independent of the byte scanner. `minted` must equal this
   *  or the run failed: an incomplete mint is not a success. */
  eligible: number;
  /** The file text with insertions; present only when minted > 0 and the
   *  add-only self-proof held. */
  newText?: string;
}

/** Parse `mint-stable-ids <file...> [--write] [--json]`. Pure. */
export function parseMintArgs(argv: string[]): MintArgs | { error: string } {
  const parsed = parseFileArgs(
    "mint-stable-ids",
    argv,
    ["--write", "--json"],
    "mint-stable-ids <file...> [--write] [--json]",
    "usage: learn-content-engine mint-stable-ids <file...> [--write] [--json]",
  );
  if ("error" in parsed) return parsed;
  return { paths: parsed.paths, write: parsed.flags.has("--write"), json: parsed.flags.has("--json") };
}

/** Mints one id; injectable for deterministic tests. */
export type StableIdMinter = (kind: "exercise" | "card" | "pair" | "blank" | "option") => string;

const MINT_PREFIX: Record<"exercise" | "card" | "pair" | "blank" | "option", string> = {
  exercise: "ex",
  card: "card",
  pair: "pair",
  blank: "blank",
  option: "opt",
};

/** Default minter: opaque, time-seeded, unique within the process. */
export const defaultMinter: StableIdMinter = (() => {
  let sequence = 0;
  return (kind) => {
    sequence += 1;
    const time = Date.now().toString(36);
    const seq = sequence.toString(36).padStart(3, "0");
    const salt = Math.floor(Math.random() * 1296)
      .toString(36)
      .padStart(2, "0");
    return `${MINT_PREFIX[kind]}-${time}${seq}${salt}`;
  };
})();

interface InsertionTarget {
  kind: "exercise" | "card" | "pair" | "blank" | "option";
  /** Card/exercise: byte offset just after the closing quote of the `"id"`
   *  member value. Pair/blank/option (no `"id"` member to anchor on): byte
   *  offset of the object's own closing `}` - same "insert before the
   *  closing brace" style already used below for a card/exercise whose `id`
   *  happens to be the last member. */
  anchor: "afterIdValue" | "beforeCloseBrace";
  position: number;
  /** Indentation of the anchor line (for line-style insertion; unused for
   *  `beforeCloseBrace`, which always inserts inline like an id-last-member). */
  indent: string;
}

/**
 * Minimal JSON scanner: walks the raw text once, tracking the container path,
 * and records for every card object and exercise object WITHOUT a stable_id
 * the offset right behind its `"id"` member value. Only `cards[*]` and
 * `steps[*].exercise` objects are targets; the lesson id and step ids stay
 * untouched.
 */
function findTargets(raw: string): InsertionTarget[] {
  const lesson = JSON.parse(raw) as {
    cards?: { stable_id?: string }[];
    steps?: {
      exercise?: {
        stable_id?: string;
        pairs?: { stable_id?: string }[];
        blanks?: { stable_id?: string }[];
        options?: { stable_id?: string }[];
      };
    }[];
  };
  const wantsCard = (lesson.cards ?? []).map((card) => !card.stable_id);
  const wantsExercise = (lesson.steps ?? []).map((step) =>
    step.exercise ? !step.exercise.stable_id : false,
  );
  const subFlags = (list?: { stable_id?: string }[]) => (list ?? []).map((entry) => !entry?.stable_id);
  const wantsSub = (lesson.steps ?? []).map((step) => ({
    pair: subFlags(step.exercise?.pairs),
    blank: subFlags(step.exercise?.blanks),
    option: subFlags(step.exercise?.options),
  }));

  const targets: InsertionTarget[] = [];
  type Frame = { container: "object" | "array"; key: string | number | null; index: number };
  const stack: Frame[] = [];
  let pendingKey: string | null = null;
  let expectKey = false;
  let position = 0;

  const currentNames = (): (string | number | null)[] =>
    stack
      .filter((frame) => frame.container === "object" || frame.container === "array")
      .map((frame) => frame.key);

  const pathMatches = (): { kind: "exercise" | "card"; ordinal: number } | null => {
    // stack shape for a card object:    [{obj root}, {key cards -> array}, {array idx}]
    // for an exercise object: [{obj root}, {key steps}, {array idx}, {key exercise}]
    const names = currentNames();
    if (names.length === 3 && names[1] === "cards" && typeof names[2] === "number") {
      return { kind: "card", ordinal: names[2] };
    }
    if (
      names.length === 4 &&
      names[1] === "steps" &&
      typeof names[2] === "number" &&
      names[3] === "exercise"
    ) {
      return { kind: "exercise", ordinal: names[2] };
    }
    return null;
  };

  const SUB_KEY_TO_KIND = { pairs: "pair", blanks: "blank", options: "option" } as const;

  /** Matches while the scanner is INSIDE a pair/blank/option object, i.e.
   *  stack shape [{root}, {steps}, {N}, {exercise}, {pairs|blanks|options}, {M}]
   *  - checked at the object's closing `}`, before it is popped. */
  const subElementPathMatches = ():
    | { kind: "pair" | "blank" | "option"; exerciseOrdinal: number; subOrdinal: number }
    | null => {
    const names = currentNames();
    if (
      names.length === 6 &&
      names[1] === "steps" &&
      typeof names[2] === "number" &&
      names[3] === "exercise" &&
      typeof names[4] === "string" &&
      names[4] in SUB_KEY_TO_KIND &&
      typeof names[5] === "number"
    ) {
      return {
        kind: SUB_KEY_TO_KIND[names[4] as keyof typeof SUB_KEY_TO_KIND],
        exerciseOrdinal: names[2],
        subOrdinal: names[5],
      };
    }
    return null;
  };

  const readString = (): string => {
    // position sits ON the opening quote; returns content, leaves position after closing quote.
    let value = "";
    position += 1;
    while (position < raw.length) {
      const char = raw.charAt(position);
      if (char === "\\") {
        value += raw.slice(position, position + 2);
        position += 2;
        continue;
      }
      if (char === '"') {
        position += 1;
        return value;
      }
      value += char;
      position += 1;
    }
    throw new Error("unterminated string");
  };

  while (position < raw.length) {
    const char = raw.charAt(position);
    if (char === '"') {
      const start = position;
      const text = readString();
      if (expectKey) {
        pendingKey = text;
        expectKey = false;
      } else {
        if (pendingKey === "id") {
          const match = pathMatches();
          if (match) {
            const wanted = match.kind === "card" ? wantsCard[match.ordinal] : wantsExercise[match.ordinal];
            if (wanted) {
              const lineStart = raw.lastIndexOf("\n", start) + 1;
              const indent = /^[ \t]*/.exec(raw.slice(lineStart, start))?.[0] ?? "";
              targets.push({ kind: match.kind, anchor: "afterIdValue", position, indent });
            }
          }
        }
        // A consumed VALUE clears the pending key. Without this the key
        // survived into the next `{`, which then took it instead of its array
        // index, so its path stopped matching and every element after the
        // first was skipped (caught by the coverage ratchet on the first real
        // wave, not by the unit tests, which used single-element lessons).
        pendingKey = null;
      }
      continue;
    }
    if (char === "{") {
      stack.push({ container: "object", key: pendingKey ?? indexOfParent(stack), index: 0 });
      pendingKey = null;
      expectKey = true;
    } else if (char === "[") {
      stack.push({ container: "array", key: pendingKey ?? indexOfParent(stack), index: 0 });
      pendingKey = null;
    } else if (char === "}") {
      // Checked BEFORE the pop: subElementPathMatches() reads the frame for
      // the object that is about to close, which is still on the stack here.
      const subMatch = subElementPathMatches();
      if (subMatch && wantsSub[subMatch.exerciseOrdinal]?.[subMatch.kind][subMatch.subOrdinal]) {
        // Anchor right after the last member's VALUE, like the id-anchored
        // targets do - not at `}` itself, which would leave any whitespace
        // between the value and the brace stranded before the inserted comma.
        let insertAt = position;
        while (insertAt > 0 && /\s/.test(raw.charAt(insertAt - 1))) insertAt -= 1;
        targets.push({ kind: subMatch.kind, anchor: "beforeCloseBrace", position: insertAt, indent: "" });
      }
      stack.pop();
    } else if (char === "]") {
      stack.pop();
    } else if (char === ",") {
      const top = stack[stack.length - 1];
      if (top?.container === "object") expectKey = true;
      if (top?.container === "array") top.index += 1;
    } else if (char === ":") {
      // value follows; pendingKey stays until the value is consumed
    } else if (!/\s/.test(char)) {
      // literal or number value: consume it in one go
      pendingKey = null;
    }
    position += 1;
  }
  return targets;

  function indexOfParent(frames: Frame[]): number | null {
    const parent = frames[frames.length - 1];
    return parent?.container === "array" ? parent.index : null;
  }
}

/** How many exercises and cards of this lesson still lack a stable_id?
 *  Derived from the PARSED structure, deliberately not from the scanner, so
 *  the two can be compared. */
function countEligible(raw: string): number {
  const lesson = JSON.parse(raw) as {
    cards?: { stable_id?: string }[];
    steps?: {
      exercise?: {
        stable_id?: string;
        pairs?: { stable_id?: string }[];
        blanks?: { stable_id?: string }[];
        options?: { stable_id?: string }[];
      };
    }[];
  };
  const cards = (lesson.cards ?? []).filter((card) => !card?.stable_id).length;
  const exercises = (lesson.steps ?? []).filter(
    (step) => step?.exercise && !step.exercise.stable_id,
  ).length;
  const countUnminted = (list?: { stable_id?: string }[]) =>
    (list ?? []).filter((entry) => !entry?.stable_id).length;
  const subElements = (lesson.steps ?? []).reduce(
    (sum, step) =>
      sum +
      countUnminted(step?.exercise?.pairs) +
      countUnminted(step?.exercise?.blanks) +
      countUnminted(step?.exercise?.options),
    0,
  );
  return cards + exercises + subElements;
}

/** Strip every `stable_id` member from a parsed structure (for the proof). */
const stripStableIds = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (key, entry) => (key === "stable_id" ? undefined : entry));

/**
 * Insert `stable_id`s for every unminted exercise and card in `rawJson`,
 * format-preserving, and prove the add-only property before returning the
 * new text. Errors never throw; they come back as a failed report.
 */
export function mintStableIds(
  rawJson: string,
  path: string,
  minter: StableIdMinter = defaultMinter,
  options: { findTargetsLimit?: number } = {},
): MintReport {
  let targets: InsertionTarget[];
  let eligible: number;
  try {
    eligible = countEligible(rawJson);
    targets = findTargets(rawJson);
  } catch (error) {
    return {
      path,
      ok: false,
      minted: 0,
      eligible: 0,
      parseError: String(error instanceof Error ? error.message : error),
    };
  }
  // Test seam: shrink the scanner's result to simulate a scanner gap, so the
  // completeness rule is provable without waiting for the next real bug.
  if (options.findTargetsLimit !== undefined) {
    targets = targets.slice(0, options.findTargetsLimit);
  }
  // COMPLETENESS: the eligible count comes from the parsed structure, the
  // targets from the byte scanner. Two independent derivations of the same
  // number. When they disagree the scanner missed something, and an
  // incomplete mint must FAIL rather than report the part it managed - that
  // is how 2 of 8 once passed as success (the add-only proof only ever
  // answered whether anything ELSE moved).
  if (targets.length !== eligible) {
    return {
      path,
      ok: false,
      minted: 0,
      eligible,
      parseError: `incomplete mint: the scanner found ${targets.length} of ${eligible} eligible element(s); refusing to write a partial mint`,
    };
  }
  if (targets.length === 0) {
    return { path, ok: true, minted: 0, eligible };
  }

  let newText = "";
  let cursor = 0;
  for (const target of targets.sort((a, b) => a.position - b.position)) {
    newText += rawJson.slice(cursor, target.position);
    const stableId = minter(target.kind);
    if (target.anchor === "beforeCloseBrace") {
      // Pair/blank/option: no `"id"` member to anchor on, so `position` is
      // the object's own closing `}` and the insertion is always inline,
      // exactly like the "id is the last member" case below.
      newText += `, "stable_id": "${stableId}"`;
      cursor = target.position;
      continue;
    }
    const behind = rawJson.slice(target.position);
    if (/^,\s*\n/.test(behind)) {
      // line style: keep the id line as-is and add one full stable_id line
      // beneath it, indented like the id line. The original comma is consumed
      // and re-emitted before the insertion so the added line ends with the
      // comma the following member needs.
      newText += `,\n${target.indent}"stable_id": "${stableId}",`;
      cursor = target.position + 1;
    } else if (behind.startsWith(",")) {
      // inline style: `{ "id": "x", ... }` gains `, "stable_id": "..."` in place.
      newText += `, "stable_id": "${stableId}"`;
      cursor = target.position;
    } else {
      // id is the last member: append before the closing brace.
      newText += `, "stable_id": "${stableId}"`;
      cursor = target.position;
    }
  }
  newText += rawJson.slice(cursor);

  // The add-only proof: re-parse and compare with the input once the minted
  // ids are stripped. If ANYTHING else moved, refuse the result.
  try {
    const before = stripStableIds(JSON.parse(rawJson));
    const after = stripStableIds(JSON.parse(newText));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return { path, ok: false, minted: 0, eligible, parseError: "add-only proof failed: output differs beyond stable_id" };
    }
  } catch (error) {
    return { path, ok: false, minted: 0, eligible, parseError: `add-only proof failed: ${String(error)}` };
  }

  return { path, ok: true, minted: targets.length, eligible, newText };
}

/** Human/JSON output for a batch of mint reports. */
export function formatMintReports(
  reports: MintReport[],
  options: { json: boolean; write: boolean },
): { text: string; exitCode: number } {
  const exitCode = exitCodeFor(reports);
  if (options.json) {
    return { text: JSON.stringify(
      reports.map((report) => {
        const { newText, ...rest } = report;
        void newText;
        return rest;
      }),
      null,
      2,
    ), exitCode };
  }
  const lines: string[] = [];
  let mintedTotal = 0;
  for (const report of reports) {
    if (!report.ok) {
      lines.push(parseErrorLine(report));
      continue;
    }
    mintedTotal += report.minted;
    lines.push(`${report.minted === 0 ? "ok   " : "MINT "}${report.path}: ${report.minted} of ${report.eligible} eligible stable_id(s)`);
  }
  lines.push(`total: ${mintedTotal} stable_id(s) across ${reports.length} file(s)`);
  if (!options.write) lines.push("dry run - pass --write to apply");
  return { text: lines.join("\n"), exitCode };
}

export { exitCodeFor as mintExitCode };
