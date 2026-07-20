# Changelog

All notable changes to `learn-content-engine`. The format is inspired by
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/) (schema evolution is additive, see
[docs/concepts.md](docs/concepts.md#schema-version-policy-additive)).

## [0.13.1] - 2026-07-20

Docs/examples: sixth reference extension `ext:ref-dictation` (#68) - an audio
stimulus bound to a typed transcription. The payload is self-contained
(`audio` reference + `accept` transcriptions, no card lookup); the engine
validates only that `audio` is a non-empty string and leaves storage, upload,
resolution and playback to the consumer. New payload rules
`E-EXT-REFDICT-SHAPE`, `E-EXT-REFDICT-AUDIO`, `E-EXT-REFDICT-ACCEPT` on the
extension half. **No schema change and no `schema_version` bump**: a new
`ext:` type never touches `lesson.schema.json` (`ext_payload` is already an
open object), so existing content validates byte-identically. The example
lives under `src/examples/` and is excluded from the published build.

## [0.13.0] - 2026-07-17

Feature (schema 1.8, additive): `picture_choice` image `src` now takes one of
two explicit formats - the original relative `assets/` path (unchanged
500-char cap) OR an inline base64 data URI (`data:image/...;base64,...`) with
its own 250000-char cap, sized for the reference consumer's 150-KiB upload
compression (adaptive-learner#1763). The path intent stays documented and
enforced instead of being silently widened; existing content validates
unchanged. New author lint `W-PIC-DATA-URI` (advisory, never blocks) flags
inline data URIs so repo content keeps preferring `assets/` paths over
git-bloating blobs. Decision record: #66 (option B - both formats explicit).

## [0.12.3] - 2026-07-15

Fix: importing the package entry no longer touches the filesystem (#59). The
ajv validators for `lesson.schema.json` and `content-manifest.schema.json`
were compiled eagerly at module load via `readFileSync`, so a browser
consumer whose bundler executes the entry eagerly (e.g. vite dev
pre-bundling, no tree-shaking) crashed on import even when it only used the
parse APIs; production builds were merely masked by tree-shaking. The
compiled validators are now created lazily on the first
`validateLesson` / `validateManifest` call (memoized). No API change;
Node behaviour is identical.

## [0.12.2] - 2026-07-14

Change: new hard rule `E-MATCH-DUP-LEFT` - a `matching` exercise's `left` terms
must be unique within the exercise (compared case-insensitive and
whitespace-trimmed). A repeated left maps to two different rights, which is
objectively unsolvable for the learner; the message names the term and its
positions. The content fix is the author's - there is no safe automatic rename.
The existing `W-MATCH-AMBIG` warning now covers duplicate `right` values only
(left duplicates are the hard error). Origin: three independent occurrences of
the same author mistake (alc-die-waehrung-des-geistes#27). A dry run over all
four content repos (562 lessons) found zero affected lessons, so the rule ships
as a hard error with no migration. Validator-only; `x-schema-version` stays
`1.7` (no schema field added). This tightens validation, so consumers with
duplicate-left content (not present in the audited repos) would newly fail -
bump treated as a patch since no audited content is affected. Closes #54.

## [0.12.1] - 2026-07-14

Change: `W-CARD-UNUSED` is now emitted **once per lesson**, listing every
unused card id, instead of one warning per orphan card (#49). A card-rich set
(cards as a broad knowledge base, exercises a curated subset) is a common,
valid shape - the official content repo carries ~17% unreferenced cards
uniformly across every set - so a line per card buried the rare real author
mistake under noise (alert fatigue). Detection is unchanged: the
`unusedCardIds` core the suggest-wiring CLI shares still returns the full
per-id list; only the lint's emission aggregates. Non-breaking - warnings
stay non-blocking and `validateLesson`'s result shape is unchanged
(`x-schema-version` stays `1.7`).

## [0.12.0] - 2026-07-11

Feature: `learn-content-engine suggest-wiring <file...> [--json]
[--write --accept <id>...]` - a suggest mode for `W-CARD-UNUSED` (#20).
Detection shares the lint's unused-card core; a wiring is proposed only when
the card's `front`/`back` appears verbatim in a text field of exactly one
exercise, printed with its evidence (field + quote). No fuzzy matching: zero
or ambiguous matches land in "manual review" instead of a guess. Dry-run by
default; `--write` applies only explicitly `--accept`ed suggestions (no bulk
apply - `card_ids` drives SRS scheduling) and the rewired lesson must pass
the bundled validator before the file is touched. Schema untouched
(`x-schema-version` stays `1.7`). See
[lesson-format.md](docs/lesson-format.md#suggesting-card-wiring-for-unused-cards).

## [0.11.1] - 2026-07-11

Fix: `schema/lesson.schema.json` is canonically serialized again
(`json.dumps(..., indent=2, sort_keys=True)`); the 1.7 blocks from 0.10.0 had
been inserted hand-formatted. Semantically identical (parsed-equality
proven), but consumers that RE-EMIT the schema canonically (the app's
sync-schema pipeline and its byte-parity gate) need the canonical bytes.
Types regenerated from the sorted artifact; no rule/type change.

## [0.11.0] - 2026-07-11

Feature: optional **QTI 2.x interop adapter** on the subpath
export `learn-content-engine/qti` (`importQti`, `exportQti`, `qtiLessonAdapter`).
Maps the mappable subset both ways - `choiceInteraction` <-> `multiple_choice`
(single / multiple by cardinality), `textEntryInteraction` <-> `free_text`,
`matchInteraction` <-> `matching` - at the `parseLesson` boundary. Import
refuses unmappable items loudly (`QtiImportError` with a per-item list, no
silent skip) and gates the result through `validateLesson`; export covers the
mappable subset (`QtiExportError` otherwise). The XML parser
(`@rgrove/parse-xml`, zero transitive deps) is isolated to the subpath so the
core import stays dependency-free. xAPI stays a consumer responsibility.
Schema untouched by this feature (the 1.7 stamp comes from 0.10.0). See
[qti.md](docs/qti.md).

## [0.10.0] - 2026-07-11

Feature: **extension exercise types** (schema **1.7**). A consumer
can register a NON-core exercise type in the `ext:<vendor>-<name>` namespace
without widening the core `ExerciseType` enum. A lesson declares what it needs
in the new top-level `requires_extensions` (each `@<major>`), carries the
extension's data in an opaque `ext_payload`, and a consumer that has not
registered a declared extension refuses it loudly (`E-EXT-UNSUPPORTED`;
`E-EXT-UNDECLARED` when an `ext:` type is used undeclared). `validateLesson` /
`parseLesson` gain an additive `{ extensions }` option - core content
validates and parses byte-identically without it. New public types
`ExerciseExtension` / `ExtensionRegistry`; a reference extension
`ext:ref-ordering` (`src/examples/`) proves the seam end-to-end. Additive
schema bump (`x-schema-version` 1.6 -> 1.7); pre-1.7 content unchanged. See
[extensions.md](docs/extensions.md).

## [0.9.0] - 2026-07-11

Feature: `learn-content-engine migrate <file...> [--write] [--json]` -
the cloze `select`/`multiselect` -> native `multiple_choice` conversion every
content repo scripted by hand, as a validated CLI subcommand. Dry-run by
default; the rewritten lesson must pass the bundled validator before
`--write` touches the file; multi-blank selects and `cloze_mode: "type"` are
never converted (no clean MC equivalent). Schema untouched
(`x-schema-version` stays `1.6`). See
[lesson-format.md](docs/lesson-format.md#migrating-cloze-selectmultiselect-to-multiple_choice).

## [0.8.2] - 2026-07-10

Schema annotation: the list/map fields that are always present at
runtime (`Card.tags`, `Exercise.card_ids`, `Exercise.distractors`,
`Lesson.cards`; manifest `ContentSet.tags`/`assets`, `sets`, `metadata`) now
carry an explicit `"default": []` / `{}`. Validation-neutral (ajv ignores
`default`; TS types unchanged) - it makes the existing "absent = empty"
contract machine-readable so downstream code generators (the app's D3b
Pydantic generator) can reproduce it. 8 added lines, nothing else.

## [0.8.1] - 2026-07-10

Fix: the manifest schema's `schema_version` field `default` now
also says `1.6` (0.8.0 bumped only the `x-schema-version` stamp; the app
generator renders the field default from the same constant, so the byte-parity
gate caught the inconsistency). No other change.

## [0.8.0] - 2026-07-10

Feature (Bucket B): native **`multiple_choice`** exercise type
(schema **v1.6** - a new type is a minor schema bump per the ExerciseType
policy; 1.x content stays valid). At least two `options` (`{text, correct?}`,
texts unique); `multiple: false` = single choice (exactly one correct),
`multiple: true` = select-all (exact-set grading, no partial credit).
Coexists with the `cloze` select/multiselect vehicle - nothing deprecated.
New rules `E-MC-OPTIONS` / `E-MC-ONE-CORRECT` / `E-MC-MIN-CORRECT` /
`E-MC-DUP-OPTION`. **Not yet rendered by the app** - the app-side renderer +
grader (part 2) makes it a complete feature; the app re-pins then.

## [0.7.0] - 2026-07-10

Feature (Bucket B): matching `from_cards`. A `matching` exercise
can derive its `pairs` from the referenced cards (left = `front`,
right = `back`) instead of duplicating them - set `"from_cards": true` with
`card_ids` and omit `pairs`. The engine resolves it to concrete pairs at parse
time, so no renderer changes. Additive + optional; `x-schema-version` stays
`1.5`. New rules `E-MATCH-FROMCARDS-CARDS` / `E-MATCH-FROMCARDS-PAIRS`. First
schema feature authored in the engine post-flip.

## [0.6.1] - 2026-07-10

Tooling: the lesson TypeScript types are now regenerated from
`schema/lesson.schema.json` by an in-engine generator
(`scripts/generate-lesson-types.mjs`, `make sync-types`), gated in
`release-check` + CI (`--check`). Completes the D1b follow-up (type generation
moved here). Types are byte-identical; only the generator banner changed. No
API or schema change.

## [0.6.0] - 2026-07-10

**Schema authority moved to the engine** (roadmap stage 4). The
lesson schema is now the authored canonical source here; the app and content
repos consume it (source-of-truth chain: engine → app + content). The flip is
**byte-equivalent** - only the `$id` changed (now engine-owned,
`https://astrapi69.github.io/learn-content-engine/schema/...`); same types,
fields, enums and constraints, and `x-schema-version` stays `1.5`. A frozen byte
baseline (`src/schema-baseline.test.ts`) guards against content drift. No
behavior change; consumers re-pin to 0.6.0.

## [0.5.0] - 2026-07-10

Author ergonomics (additive, back-compat): `validate*` gains a
non-blocking `warnings[]` layer and every issue carries a stable `id`,
`severity` and `docAnchor` (`valid` stays errors-only). New author lints -
unused cards, ambiguous matching, duplicate word tiles, answer-as-distractor,
duplicate picture labels, length-revealing hints. A `learn-content-engine lint`
CLI runs the full gate (errors + warnings) offline with `--json`. A rule
catalog + editor-setup section in the docs (catalog completeness is tested).
The app-side items (a `multiple_choice` type, word_tiles grade-by-string) are
co-designed in [a proposal](docs/proposals/author-ergonomics-app-track.md).

## [0.4.0] - 2026-07-07

Distribution: `schema/quality-rules.json` ships as a package
artifact (the shared quality minimums generated by the app, new exports
subpath, sync-procedure step - closes issue #1, content repos can mirror the
numbers from the pinned release), and a `prepare` script builds `dist/` on
git installs (`npm install github:astrapi69/learn-content-engine#<rev>`),
documented as an Install subsection. Additive; no API change.
- **0.3.1** — Documentation: a self-contained `docs/` set (getting-started,
concepts, lesson-format reference, validation, architecture) + `CONTRIBUTING`,
README trimmed to an entry point. Every `json` example in the format reference
is extracted and validated by a test (one per exercise type + cloze mode).
Docs-only; no API change.
- **0.3.0** — Conformance suite: an explicit, opt-in `validateLesson` /
`validateManifest` API (`ajv` against the bundled, strict
`schema/lesson.schema.json` + semantic rules mirroring the app's
`model_validator`s), the schema shipped as a package artifact, a vendored
fixture per `ExerciseType`/mode with round-trip + negative suites, and a
`make conformance-real` target that runs the full pipeline over both content
repos (513 lessons, 100% parse). Additive; 1.4/1.5 lessons stay valid.
- **0.2.0** — Schema nachzug 1.4 → 1.5: additive `examples`
(`ContentLessonInlineExample`: `content` + optional `language` / `title`) on
theory steps and exercises, coexisting with the v1.4 `example_url`. Parity
with adaptive-learner `develop` @ `7287b045`. 1.4 lessons stay valid.
- **0.1.0** — Initial extraction of the content engine (schema v1.4).
