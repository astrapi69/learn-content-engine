# QTI interop

[QTI](https://www.imsglobal.org/question/index.html) (IMS Question and Test
Interoperability) is the established interchange format for assessment content.
`learn-content-engine` ships an optional **QTI 2.x adapter** that maps the
mappable subset of QTI to and from the canonical lesson model, at the same
source-to-canonical boundary the core engine draws
([architecture.md](architecture.md)).

The adapter lives behind a **subpath export** so its XML-parser dependency
(`@rgrove/parse-xml`, zero transitive dependencies) never enters the
dependency-free core import:

```ts
import { importQti, exportQti, QtiImportError } from "learn-content-engine/qti";

const lesson = importQti(qtiXml);          // QTI 2.x XML -> ContentLesson
const xml = exportQti(lesson);             // ContentLesson -> QTI 2.x XML
```

It also plugs into the `parseLesson` seam as a source adapter:

```ts
import { parseLesson } from "learn-content-engine";
import { qtiLessonAdapter } from "learn-content-engine/qti";

const lesson = parseLesson(qtiXml, setContext, qtiLessonAdapter);
```

This adapter targets **QTI 2.x**. A future 3.0 reader plugs in as a second
mapping layer without changing the canonical shape.

## Mapping table

| QTI 2.x interaction | response cardinality | Engine exercise type | Mapping |
|---|---|---|---|
| `choiceInteraction` | `single` | `multiple_choice` (`multiple` omitted) | `simpleChoice` -> option; `correctResponse` identifiers -> `correct: true` |
| `choiceInteraction` | `multiple` | `multiple_choice` (`multiple: true`) | every `correctResponse` identifier -> a correct option |
| `textEntryInteraction` | `single` (`string`) | `free_text` | `correctResponse` value(s) + `mapping` `mapEntry` keys -> `accept[]` |
| `matchInteraction` | `multiple` (`directedPair`) | `matching` | each directed pair -> `{ left, right }`, resolved against both `simpleMatchSet`s |

The prompt is taken from the interaction's `<prompt>` (choice / match) or the
item body's first `<p>` (text entry), falling back to the item `title`.

### Rejected on import (loud, never silent)

Any interaction outside the table above is **refused**. Import collects every
unmappable item and throws a single `QtiImportError` whose `issues` array lists
each one (`itemIdentifier`, `interaction`, `reason`) - there is no silent skip.
Refused cases include `orderInteraction`, `associateInteraction`,
`gapMatchInteraction`, `hotspotInteraction`, `inlineChoiceInteraction`,
`extendedTextInteraction`, `sliderInteraction`, `uploadInteraction`, an item
with **no** interaction, an item with **more than one** interaction, and an item
without an `itemBody`.

Imported lessons are additionally gated through `validateLesson`; an import that
would produce an invalid lesson throws rather than returning it (same discipline
as the `migrate` CLI).

## Import

A single `assessmentItem` becomes a one-step lesson; an `assessmentTest` becomes
a lesson with one step per contained item (lesson `id` / `title` from the test's
`identifier` / `title`, overridable via the `meta` argument). Items may be
inline inside the test - a self-contained convenience over QTI's usual
one-item-per-file layout with `assessmentItemRef` hrefs.

## Export

`exportQti(lesson)` serialises the lesson as one `assessmentTest` with inline
`assessmentItem`s, one per exercise step, so `importQti` reads it straight back.
Only the mappable subset is representable: an exercise whose type is outside the
subset throws `QtiExportError` listing the offending exercise ids.

## Round-trip guarantee

For a lesson whose steps are all mappable exercise types (`multiple_choice`,
`free_text`, `matching`), the following holds by content:

```ts
importQti(exportQti(lesson))  // equals `lesson` on the guaranteed subset
```

The guaranteed subset is: the lesson `id` and `title`, and for every exercise
its `id`, `type`, `prompt`, the per-type payload (`options`, `accept`, `pairs`)
and the `multiple` flag. `cards` come back as `[]`.

## Fidelity limits

| Aspect | Behaviour |
|---|---|
| Theory steps | Dropped on export - QTI has no theory item. |
| `cards` / `card_ids` | Not represented; QTI items are standalone. Imported lessons have `cards: []`. |
| Step `id` | Normalised to the exercise / item `identifier` on import. |
| `free_text` multiple `accept` | Round-trips: first entry in `correctResponse`, the rest as `mapping` `mapEntry` keys. |
| `hint`, `examples`, `direction`, `distractors` | Not carried across the QTI boundary. |
| `shuffle`, timing, scoring, `responseProcessing` | Not preserved (import ignores; export emits neutral defaults). |
| Unsupported interaction types | Import throws `QtiImportError` with the full per-item list. |

## Scope and non-goals

The adapter maps the three exercise types with a faithful QTI 2.x interaction
(`multiple_choice`, `free_text`, `matching`) and refuses the rest loudly. That
subset is deliberate, and expanding it is intentionally NOT on the roadmap
unless a concrete QTI consumer needs it. The reasoning:

- **The remaining core types have QTI equivalents, but with fidelity cost.**
  `word_tiles` maps to `orderInteraction` (losing `accept_orderings` - QTI has
  one correct order); `cloze` maps to inline `textEntryInteraction` /
  `inlineChoiceInteraction` / `choiceInteraction` by mode; `picture_choice`
  maps to `choiceInteraction` with image objects, but only usefully if the
  importing system can resolve the asset paths (the engine bundles no assets).
  `word_tiles -> orderInteraction` is the one clean, low-cost addition if
  completeness is wanted for its own sake.
- **QTI 2.x is not the lever for the teacher / LMS use case.** Native question
  import varies by LMS and is often partial or plugin-based; Moodle's native
  format is Moodle XML, not QTI 2.x. A Moodle-XML (or Canvas) exporter would be
  a consumer-specific tool, not a framework-agnostic engine adapter - the same
  boundary that keeps xAPI and persistence in the consumer (see below). If that
  path is ever wanted, it belongs in consumer tooling.
- **Extension (`ext:`) types never map.** Their payload is opaque to the core;
  QTI export refuses them by the same contract that refuses them everywhere.

So the QTI adapter is a standards-interop bridge for the mappable subset, not a
complete LMS export. Teacher-facing export (Moodle XML, printable PDF, an
authoring UI) is consumer tooling by design.

## Activity tracking (xAPI)

Recording learner activity (xAPI / Experience API statements) is **not** part of
this engine, by design. The engine is the source-to-canonical content boundary;
fetching, persistence, and tracking stay in the consumer
([architecture.md](architecture.md)). A host that needs xAPI maps its own
runtime events (attempt, answer, completion) to xAPI statements - the engine
neither emits nor stores them. This keeps the no-network, no-storage boundary
intact and is why xAPI is a consumer responsibility rather than an engine
adapter.
