# Extensions

Extension exercise types let a consumer add a NON-core exercise type in the
`ext:<vendor>-<name>` namespace (schema 1.7) **without** widening the core
`ExerciseType` enum. The core enum stays the single, portable authority; every
extension is opt-in and honestly declared, so core content keeps its guarantee
that "validates here => loads in any consumer".

## The portability contract

- **Core is guaranteed.** A lesson using only core exercise types
  (`matching`, `picture_choice`, `free_text`, `word_tiles`, `cloze`,
  `multiple_choice`) validates and parses exactly as before - the registry is
  irrelevant to it.
- **Extensions are opt-in and declared.** A lesson that uses an `ext:` type MUST
  list it in the top-level `requires_extensions` array, each entry pinned to a
  major (`ext:<vendor>-<name>@<major>`).
- **Missing extensions are refused loudly.** A consumer that has not registered
  a declared extension refuses the lesson with `E-EXT-UNSUPPORTED` instead of
  silently mis-rendering it. This is what keeps portability honest: content that
  needs an extension either runs on a consumer that has it, or is rejected
  clearly everywhere else.

## Shape

An extension exercise carries the `ext:` type and an opaque `ext_payload` the
core engine never interprets:

```json
{
  "id": "l1",
  "title": "Ordering lesson",
  "requires_extensions": ["ext:acme-ordering@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:acme-ordering",
        "prompt": "Put the steps in order",
        "ext_payload": { "items": ["First", "Second", "Third"] }
      }
    }
  ]
}
```

The schema validates the namespace pattern, the declaration pattern, and that
`ext_payload` is an object; everything inside `ext_payload` is validated by the
registered extension, not the core schema.

## Registering an extension

Both `validateLesson` and `parseLesson` take an optional `{ extensions }`
registry. Without it, behaviour is identical to core-only:

```ts
import { validateLesson, parseLesson, type ExerciseExtension } from "learn-content-engine";

const acmeOrdering: ExerciseExtension = {
  type: "ext:acme-ordering",
  major: 1,
  validate(exercise) {
    const items = (exercise.ext_payload as { items?: unknown }).items;
    return Array.isArray(items) && items.length >= 2
      ? []
      : [{ path: "/ext_payload", message: "needs >= 2 items", id: "E-EXT-ACME-ITEMS", severity: "error", docAnchor: "..." }];
  },
};

validateLesson(lesson, { extensions: [acmeOrdering] });   // runs the extension validator
parseLesson(raw, context, undefined, { extensions: [acmeOrdering] }); // applies any resolve() hook
```

The `ExerciseExtension` interface (exported from the package) is the engine
half; the consumer half (renderer / grader) lives in the consumer and is
registered there. Shipping the two together is what makes "validated =>
renderable" hold. adaptive-learner is one such consumer, but nothing in the
contract is app-specific.

## Errors

| Rule | When |
|---|---|
| `E-EXT-UNDECLARED` | An exercise uses an `ext:` type the lesson does not list in `requires_extensions`. |
| `E-EXT-UNSUPPORTED` | A declared extension (at its pinned major) is not in the registry - a major mismatch counts. The consumer cannot render the lesson. |

An extension's own `validate` may return any additional issues (its own ids).

## Reference extension: `ext:ref-ordering`

`src/examples/ext-ref-ordering/` is a deliberately trivial worked example -
"put these items in the correct order" - that proves the seam end-to-end. It
ships both halves in one folder: the engine-half `refOrderingExtension` (an
`ExerciseExtension` validating `ext_payload.items`) and the consumer-half
`renderRefOrdering` (a minimal renderer). It is excluded from the published
build; a real extension would ship as its own package importing the engine's
`ExerciseExtension` type.

## What extensions do NOT change

The core schema, the core `ExerciseType` enum, and the schema-authority process
for core types are unchanged. Extensions are a separate, versioned, opt-in tier
that sits AROUND the portable core - they never bypass the core enum, the strict
`additionalProperties: false` on core fields, or the RED-first process for a new
CORE type. Core content authored before 1.7 validates and parses byte-identically.
