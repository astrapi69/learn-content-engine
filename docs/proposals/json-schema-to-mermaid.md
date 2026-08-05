# Exploration: JSON Schema to Mermaid as a standalone tool

Exploration only, no code and no package. The question came out of engine#117,
where a generator was written to keep two documentation diagrams from drifting:
does a general tool for "JSON Schema in, readable Mermaid out" exist, and if
not, should one be built?

**Result up front: do not build it, and the reason is not that nobody got
around to it.**

Two independent lines of evidence agree. The census (Part 1) finds exactly one
non-toy direct tool, with two GitHub stars and no commits since November 2024,
while the JSON Schema organisation has proposed a visualization tool in three
consecutive Summer of Code cycles without one appearing. The measurements
(Parts 2 and 3) say a general tool would have to decide, per schema, between
three behaviours, and for two of the three the correct behaviour is to draw
nothing useful. That decision needs information the schema does not carry.

The strongest single piece of evidence is in Part 5: on **this** repository's
schema, the easiest possible input, a general tool would draw eleven boxes
where the diagram that was actually wanted has four.

---

## Part 1: What exists

Census across npm, PyPI, NuGet, Maven Central, crates.io and Go modules.
Repository figures below were re-verified against the GitHub API on
2026-08-05 rather than taken from the search results.

### Direct: JSON Schema in, Mermaid out

| Tool | Where | Stars | Last push | Why it does not solve it |
|---|---|---|---|---|
| **DryGen** | `ebjornset/DryGen`, NuGet `dry-gen` | 2 | 2024-11-13 | The only non-toy entry. Needs a .NET 8 runtime, no npm artifact, dead 21 months. Its JSON Schema path is not native: schema to C# POCO codegen to in-memory compile to reflection to Mermaid, so fidelity is capped by what C# can express. Its own fixture renames `prop1` to `Prop1`. |
| JSONSchema-to-Mermaid | `flemming-n-larsen/...` (Kotlin) | 0 | 2026-02-01 | AGPL-3.0, no release, no tag, not on Maven Central. Still ships a `PUBLIC_RELEASE_CHECKLIST.md`. |
| json-schema-to-mermaidjs | `TeemuKurki/...` | 2 | 2025-12-22 | **Zero published npm versions**, no license. 143 lines with no handling of `oneOf`, `anyOf`, `allOf` or `enum`. |
| json-schema-to-diagram | npm, `tobiasbueschel/...` | 1 | 2024-11-30 | Calls the OpenAI API. Non-deterministic, needs a key, 27 downloads a month. |
| json-schema-to-mermaid | `Stefan4D/...` | 0 | 2025-10-05 | Created and abandoned the same day. No README, no license. |

The obvious npm names are all unclaimed: `json-schema-mermaid`,
`jsonschema-to-mermaid`, `json-schema-to-mermaid`, `schema-to-mermaid`,
`mermaid-json-schema` all return 404 (checked directly).

### Adjacent: right input, wrong output

- `SOM-Research/jsonSchema-to-uml` (40 stars) is the most-cited answer online
  and a dead end: last push **2020-06-22**, and it emits **XMI**, which needs
  Eclipse plus Papyrus to render. The maintainer declared it dead in 2023; the
  repository's archived flag is not actually set, which is why search results
  still surface it as if alive.
- The two healthy documentation generators emit **no diagrams at all**:
  `adobe/jsonschema2md` (721 stars, active) is Markdown tables,
  `coveooss/json-schema-for-humans` (740 stars, active) is HTML.
- Mermaid generators exist in force, but for other inputs: `prisma-erd-generator`
  (1,033 stars), `mermerd` (610 stars, needs a live database connection),
  `openapi-mermaid` (15 stars).

That last line is the demand comparison worth keeping: the Mermaid-from-a-model
pattern is proven and popular in adjacent ecosystems. It simply has no JSON
Schema equivalent.

### Indirect chains, run rather than read

