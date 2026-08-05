#!/usr/bin/env node
/**
 * Generate the two SCHEMA-DERIVED Mermaid diagrams in docs/schema-diagrams.md
 * (engine#117).
 *
 * A diagram is a second place for the same truth. It goes stale the moment
 * the schema moves, and the expensive part is not the edit - Mermaid is text -
 * but that nobody notices the edit is due. So the two diagrams whose content
 * lives in the schema are DERIVED from it, and `--check` fails when the
 * committed file no longer matches what the schema would produce.
 *
 * What is read, and what is deliberately NOT drawn:
 *   - Containment and cardinality come from `$defs` + `required` + array
 *     bounds (`maxItems`), so diagram 1 states only what the schema states.
 *   - The exercise-type list comes from the `ExerciseType` enum.
 *   - Per-type PAYLOAD is NOT in the schema: `Exercise` is a flat object with
 *     no `if`/`then`, `oneOf` or discriminator, so a `matching` exercise
 *     carrying cloze fields and no `pairs` is structurally valid (verified).
 *     Drawing a payload-per-type mapping would mean inventing it here or
 *     copying it from validate.ts - a second place for the same truth, which
 *     is the thing this file exists to prevent. Diagram 2 therefore shows the
 *     types and names the semantic layer as the owner of their payload.
 *
 * Input:  schema/lesson.schema.json
 * Output: docs/schema-diagrams.md, between the GENERATED markers
 *
 * Usage:
 *   node scripts/generate-schema-diagrams.mjs           # write
 *   node scripts/generate-schema-diagrams.mjs --check   # exit 1 on drift
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = join(REPO_ROOT, "schema", "lesson.schema.json");
const DOC_PATH = join(REPO_ROOT, "docs", "schema-diagrams.md");

const BEGIN = "<!-- GENERATED:schema-diagrams BEGIN - do not edit by hand, run scripts/generate-schema-diagrams.mjs -->";
const END = "<!-- GENERATED:schema-diagrams END -->";

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const defs = schema.$defs;

/** Required-ness of a property on a definition, as the schema states it. */
const isRequired = (definition, property) => (definition.required ?? []).includes(property);

/** Mermaid cardinality label for an array property, from the schema's own
 *  bounds. `required` decides whether the low end is 1 or 0.
 *
 *  NOT quoted: a `"` inside a `-->|label|` edge label is a parse error in
 *  Mermaid's flowchart grammar, and GitHub renders the error box instead of
 *  the diagram. The committed page shipped that way once, because the drift
 *  gate proved the file matched the generator and never proved the generator
 *  emits parseable Mermaid. */
function arrayCardinality(owner, propertyName) {
  const property = owner.properties[propertyName];
  const low = isRequired(owner, propertyName) ? (property.minItems ?? 1) : 0;
  const high = property.maxItems ?? "*";
  return `${low}..${high}`;
}

function contentStructureDiagram() {
  const root = schema;
  const step = defs.LessonStep;
  const lessonToSteps = arrayCardinality(root, "steps");
  const lessonToCards = arrayCardinality(root, "cards");
  const cardTags = arrayCardinality(defs.Card, "tags");
  const exerciseCardIds = arrayCardinality(defs.Exercise, "card_ids");
  const stepHasExercise = isRequired(step, "exercise") ? "1" : "0..1";
  return [
    "```mermaid",
    "graph TD",
    "    Lesson[Lesson]",
    "    LessonStep[LessonStep]",
    "    Exercise[Exercise]",
    "    Card[Card]",
    `    Lesson -->|steps ${lessonToSteps}| LessonStep`,
    `    Lesson -->|cards ${lessonToCards}| Card`,
    `    LessonStep -->|exercise ${stepHasExercise}| Exercise`,
    `    Exercise -.->|card_ids ${exerciseCardIds}, by id| Card`,
    `    Card -->|tags ${cardTags}| Tag[["tag (SlugId)"]]`,
    "```",
    "",
    "Solid arrows are containment: the child object is nested in the parent",
    "document. The dashed arrow is a reference BY STRING - `card_ids` holds",
    "`Card.id` values, and the schema alone cannot check that they resolve;",
    "the semantic layer does (`E-CARD-REF`). Cardinalities are the schema's",
    "own `required` plus `minItems`/`maxItems`.",
  ].join("\n");
}

function exerciseTypesDiagram() {
  const coreTypes = defs.ExerciseType.enum;
  const extPattern = defs.ExtExerciseType.pattern;
  const lines = [
    "```mermaid",
    "graph LR",
    `    ExerciseType["Exercise.type"]`,
    `    Core["core: closed enum (${coreTypes.length})"]`,
    `    Ext["extension: pattern<br/>${extPattern.replace(/\|/g, "\\|")}"]`,
    "    ExerciseType --> Core",
    "    ExerciseType --> Ext",
  ];
  for (const [index, typeName] of coreTypes.entries()) {
    lines.push(`    Core --> T${index}["${typeName}"]`);
  }
  lines.push("```");
  lines.push("");
  lines.push(
    `The schema knows ${coreTypes.length} core types as a closed enum, plus any`,
  );
  lines.push(
    "`ext:` type matching the pattern. Extension types are NOT enumerated in",
  );
  lines.push(
    "the schema: a lesson declares them in `requires_extensions`, and a",
  );
  lines.push(
    "consumer that has not registered one refuses the lesson (`E-EXT-UNSUPPORTED`).",
  );
  return lines.join("\n");
}

function generatedBlock() {
  return [
    BEGIN,
    "",
    `<!-- schema x-schema-version: ${schema["x-schema-version"]} -->`,
    "",
    "### 1. Content structure (generated)",
    "",
    contentStructureDiagram(),
    "",
    "### 2. Exercise types (generated)",
    "",
    exerciseTypesDiagram(),
    "",
    END,
  ].join("\n");
}

const block = generatedBlock();

// A run that produced no types or no cardinalities is a broken run, not a
// matching one (the floor rule from engine#93): an empty diagram would
// otherwise compare equal to an empty committed block and report OK.
const coreTypeCount = defs.ExerciseType.enum.length;
if (coreTypeCount === 0) {
  console.error("FATAL: the ExerciseType enum is empty - refusing to write an empty diagram.");
  process.exit(2);
}
if (!block.includes("-->|steps ")) {
  console.error("FATAL: the content-structure diagram lost its containment edges.");
  process.exit(2);
}

const existing = readFileSync(DOC_PATH, "utf8");
const beginIndex = existing.indexOf(BEGIN);
const endIndex = existing.indexOf(END);
if (beginIndex === -1 || endIndex === -1) {
  console.error(`FATAL: ${DOC_PATH} has no GENERATED markers.`);
  process.exit(2);
}
const next = existing.slice(0, beginIndex) + block + existing.slice(endIndex + END.length);

if (process.argv.includes("--check")) {
  if (next !== existing) {
    console.error(
      "DIAGRAM DRIFT: docs/schema-diagrams.md no longer matches the schema.\n" +
        "Run: node scripts/generate-schema-diagrams.mjs",
    );
    process.exit(1);
  }
  console.log(`docs/schema-diagrams.md is up to date (${coreTypeCount} exercise types checked).`);
  process.exit(0);
}

writeFileSync(DOC_PATH, next);
console.log(`Wrote docs/schema-diagrams.md (${coreTypeCount} exercise types).`);
