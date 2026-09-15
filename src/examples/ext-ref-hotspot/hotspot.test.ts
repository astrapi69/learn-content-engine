import { describe, it, expect } from "vitest";

import { refHotspotExtension, renderRefHotspot, gradeRefHotspot } from "./hotspot-extension.js";
import { validateLesson } from "../../validate.js";
import type { Exercise } from "../../types/lesson-schema.generated.js";

/**
 * End-to-end proof of the extension seam with the reference extension
 * ext:ref-hotspot: a lesson declares + carries the ext type, the engine half
 * validates it through validateLesson's registry, and the consumer half
 * hit-tests a clicked point against the authored zones. Nothing here touches
 * core exercise types.
 */

const hotspotExercise = (zones: unknown): Exercise =>
  ({
    id: "e1",
    type: "ext:ref-hotspot",
    prompt: "Click the stop sign",
    ext_payload: { src: "signs.png", zones },
  }) as Exercise;

const lessonWith = (exercise: Exercise, requires: string[] = ["ext:ref-hotspot@1"]) => ({
  id: "l1",
  title: "Hotspot lesson",
  requires_extensions: requires,
  steps: [{ id: "s1", type: "exercise", exercise }],
});

const twoZones = [
  { shape: "rect", coords: [10, 10, 20, 20], is_correct: "true" },
  { shape: "circle", coords: [70, 70, 15] },
];

describe("ext:ref-hotspot end-to-end", () => {
  it("validates a declared + registered hotspot exercise", () => {
    const result = validateLesson(lessonWith(hotspotExercise(twoZones)), {
      extensions: [refHotspotExtension],
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("is refused loudly without the registry (E-EXT-UNSUPPORTED)", () => {
    const result = validateLesson(lessonWith(hotspotExercise(twoZones)));
    expect(result.errors.some((issue) => issue.id === "E-EXT-UNSUPPORTED")).toBe(true);
  });

  it("surfaces the extension's own payload errors", () => {
    const tooFew = validateLesson(lessonWith(hotspotExercise([twoZones[0]])), {
      extensions: [refHotspotExtension],
    });
    expect(tooFew.errors.some((issue) => issue.id === "E-EXT-REFHOTSPOT-MIN")).toBe(true);

    const badShape = validateLesson(
      lessonWith(hotspotExercise([{ shape: "triangle", coords: [1, 2, 3] }, twoZones[1]])),
      { extensions: [refHotspotExtension] },
    );
    expect(badShape.errors.some((issue) => issue.id === "E-EXT-REFHOTSPOT-SHAPETYPE")).toBe(true);

    const badCoords = validateLesson(
      lessonWith(hotspotExercise([{ shape: "rect", coords: [10, 10, 20], is_correct: "true" }, twoZones[1]])),
      { extensions: [refHotspotExtension] },
    );
    expect(badCoords.errors.some((issue) => issue.id === "E-EXT-REFHOTSPOT-COORDS")).toBe(true);

    const outOfRange = validateLesson(
      lessonWith(hotspotExercise([{ shape: "rect", coords: [10, 10, 20, 200], is_correct: "true" }, twoZones[1]])),
      { extensions: [refHotspotExtension] },
    );
    expect(outOfRange.errors.some((issue) => issue.id === "E-EXT-REFHOTSPOT-COORDS")).toBe(true);

    const noCorrect = validateLesson(
      lessonWith(hotspotExercise([{ shape: "rect", coords: [10, 10, 20, 20] }, twoZones[1]])),
      { extensions: [refHotspotExtension] },
    );
    expect(noCorrect.errors.some((issue) => issue.id === "E-EXT-REFHOTSPOT-CORRECT")).toBe(true);

    const twoCorrect = validateLesson(
      lessonWith(
        hotspotExercise([
          { shape: "rect", coords: [10, 10, 20, 20], is_correct: "true" },
          { shape: "circle", coords: [70, 70, 15], is_correct: "true" },
        ]),
      ),
      { extensions: [refHotspotExtension] },
    );
    expect(twoCorrect.errors.some((issue) => issue.id === "E-EXT-REFHOTSPOT-CORRECT")).toBe(true);
  });

  it("renders (consumer half) the prompt with the image reference and zone count", () => {
    const rendered = renderRefHotspot(hotspotExercise(twoZones));
    expect(rendered).toBe("Click the stop sign\n[image] signs.png\n2 zone(s)");
  });

  it("grades (consumer half) a rect hit inclusive of its edges, a distractor hit and a miss as incorrect", () => {
    const exercise = hotspotExercise(twoZones);
    expect(gradeRefHotspot(exercise, { x: 15, y: 15 })).toBe(true);
    expect(gradeRefHotspot(exercise, { x: 10, y: 10 })).toBe(true);
    expect(gradeRefHotspot(exercise, { x: 30, y: 30 })).toBe(true);
    expect(gradeRefHotspot(exercise, { x: 31, y: 31 })).toBe(false);
    expect(gradeRefHotspot(exercise, { x: 70, y: 70 })).toBe(false);
    expect(gradeRefHotspot(exercise, { x: 0, y: 0 })).toBe(false);
  });

  it("grades (consumer half) a circle hit inclusive of its radius", () => {
    const exercise = hotspotExercise([
      { shape: "rect", coords: [10, 10, 20, 20] },
      { shape: "circle", coords: [70, 70, 15], is_correct: "true" },
    ]);
    expect(gradeRefHotspot(exercise, { x: 70, y: 70 })).toBe(true);
    expect(gradeRefHotspot(exercise, { x: 85, y: 70 })).toBe(true);
    expect(gradeRefHotspot(exercise, { x: 86, y: 70 })).toBe(false);
    expect(gradeRefHotspot(exercise, { x: 15, y: 15 })).toBe(false);
  });

  it("grades a malformed payload as incorrect rather than throwing", () => {
    const exercise = hotspotExercise("not-an-array");
    expect(gradeRefHotspot(exercise, { x: 15, y: 15 })).toBe(false);
  });
});