Five chains were executed end to end against this repository's own
`lesson.schema.json`, with every output validated through the real Mermaid 11
parser. Two work:

| Chain | Result | Cost |
|---|---|---|
| `json-schema-to-typescript` then `tsuml2 --outMermaidDsl` | 11 classes, 11 associations with cardinality, parses | 2 npm dependencies + 2 preprocessing filters |
| `@openapi-contrib/json-schema-to-openapi-schema` then `openapi-mermaid` | Near-total property coverage, 17 associations, real enum boxes, parses | 2 npm dependencies + ~30 lines of wrapper glue + 1 filter |
| via Prisma or SQL to an ER diagram | not viable | no maintained forward converter; and `Pair`, `ClozeBlank`, `InlineExample`, `MultipleChoiceOption` have no id fields, so it would invent keys |
| via Pydantic then `pymermaider` | best raw fidelity, **does not render** | the `{` and `}` inside the slug regex are read as struct delimiters by Mermaid's parser |

**So "nothing exists" is too strong, and the accurate statement is more
interesting: chains exist, they work, and their naive form fails silently.**

- The TypeScript chain, run without preprocessing, produced 1,714 lines with
  roughly 79 junk per-property type aliases, and the single most important edge
  in the model - `Lesson` to `LessonStep` - was **missing**. No error.
- The OpenAPI chain, run without preprocessing, silently dropped **55 of 81
  properties**. The converter rewrites `anyOf: [string, null]` into a
  single-element `anyOf`, the Mermaid generator finds no `.type` and skips the
  property without a warning. The diagram looked clean.

Both were repaired, and this is the part that matters for the general question:
**the repairs are specific to how this schema was generated.** Stripping
per-property `title` keys fixes the alias explosion because this schema comes
from Pydantic and carries 104 of them. Flattening single-element `anyOf` fixes
the property loss because 53 of the 55 `anyOf` here are the null-optionality
pattern. A schema built differently needs different filters, and nothing tells
you in advance which.

A second cross-cutting fact: **every tool-based chain destroys the constraints.**
After any of them, `id: string` no longer knows it must match the slug pattern.
`pattern`, `maxLength`, `const` and numeric bounds do not survive the hop into
TypeScript or OpenAPI. Only a direct emitter can carry them.

### Why the gap exists, in the ecosystem's own words

