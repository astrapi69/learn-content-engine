---
title: "Schema-First Content Engineering"
description: "Wie learn-content-engine ein stabiles Kern-Schema behält und trotzdem Raum für pädagogische Erfindung lässt: durch eine harte Linie zwischen dem Vertrag, den es besitzt, und den Regeln, die seine Consumer besitzen."
date: 2026-07-14
tags: [architecture, schema-design, typescript, content-engineering]
---

# Schema-First Content Engineering

*Wie `learn-content-engine` ein stabiles Kern-Schema behält und trotzdem Raum für pädagogische Erfindung lässt: durch eine harte Linie zwischen dem Vertrag, den es besitzt, und den Regeln, die seine Consumer besitzen.*

`learn-content-engine` · Schema aktuell v1.8 · framework-agnostisches TypeScript

## Das Content-Schema-Dilemma

`learn-content-engine` ist eine framework-agnostische TypeScript-Bibliothek, die Lerninhalte parst und validiert: Sprachkurse zuallererst, wobei ein frei belegbares `domain`-Feld dieselbe Form auch andere Wissensgebiete tragen lässt (Technik-Kurse, Führerschein-Vorbereitung, Psychologie). Sie verwandelt Rohquellen (Lektions-JSON plus eine `manifest.yaml`) in eine kanonische interne Form, und sie ist die einzige Quelle der Wahrheit für das Lektions-Schema, aktuell Version 1.8.

Der Kern ist bewusst klein. Kein Rendering, keine Persistenz, kein Netzwerk; die einzige Laufzeit-Abhängigkeit ist ein YAML-Parser. Was er bietet, ist reine Validierung und Transformation. Dieser Minimalismus ist der Punkt, und er erzwingt eine harte Frage: *Wie entwickelt man ein Content-Schema weiter, ohne jeden Consumer zu brechen, der davon abhängt?*

Sprachlern-Inhalte halten nicht still. Neue Übungstypen tauchen ständig auf (Kategorisierung, Fehlerkorrektur, benotete Quizze), alte verblassen, und in der Produktion zeigen sich Randfälle, die niemand vorgesehen hat. Ein Content-Schema muss stabil genug sein, um Inhalte über mehrere Repositories hinweg zu versionieren, und zugleich locker genug, um pädagogische Ideen aufzunehmen, die beim Schreiben noch nicht gedacht waren. Stabilität gegen Evolution: Diese Spannung ist das ganze Design-Problem, und der Rest dieses Textes ist, wie wir sie aufgelöst haben.

## Das Schema ist die Quelle der Wahrheit, nicht die Typen

Die erste Entscheidung war, das JSON-Schema autoritativ zu machen und die TypeScript-Typen als sein Artefakt zu behandeln, niemals umgekehrt. Die Schleife ist:

- Die Form in `lesson.schema.json` definieren.
- Die TypeScript-Typen daraus generieren, via `scripts/generate-lesson-types.mjs`.
- Inhalte in `validate.ts` gegen das Schema validieren.
- Die Validierung Autoren über eine CLI zugänglich machen: `learn-content-engine lint <file>`, verdrahtet in das `make lint` jedes Content-Repos.

Das schließt die Tür vor Schema-Drift: dem vertrauten Versagen, bei dem Dokumentation, Code und Validierung leise auseinanderlaufen, bis niemand mehr sicher ist, was stimmt. Ändern Sie das Schema, und die Typen regenerieren sich, die Validierung folgt, die CLI meldet die neuen Regeln. Ein Ort zum Nachsehen, ein Ort zum Ändern.

Das Schema beschreibt die kanonische Struktur und nichts darüber hinaus: Lektionen enthalten Schritte, Schritte enthalten Übungen, jede Übung hat einen Typ mit eigener Payload-Form, und die Engine prüft, dass Inhalte dem entsprechen. Womit die härtere Frage aufgestellt ist, die es noch nicht beantwortet: Was tun, wenn Sie einen Typ brauchen, den das Schema nie gesehen hat?

## Was ein Kern-Typ wirklich kostet

Einen neuen *Kern*-`ExerciseType` hinzuzufügen ist keine kleine Änderung. Es ist eine Produkt-Festlegung mit hoher Rückbau-Hürde, und die Kosten fallen größtenteils außerhalb der Engine an.

Verfolgen Sie, was ein einzelner Kern-Typ berührt:

