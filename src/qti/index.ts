/**
 * QTI interop for learn-content-engine (subpath export
 * ``learn-content-engine/qti``): the 2.x dialect and, since 0.25.0, the 3.0
 * dialect (detected on import from the root element, chosen on export via
 * ``{ version: "3.0" }``).
 *
 * QTI (IMS Question and Test Interoperability) is the established interchange
 * format for assessment content; this adapter bridges the mappable subset to
 * the canonical lesson model at the same source->canonical boundary the core
 * engine draws. It lives behind a subpath so the XML parser dependency
 * (``@rgrove/parse-xml``) never enters the dependency-free core import.
 *
 * See docs/qti.md for the mapping table and fidelity limits. Activity tracking
 * (xAPI) is deliberately NOT part of this - tracking is a consumer
 * responsibility (docs/qti.md#activity-tracking).
 */

export { importQti, qtiLessonAdapter, QtiImportError } from "./import.js";
export type { QtiMappingIssue } from "./import.js";
export { exportQti, QtiExportError } from "./export.js";
export type { QtiExportOptions } from "./export.js";
export type { QtiVersion } from "./dialect.js";
export { QTI_2_NAMESPACE, QTI_3_NAMESPACE } from "./dialect.js";
