/**
 * Canonical {@link Lesson} -> QTI 2.x export, for the mappable subset
 * only (``multiple_choice`` -> ``choiceInteraction``, ``free_text`` ->
 * ``textEntryInteraction``, ``matching`` -> ``matchInteraction``). The lesson is
 * serialised as a single ``assessmentTest`` with inline ``assessmentItem``s (one
 * per exercise step), so ``importQti`` can read it straight back.
 *
 * Non-exercise (theory) steps have no QTI equivalent and are dropped (documented
 * fidelity limit, see docs/qti.md). An exercise whose type is outside the
 * mappable subset is REFUSED loudly via {@link QtiExportError} - never silently
 * skipped.
 */

import type { Exercise, Lesson } from "../types/lesson-schema.generated.js";

const QTI_NS = "http://www.imsglobal.org/xsd/imsqti_v2p1";
const MAPPABLE_TYPES = new Set(["multiple_choice", "free_text", "matching"]);

/** Thrown when a lesson carries an exercise type QTI export cannot represent. */
export class QtiExportError extends Error {
  readonly exerciseIds: string[];
  constructor(message: string, exerciseIds: string[]) {
    super(message);
    this.name = "QtiExportError";
    this.exerciseIds = exerciseIds;
  }
}

/** Escape the five XML markup characters in element text (umlauts and other
 *  non-ASCII stay verbatim UTF-8). */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape for a double-quoted attribute value. */
function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function choiceItem(exercise: Exercise): string {
  const options = exercise.options ?? [];
  const multiple = exercise.multiple === true;
  const correctValues = options
    .map((option, index) => (option.correct === true ? `        <value>OPT${index}</value>` : null))
    .filter((line): line is string => line !== null)
    .join("\n");
  const choices = options
    .map((option, index) => `        <simpleChoice identifier="OPT${index}">${escapeText(option.text)}</simpleChoice>`)
    .join("\n");
  return [
    `  <assessmentItem identifier="${escapeAttr(exercise.id)}" title="${escapeAttr(exercise.id)}" adaptive="false" timeDependent="false">`,
    `    <responseDeclaration identifier="RESPONSE" cardinality="${multiple ? "multiple" : "single"}" baseType="identifier">`,
    `      <correctResponse>`,
    correctValues,
    `      </correctResponse>`,
    `    </responseDeclaration>`,
    `    <itemBody>`,
    `      <choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="${multiple ? 0 : 1}">`,
    `        <prompt>${escapeText(exercise.prompt)}</prompt>`,
    choices,
    `      </choiceInteraction>`,
    `    </itemBody>`,
    `  </assessmentItem>`,
  ].join("\n");
}

function textEntryItem(exercise: Exercise): string {
  const accept = exercise.accept ?? [];
  const primary = accept[0] ?? "";
  const alternates = accept.slice(1);
  const mapping =
    alternates.length > 0
      ? [
          `      <mapping defaultValue="0">`,
          ...alternates.map((value) => `        <mapEntry mapKey="${escapeAttr(value)}" mappedValue="1"/>`),
          `      </mapping>`,
        ].join("\n")
      : "";
  return [
    `  <assessmentItem identifier="${escapeAttr(exercise.id)}" title="${escapeAttr(exercise.id)}" adaptive="false" timeDependent="false">`,
    `    <responseDeclaration identifier="RESPONSE" cardinality="single" baseType="string">`,
    `      <correctResponse>`,
    `        <value>${escapeText(primary)}</value>`,
    `      </correctResponse>`,
    mapping,
    `    </responseDeclaration>`,
    `    <itemBody>`,
    `      <p>${escapeText(exercise.prompt)}</p>`,
    `      <textEntryInteraction responseIdentifier="RESPONSE" expectedLength="20"/>`,
    `    </itemBody>`,
    `  </assessmentItem>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function matchItem(exercise: Exercise): string {
  const pairs = exercise.pairs ?? [];
  const correctValues = pairs.map((_pair, index) => `        <value>L${index} R${index}</value>`).join("\n");
  const leftSet = pairs
    .map((pair, index) => `        <simpleAssociableChoice identifier="L${index}" matchMax="1">${escapeText(pair.left)}</simpleAssociableChoice>`)
    .join("\n");
  const rightSet = pairs
    .map((pair, index) => `        <simpleAssociableChoice identifier="R${index}" matchMax="1">${escapeText(pair.right)}</simpleAssociableChoice>`)
    .join("\n");
  return [
    `  <assessmentItem identifier="${escapeAttr(exercise.id)}" title="${escapeAttr(exercise.id)}" adaptive="false" timeDependent="false">`,
    `    <responseDeclaration identifier="RESPONSE" cardinality="multiple" baseType="directedPair">`,
    `      <correctResponse>`,
    correctValues,
    `      </correctResponse>`,
    `    </responseDeclaration>`,
    `    <itemBody>`,
    `      <matchInteraction responseIdentifier="RESPONSE" shuffle="false" maxAssociations="0">`,
    `        <prompt>${escapeText(exercise.prompt)}</prompt>`,
    `        <simpleMatchSet>`,
    leftSet,
    `        </simpleMatchSet>`,
    `        <simpleMatchSet>`,
    rightSet,
    `        </simpleMatchSet>`,
    `      </matchInteraction>`,
    `    </itemBody>`,
    `  </assessmentItem>`,
  ].join("\n");
}

function itemFor(exercise: Exercise): string {
  if (exercise.type === "multiple_choice") return choiceItem(exercise);
  if (exercise.type === "free_text") return textEntryItem(exercise);
  return matchItem(exercise);
}

/**
 * Serialise a {@link Lesson} to a QTI 2.x ``assessmentTest`` document.
 * Throws {@link QtiExportError} listing any exercise whose type is outside the
 * mappable subset. Theory steps are dropped (documented fidelity limit).
 */
export function exportQti(lesson: Lesson): string {
  const exercises = lesson.steps
    .filter((step) => step.type === "exercise" && step.exercise != null)
    .map((step) => step.exercise as Exercise);

  const unmappable = exercises.filter((exercise) => !MAPPABLE_TYPES.has(exercise.type));
  if (unmappable.length > 0) {
    const ids = unmappable.map((exercise) => exercise.id);
    throw new QtiExportError(
      `QTI export cannot represent exercise type(s): ${unmappable.map((e) => `${e.id} (${e.type})`).join("; ")}`,
      ids,
    );
  }

  const items = exercises.map(itemFor).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<assessmentTest xmlns="${QTI_NS}" identifier="${escapeAttr(lesson.id)}" title="${escapeAttr(lesson.title)}">`,
    `  <testPart identifier="part1" navigationMode="linear" submissionMode="individual">`,
    `    <assessmentSection identifier="section1" title="${escapeAttr(lesson.title)}" visible="true">`,
    items,
    `    </assessmentSection>`,
    `  </testPart>`,
    `</assessmentTest>`,
    ``,
  ].join("\n");
}
