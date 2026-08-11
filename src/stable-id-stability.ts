/**
 * Stability comparison for `stable_id` (engine#90) - the PURE core.
 *
 * The schema can demand presence, format and per-document uniqueness. It can
 * never check that an id still points at the same element after an update,
 * because that needs the PREVIOUS version. This core takes the inventory of
 * the last published state and the inventory of the head and reports the
 * violations; reading git history and files is the shipped CLI's job
 * (`bin/learn-content-engine.mjs`), so the library stays I/O-free.
 *
 * Why this ships in the package instead of living as a script each content
 * repo copies: the schema claims stable identity in ALL consuming repos, so
 * the enforcement has to reach all of them. A vendored script reaches the one
 * repo that has it and drifts in the nine that copied it; a command that
 * arrives with the pinned release reaches every repo the moment it re-pins,
 * exactly like the validator rules do.
 */

/** One identity-bearing element as the gate sees it. */
export interface StableIdElement {
  /** Repo-relative set directory, e.g. ``sets/de/psych-intro``. */
  set: string;
  stableId: string;
  kind: "exercise" | "card" | "pair" | "blank" | "option";
  /** Exercise type, or ``"card"`` for cards (part of the reuse check). */
  type: string;
  /** Lesson FILE name; the filename is the lesson's identity. */
  lesson: string;
}

/** The state of one tree: its identity-bearing elements plus its lesson files.
 *  `retired` carries the tree's declared retirements (each set manifest's
 *  `metadata.retired_ids`, engine#131); absent means "none declared" and keeps
 *  pre-existing callers valid. */
export interface StableIdInventory {
  elements: StableIdElement[];
  lessons: { set: string; filename: string }[];
  retired?: { set: string; stableId: string }[];
}

/** One violation of the stability promise. */
export interface StabilityViolation {
  rule: "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
  set: string;
  message: string;
}

/** The comparison result, including the checked quantities so a caller can
 *  prove the run was not empty. */
export interface StabilityResult {
  violations: StabilityViolation[];
  checked: {
    baseIds: number;
    headIds: number;
    baseLessons: number;
    headLessons: number;
    baseRetired: number;
    headRetired: number;
  };
}

/** A lesson document with the fields the inventory reads. */
interface LessonInput {
  set: string;
  filename: string;
  lesson: unknown;
}

/** Build the inventory of a tree from its parsed lessons. */
export function buildStableIdInventory(lessons: LessonInput[]): StableIdInventory {
  const elements: StableIdElement[] = [];
  const files: { set: string; filename: string }[] = [];

  for (const { set, filename, lesson: raw } of lessons) {
    files.push({ set, filename });
    const lesson = (raw ?? {}) as {
      cards?: { stable_id?: unknown }[];
      steps?: {
        exercise?: {
          type?: unknown;
          stable_id?: unknown;
          pairs?: { stable_id?: unknown }[];
          blanks?: { stable_id?: unknown }[];
          options?: { stable_id?: unknown }[];
        };
      }[];
    };
    for (const card of lesson.cards ?? []) {
      if (typeof card?.stable_id === "string" && card.stable_id !== "") {
        elements.push({ set, stableId: card.stable_id, kind: "card", type: "card", lesson: filename });
      }
    }
    for (const step of lesson.steps ?? []) {
      const exercise = step?.exercise;
      if (!exercise) continue;
      const type = typeof exercise.type === "string" ? exercise.type : "?";
      if (typeof exercise.stable_id === "string" && exercise.stable_id !== "") {
        elements.push({ set, stableId: exercise.stable_id, kind: "exercise", type, lesson: filename });
      }
      const subElements: ["pair" | "blank" | "option", { stable_id?: unknown }[] | undefined][] = [
        ["pair", exercise.pairs],
        ["blank", exercise.blanks],
        ["option", exercise.options],
      ];
      for (const [kind, list] of subElements) {
        for (const entry of list ?? []) {
          if (typeof entry?.stable_id === "string" && entry.stable_id !== "") {
            elements.push({ set, stableId: entry.stable_id, kind, type, lesson: filename });
          }
        }
      }
    }
  }
  return { elements, lessons: files };
}

const keyOf = (element: { set: string; stableId: string }): string =>
  `${element.set}\u0000${element.stableId}`;

/**
 * Compare the published state against the head.
 *
 * Violations:
 * - **V1** a base id is gone from the head WITHOUT being declared in the
 *   head's `retired_ids` for its set. Declared retirement is the legal way
 *   out since engine#131 (the consumer archives the learner progress,
 *   adaptive-learner#2188); an undeclared disappearance stays a violation.
 * - **V2** an id is used more than once inside one set (set-wide uniqueness;
 *   the same id in two DIFFERENT sets is fine).
 * - **V3** an id points at another kind or exercise type than before (reuse
 *   smell: a card became an exercise, a matching became a cloze).
 * - **V4** a lesson FILE vanished while its set survived. The filename is the
 *   lesson's identity for progress joins; a whole set disappearing is a
 *   different, deliberate act and is reported through V1 only.
 * - **V5** a base retirement is gone from the head's list: a published
 *   retirement is never un-declared (add-only, like the ids themselves).
 * - **V6** a head retirement is still alive in the head: retired AND present
 *   is a contradiction - the consumer treats a resolvable id as living, so
 *   the declared retirement would be silently ignored.
 *
 * Editing content under a constant id is the allowed case and the entire
 * point of the promise.
 */