- **Schema.** `lesson.schema.json` bekommt einen Enum-Wert und eine Payload-Definition (ein additiver Minor-Sprung, 1.8 auf 1.9).
- **Typen.** `generate-lesson-types.mjs` regeneriert die Interfaces; jeder Consumer übernimmt die neue Form.
- **Spiegel.** Zehn Content-Repositories spiegeln das Schema (das offizielle Repo, das Test-/Starter-Repo, das Template und sieben `alc-*`-Domänen-Repos, plus die generierte Kopie der App selbst), und Byte-Paritäts-Gates halten sie ehrlich.
- **Dispatcher & Renderer.** Der Übungs-Dispatcher der App braucht einen neuen Zweig und eine neue Renderer-Komponente.
- **i18n.** Elf Sprachkataloge brauchen Anweisungs-Schlüssel, Feedback und Fehlertexte.
- **Validierung.** `validate.ts` braucht Regeln für die neue Form: Wohlgeformtheit, feldübergreifende Integrität.
- **Migration & Doku.** Bestehende Inhalte brauchen womöglich eine Migration; Architektur- und Contributor-Doku müssen nachziehen.

Nichts davon ist für sich exotisch. Die Kosten sind die Koordination: synchronisierte Releases über Repositories hinweg, Rückwärtskompatibilitäts-Garantien und Tests, die das ganze Content-Ökosystem umspannen. Und es ist eine Einbahn-Tür. Sobald Inhalte in freier Wildbahn einen Kern-Typ verwenden, bedeutet sein Entfernen einen Deprecation-Zyklus, einen Migrationspfad und einen Breaking Change für jeden Consumer. Ein Kern-Typ ist dauerhaft auf eine Weise, wie es der meiste Code nicht ist, und genau deshalb sollte er nie eine beiläufige Entscheidung sein.

## Die Erweiterungs-Schicht

Der Ausweg ist die *Erweiterungs-Schicht*: ein Mechanismus, um Übungstypen hinzuzufügen, ohne das Kern-Schema überhaupt anzufassen. Drei Schema-Felder machen es möglich.

```json
// the exercise's type: a namespaced ext id
"type": { "pattern": "^ext:[a-z0-9]+-[a-z0-9-]+$" }

// its payload, opaque to the core engine
"ext_payload": { "type": "object", "additionalProperties": true }

// declared at the lesson level, versioned by major
"requires_extensions": {
  "items": { "pattern": "^ext:[a-z0-9]+-[a-z0-9-]+@\\d+$" }
}
```

Ein Erweiterungstyp trägt einen Namensraum-Namen (`ext:<vendor>-<name>`, zum Beispiel `ext:al-graded-quiz`), legt seine Daten in die opake `ext_payload` und wird von der Lektion in `requires_extensions` deklariert, mit gepinnter Major-Version (`ext:al-graded-quiz@1`). Dieser Versions-Pin ist die Portabilitäts-Garantie: Ein Consumer, der eine deklarierte Erweiterung nicht registriert hat, weist die Lektion laut mit `E-EXT-UNSUPPORTED` ab, statt sie falsch zu rendern.

Die Aufteilung der Verantwortung ist die ganze Idee:

| Die Engine besitzt | Der Consumer besitzt |
|---|---|
| Das Parsen von Typ und Payload aus JSON/YAML | Payload-Validierung: die Form innerhalb von `ext_payload` |
| Strukturelle Validierung: das Typ-Muster, den Versions-Pin | Rendering: die Oberfläche der Übung |
| Den Lade-Wächter: ist die Erweiterung registriert? | Fachlogik: Bewertung, verteilte Wiederholung, Feedback |

Die Engine besitzt den Vertrag; der Consumer besitzt die Regeln. Nichts im Erweiterungs-Namensraum ist app-spezifisch: Die Engine wählt keinen Vendor. Ihre eigenen Referenz-Implementierungen leben unter `src/examples/ext-ref-*` und verwenden den neutralen Vendor `ref` (`ext:ref-categorization`, `ext:ref-graded-quiz`); ein echter Consumer wählt seinen eigenen Vendor und registriert seine eigenen Validatoren. Die Referenz-App, `adaptive-learner`, adoptiert sie unter dem Vendor `al`.

Was das einbringt, ist Bewegungsfreiheit: experimentieren, ohne den Kern zu destabilisieren, eine Payload-Form ändern, ohne andere Consumer zu brechen, und jeden Consumer nach eigenem Zeitplan adoptieren lassen statt nach dem der Engine. Der Kompromiss ist ehrlich: Erweiterungen sind nicht von Haus aus portabel. Ein Consumer, der nie von `ext:al-categorization` gehört hat, zeigt einen Platzhalter und sagt es. Diese Weigerung ist das Feature: Portabilität wird eine explizite Adoptions-Entscheidung statt einer stillen Annahme.

## Vier Adoptionen, ein Rezept

Vier Erweiterungstypen sind diesen Weg vollständig gegangen. Jeder hat einen anderen Teil des Designs belastet.

