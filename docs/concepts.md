# Concepts

## The pipeline

The engine draws one boundary: **raw source content to canonical objects**. It
runs in four stages, and the consumer supplies the bytes at each step (the
engine never fetches):

```
manifest.yaml ──parseManifest──▶ ParsedManifest
   │
   └─ sets[] ──asContentSetEntry──▶ ContentSetEntry   (canonical set projection)
        │
        └─ language pair + domain ──▶ LessonSetContext
             │
   lesson JSON ──parseLesson(raw, context)──▶ ContentLesson   (canonical lesson)
```

1. **`parseManifest(text)`** deserializes a repo's `manifest.yaml` into a
   `ParsedManifest` (a thin YAML/JSON parse, no projection).
2. **`asContentSetEntry(source, parsedSet, cachedVersion, ...)`** projects one
   `sets[]` entry into a canonical `ContentSetEntry`: it resolves the language
   pair, applies defaults, computes `update_available`, projects the book
   block, and carries the optional `visibility` hint (`"visible"` unless the set
   opts out with `"hidden"`). **`setBasePath(parsedSet)`** tells you the
   repo-relative directory holding that set's `lessons/`.
3. From the set entry you build a **`LessonSetContext`** (`language`,
   `target_language`, `source_language`, `domain`): the context a lesson
   inherits from its parent set.
4. **`parseLesson(rawText, context, adapter?)`** turns raw lesson source into a
   canonical `ContentLesson`, injecting the set context where the lesson omits
   it (see below). The default adapter reads the single-JSON lesson format; a
   custom `LessonSourceAdapter` can plug in another source shape without
   touching the caller's fetch or storage.

Validation ([validation.md](validation.md)) is a **separate, opt-in** step: it
is not part of `parse`.

## Context inheritance vs. standalone

A lesson file usually does **not** carry its own `target_language` /
`source_language` / `domain`: the parent set is authoritative, so the adapter
injects them from the `LessonSetContext`:

- If the lesson **omits** a field, the set context value is used.
- If the lesson **declares** its own (for example an exported standalone lesson
  shared outside its set), the lesson's value is kept.

This is why the same lesson JSON works both inside a set (inherits `fr`/`en`)
and as a standalone export (carries its own pair).

## The legacy `language` alias

Before schema v1.2, a set carried a single `language` key. The engine still
accepts it as an alias for `target_language`:

- `resolveLanguagePair(set)` returns `{ target, source }`, preferring
  `target_language`, falling back to the legacy `language`, and defaulting
  `source` to `"en"`.
- `validateManifest` normalizes the alias before schema-checking, so a pre-v1.2
  manifest validates instead of tripping the strict schema.

When both `language` and `target_language` are present, `target_language` wins
and the alias is dropped.

## Domains

`domain` groups content by kind (`language`, `psychology`, `programming`, ...).
It defaults to `"language"` when a set omits it, and (like the language pair) is
inherited by the set's lessons unless a lesson declares its own.

## Schema-version policy (additive)

The lesson schema is versioned (`x-schema-version`, currently `1.7`) and evolves
**additively**: new fields are optional, so **older content stays valid under a
newer schema**. For example, v1.5 added the inline `examples` field; a v1.4
lesson without `examples` validates unchanged under v1.5. v1.6 added the native
`multiple_choice` exercise type and matching `from_cards`, and v1.7 added the
extension tier (`ext:` exercise types), all optional, so pre-1.7 content
validates unchanged under v1.7.

The schema's **canonical source is this engine** (as of v0.6.0); consumers
(adaptive-learner, the content repos) consume it (see
[schema authority](architecture.md#schema-authority-this-engine)). That authority
(not a runtime dependency on any particular consumer) is what lets you treat
this engine as the format reference.
