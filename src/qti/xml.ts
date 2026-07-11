/**
 * Minimal typed accessors over ``@rgrove/parse-xml`` nodes. QTI documents use a
 * default namespace (element names arrive unprefixed) but some exporters prefix
 * them (``qti:choiceInteraction``); every lookup here compares the LOCAL name so
 * both shapes map identically.
 */

import type { XmlElement, XmlNode } from "@rgrove/parse-xml";

/** Local element name without any namespace prefix. */
export function localName(element: XmlElement): string {
  const colon = element.name.indexOf(":");
  return colon === -1 ? element.name : element.name.slice(colon + 1);
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

/** Attribute value, or ``undefined`` when absent. */
export function attr(element: XmlElement, key: string): string | undefined {
  return element.attributes[key];
}

/** Trimmed concatenated text of an element (all descendant text nodes). */
export function textOf(element: XmlElement): string {
  return element.text.trim();
}
