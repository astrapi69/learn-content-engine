/**
 * QTI 2.x interop for learn-content-engine (subpath export
 * ``learn-content-engine/qti``).
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
