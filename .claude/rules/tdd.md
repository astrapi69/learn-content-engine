# Test-Driven Development (TDD)

This is the WORKFLOW rule for writing code. It sits on top of the test
discipline in `coding-standards.md` ("failing test FIRST, then fix";
happy path + error case as the floor). Where that states *what* and
*how much* to test, this rule states the *order*: test first, then the
minimal code, then cleanup.

Adapted from the adaptive-learner project for this TypeScript library.
The tools here are `tsc` + Vitest (there is no Python/pytest side).

## Pflicht für Code-Änderungen mit Logik

Code-Änderungen mit Verhalten/Logik folgen dem Red-Green-Refactor-Zyklus.
"Mit Logik" heißt: ein neues Verhalten, ein geänderter Code-Pfad, eine
Bedingung, eine Berechnung, eine Validierung, ein Mapping (z. B. ein
neuer Source-Adapter, ein neuer Manifest-Zweig, eine geänderte
`resolve*`-Regel). Reine Mechanik ohne Verhaltensänderung fällt unter
die Ausnahmen unten.

### Phase 1: RED (Test zuerst)

- Test schreiben, der die gewünschte Änderung beschreibt.
- Der Test MUSS fehlschlagen (beweist, dass das Feature/der Fix noch
  nicht existiert).
- Kein Produktionscode vor dem fehlschlagenden Test.

### Phase 2: GREEN (minimale Implementierung)

- Nur den Code schreiben, der den Test grün macht.
- YAGNI: keine vorzeitige Optimierung, kein Code "für später".
- `npm run typecheck` (`tsc --noEmit`) + `npm test` (Vitest) grün.

### Phase 3: REFACTOR (aufräumen)

- Code-Smells, Duplikation, Benennung verbessern (Boy-Scout-Rule,
  `coding-standards.md`).
- Tests bleiben grün.

## Test-Menge pro Feature/Fix

Der MINIMAL-Boden für triviale neue Funktionen ist happy path + ein
Fehlerfall. Für ein echtes Feature oder einen Fix ist das ZIEL die
folgende Aufteilung - mindestens vier Tests, die zusammen das Verhalten
absichern:

1. **Reproduktionstest** - der Red-Test vor dem Fix/Feature.
2. **Happy-Path** - der erwartete Normalfall.
3. **Edge-Cases** - leere/fehlende/unerwartete Eingaben (fehlendes
   `title`, leerer YAML-String, ungültiges JSON, nullish Felder).
4. **Grenzwerte / Boundary** - die Ränder des gültigen Bereichs
   (Legacy-`language`-Alias vs. `target_language`, `?? "en"`-Default,
   `cached_version === version` als Grenze zu `update_available`).

Boden und Ziel sind KEIN Widerspruch: der Boden gilt für triviale neue
Funktionen, das Ziel für Features und Fixes. Mehr Tests sind erlaubt,
weniger als der Boden nicht. Keine künstlichen Tests nur zum Zählen -
jeder Test prüft eine echte Verhaltenseigenschaft. Sinnvolle Abdeckung
ist das Ziel, nicht die Prozentzahl: neue Verhaltenszweige (jeder `??`,
jedes `? :`, jede Guard-Clause) gehören abgedeckt.

## Bug-Fixes

- IMMER zuerst einen Test, der den Bug reproduziert (RED, beweist den
  Bug).
- Dann fixen bis GREEN.
- Der Reproduktionstest bleibt als Regressions-Guard im Repo.
- Erst den Fehler reproduzierbar machen, dann fixen - kein Fix ohne
  verstandene Ursache.

## Ausnahmen (etablierte Projektpraxis)

TDD wird NICHT erzwungen für:

- Reine Doku-Änderungen (kein Code).
- Reine Konfiguration (CI, Makefile, `tsconfig`, YAML) ohne Logik.
- Mechanische Refactors mit bestehender Testabdeckung: Datei-Splits,
  Barrel-/Re-Export-Umzüge, Schema-/Typ-Generierung
  (`lesson-schema.generated.ts`). Hier MUSS die bestehende Suite grün
  bleiben (beweist, dass nichts brach), aber es werden keine neuen
  Verhaltenstests erzwungen.

Die Ausnahmen entbinden nicht von der harten Regel "`npm test` muss
nach jeder Änderung grün bleiben".
