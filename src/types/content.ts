/**
 * Canonical content types — the consumer-facing surface (``Content*``) for the
 * App-authoritative lesson schema (EXP-039).
 *
 * Extracted from the Adaptive Learner app (`storage/types/content/content.ts`,
 * EXP-042) into this standalone engine. Only the types the content-engine
 * transform needs are kept here — the set-entry projection shape
 * ({@link ContentSetEntry}) and the canonical lesson shape
 * ({@link ContentLesson}). App-specific surfaces (the storage namespace, AI
 * validation, user-set import, lesson progress) stay in the app.
 *
 * SINGLE SOURCE OF TRUTH for the field SHAPES: the Pydantic models in
 * ``adaptive_learner_content_loader.schema`` → ``schema/lesson.schema.json`` →
 * ``lesson-schema.generated.ts``. The ``Content*`` names below are thin aliases
 * of those generated types, so there is no parallel hand-maintained mirror that
 * can drift.
 */

import type {
  Card as GeneratedCard,
  CardTokenRole as GeneratedCardTokenRole,
  ClozeBlank as GeneratedClozeBlank,
  Direction as GeneratedDirection,
  Exercise as GeneratedExercise,
  Lesson as GeneratedLesson,
  LessonResource as GeneratedLessonResource,
  LessonStep as GeneratedLessonStep,
  MediaType as GeneratedMediaType,
  TokenRole as GeneratedTokenRole,
} from "./lesson-schema.generated.js";

/**
 * Lifecycle status of a downloaded set. ``active`` is the default; ``deferred``
 * parks a set for later; ``completed`` marks it done.
 */
export type SetStatus = "active" | "deferred" | "completed";

/** The canonical projection of one content set (a manifest ``sets[]`` entry
 *  resolved against its cached state). Produced by ``asContentSetEntry``. */
export interface ContentSetEntry {
  source: string;
  branch: string;
  id: string;
  /** Title in the learner's SOURCE language (what they read in
   *  the browser, e.g. "Französisch A1 für Deutschsprachige"). */
  title: string;
  /** Optional title in the TARGET language (native script, e.g.
   *  "Français A1"), shown as a secondary label. */
  title_native?: string | null;
  /** Legacy alias for {@link target_language} — always equal to it. */
  language: string;
  /** BCP-47 code of the language the learner is LEARNING. */
  target_language: string;
  /** BCP-47 code of the language the learner ALREADY SPEAKS
   *  (the language the card backs / notes / theory are written
   *  in). Defaults to ``"en"`` for pre-v1.44.0 content. */
  source_language: string;
  level: string;
  domain: string;
  version: string;
  lesson_count: number;
  description: string | null;
  tags: string[];
  cover_image: string | null;
  cached_version: string | null;
  update_available: boolean;
  /** ISO-8601 timestamp of when this set was downloaded/cached, or ``null``. */
  downloaded_at?: string | null;
  /** Lifecycle status (active / deferred / completed); a missing value is
   *  treated as ``"active"``. */
  status?: SetStatus;
  /** Optional set-level book block. */
  book?: ContentSetBook | null;
}

/** A set's manifest-level book block. Mirrors the manifest \`sets[].book\`
 *  shape. */
export interface ContentSetBook {
  title: string;
  author?: string | null;
  url?: string | null;
  asin?: string | null;
}

/** Identifies where a set was fetched from (repo slug + branch). */
export interface ContentSetSource {
  source: string;
  branch: string;
}

/** Make the keys ``K`` of ``T`` required + non-null, deriving each value
 *  type from ``T`` (drift-safe: ``K extends keyof T``). */
type RequireKeys<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};

/** Card content kind (schema v1.3). Null/absent is treated as "text". */
export type ContentCardMediaType = NonNullable<GeneratedMediaType>;

/** Drill direction. ``target_to_source`` (default) is receptive;
 *  ``source_to_target`` is productive. */
export type ContentExerciseDirection = GeneratedDirection;

/** Closed grammatical-role enum for token annotations inside a card ``front``. */
export type ContentLessonCardTokenRoleName = GeneratedTokenRole;

/** One ``{token, role}`` annotation. */
export type ContentLessonCardTokenRole = GeneratedCardTokenRole;

/** One blank inside a CLOZE exercise's ``sentence``. */
export type ContentLessonClozeBlank = GeneratedClozeBlank;

/** One lesson-level supplementary-media entry (the raw shape stored in the
 *  content JSON). */
export type ContentLessonResource = GeneratedLessonResource;

/** The smallest learnable unit. ``tags`` is always present at runtime
 *  (``default_factory=list``). */
export type ContentLessonCard = RequireKeys<GeneratedCard, "tags">;

/** One exercise step. ``card_ids`` + ``distractors`` are always present at
 *  runtime (``default_factory=list``). */
export type ContentLessonExercise = RequireKeys<GeneratedExercise, "card_ids" | "distractors">;

/** One step in the lesson sequence. Re-wires ``exercise`` to the
 *  consumer-facing {@link ContentLessonExercise}. */
export type ContentLessonStep = Omit<GeneratedLessonStep, "exercise"> & {
  exercise?: ContentLessonExercise | null;
};

/** One lesson in a content set — the canonical internal lesson object. */
export type ContentLesson = Omit<GeneratedLesson, "cards" | "steps" | "estimated_minutes"> & {
  cards: ContentLessonCard[];
  estimated_minutes: NonNullable<GeneratedLesson["estimated_minutes"]>;
  steps: ContentLessonStep[];
};
