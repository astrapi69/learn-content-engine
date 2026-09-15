/**
 * Example extension ``ext:ref-hotspot`` - an image with clickable target
 * zones ("click the correct region of the image"), the visual-selection twin
 * of ``ext:ref-image-description``. Modelled on QTI 3.0's Hotspot Interaction
 * and H5P's Find the Hotspot, simplified to two shape primitives (rect,
 * circle) with percentage-based coordinates (0-100) so the payload stays
 * resolution-independent - the consumer maps percentages onto its own
 * rendered image size.
 *
 * The payload is self-contained (Option A, engine#68): no card reference,
 * everything the consumer needs is in ``ext_payload``. Zones mirror the core
 * ``picture_choice`` exactly-one-correct convention (``is_correct: "true"``)
 * for consistency rather than inventing a boolean. Overlapping zones are
 * permitted (real hotspot images sometimes have adjacent regions); the engine
 * validates zone SHAPE, not zone layout.
 *
 * Excluded from the published build (tsconfig.build); a production adoption
 * uses its own vendor namespace.
 */

import type { ExerciseExtension } from "../../extensions.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";
import type { ValidationIssue } from "../../validate.js";

const DOC_ANCHOR = "docs/extensions.md#example-extension-extref-hotspot";

type HotspotShape = "rect" | "circle";

interface HotspotZone {
  /** Not narrowed to HotspotShape here - an unknown shape is a payload error the loop below reports, not a parse failure. */
  shape: string;
  /** rect: [x, y, width, height]; circle: [cx, cy, radius] - all percentages (0-100) of the image. */
  coords: number[];
  is_correct?: "true";
}

/** The ``ext_payload`` shape ``ext:ref-hotspot`` expects. */
interface HotspotPayload {
  src: string;
  zones: HotspotZone[];
}

function issue(id: string, message: string): ValidationIssue {
  return { path: "/ext_payload", message, id, severity: "error", docAnchor: DOC_ANCHOR };
}

function isHotspotZone(value: unknown): value is HotspotZone {
  if (typeof value !== "object" || value === null) return false;
  const zone = value as { shape?: unknown; coords?: unknown; is_correct?: unknown };
  if (typeof zone.shape !== "string") return false;
  if (!Array.isArray(zone.coords) || !zone.coords.every((coord) => typeof coord === "number")) return false;
  if (zone.is_correct !== undefined && zone.is_correct !== "true") return false;
  return true;
}

/** Read the payload, or null when it is not shaped right. */
function asHotspotPayload(exercise: Exercise): HotspotPayload | null {
  const payload = exercise.ext_payload as { src?: unknown; zones?: unknown } | undefined;
  if (!payload) return null;
  if (typeof payload.src !== "string") return null;
  if (!Array.isArray(payload.zones) || !payload.zones.every(isHotspotZone)) return null;
  return { src: payload.src, zones: payload.zones as HotspotZone[] };
}

const expectedCoordCount: Record<HotspotShape, number> = { rect: 4, circle: 3 };

/** ENGINE half: validate one ``ext:ref-hotspot`` payload. */
export const refHotspotExtension: ExerciseExtension = {
  type: "ext:ref-hotspot",
  major: 1,
  validate(exercise: Exercise): ValidationIssue[] {
    const payload = asHotspotPayload(exercise);
    if (!payload) {
      return [
        issue(
          "E-EXT-REFHOTSPOT-SHAPE",
          "ext:ref-hotspot requires 'ext_payload' with src (string) and zones ([{shape, coords[], is_correct?}])",
        ),
      ];
    }
    const issues: ValidationIssue[] = [];
    if (payload.src.trim() === "") {
      issues.push(issue("E-EXT-REFHOTSPOT-SRC", "ext:ref-hotspot requires a non-empty image reference"));
    }
    if (payload.zones.length < 2) {
      issues.push(issue("E-EXT-REFHOTSPOT-MIN", "ext:ref-hotspot requires at least 2 zones"));
    }
    for (const zone of payload.zones) {
      if (zone.shape !== "rect" && zone.shape !== "circle") {
        issues.push(issue("E-EXT-REFHOTSPOT-SHAPETYPE", "ext:ref-hotspot zone shape must be 'rect' or 'circle'"));
        continue;
      }
      const expected = expectedCoordCount[zone.shape];
      const inRange = zone.coords.every((coord) => coord >= 0 && coord <= 100);
      if (zone.coords.length !== expected || !inRange) {
        issues.push(
          issue(
            "E-EXT-REFHOTSPOT-COORDS",
            `ext:ref-hotspot '${zone.shape}' zone requires exactly ${expected} coords, each a percentage 0-100`,
          ),
        );
      }
    }
    const correctCount = payload.zones.filter((zone) => zone.is_correct === "true").length;
    if (correctCount !== 1) {
      issues.push(issue("E-EXT-REFHOTSPOT-CORRECT", "ext:ref-hotspot requires exactly one zone with is_correct: 'true'"));
    }
    return issues;
  },
};

/**
 * CONSUMER half: render the prompt with the image reference and zone count.
 * A real consumer would mount its Canvas/SVG hotspot view here; this string
 * form keeps the demo framework-agnostic and testable. Deliberately omits
 * which zone is correct, matching image-description's no-spoiler stance.
 */
export function renderRefHotspot(exercise: Exercise): string {
  const payload = asHotspotPayload(exercise);
  if (!payload) return exercise.prompt;
  return [exercise.prompt, `[image] ${payload.src}`, `${payload.zones.length} zone(s)`].join("\n");
}

function pointInZone(zone: HotspotZone, x: number, y: number): boolean {
  if (zone.shape === "rect") {
    const [zx, zy, width, height] = zone.coords;
    return x >= zx! && x <= zx! + width! && y >= zy! && y <= zy! + height!;
  }
  const [cx, cy, radius] = zone.coords;
  const dx = x - cx!;
  const dy = y - cy!;
  return dx * dx + dy * dy <= radius! * radius!;
}

/**
 * CONSUMER half: grade a clicked point (percentages, same coordinate space as
 * the zones) by hit-testing every zone and checking whether the FIRST match
 * is the correct one. A malformed payload or a miss grades as incorrect
 * rather than throwing.
 */
export function gradeRefHotspot(exercise: Exercise, point: { x: number; y: number }): boolean {
  const payload = asHotspotPayload(exercise);
  if (!payload) return false;
  const hitZone = payload.zones.find((zone) => pointInZone(zone, point.x, point.y));
  return hitZone?.is_correct === "true";
}
