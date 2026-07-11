/**
 * QTI 2.x -> canonical {@link ContentLesson} import.
 *
 * One ``assessmentItem`` maps to one exercise step; an ``assessmentTest`` maps
 * to a lesson (one step per contained item). The mapping is the mappable subset
 * only - ``choiceInteraction`` -> ``multiple_choice``, ``textEntryInteraction``
 * -> ``free_text``, ``matchInteraction`` -> ``matching``. Anything else is
 * REFUSED loudly: every unmappable item is collected and reported together in a
 * {@link QtiImportError} (no silent skip). Imported lessons are gated through
 * ``validateLesson`` before they are returned, mirroring the migrate CLI.
 */

import { parseXml } from "@rgrove/parse-xml";
import type { XmlElement } from "@rgrove/parse-xml";

import type { LessonSourceAdapter } from "../content-engine.js";
import type { ContentLesson } from "../types/index.js";
import type { Exercise, Lesson, LessonStep } from "../types/lesson-schema.generated.js";
import { validateLesson } from "../validate.js";
import {
  attr,
  childNamed,
  childrenNamed,
  descendantsNamed,
  descendantsWhere,
  localName,
  textOf,
} from "./xml.js";

/** One reason an item could not be mapped, collected across the whole document. */
export interface QtiMappingIssue {
  itemIdentifier: string;
  interaction: string;
  reason: string;
}

/** Thrown when a QTI document cannot be mapped in full. ``issues`` is the
 *  complete per-item list so the caller sees every problem at once. */
export class QtiImportError extends Error {
  readonly issues: QtiMappingIssue[];
  constructor(message: string, issues: QtiMappingIssue[]) {
    super(message);
    this.name = "QtiImportError";
    this.issues = issues;
  }
}

const SUPPORTED_INTERACTIONS = new Set([
  "choiceInteraction",
  "textEntryInteraction",
  "matchInteraction",
]);

/** The QTI 2.x response metadata a mapping needs. */
interface ResponseInfo {
  cardinality: string;
  correctValues: string[];
  mapKeys: string[];
}

function identifierOf(element: XmlElement): string {
  return attr(element, "identifier") ?? "qti-item";
}

function responseFor(item: XmlElement, responseIdentifier: string): ResponseInfo {
  const declaration = childrenNamed(item, "responseDeclaration").find(
    (candidate) => attr(candidate, "identifier") === responseIdentifier,
  );
  const correctResponse = declaration && childNamed(declaration, "correctResponse");
  const correctValues = correctResponse
    ? childrenNamed(correctResponse, "value").map(textOf)
    : [];
  const mapping = declaration && childNamed(declaration, "mapping");
  const mapKeys = mapping
    ? childrenNamed(mapping, "mapEntry").map((entry) => attr(entry, "mapKey") ?? "")
    : [];
  return {
    cardinality: (declaration && attr(declaration, "cardinality")) ?? "single",
    correctValues,
    mapKeys,
  };
}

/** Prompt text: a block interaction's ``<prompt>``, else the first ``<p>`` in
 *  the item body (text-entry convention), else the item title. */
function promptOf(interaction: XmlElement, item: XmlElement): string {
  const prompt = childNamed(interaction, "prompt");
  if (prompt) return textOf(prompt);
  const itemBody = childNamed(item, "itemBody");
  const paragraph = itemBody && childNamed(itemBody, "p");
  if (paragraph) return textOf(paragraph);
  return attr(item, "title") ?? identifierOf(item);
}

function mapChoice(interaction: XmlElement, item: XmlElement, responses: ResponseInfo): Exercise {
  const correct = new Set(responses.correctValues);
  const options = childrenNamed(interaction, "simpleChoice").map((choice) => {
    const text = textOf(choice);
    return correct.has(attr(choice, "identifier") ?? "") ? { text, correct: true } : { text };
  });
  const exercise: Exercise = {
    id: identifierOf(item),
    type: "multiple_choice",
    prompt: promptOf(interaction, item),
    options,
  };
  if (responses.cardinality === "multiple") exercise.multiple = true;
  return exercise;
}

function mapTextEntry(interaction: XmlElement, item: XmlElement, responses: ResponseInfo): Exercise {
  return {
    id: identifierOf(item),
    type: "free_text",
    prompt: promptOf(interaction, item),
    accept: [...responses.correctValues, ...responses.mapKeys],
  };
}

