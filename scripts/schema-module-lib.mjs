/**
 * The pure half of generate-schema-module.mjs (engine#203), importable
 * without side effects so the test suite can pin the generated module to it
 * (src/schemas-generated.test.ts).
 */

/** Annotation keywords: they document a schema and never change what it
 *  accepts, so the validator's copy leaves them out (most of the schema's
 *  size is its descriptions). The JSON files keep them. */
const ANNOTATIONS = new Set(["description", "title", "$comment"]);
/** Keywords whose value maps NAMES to subschemas: the names are data (a
 *  property may be called `title`), only the subschemas are schemas. */
const SCHEMA_MAPS = new Set(["properties", "$defs", "patternProperties", "dependentSchemas"]);

/** A copy of a schema without its annotation keywords. */
export function stripAnnotations(node) {
  if (Array.isArray(node)) return node.map(stripAnnotations);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !ANNOTATIONS.has(key))
      .map(([key, value]) => [
        key,
        SCHEMA_MAPS.has(key)
          ? Object.fromEntries(Object.entries(value).map(([name, subschema]) => [name, stripAnnotations(subschema)]))
          : stripAnnotations(value),
      ]),
  );
}