### `ext:al-categorization`: Sortieren in Behälter

Lernende sortieren Elemente in feste Kategorien. Die Payload ist so schlicht, wie sie aussieht:

```json
{
  "categories": [
    { "name": "Nouns", "items": ["Haus", "Auto", "Buch"] },
    { "name": "Verbs", "items": ["gehen", "laufen"] }
  ]
}
```

Einfache Payload, direkter Renderer. Der interessante Teil war das Rezept, das sie etabliert hat und das seither jede Adoption wiederholt: ein `ref`-Beispiel in der Engine, dann ein `SUPPORTED_EXTENSIONS`-Eintrag und ein Renderer in der App, dann ein Allowlist-Eintrag im Content-Gate (`validate_with_engine.mjs`). Die Erweiterungs-Schicht hat genau getan, was sie versprochen hat.

### `ext:al-error-correction`: das falsche Token markieren

Lernende sehen einen tokenisierten Satz mit einem falschen Token und korrigieren es.

```json
{
  "tokens": ["Ich", "gehe", "nach", "Hausee"],
  "error_index": 3,
  "accept": ["Hause"]
}
```

Beachten Sie die Form: Der Satz ist ein `tokens`-Array, kein String; `error_index` ist 0-basiert, innerhalb des Token-Bereichs; und die akzeptierten Antworten sind *Korrekturen*. Der Vertrag verlangt, dass jeder Eintrag sich vom markierten Token unterscheidet, damit sich das falsche Token nicht in die Accept-Liste schleichen kann. Das `accept`-Array kam als Vertrags-Verfeinerung *während* der Adoption, nicht in der Engine. Genau so soll die Schicht arbeiten: Die Engine hat die Payload nie inspiziert, also konnte sich die Form schärfen, ohne Schema-Änderung und ohne koordinierten Release.

### `ext:al-reading-comprehension`: ein geteilter Stimulus mit Unterfragen

Eine Passage, gefolgt von mehreren gebundenen Fragen. Dieser Typ *hätte* Kern sein können: Er braucht eine wirklich neue Struktur (einen geteilten Stimulus mit Unterfragen), die das "ein Schritt, eine Übung"-Modell des Schemas sprengt. Wir haben ihn trotzdem als Erweiterung gebaut.

```json
{
  "passage": "Berlin ist die Hauptstadt von Deutschland...",
  "questions": [
    { "prompt": "Was ist Berlin?", "type": "free_text", "accept": ["die Hauptstadt"] },
    { "prompt": "In welchem Land liegt Berlin?", "type": "free_text", "accept": ["Deutschland"] }
  ]
}
```

Unterfragen tragen ihren eigenen `type` und können ebenso gut Multiple-Choice sein (mit einem `options`-Array) wie Freitext; der Renderer nutzt die vorhandenen Grader der App wieder. Warum nicht Kern? Das Datenmodell war nicht erprobt, und wir wollten die Interaktion ausprobieren, bevor wir das Schema darauf festlegen. Eine Erweiterung lässt sich später jederzeit zum Kern befördern; herabstufen lässt sie sich nicht billig. Wenn die Form unsicher ist, ist die Erweiterung der sichere erste Zug.

### `ext:al-graded-quiz`: Bewertung mit Teilpunkten

Ein in sich geschlossenes benotetes Fragen-Set: Punkte pro Frage, anteilige Teilpunkte bei Mehrfachauswahl, eine optionale Bestehens-Schwelle.

```json
{
  "pass_threshold": 60,
  "questions": [
    {
      "prompt": "What is the capital of France?",
      "type": "multiple_choice",
      "options": [
        { "text": "Paris", "correct": true },
        { "text": "London" },
        { "text": "Berlin" }
      ],
      "points": 2
    }
  ]
}
```

