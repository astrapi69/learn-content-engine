/**
 * The QTI 2.x / QTI 3.0 dialect difference, in three pure functions.
 *
 * QTI 3.0 (1EdTech, 2022) renamed every 2.x element to a ``qti-`` prefixed
 * kebab-case form (``choiceInteraction`` became ``qti-choice-interaction``)
 * and every multi-word attribute to kebab-case (``responseIdentifier`` became
 * ``response-identifier``); attribute VALUES such as ``directedPair`` and the
 * semantics of the mappable subset did not change. So the import and export
 * code keeps speaking 2.x names internally, and only the edges translate:
 * ``canonicalName`` on the way in, ``elementName`` /
 * ``attributeName`` on the way out.
 */

export type QtiVersion = "2.x" | "3.0";

export const QTI_2_NAMESPACE = "http://www.imsglobal.org/xsd/imsqti_v2p1";
export const QTI_3_NAMESPACE = "http://www.imsglobal.org/xsd/imsqtiasi_v3p0";

const QTI_3_PREFIX = "qti-";

const ROOT_ELEMENTS = new Set(["assessmentItem", "assessmentTest"]);

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

export function camelToKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** The 2.x spelling of an element or attribute name from either dialect. */
export function canonicalName(name: string): string {
  const bare = name.startsWith(QTI_3_PREFIX) ? name.slice(QTI_3_PREFIX.length) : name;
  return bare.includes("-") ? kebabToCamel(bare) : bare;
}

/** The spelling of a 2.x element name in the requested dialect. */
export function elementName(canonical: string, version: QtiVersion): string {
  return version === "3.0" ? `${QTI_3_PREFIX}${camelToKebab(canonical)}` : canonical;
}

/** The spelling of a 2.x attribute name in the requested dialect. */
export function attributeName(canonical: string, version: QtiVersion): string {
  return version === "3.0" ? camelToKebab(canonical) : canonical;
}

/**
 * Which dialect a document is in, from its root element's local name and
 * default namespace, or null when the root is not a QTI item or test at all.
 */
export function detectQtiVersion(rootLocalName: string, namespace: string | undefined): QtiVersion | null {
  if (!ROOT_ELEMENTS.has(canonicalName(rootLocalName))) return null;
  if (rootLocalName.startsWith(QTI_3_PREFIX) || namespace === QTI_3_NAMESPACE) return "3.0";
  return "2.x";
}