- The JSON Schema organisation has proposed a visualization tool as a
  Google Summer of Code project in **three consecutive cycles** (community
  issues #868, #974, #983, #1022), stating: *"Existing tools lack the features
  needed to simplify the visualization and navigation of these schemas."* There
  is still no visualization repository in the organisation.
- `json-schema.org/tools` has **no visualization category** at all. Across 282
  catalogued tools, the string "mermaid" appears **zero times**; two emit
  PlantUML.
- The academic attempt named the reason before dying. Javier Canovas, announcing
  jsonSchema-to-uml in 2018: *"The mapping between JSON Schema and UML Class
  diagram elements is not trivial"*, with the open problems listed as *"how to
  properly deal with allOf, oneOf, anyOf"* and *"incorporate full support for
  $ref"*. Archived in 2023.
- The structural statement, from the jsonschema2pojo wiki where it has sat as an
  unimplemented proposal through nine revisions: *"oneOf nested in allOf could
  produce a large number of types, if the implementation attempts to produce a
  type for every possible valid combination."*

That last quote is the whole problem in one sentence. **A JSON Schema under
composition does not denote a set of entities. It denotes a lattice of valid
shapes.** Mermaid can only draw a fixed set of boxes. Something has to choose
which boxes exist, and that choice is not in the schema.

Cucumber, who generate an ER diagram from their own JSON Schemas with a bespoke
template, had to write into the output that the cardinality *"can't be extracted
from the json schema easily"*, plus hand annotations that *"Worker is not
actually an entity"*. Their relationship detection is a naming convention:
properties ending in `Id`. That is not a general algorithm, and they are the
people who wanted it most.

---

## Part 2: What makes the task hard, measured

Rather than list the hard JSON Schema shapes in the abstract, here is how often
they occur in six real schemas plus this engine's own. All counts are from the
published files, measured 2026-08-05.

| schema | kB | max depth | named defs | anonymous objects | allOf | anyOf | oneOf | if/then | external $ref |
|---|---|---|---|---|---|---|---|---|---|
| lesson (this engine) | 46 | 9 | 15 | 1 | 0 | 49 | 0 | 0 | 0 |
| geojson | 45 | 21 | 0 | 44 | 0 | 0 | 10 | 0 | 0 |
| package.json | 44 | 9 | 29 | 24 | 0 | 2 | 18 | 0 | 9 |
| tsconfig.json | 425 | 12 | 13 | 9 | 2 | 8 | 1 | 0 | 0 |
| github-workflow | 110 | 15 | 30 | 46 | 53 | 3 | 33 | 8 | 0 |
| openapi 3.1 | 33 | 11 | 39 | 29 | 4 | 1 | 3 | 21 | 0 |
| JSON Schema meta-schema | 2 | 6 | 0 | 1 | 1 | 1 | 0 | 0 | 7 |

And the shapes that have no obvious picture at all:

| schema | `not` | patternProperties | additionalProperties as schema | $dynamicRef |
|---|---|---|---|---|
| lesson (this engine) | 0 | 0 | 0 | 0 |
| github-workflow | 9 | 7 | 6 | 0 |
| openapi 3.1 | 2 | 4 | 20 | 4 |
| package.json | 0 | 8 | 11 | 0 |
| meta-schema | 0 | 0 | 2 | 2 |

The first row of both tables is the point Aster made in advance: **this engine's
schema has zero of every hard shape.** No `allOf`, no `oneOf`, no `if`, no
`not`, no `patternProperties`, no external references, one anonymous object.
It is the easiest case that exists, and it would have been a misleading
yardstick.

### The naive rendering

Drawing one box per object shape gives:

| schema | boxes | verdict |
|---|---|---|
| meta-schema | 1 | readable |
| lesson (this engine) | 16 | readable |
| tsconfig | 22 | readable |
| geojson | 44 | borderline |
| package.json | 53 | borderline |
| openapi 3.1 | 68 | unreadable |
| github-workflow | 76 | unreadable |

A Mermaid class or graph diagram stops being scannable somewhere around 25 to
30 boxes. So the naive rendering fails on the two largest, and it fails in the
way that matters: the output is produced, it renders, and nobody can read it.

### The rescue that almost works

Drawing only NAMED definitions whose type is `object` is a rule derivable from
the schema alone, and it collapses everything into range:

| schema | structural named defs | edges between them | verdict |
|---|---|---|---|
| openapi 3.1 | 28 | 31 | a real graph |
| package.json | 11 | 10 | a real graph |
| github-workflow | 10 | 12 | a real graph |
| lesson (this engine) | 10 | 9 | a real graph |
| tsconfig | 11 | **0** | a list, not a graph |
| geojson | **0** | 0 | no named objects at all |
| meta-schema | **0** | 0 | no named objects at all |

This is the decisive table. The same rule that rescues the big schemas produces
**an empty diagram for two of the six**, and **an edgeless list for a third**.

An empty diagram is worse than an unreadable one. It renders, it is quiet, and
it says "there is nothing here" about a 45 kB schema that describes nine
geometry types.

### Why those two are empty

`geojson` and the meta-schema carry their structure anonymously. GeoJSON is
nine inline `oneOf` branches at the root; the meta-schema is built from
`$dynamicRef` against vocabularies. Neither declares a single named object.

A fallback exists for one of them: anonymous branches that carry a `title` can
become boxes. Measured:

| schema | titled anonymous branches | distinct titles |
|---|---|---|
| geojson | 41 | **9** |
| github-workflow | 0 | 0 |
| openapi 3.1 | 0 | 0 |
| meta-schema | 0 | 0 |

The nine distinct titles are exactly the nine GeoJSON types, so the fallback
produces the right picture - **for geojson and for nothing else.** Whether a
schema titles its branches is an authoring style, not a property the schema
declares. A tool cannot know in advance which of its two algorithms applies; it
can only try one, get nothing, and try the other.

---

## Part 3: The test bed, one schema at a time

For each foreign schema: what would a diagram have to show to help someone, and
is that derivable from the schema?

### github-workflow (110 kB, 30 named defs)

**What would help.** Workflow, then jobs, then steps, then the container and
service boxes. Five or six boxes. A reader wants to know that a job holds steps
and that a step is either a `run` or a `uses`.

**Is it derivable?** Partly. The five structural objects are findable
(`normalJob`, `reusableWorkflowCallJob`, `step`, `jobContainer`,
`serviceContainer`). But `$defs` also holds `architecture`, `machine`, `name`,
`expressionSyntax`, `working-directory` - scalar type aliases that are not
boxes. Filtering by `type: object` removes them, so this one works.

What is NOT derivable: that `on` (the trigger block) is the second thing a
reader looks for, and it is 12 `oneOf` branches deep in anonymous territory.
The useful diagram would put triggers next to jobs. The schema gives no signal
that `on` matters more than `defaults`.

### openapi 3.1 (33 kB, 39 named defs, 21 `if`/`then`)

**What would help.** The document graph: OpenAPI, Paths, PathItem, Operation,
Response, Schema, Components. Perhaps eight boxes.

**Is it derivable?** The 28 structural defs form a genuine graph with 31 edges,
so a tool would emit a correct 28-box diagram. Correct, and roughly three times
larger than the useful one. Which eight of the 28 matter is editorial judgement,
not schema content.

The 21 `if`/`then` pairs encode conditional requirements ("if this is a
reference object, then `$ref` is required"). There is no honest diagram edge for
a conditional requirement. Drawing it as a normal edge is a lie; omitting it
silently drops a constraint.

### tsconfig.json (425 kB, 120 compiler options)

**What would help.** Nothing structural. The 11 named defs are wrappers, and
they reference each other **zero** times. The content a reader wants is the
grouping of 120 compiler options by topic - strictness, modules, emit,
interop - and that grouping exists in the TypeScript documentation, not in the
schema.

**Is it derivable?** No. This schema is a configuration bag. A structure diagram
of a configuration bag is a box with a lid.

This is the most important single case in this document, because a tool that
"works" would happily emit 11 disconnected boxes and report success.

### geojson (45 kB, 0 named defs)

**What would help.** One box per geometry type, plus Feature and
FeatureCollection, with the containment between them. Nine boxes, and the
schema really does describe exactly that.

**Is it derivable?** Only through the title fallback, which works here and
nowhere else in this sample.

### JSON Schema meta-schema (2 kB, `$dynamicRef`)

**What would help.** Honestly: nothing a class diagram can express. It is a
vocabulary composition, and the interesting relationship is "this vocabulary
extends that one at runtime".

**Is it derivable?** No, and it should not be attempted.

### Result

Five foreign schemas. **Two yield a useful, derivable diagram**
(github-workflow, openapi 3.1) - though both larger and less focused than a
human would draw. **One yields a correct but pointless diagram** (tsconfig).
**One needs a second algorithm that happens to fit it alone** (geojson). **One
should not be drawn** (meta-schema).

Aster's stopping rule was: if the answer comes back "no" repeatedly, that is the
reason for the gap. It came back no or heavily qualified in three of five.

---

## Part 5 as evidence, not as a plan: the first consumer refutes the premise

The intended first consumer was this engine's own schema, for the two generated
diagrams in engine#117. That is also the strongest available test, because if a
general tool cannot serve the easiest schema without ceremony, it will not serve
harder ones.

A general tool filtering structural named definitions would draw **eleven**
boxes for this schema:

```
Card, CardTokenRole, ClozeBlank, Exercise, InlineExample, LessonResource,
LessonStep, MultipleChoiceOption, Pair, PictureImage, + the root Lesson
```

Diagram 1 in `docs/schema-diagrams.md` draws **four**: Lesson, LessonStep,
Exercise, Card.

The seven left out - `Pair`, `ClozeBlank`, `PictureImage`,
`MultipleChoiceOption`, `InlineExample`, `LessonResource`, `CardTokenRole` - are
exercise payload details. Leaving them out is what makes the diagram answer the
question "how is content shaped", instead of "what object types exist". Nothing
in the schema marks them as secondary. They have the same shape, the same
nesting depth, the same kind of reference as the four that stayed.

**So the curation is the value, and the curation is not in the schema.** On the
easiest possible input, a general tool would produce roughly three times the
content and a different diagram than the one that was actually wanted.

---

## The answer to the counter-question

**The gap exists because the general problem has no general answer.** A
schema-to-diagram tool must choose:

1. draw everything, which is unreadable above about 30 boxes and hits two of six
   sample schemas;
2. draw named structural definitions, which is derivable and readable but
   produces an empty picture for schemas that name nothing (two of six) and an
   edgeless list for configuration bags (one of six);
3. draw the useful subset, which requires knowing which types matter - editorial
   knowledge that no schema carries.

Options 1 and 2 are implementable and mostly not worth reading. Option 3 is
worth reading and not implementable. That is a stable reason for a tool not to
exist, not an oversight.

There is a second reason, visible in the numbers above. The schemas where a
diagram helps most (github-workflow, openapi) are exactly the ones with the most
`allOf`, `if`/`then`, `patternProperties` and `not` - shapes with no honest
diagram edge. The need and the difficulty rise together.

And a third, which only showed up because the chains were run instead of read:
**the naive form of every working chain fails silently.** A missing central
edge and a 68 percent property loss both rendered cleanly and reported success.
Whatever a future tool does, its own gate would have to assert class and
property counts against the source schema, because "a `.mmd` file was produced"
is not a measurement. That is the same rule this repository already applies to
the coverage gate and the diagram drift check.

## What this does not argue

It does not argue that engine#117's generator was wrong. That generator is not
general: it knows which four types matter and how to label their edges, and its
value is the drift check, not the drawing. **A hand-shaped generator for one
schema is a different artifact from a general tool**, and only the first one is
justified by these measurements.

If the question comes up again, the cheapest way to reopen it honestly is to
re-run the connectivity measurement on a fresh sample of schemas. If a large
majority turn out to be genuine graphs with named types, the balance changes.
In this sample it was two of six.

## Recommendation

**Do not build it.** Keep `scripts/generate-schema-diagrams.mjs` as what it is:
a repo-local generator for one known schema, whose real product is the
`--check` gate.

If a second schema in this ecosystem ever needs the same treatment
(`content-manifest.schema.json` is the only candidate), extend that script to
take a schema path and a curated type list. That is a parameter, not a product.

### If the answer is ever revisited

Two things would have to change, and both are measurable rather than matters of
taste:

1. **Connectivity.** Re-run the named-structural-definition and edge count on a
   fresh sample. In this sample two of six schemas were genuine graphs. If a
   large majority turn out to be, the balance changes.
2. **Form.** Every official proposal in the JSON Schema organisation reaches for
   an interactive canvas, and none of them names Mermaid. A text diagram that
   diffs, reviews and renders inside GitHub is a genuinely different product
   from a browser app, and the demand for that specific form is an untested
   hypothesis rather than a validated signal. Do not treat the organisation's
   repeated proposals as demand for this artifact.

What should NOT be done is the thing that looks cheapest: adopting one of the
two working chains as a build step. Both need preprocessing tuned to how this
particular schema was generated, both discard every constraint on the way, and
the load-bearing dependency in the higher-fidelity chain has 15 stars. Owning
about 200 lines that read `$defs` directly is less risk than two hops that fail
without saying so.
