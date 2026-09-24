# App-track proposal: `multiple_choice`, word_tiles grading, `from_cards`

This is a **co-design spec for the adaptive-learner app**, not engine work. The
lesson schema's source of truth is the app's Pydantic model (EXP-039); these
three items change the schema and/or grading, which live there. Once the app
ships them, the engine follows via the
[schema-sync procedure](../../README.md#schema-sync-from-adaptive-learner). File
references below are in `astrapi69/adaptive-learner`.

Companion to the engine-side author-ergonomics work (warnings, rule IDs, lint
CLI), which is already shippable without any of this.

---

## 1. `multiple_choice` as a first-class type (schema + renderer + grading)

### Design tension to resolve first (product decision)

The app **deliberately has no `multiple_choice` type today**: text multiple
choice is `cloze` `select` mode by design (EXP-036 §4.3, #890). This is
documented (`docs/help/en/developer/authoring-content.md:233`, "Deliberately
excluded") and **test-enforced**: `ExerciseDispatcher.type-parity.test.ts`
asserts the renderer registry equals the schema enum, and its own comment states
the position. A new enum value with no renderer turns that test red.

So this is not a pure "add a type" task. It needs a decision:

- **Option A: Supersede.** `multiple_choice` becomes the canonical text-MC type;
  `cloze` `select`/`multiselect` become a deprecated authoring form (still valid,
  auto-migratable). Cleanest data model long-term; larger renderer/docs change.
- **Option B: Coexist.** Keep cloze-select as the low-level vehicle; add
  `multiple_choice` as an authoring-friendly sugar that the loader/renderer maps
  onto the same grading. Less disruptive; two ways to express the same thing.

Recommendation: **Option A with a deprecation window**. The author pain the
request describes (abusing `cloze`+`___` for MC, marker/blanks confusion) is
exactly what a first-class type removes, and keeping two long-term is the
duplication #5 warns about at the schema level.

### Proposed shape

```jsonc
{
  "type": "multiple_choice",
  "prompt": "Wer hat an einer Kreuzung ohne Zeichen Vorfahrt?",
  "card_ids": ["rvl"],
  "options": [
    { "text": "Wer von rechts kommt", "correct": true },
    { "text": "Wer von links kommt" },
    { "text": "Das größere Fahrzeug" }
  ],
  "multiple": false,   // false = exactly one correct; true = "select all that apply"
  "hint": "…"
}
```

Structure makes the old `accept`/`distractor` disjointness impossible to get
wrong: correctness is a per-option boolean, not two lists that must be disjoint.

### Schema changes (Pydantic, `plugins/.../schema.py`)

- Add `MULTIPLE_CHOICE = "multiple_choice"` to `ExerciseType` (`schema.py:66-81`).
- Add a `MultipleChoiceOption` model (`{text: str (1..500), correct: bool = false}`,
  `extra="forbid"`) and optional `options: list[...] | None`, `multiple: bool = false`
  fields on `Exercise`.
- Register `_validate_multiple_choice_fields` in the `_enforce_type_specific_fields`
  dispatcher (`schema.py:662-682`):
  - `len(options) >= 2`;
  - `multiple=false` -> exactly one `correct`; `multiple=true` -> `>= 1` correct;
  - option `text` values unique (mirror of the engine's ambiguity warnings).
- Bump `CURRENT_SCHEMA_VERSION` `1.5 -> 1.6` (`models.py:42`): minor, additive;
  `is_supported_schema_version` (major match) keeps 1.x content valid.
- Regenerate artifacts: `make sync-schema` (never hand-edit generated files).

### Renderer + grading (frontend)

- New `MultipleChoiceExercise` renderer; add `"multiple_choice"` to
  `SUPPORTED_EXERCISE_TYPES` and a dispatch branch in `ExerciseDispatcher.tsx`
  (the parity test then passes). Reuse `ChoiceButtonGroup` from the cloze-select
  renderer; grade single = one correct pick, multi = exact-set over the `correct`
  options (reuse `_exactSetCorrect` from `ClozeMultiSelect.tsx:61-70`).
- Update `authoring-content.md` (§ catalog line 233, § Multiple Choice) and the
  `adding-exercise-type.md` recipe outcome.

### Migration helper (old -> new)

- `cloze` `select`  -> `{type: multiple_choice, multiple:false, options:[{text: blank.accept[0], correct:true}, ...distractors.map(text=>({text}))]}`.
- `cloze` `multiselect` -> `{type: multiple_choice, multiple:true, options:[...accept.map(t=>({text:t,correct:true})), ...distractors.map(text=>({text}))]}`.
- Ship as a one-shot codemod over content repos; keep the old forms valid during
  the deprecation window.

### Engine follow-up (after the app ships it)

Vendor the regenerated schema + types; add `checkMultipleChoice` in
`src/validate.ts` (since 0.29.0 the semantic rules live in `src/rules.ts`) (options>=2, correct-count rule) with `E-MC-*` ids + a
`W-MC-DUP-OPTION` warning; add a conformance fixture + rule-catalog rows; bump the
engine minor.

---

## 2. `word_tiles`: grade by resulting string (fixes duplicate tiles)

### The bug

Grading is by **index ordering**, not resulting string
(`frontend/src/lib/exercises/word-tiles-equivalence.ts:203-227`,
`isWordTilesCorrect`). The learner's answer is `placed: number[]`; targets are
index sequences (`[0..n-1]` plus `accept_orderings`) compared with `arraysEqual`.
With two identical-text tiles (e.g. `["Lieber","kurz","und","oft","als","lang","und","selten"]`,
two `"und"`), swapping them yields the **same sentence** but a different index
array, so it grades **wrong**.

### Minimal, additive change

Add a string-equality layer inside `isWordTilesCorrect` (keep the existing index
layers):

```ts
const asText = (order: readonly number[]) => order.map((i) => tiles[i]).join("\u0000");
const placedText = asText(placed);
for (const target of targets) {
  if (placedText === asText(target)) return true;
}
```

Any permutation whose **label sequence** equals an accepted ordering now counts
as correct, exactly resolving identical duplicate tiles. Pure, back-compat
(only ever accepts more, never fewer), no schema change. The per-tile display
helper already forces all-green on a fully-correct answer
(`WordTilesExercise.tsx:134-140`), so "My answer" stays consistent.

TDD: RED first, a duplicate-tile swap must grade correct
(`word-tiles-equivalence.test.ts`).

### Engine follow-up

No schema change, so nothing to vendor. The engine already ships the matching
**warning** `W-TILES-DUP` (duplicate tiles without `accept_orderings`), which
nudges authors even before the app grades leniently.

---

## 3. `from_cards` / `*_ref` against content duplication (optional, additive)

Lower priority. Let `matching` derive `pairs` from cards instead of copy-paste:

- Additive optional fields on `Exercise` (Pydantic): `from_cards: bool = false`
  (build `pairs` from each referenced card's `front`/`back`) and/or per-pair
  `left_ref` / `right_ref` like `"<card-id>.back"`.
- Validator: when `from_cards`, require non-empty `card_ids` and forbid explicit
  `pairs`; resolve refs against the lesson's cards.
- Back-compat: explicit `pairs` stays the default.
- Engine follow-up: vendor the fields; resolve refs during `parseLesson` (the
  canonical object still ends up with concrete `pairs`); add a `W-PAIR-DRIFT`
  warning (a `right` that nearly-but-not-exactly equals a `card.back`).

---

## Sequencing

1. **word_tiles grade-by-string**: smallest, pure, highest learner impact, no
   product decision needed. Do first.
2. **`multiple_choice`**: needs the supersede-vs-coexist decision, then schema +
   renderer + migration. Largest.
3. **`from_cards`**: optional ergonomics; do last or defer.
