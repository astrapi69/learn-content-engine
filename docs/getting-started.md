# Getting started

`learn-content-engine` turns raw lesson content (a single-JSON lesson plus a
`manifest.yaml`) into canonical objects, and validates it against a strict,
bundled schema. It has **no** network, storage, or UI - you supply the bytes and
keep fetch + persistence.

## Install

From npm:

```bash
npm install learn-content-engine
```

Or pin to a git revision (no npm needed):

```bash
npm install github:astrapi69/learn-content-engine
```

On a git install npm runs the package's `prepare` script (`npm run build`) to
compile `dist/` from source - a plain `npm install` is enough, no extra step.

The package is ESM and ships TypeScript declarations. Node >= 18.

## Five-minute example

The pipeline is: **parse the manifest -> project each set -> build the lesson
context -> parse each lesson -> (optionally) validate**. This whole script is
copy-runnable:

```ts
import {
  parseManifest,
  asContentSetEntry,
  setBasePath,
  parseLesson,
  validateLesson,
  type LessonSetContext,
} from "learn-content-engine";

// 1. Parse a repo manifest (you fetched/read the text yourself).
const manifestText = `
name: My French Content
sets:
  - id: fr-a1
    title: French A1
    target_language: fr
    source_language: en
    level: A1
    version: 1.0.0
    lesson_count: 1
    path: sets/en/fr-a1
`;
const manifest = parseManifest(manifestText);

// 2. Project the first set into a canonical entry.
const parsedSet = manifest!.sets![0]!;
const entry = asContentSetEntry(
  { source: "you/your-content", branch: "main" },
  parsedSet,
  /* cachedVersion */ null,
);

// 3. Build the context a lesson inherits from its set.
const context: LessonSetContext = {
  language: entry.language,
  target_language: entry.target_language,
  source_language: entry.source_language,
  domain: entry.domain,
};
console.log(setBasePath(parsedSet)); // "sets/en/fr-a1" -> where its lessons live

// 4. Parse a lesson (raw JSON text you fetched from <path>/lessons/*.json).
const rawLesson = `{
  "id": "01-greetings",
  "title": "Greetings",
  "steps": [
    { "id": "s1", "type": "exercise",
      "exercise": { "id": "e1", "type": "free_text",
        "prompt": "Say hello in French.", "accept": ["bonjour"] } }
  ]
}`;
const lesson = parseLesson(rawLesson, context);
console.log(lesson.target_language); // "fr" - injected from the set context

// 5. Validate explicitly (opt-in). parse is permissive; validate enforces.
const result = validateLesson(JSON.parse(rawLesson));
if (!result.valid) {
  for (const issue of result.errors) {
    console.error(`${issue.path}: ${issue.message}`);
  }
}
```

`parse` never validates - it is permissive by design. Validation is a separate,
explicit step you run when you want the format contract enforced. See
[validation.md](validation.md).

## Where to next

- [concepts.md](concepts.md) - the pipeline, context inheritance, schema policy.
- [lesson-format.md](lesson-format.md) - the full format reference (every field,
  every exercise type, with tested examples).
- [validation.md](validation.md) - what `validate*` checks and the error model.
- [architecture.md](architecture.md) - the engine boundary and roadmap.