Korrektheit wird *inline* an jeder Option markiert (`{ text, correct }`), niemals als Index in das Options-Array. Das ist kein Zufall: Index-basierte Antworten sind eine bekannte Falle in diesem System (ein Index-bewertender Renderer ist genau das, wogegen der `W-TILES-DUP`-Lint und Issue engine#19 wachen), also vermeidet die Payload sie per Konstruktion. Auf der Consumer-Seite hielt das Design zwei Bewertungen getrennt: die SRS-Bewertung (richtige Fragen, für XP) und die Test-Bewertung (Punkte und Bestehen/Durchfallen, für die Benotung), damit Lernfortschritt und formale Benotung einander nie verunreinigen. Die Engine hat, wie immer, zu nichts davon eine Position bezogen.

## Kern oder Erweiterung?

Nach vier Adoptionen und mehreren Diskussionsrunden verdichtet sich die Frage auf einen Test:

> **Kern:** Braucht es eine grundlegend neue Datenform, die *jeder* Consumer verstehen muss? Dann ist es eine Kern-Änderung, nach sorgfältiger Abwägung.
>
> **Erweiterung:** Ist es eine bestehende Form plus spezifisches Consumer-Verhalten oder Rendering? Dann ist es eine Erweiterung.

An diesem Test aufgereiht ordnen sich die vier sauber, und der überraschende Fall ist der, den wir bewusst nicht befördert haben:

| Typ | Lesart | Urteil |
|---|---|---|
| categorization | Eine bestehende Form (matching) mit spezifischer Behälter-Oberfläche | **Erweiterung** |
| error-correction | Tokens plus markierter Index und akzeptierte Korrekturen | **Erweiterung** |
| graded-quiz | Multiple-Choice plus Bewertungs- und Bestehens-Logik | **Erweiterung** |
| reading-comprehension | Eine wirklich neue Form: geteilter Stimulus, gebundene Unterfragen | *Könnte Kern sein, Erweiterung gewählt* |

Vor alldem lohnt eine Vorfrage, weil sie das Ganze oft auflöst: *Lässt sich die Idee mit bestehenden Typen plus Metadaten ausdrücken?* Wenn ja, fügen Sie gar nichts hinzu. Erst wenn die Antwort ehrlich Nein lautet, beginnt die Kern-oder-Erweiterung-Wahl überhaupt, und selbst dann ist die Erweiterung für das meiste, was übrig bleibt, der richtige Standard. Kern-Typen sind für die kleine Menge von Formen, die wirklich universelles Verständnis verlangen.

## Wo uns das hinstellt

Ein Content-Schema kann stabil und entwickelbar zugleich sein, aber nur, wenn man den Vertrag von den Regeln trennt. Die Engine besitzt den Vertrag: Struktur, Validierung, den Lade-Wächter. Der Consumer besitzt die Regeln: Payload-Form, Rendering, Fachlogik. Halten Sie diese Linie, und der Rest folgt.

Vier Dinge, die das in der Praxis eingebracht hat:

- **Schema-first tötet Drift.** Eine Quelle der Wahrheit für Typen, Validierung und Doku.
- **Kern-Typen sind teuer.** Die Welle ist real, und die Tür öffnet nur in eine Richtung. Fügen Sie sie nicht beiläufig hinzu.
- **Erweiterungen sind der richtige Standard.** Sie erlauben Experimente, ohne den Kern zu riskieren.
- **Der Vertrag ist das Produkt.** Die saubere Trennung zwischen Engine und Consumer ist, was das Ganze wartbar hält.

Einiges ist bewusst unfertig und als Issue verfolgt, statt als stille Schuld mitgeschleppt:

- **Die Erweiterungs-Validatoren veröffentlichen.** Heute ist das Content-Gate permissiv: Es prüft, dass eine deklarierte Erweiterung auf der Allowlist steht, validiert aber die Payload nicht; diese Korrektheit bleibt Aufgabe des Consumers. Die Payload-Validatoren des Consumers zu veröffentlichen, damit das Gate sie wiederverwenden kann, würde das straffen. Es ist eine Verbesserung, kein Blocker; bewusst zurückgestellt.
- **Reine Test-Sets.** Content-Repos erzwingen Qualitäts-Mindestwerte (mindestens fünf Übungen, zwei Übungstypen, ein Theorie-Schritt pro Lektion), die ein reines benotetes "Test"-Set nicht erfüllen kann. Ob diese Mindestwerte für reine Test-Lektionen gelockert werden, ist eine offene, bewusste Qualitäts-Boden-Entscheidung.

> **Eine Anmerkung zur Ehrlichkeit.** Das sind absichtlich verschobene Entscheidungen, jede mit aufgeschriebenem Grund, keine später entdeckten Versäumnisse. Der Unterschied zählt: Verfolgtes "später" ist ein Plan; unverfolgtes "später" ist Schuld in Verkleidung.

Die Engine ist mit Absicht klein, und das meiste, worauf sie achtet, ist, was sie sich weigert zu tun. Content-Schemas sind schwer und Evolution ist unvermeidlich; die Erweiterungs-Schicht ist, wie dieses hier für beides baut, ohne die Spannung wegzureden. Wenn Sie eine eigene Content-Engine bauen, ist die früh zu beantwortende Frage schlicht: *Was ist Ihre Erweiterungs-Strategie?* Die Naht lässt sich leichter eindesignen als nachrüsten.

---

*Der Kern besitzt den Vertrag. Consumer besitzen die Regeln.*
