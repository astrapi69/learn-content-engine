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
export type StableIdMinter = (kind: "exercise" | "card") => string;

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
    return `${kind === "card" ? "card" : "ex"}-${time}${seq}${salt}`;
  };
})();

interface InsertionTarget {
  kind: "exercise" | "card";
  /** Byte offset just after the closing quote of the `"id"` member value. */
  afterIdValue: number;
  /** Indentation of the `"id"` line (for line-style insertion). */
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
    steps?: { exercise?: { stable_id?: string } }[];
  };
  const wantsCard = (lesson.cards ?? []).map((card) => !card.stable_id);
  const wantsExercise = (lesson.steps ?? []).map((step) =>
    step.exercise ? !step.exercise.stable_id : false,
  );

  const targets: InsertionTarget[] = [];
  type Frame = { container: "object" | "array"; key: string | number | null; index: number };
  const stack: Frame[] = [];
  let pendingKey: string | null = null;
  let expectKey = false;
  let position = 0;

  const pathMatches = (): { kind: "exercise" | "card"; ordinal: number } | null => {
    // stack shape for a card object:    [{obj root}, {key cards -> array}, {array idx}]
    // for an exercise object: [{obj root}, {key steps}, {array idx}, {key exercise}]
    const names = stack
      .filter((frame) => frame.container === "object" || frame.container === "array")
      .map((frame) => frame.key);
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
      } else if (pendingKey === "id") {
        const match = pathMatches();
        if (match) {
          const wanted = match.kind === "card" ? wantsCard[match.ordinal] : wantsExercise[match.ordinal];
          if (wanted) {
            const lineStart = raw.lastIndexOf("\n", start) + 1;
            const indent = /^[ \t]*/.exec(raw.slice(lineStart, start))?.[0] ?? "";
            targets.push({ kind: match.kind, afterIdValue: position, indent });
          }
        }
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
    } else if (char === "}" || char === "]") {
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
): MintReport {
  let targets: InsertionTarget[];
  try {
    targets = findTargets(rawJson);
  } catch (error) {
    return { path, ok: false, minted: 0, parseError: String(error instanceof Error ? error.message : error) };
  }
  if (targets.length === 0) {
    return { path, ok: true, minted: 0 };
  }

  let newText = "";
  let cursor = 0;
  for (const target of targets.sort((a, b) => a.afterIdValue - b.afterIdValue)) {
    newText += rawJson.slice(cursor, target.afterIdValue);
    const stableId = minter(target.kind);
    const behind = rawJson.slice(target.afterIdValue);
    if (/^,\s*\n/.test(behind)) {
      // line style: keep the id line as-is and add one full stable_id line
      // beneath it, indented like the id line. The original comma is consumed
      // and re-emitted before the insertion so the added line ends with the
      // comma the following member needs.
      newText += `,\n${target.indent}"stable_id": "${stableId}",`;
      cursor = target.afterIdValue + 1;
    } else if (behind.startsWith(",")) {
      // inline style: `{ "id": "x", ... }` gains `, "stable_id": "..."` in place.
      newText += `, "stable_id": "${stableId}"`;
      cursor = target.afterIdValue;
    } else {
      // id is the last member: append before the closing brace.
      newText += `, "stable_id": "${stableId}"`;
      cursor = target.afterIdValue;
    }
  }
  newText += rawJson.slice(cursor);

  // The add-only proof: re-parse and compare with the input once the minted
  // ids are stripped. If ANYTHING else moved, refuse the result.
  try {
    const before = stripStableIds(JSON.parse(rawJson));
    const after = stripStableIds(JSON.parse(newText));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return { path, ok: false, minted: 0, parseError: "add-only proof failed: output differs beyond stable_id" };
    }
  } catch (error) {
    return { path, ok: false, minted: 0, parseError: `add-only proof failed: ${String(error)}` };
  }

  return { path, ok: true, minted: targets.length, newText };
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
    lines.push(`${report.minted === 0 ? "ok   " : "MINT "}${report.path}: ${report.minted} stable_id(s)`);
  }
  lines.push(`total: ${mintedTotal} stable_id(s) across ${reports.length} file(s)`);
  if (!options.write) lines.push("dry run - pass --write to apply");
  return { text: lines.join("\n"), exitCode };
}

export { exitCodeFor as mintExitCode };
