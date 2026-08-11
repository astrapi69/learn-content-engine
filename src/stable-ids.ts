/**
 * Set-wide stable_id view (engine#90).
 *
 * The JSON Schema validates one document and can therefore only see
 * duplicates inside one lesson; set-wide uniqueness is the repo gate's
 * job. This helper gives gates and harnesses that cross-lesson view
 * without teaching the engine about sets: the caller decides which
 * lessons form the scope.
 */

interface StableIdLocation {
  lessonId: string;
  kind: "exercise" | "card" | "pair" | "blank" | "option";
  elementId: string;
}

export interface StableIdDuplicate {
  stableId: string;
  locations: StableIdLocation[];
}

export interface StableIdReport {
  /** Number of stable_ids seen across all lessons (the checked quantity). */
  total: number;
  duplicates: StableIdDuplicate[];
}

interface LessonLike {
  id?: unknown;
  cards?: unknown;
  steps?: unknown;
}

/**
 * Collect every stable_id across the given lessons and report duplicates
 * with their locations. Elements without a stable_id are skipped (the
 * field is optional); `total` is the checked quantity so a run over
 * nothing stays visible to the caller.
 */
export function collectStableIds(lessons: unknown[]): StableIdReport {
  const seen = new Map<string, StableIdLocation[]>();
  let total = 0;

  const record = (stableId: unknown, location: StableIdLocation): void => {
    if (typeof stableId !== "string" || stableId === "") return;
    total += 1;
    const locations = seen.get(stableId) ?? [];
    locations.push(location);
    seen.set(stableId, locations);
  };

  for (const lessonInput of lessons) {
    const lesson = (lessonInput ?? {}) as LessonLike;
    const lessonId = typeof lesson.id === "string" ? lesson.id : "?";
    const cards = Array.isArray(lesson.cards) ? lesson.cards : [];
    for (const cardInput of cards) {
      const card = (cardInput ?? {}) as { id?: unknown; stable_id?: unknown };
      record(card.stable_id, {
        lessonId,
        kind: "card",
        elementId: typeof card.id === "string" ? card.id : "?",
      });
    }
    const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
    for (const stepInput of steps) {
      const step = (stepInput ?? {}) as {
        exercise?: {
          id?: unknown;
          stable_id?: unknown;
          pairs?: unknown;
          blanks?: unknown;
          options?: unknown;
        };
      };
      if (!step.exercise) continue;
      const exerciseId = typeof step.exercise.id === "string" ? step.exercise.id : "?";
      record(step.exercise.stable_id, { lessonId, kind: "exercise", elementId: exerciseId });

      const subElements: ["pair" | "blank" | "option", unknown][] = [
        ["pair", step.exercise.pairs],
        ["blank", step.exercise.blanks],
        ["option", step.exercise.options],
      ];
      for (const [kind, list] of subElements) {
        if (!Array.isArray(list)) continue;
        list.forEach((entryInput: unknown, index: number) => {
          const entry = (entryInput ?? {}) as { stable_id?: unknown };
          record(entry.stable_id, {
            lessonId,
            kind,
            elementId: `${exerciseId}.${kind}s[${index}]`,
          });
        });
      }
    }
  }

  const duplicates: StableIdDuplicate[] = [];
  for (const [stableId, locations] of seen) {
    if (locations.length > 1) duplicates.push({ stableId, locations });
  }
  return { total, duplicates };
}
