# learn-content-engine

Framework-agnostic TypeScript engine that parses lesson content from pluggable
sources into a canonical lesson object.

This is the extracted **content engine** of
[Adaptive Learner](https://github.com/astrapi69/adaptive-learner) (EXP-042): the
`source → canonical` boundary. It takes raw content (today a **single-JSON**
lesson, plus a `manifest.yaml`) and a set context, and produces the canonical
internal lesson / set-entry objects. It contains **no** network, storage, or UI
code — the host supplies the bytes and keeps fetch + persistence.

## Install

```bash
npm install learn-content-engine
```

## Usage

Parse a raw single-JSON lesson into the canonical `ContentLesson`:

```ts
import { parseLesson, type LessonSetContext } from "learn-content-engine";

const setContext: LessonSetContext = {
  language: "fr",
  target_language: "fr",
  source_language: "de",
  domain: "language",
};

const rawJson = '{ "id": "01-greetings", "title": "Begrüßungen", "cards": [], "steps": [] }';

const lesson = parseLesson(rawJson, setContext);
// → canonical ContentLesson; the set's language pair + domain are injected
//   when the lesson file omits them.
lesson.target_language; // "fr"
lesson.source_language; // "de"
```

Project a raw `manifest.yaml` set into a canonical `ContentSetEntry`:

```ts
import { parseManifest, asContentSetEntry } from "learn-content-engine";

const manifest = parseManifest(rawManifestYaml);
const entry = asContentSetEntry(
  { source: "astrapi69/adaptive-learner-content", branch: "main" },
  manifest!.sets![0],
  /* cachedVersion */ null,
);
```

### Custom source adapters (the extension seam)

`parseLesson` delegates to a **source adapter** (`rawText + context →
ContentLesson`). The only built-in is `singleJsonLessonAdapter`. A future
multi-file source format plugs in as another adapter with the same signature —
no change to the caller's fetch or storage:

```ts
import { parseLesson, type LessonSourceAdapter } from "learn-content-engine";

const myAdapter: LessonSourceAdapter = (rawText, context) => {
  /* build a canonical ContentLesson from your own source format */
};

const lesson = parseLesson(rawText, setContext, myAdapter);
```

## Public API

| Export | Kind | Purpose |
|---|---|---|
| `parseLesson` | fn | raw source + context → canonical `ContentLesson` (via an adapter) |
| `singleJsonLessonAdapter` | fn | the built-in single-JSON source adapter |
| `parseManifest` | fn | raw `manifest.yaml` text → `ParsedManifest` |
| `asContentSetEntry` | fn | raw parsed set → canonical `ContentSetEntry` |
| `resolveLanguagePair` | fn | language-pair resolution (legacy alias + `en` default) |
| `setBasePath` | fn | repo-relative base dir for a set |
| `asContentSetBook` | fn | project a manifest book block → `ContentSetBook \| null` |
| `ContentLesson`, `ContentSetEntry`, `ContentSetBook`, `ContentSetSource`, … | types | the canonical internal format |
| `LessonSetContext`, `LessonSourceAdapter`, `ParsedManifest`, `ParsedSet` | types | adapter + manifest surface |

## Scope (what this library deliberately is NOT)

Per the EXP-042 lib boundary, this package contains **only** parse / transform /
types + the single-JSON source adapter. It does **not** include:

- **Fetch** (GitHub fetcher, raw base URLs) — stays in the host.
- **Storage** (IndexedDB / Dexie cache, DB keys) — stays in the host.
- **UI** — no React or any renderer.

That is why the engine imports only content *types* and a YAML parser. The
import boundary is the extraction seam: consumer → engine, never the reverse.

## Status — migration pending

This library is the **extracted** engine. The Adaptive Learner app does **not**
consume it yet; that migration is follow-up work (EXP-042 section 7). Until then
the parse/transform logic exists in **two** places — the original in the app
repo (`frontend/src/lib/content/engine/`) and this library — kept in sync by
hand. This package is configured to be publishable but has **not** been
published to npm.

## Develop

```bash
npm install
npm run build      # tsc → dist/ (JS + .d.ts declarations)
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## License

MIT © Asterios Raptis