export function compareStableIdInventories(
  base: StableIdInventory,
  head: StableIdInventory,
): StabilityResult {
  const violations: StabilityViolation[] = [];

  const headByKey = new Map<string, StableIdElement[]>();
  for (const element of head.elements) {
    const bucket = headByKey.get(keyOf(element)) ?? [];
    bucket.push(element);
    headByKey.set(keyOf(element), bucket);
  }

  const headRetiredKeys = new Set((head.retired ?? []).map(keyOf));

  for (const element of base.elements) {
    const matches = headByKey.get(keyOf(element));
    if (!matches || matches.length === 0) {
      if (headRetiredKeys.has(keyOf(element))) continue;
      violations.push({
        rule: "V1",
        set: element.set,
        message: `stable_id '${element.stableId}' (${element.kind} in ${element.lesson}) disappeared without being declared in the set's retired_ids; declare the retirement or restore the element`,
      });
      continue;
    }
    const moved = matches.find((match) => match.kind !== element.kind || match.type !== element.type);
    if (moved) {
      violations.push({
        rule: "V3",
        set: element.set,
        message: `stable_id '${element.stableId}' moved from ${element.kind}/${element.type} to ${moved.kind}/${moved.type} (id reuse)`,
      });
    }
  }

  for (const [key, bucket] of headByKey) {
    if (bucket.length > 1) {
      const [set, stableId] = key.split("\u0000");
      violations.push({
        rule: "V2",
        set: set ?? "?",
        message: `stable_id '${stableId}' is used ${bucket.length} times in this set (${bucket
          .map((element) => `${element.kind} in ${element.lesson}`)
          .join(", ")})`,
      });
    }
  }

  for (const retirement of base.retired ?? []) {
    if (!headRetiredKeys.has(keyOf(retirement))) {
      violations.push({
        rule: "V5",
        set: retirement.set,
        message: `retired_id '${retirement.stableId}' left the set's retired_ids list; a published retirement is never un-declared`,
      });
    }
  }

  for (const retirement of head.retired ?? []) {
    if (headByKey.has(keyOf(retirement))) {
      violations.push({
        rule: "V6",
        set: retirement.set,
        message: `retired_id '${retirement.stableId}' is declared retired but still present in the set; a consumer resolves it as living, so the retirement would be silently ignored - remove the element or the declaration`,
      });
    }
  }

  const headLessonKeys = new Set(head.lessons.map((file) => `${file.set}\u0000${file.filename}`));
  const survivingSets = new Set(head.lessons.map((file) => file.set));
  for (const file of base.lessons) {
    if (!survivingSets.has(file.set)) continue;
    if (!headLessonKeys.has(`${file.set}\u0000${file.filename}`)) {
      violations.push({
        rule: "V4",
        set: file.set,
        message: `lesson file '${file.filename}' is gone while its set survives; the filename is the lesson's identity for progress joins`,
      });
    }
  }

  return {
    violations,
    checked: {
      baseIds: base.elements.length,
      headIds: head.elements.length,
      baseLessons: base.lessons.length,
      headLessons: head.lessons.length,
      baseRetired: (base.retired ?? []).length,
      headRetired: (head.retired ?? []).length,
    },
  };
}

/**
 * Is the comparison base a plausible predecessor of the head?
 *
 * A base that carries NO lessons yields no previous ids, so nothing can be
 * violated and the gate reports green precisely when it matters most: while
 * ids are being minted. That shape means a wrong, empty or unrelated ref (or
 * a genuinely first publication, which has to be stated explicitly), never a
 * clean run.
 *
 * A base WITH lessons but zero stable_ids is the normal mint-wave shape and
 * stays credible: that is exactly the state a minting PR starts from.
 */
export function isBaseCredible(checked: StabilityResult["checked"]): {
  credible: boolean;
  reason?: string;
} {
  if (checked.headLessons > 0 && checked.baseLessons === 0) {
    return {
      credible: false,
      reason:
        "the comparison base carries no lessons while the head does; an empty or unrelated base cannot prove stability (pass --allow-empty-base for a genuine first publication)",
    };
  }
  return { credible: true };
}

/** Human-readable report for a comparison, including the checked quantities. */
export function formatStabilityResult(result: StabilityResult): string {
  const lines = [
    `checked: ${result.checked.baseIds} base id(s) / ${result.checked.headIds} head id(s), ` +
      `${result.checked.baseLessons} base lesson(s) / ${result.checked.headLessons} head lesson(s), ` +
      `${result.checked.baseRetired} base retired / ${result.checked.headRetired} head retired`,
  ];
  if (result.violations.length === 0) {
    lines.push("ok: every published stable_id still points at its element");
    return lines.join("\n");
  }
  lines.push(`FAIL: ${result.violations.length} stability violation(s)`);
  for (const violation of result.violations) {
    lines.push(`  ${violation.rule} ${violation.set}: ${violation.message}`);
  }
  return lines.join("\n");
}
