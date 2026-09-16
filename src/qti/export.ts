/**
 * Canonical {@link Lesson} -> QTI export, for the mappable subset only
 * (``multiple_choice`` -> ``choiceInteraction``, ``free_text`` ->
 * ``textEntryInteraction``, ``matching`` -> ``matchInteraction``), in the 2.x
 * dialect by default or the 3.0 dialect on request. The lesson is serialised as
 * a single ``assessmentTest`` with inline ``assessmentItem``s (one per exercise
 * step), so ``importQti`` can read it straight back.
 *
 * Non-exercise (theory) steps have no QTI equivalent and are dropped (documented
 * fidelity limit, see docs/qti.md). An exercise whose type is outside the
 * mappable subset is REFUSED loudly via {@link QtiExportError} - never silently
 * skipped.
 */

import type { Exercise, Lesson } from "../types/lesson-schema.generated.js";
import { attributeName, elementName, QTI_2_NAMESPACE, QTI_3_NAMESPACE, type QtiVersion } from "./dialect.js";

const MAPPABLE_TYPES = new Set(["multiple_choice", "free_text", "matching"]);

export interface QtiExportOptions {
  /** Dialect to emit; ``"2.x"`` (the default) or ``"3.0"``. */
  version?: QtiVersion;
}

/** Thrown when a lesson carries an exercise type QTI export cannot represent. */
export class QtiExportError extends Error {
  readonly exerciseIds: string[];
  constructor(message: string, exerciseIds: string[]) {
    super(message);
    this.name = "QtiExportError";
    this.exerciseIds = exerciseIds;
  }
}

/** The dialect-specific spellings an item template needs. */
interface Dialect {
  el(canonical: string): string;
  at(canonical: string): string;
  namespace: string;
}

