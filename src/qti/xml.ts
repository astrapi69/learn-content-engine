/**
 * Minimal typed accessors over ``@rgrove/parse-xml`` nodes. QTI documents use a
 * default namespace (element names arrive unprefixed) but some exporters prefix
 * them (``qti:choiceInteraction``); every lookup here compares the LOCAL name so
 * both shapes map identically. The local name is further normalised to the
 * QTI 2.x spelling, so a QTI 3.0 document (``qti-choice-interaction``,
 * ``response-identifier``) reads through the same accessors unchanged.
 */

import type { XmlElement, XmlNode } from "@rgrove/parse-xml";

import { camelToKebab, canonicalName } from "./dialect.js";

/** Local element name without any namespace prefix, as written in the document. */
export function rawLocalName(element: XmlElement): string {
  const colon = element.name.indexOf(":");
  return colon === -1 ? element.name : element.name.slice(colon + 1);
}

/** Local element name in its QTI 2.x spelling, whichever dialect wrote it. */
export function localName(element: XmlElement): string {
  return canonicalName(rawLocalName(element));
}

function isElement(node: XmlNode): node is XmlElement {
  return node.type === "element";
}

/** Direct element children (text / comment nodes dropped). */
export function elementChildren(element: XmlElement): XmlElement[] {
  return element.children.filter(isElement);
}

/** Direct element children whose local name equals ``name``. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return elementChildren(element).filter((child) => localName(child) === name);
}

/** First direct child whose local name equals ``name``, or ``undefined``. */
export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return childrenNamed(element, name)[0];
}

/** Every descendant (any depth, document order) whose local name equals ``name``. */
export function descendantsNamed(element: XmlElement, name: string): XmlElement[] {
  return descendantsWhere(element, (child) => localName(child) === name);
}

/** Every descendant (any depth, document order) matching ``predicate``. */
export function descendantsWhere(
  element: XmlElement,
  predicate: (element: XmlElement) => boolean,
): XmlElement[] {
  const found: XmlElement[] = [];
  for (const child of elementChildren(element)) {
    if (predicate(child)) found.push(child);
    found.push(...descendantsWhere(child, predicate));
  }
  return found;
}

/** Attribute value by its QTI 2.x name, or ``undefined`` when absent. A QTI 3.0
 *  document spells multi-word attributes in kebab-case; that spelling is tried
 *  second. */
export function attr(element: XmlElement, key: string): string | undefined {
  return element.attributes[key] ?? element.attributes[camelToKebab(key)];
}

/** Trimmed concatenated text of an element (all descendant text nodes). */
export function textOf(element: XmlElement): string {
  return element.text.trim();
}