function mapMatch(interaction: XmlElement, item: XmlElement, responses: ResponseInfo): Exercise {
  const contentById = new Map<string, string>();
  for (const set of childrenNamed(interaction, "simpleMatchSet")) {
    for (const choice of childrenNamed(set, "simpleAssociableChoice")) {
      contentById.set(attr(choice, "identifier") ?? "", textOf(choice));
    }
  }
  const pairs = responses.correctValues.map((value) => {
    const [source, target] = value.split(/\s+/);
    return { left: contentById.get(source ?? "") ?? "", right: contentById.get(target ?? "") ?? "" };
  });
  return { id: identifierOf(item), type: "matching", prompt: promptOf(interaction, item), pairs };
}

function mapItem(item: XmlElement): { exercise?: Exercise; issue?: QtiMappingIssue } {
  const itemIdentifier = identifierOf(item);
  const itemBody = childNamed(item, "itemBody");
  if (!itemBody) {
    return { issue: { itemIdentifier, interaction: "(none)", reason: "assessmentItem has no itemBody" } };
  }
  const interactions = descendantsWhere(itemBody, (element) => localName(element).endsWith("Interaction"));
  if (interactions.length === 0) {
    return { issue: { itemIdentifier, interaction: "(none)", reason: "no interaction element found" } };
  }
  if (interactions.length > 1) {
    return {
      issue: {
        itemIdentifier,
        interaction: interactions.map(localName).join("+"),
        reason: "multiple interactions in one item are not supported",
      },
    };
  }
  const interaction = interactions[0]!;
  const name = localName(interaction);
  if (!SUPPORTED_INTERACTIONS.has(name)) {
    return { issue: { itemIdentifier, interaction: name, reason: "unsupported QTI interaction" } };
  }
  const responses = responseFor(item, attr(interaction, "responseIdentifier") ?? "RESPONSE");
  if (name === "choiceInteraction") return { exercise: mapChoice(interaction, item, responses) };
  if (name === "textEntryInteraction") return { exercise: mapTextEntry(interaction, item, responses) };
  return { exercise: mapMatch(interaction, item, responses) };
}

/**
 * Parse QTI 2.x XML (a single ``assessmentItem`` or an ``assessmentTest`` with
 * inline items) into a canonical {@link ContentLesson}. Throws
 * {@link QtiImportError} when any item is unmappable, or when the produced
 * lesson fails ``validateLesson``. ``meta`` overrides the lesson id / title
 * otherwise taken from the QTI root.
 */
export function importQti(xml: string, meta: { id?: string; title?: string } = {}): ContentLesson {
  const root = parseXml(xml).root;
  if (!root) throw new QtiImportError("QTI document has no root element", []);
  const rootName = localName(root);
  const items = rootName === "assessmentItem" ? [root] : descendantsNamed(root, "assessmentItem");
  if (items.length === 0) {
    throw new QtiImportError("QTI document contains no assessmentItem elements", []);
  }

  const exercises: Exercise[] = [];
  const issues: QtiMappingIssue[] = [];
  for (const item of items) {
    const mapped = mapItem(item);
    if (mapped.issue) issues.push(mapped.issue);
    else if (mapped.exercise) exercises.push(mapped.exercise);
  }
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.itemIdentifier}: ${issue.interaction} (${issue.reason})`).join("; ");
    throw new QtiImportError(`QTI import failed: ${issues.length} item(s) could not be mapped - ${detail}`, issues);
  }

  const steps: LessonStep[] = exercises.map((exercise) => ({ id: exercise.id, type: "exercise", exercise }));
  const lesson: Lesson = {
    id: meta.id ?? attr(root, "identifier") ?? "qti-lesson",
    title: meta.title ?? attr(root, "title") ?? attr(items[0]!, "title") ?? "Imported QTI lesson",
    cards: [],
    steps,
  };

  const result = validateLesson(lesson);
  if (!result.valid) {
    const detail = result.errors.map((error) => `[${error.id}] ${error.path} ${error.message}`).join("; ");
    throw new QtiImportError(`QTI import produced an invalid lesson: ${detail}`, issues);
  }
  return lesson as ContentLesson;
}

/**
 * A {@link LessonSourceAdapter} that maps QTI 2.x XML at the ``parseLesson``
 * seam, injecting the set-context language pair / domain the QTI document does
 * not carry (mirrors ``singleJsonLessonAdapter``).
 */
export const qtiLessonAdapter: LessonSourceAdapter = (rawText, context) => {
  const lesson = importQti(rawText);
  return {
    ...lesson,
    target_language: lesson.target_language ?? context.target_language ?? context.language,
    source_language: lesson.source_language ?? context.source_language,
    domain: lesson.domain ?? context.domain,
  };
};