function dialectFor(version: QtiVersion): Dialect {
  return {
    el: (canonical) => elementName(canonical, version),
    at: (canonical) => attributeName(canonical, version),
    namespace: version === "3.0" ? QTI_3_NAMESPACE : QTI_2_NAMESPACE,
  };
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

function itemOpen(exercise: Exercise, { el, at }: Dialect): string {
  const id = escapeAttr(exercise.id);
  return `  <${el("assessmentItem")} identifier="${id}" title="${id}" adaptive="false" ${at("timeDependent")}="false">`;
}

function choiceItem(exercise: Exercise, dialect: Dialect): string {
  const { el, at } = dialect;
  const options = exercise.options ?? [];
  const multiple = exercise.multiple === true;
  const correctValues = options
    .map((option, index) => (option.correct === true ? `        <${el("value")}>OPT${index}</${el("value")}>` : null))
    .filter((line): line is string => line !== null)
    .join("\n");
  const choices = options
    .map((option, index) => `        <${el("simpleChoice")} identifier="OPT${index}">${escapeText(option.text)}</${el("simpleChoice")}>`)
    .join("\n");
  return [
    itemOpen(exercise, dialect),
    `    <${el("responseDeclaration")} identifier="RESPONSE" cardinality="${multiple ? "multiple" : "single"}" ${at("baseType")}="identifier">`,
    `      <${el("correctResponse")}>`,
    correctValues,
    `      </${el("correctResponse")}>`,
    `    </${el("responseDeclaration")}>`,
    `    <${el("itemBody")}>`,
    `      <${el("choiceInteraction")} ${at("responseIdentifier")}="RESPONSE" shuffle="false" ${at("maxChoices")}="${multiple ? 0 : 1}">`,
    `        <${el("prompt")}>${escapeText(exercise.prompt)}</${el("prompt")}>`,
    choices,
    `      </${el("choiceInteraction")}>`,
    `    </${el("itemBody")}>`,
    `  </${el("assessmentItem")}>`,
  ].join("\n");
}

function textEntryItem(exercise: Exercise, dialect: Dialect): string {
  const { el, at } = dialect;
  const accept = exercise.accept ?? [];
  const primary = accept[0] ?? "";
  const alternates = accept.slice(1);
  const mapping =
    alternates.length > 0
      ? [
          `      <${el("mapping")} ${at("defaultValue")}="0">`,
          ...alternates.map(
            (value) => `        <${el("mapEntry")} ${at("mapKey")}="${escapeAttr(value)}" ${at("mappedValue")}="1"/>`,
          ),
          `      </${el("mapping")}>`,
        ].join("\n")
      : "";
  return [
    itemOpen(exercise, dialect),
    `    <${el("responseDeclaration")} identifier="RESPONSE" cardinality="single" ${at("baseType")}="string">`,
    `      <${el("correctResponse")}>`,
    `        <${el("value")}>${escapeText(primary)}</${el("value")}>`,
    `      </${el("correctResponse")}>`,
    mapping,
    `    </${el("responseDeclaration")}>`,
    `    <${el("itemBody")}>`,
    `      <p>${escapeText(exercise.prompt)}</p>`,
    `      <${el("textEntryInteraction")} ${at("responseIdentifier")}="RESPONSE" ${at("expectedLength")}="20"/>`,
    `    </${el("itemBody")}>`,
    `  </${el("assessmentItem")}>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function matchItem(exercise: Exercise, dialect: Dialect): string {
  const { el, at } = dialect;
  const pairs = exercise.pairs ?? [];
  const correctValues = pairs
    .map((_pair, index) => `        <${el("value")}>L${index} R${index}</${el("value")}>`)
    .join("\n");
  const choice = (id: string, text: string): string =>
    `        <${el("simpleAssociableChoice")} identifier="${id}" ${at("matchMax")}="1">${escapeText(text)}</${el("simpleAssociableChoice")}>`;
  const leftSet = pairs.map((pair, index) => choice(`L${index}`, pair.left)).join("\n");
  const rightSet = pairs.map((pair, index) => choice(`R${index}`, pair.right)).join("\n");
  return [
    itemOpen(exercise, dialect),
    `    <${el("responseDeclaration")} identifier="RESPONSE" cardinality="multiple" ${at("baseType")}="directedPair">`,
    `      <${el("correctResponse")}>`,
    correctValues,
    `      </${el("correctResponse")}>`,
    `    </${el("responseDeclaration")}>`,
    `    <${el("itemBody")}>`,
    `      <${el("matchInteraction")} ${at("responseIdentifier")}="RESPONSE" shuffle="false" ${at("maxAssociations")}="0">`,
    `        <${el("prompt")}>${escapeText(exercise.prompt)}</${el("prompt")}>`,
    `        <${el("simpleMatchSet")}>`,
    leftSet,
    `        </${el("simpleMatchSet")}>`,
    `        <${el("simpleMatchSet")}>`,
    rightSet,
    `        </${el("simpleMatchSet")}>`,
    `      </${el("matchInteraction")}>`,
    `    </${el("itemBody")}>`,
    `  </${el("assessmentItem")}>`,
  ].join("\n");
}

function itemFor(exercise: Exercise, dialect: Dialect): string {
  if (exercise.type === "multiple_choice") return choiceItem(exercise, dialect);
  if (exercise.type === "free_text") return textEntryItem(exercise, dialect);
  return matchItem(exercise, dialect);
}

/**
 * Serialise a {@link Lesson} to a QTI ``assessmentTest`` document in the 2.x
 * dialect (default) or the 3.0 dialect (``{ version: "3.0" }``). Throws
 * {@link QtiExportError} listing any exercise whose type is outside the
 * mappable subset. Theory steps are dropped (documented fidelity limit).
 */
export function exportQti(lesson: Lesson, options: QtiExportOptions = {}): string {
  const dialect = dialectFor(options.version ?? "2.x");
  const { el, at } = dialect;
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

  const items = exercises.map((exercise) => itemFor(exercise, dialect)).join("\n");
  const title = escapeAttr(lesson.title);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<${el("assessmentTest")} xmlns="${dialect.namespace}" identifier="${escapeAttr(lesson.id)}" title="${title}">`,
    `  <${el("testPart")} identifier="part1" ${at("navigationMode")}="linear" ${at("submissionMode")}="individual">`,
    `    <${el("assessmentSection")} identifier="section1" title="${title}" visible="true">`,
    items,
    `    </${el("assessmentSection")}>`,
    `  </${el("testPart")}>`,
    `</${el("assessmentTest")}>`,
    ``,
  ].join("\n");
}
