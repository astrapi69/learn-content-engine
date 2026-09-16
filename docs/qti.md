# QTI interop

[QTI](https://www.imsglobal.org/question/index.html) (IMS Question and Test
Interoperability) is the established interchange format for assessment content.
`learn-content-engine` ships an optional **QTI adapter** (2.x and 3.0
dialects, see [Dialects](#dialects-qti-2x-and-qti-30)) that maps the
mappable subset of QTI to and from the canonical lesson model, at the same
source-to-canonical boundary the core engine draws
([architecture.md](architecture.md)).

The adapter lives behind a **subpath export** so its XML-parser dependency
(`@rgrove/parse-xml`, zero transitive dependencies) never enters the
dependency-free core import:

```ts
import { importQti, exportQti, QtiImportError } from "learn-content-engine/qti";

const lesson = importQti(qtiXml);          // QTI 2.x or 3.0 XML -> ContentLesson (dialect detected)
const xml = exportQti(lesson);             // ContentLesson -> QTI 2.x XML (the default)
const xml3 = exportQti(lesson, { version: "3.0" }); // ContentLesson -> QTI 3.0 XML
```

It also plugs into the `parseLesson` seam as a source adapter:

```ts
import { parseLesson } from "learn-content-engine";
import { qtiLessonAdapter } from "learn-content-engine/qti";

const lesson = parseLesson(qtiXml, setContext, qtiLessonAdapter);
```

## Command line

The same two directions as a `bin` command, one document per run, no code
(engine#164):

```bash
# QTI item or test (2.x or 3.0, detected) -> lesson JSON on stdout
npx learn-content-engine qti import item.xml

# ... or into a file, with the lesson id and title set explicitly
npx learn-content-engine qti import test.xml --out sets/de/mein-set/lessons/01-import.json --id import-1 --title "Importiert"

# lesson JSON -> QTI 2.x test (default) or QTI 3.0
npx learn-content-engine qti export sets/de/mein-set/lessons/01-import.json --out export.xml
npx learn-content-engine qti export sets/de/mein-set/lessons/01-import.json --version 3.0 --out export3.xml
```

Exit codes follow the other subcommands: `0` converted, `1` refused (every
unmappable item or exercise listed on stderr, one line each, the same list
`QtiImportError.issues` / `QtiExportError` carry), `2` usage or unreadable
file. An imported lesson has already passed `validateLesson`, so `qti import`
followed by `lint` is redundant; `mint-stable-ids` is the natural next step
before the lesson enters a set. The command is the adapter, nothing more: the
mapping table, the refusal list and the fidelity limits below apply
unchanged.

## Dialects: QTI 2.x and QTI 3.0

QTI 3.0 (1EdTech, the current version) kept the semantics of the mappable
subset and renamed the syntax: every element is `qti-` prefixed kebab-case
(`choiceInteraction` became `qti-choice-interaction`, `assessmentItem`
became `qti-assessment-item`) and every multi-word attribute is kebab-case
(`responseIdentifier` became `response-identifier`, `baseType` became
`base-type`), under the namespace `http://www.imsglobal.org/xsd/imsqtiasi_v3p0`.
Attribute values (`directedPair`, `single`, `multiple`) and plain HTML inside
the item body (`<p>`) are unchanged.

The adapter treats that as a spelling, not a second format:

- **Import** detects the dialect from the root element (a `qti-` prefixed
  root or the 3.0 namespace) and normalises names to the 2.x spelling before
  the mapping runs, so both dialects go through the same code, the same
  refusal list and the same `validateLesson` gate. A root that is neither a
  2.x nor a 3.0 `assessmentItem` / `assessmentTest` is refused with
  `QtiImportError`. Mapping issues report the canonical 2.x interaction name
  (`orderInteraction`, even when the document said `qti-order-interaction`).
- **Export** stays 2.x by default (byte-identical to before 3.0 support) and
  emits the 3.0 spelling and namespace with `{ version: "3.0" }`.
- The mapping table, the refusal list, the round-trip guarantee and the
  fidelity limits below apply to both dialects; the table uses the 2.x
  spelling.

The whole difference lives in three pure functions (`src/qti/dialect.ts`).
The 3.0 test fixtures follow the element and attribute spellings of
1EdTech's implementation guide (checked verbatim against its choice
interaction example; text entry and match follow the same renaming rule).
QTI 3.0 packaging (manifest, one file per item) is not part of the adapter:
it reads and writes single documents, as it does for 2.x.

## Mapping table

| QTI interaction (2.x spelling) | response cardinality | Engine exercise type | Mapping |
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
each one (`itemIdentifier`, `interaction`, `reason`): there is no silent skip.
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
inline inside the test, a self-contained convenience over QTI's usual
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

The adapter maps the three exercise types with a faithful QTI interaction
(`multiple_choice`, `free_text`, `matching`) and refuses the rest loudly. That
subset is deliberate, and expanding it is intentionally NOT on the roadmap
unless a concrete QTI consumer needs it. The reasoning:

- **The remaining core types have QTI equivalents, but with fidelity cost.**
  `word_tiles` maps to `orderInteraction` (losing `accept_orderings`: QTI has
  one correct order); `cloze` maps to inline `textEntryInteraction` /
  `inlineChoiceInteraction` / `choiceInteraction` by mode; `picture_choice`
  maps to `choiceInteraction` with image objects, but only usefully if the
  importing system can resolve the asset paths (the engine bundles no assets).
  `word_tiles -> orderInteraction` is the one clean, low-cost addition if
  completeness is wanted for its own sake.
- **QTI 2.x is not the lever for the teacher / LMS use case.** Native question
  import varies by LMS and is often partial or plugin-based; Moodle's native
  format is Moodle XML, not QTI 2.x. A Moodle-XML (or Canvas) exporter would be
  a consumer-specific tool, not a framework-agnostic engine adapter: the same
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
runtime events (attempt, answer, completion) to xAPI statements: the engine
neither emits nor stores them. This keeps the no-network, no-storage boundary
intact and is why xAPI is a consumer responsibility rather than an engine
adapter.
