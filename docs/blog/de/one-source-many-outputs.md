---
title: "Eine Quelle, viele Ausgaben"
description: "Eine Lektion einmal schreiben und jede Ausgabe daraus ableiten (eine interaktive App-Übung, ein druckbarer Test mit Lösungsschlüssel und ein LMS-Import) aus einer einzigen validierten Quelle, ohne Kopien synchron zu halten."
date: 2026-07-14
tags: [content-pipeline, education, validation, authoring, qti]
---

# Eine Quelle, viele Ausgaben

*Schreiben Sie eine Lektion einmal. Liefern Sie sie als interaktive App-Übung, als druckbaren Test mit Lösungsschlüssel und als LMS-Import aus: alles aus einer einzigen validierten Quelle, ohne drei Kopien synchron zu halten.*

`learn-content-engine` · für Autoren, Technische Redakteure, Tooling & Produkt

## Dieselbe Lektion, drei Ziele

Ein einzelnes Stück Lerninhalt hat selten nur ein Zuhause. Ein benotetes Quiz zum Passiv muss eine **interaktive Übung** in der Lern-App werden, mit verteilter Wiederholung, die verfolgt, wie sich jeder Lernende schlägt. Dasselbe Quiz muss ein **druckbarer Test** werden, den eine Lehrkraft auf Papier austeilt, plus ein getrennter Lösungsschlüssel mit den Punkten. Und es muss vielleicht ein **LMS-Import** werden, damit es in Moodle oder Canvas neben allem anderen leben kann.

Der naive Weg ist, jedes davon von Hand zu autorieren. Drei Kopien, drei Formate, und in dem Moment, in dem Sie in einer einen Tippfehler korrigieren, sind die anderen beiden falsch. Das ist Content-Drift, und es ist der Normalzustand der meisten Bildungsinhalte, sobald sie ein einzelnes Werkzeug verlassen.

Die um `learn-content-engine` gebaute Pipeline nimmt den anderen Weg: **einmal autorieren, in kanonischer Form, dann jede Ausgabe daraus ableiten.** Die Quelle ist das, was Sie pflegen; das App-Rendering, das PDF und der LMS-Export sind allesamt nachgelagerte Projektionen davon. Diese Anleitung geht die Pipeline von der Tastatur des Autors bis zur gedruckten Seite durch, und sie ist ehrlich darüber, wo jede Ausgabe endet.

## Was Sie wirklich schreiben

Ein Autor schreibt zwei Arten von Datei, beide reiner Text und in einem Pull Request begutachtbar.

Eine **Lektion** ist JSON: Karten (die Vokabeln oder Fakten) und Schritte (Theorie und Übungen). Ein **Manifest** (`manifest.yaml`) gruppiert Lektionen zu *Sets* und deklariert, was jedes Set ist:

```yaml
sets:
  - id: passiv-b1
    title: "Passive voice (B1)"
    target_language: de
    source_language: en
    level: B1
    path: sets/en/de-b1
    version: "1.2.0"
    lesson_count: 8
```

Die Engine verwandelt das an genau einer Grenze in kanonische Objekte (Rohquelle zu kanonischem Modell) und sonst nichts. Die `sets[]` des Manifests werden `ContentSetEntry`-Projektionen; das JSON jeder Lektion wird eine `ContentLesson`. Das Set ist autoritativ für die Dinge, die eine Lektion nicht wiederholen sollte: Eine Lektion erbt `target_language`, `source_language` und Domäne ihres Sets, sofern sie nichts anderes sagt. Autorieren Sie das Paar einmal; der Kontext fließt nach unten.

Drei Dinge bleiben in dem, was Sie schreiben, bewusst getrennt: der **Inhalt** (die Frage, die Karten), die **richtige Antwort** (welche Optionen stimmen, welcher Text akzeptiert wird) und alles über **Darstellung und Bewertungs-Politik**: wie gerendert wird, wie Punkte berechnet werden, wie Teilpunkte funktionieren. Sie autorieren die ersten beiden. Das Dritte wird nachgelagert entschieden, von derjenigen Ausgabe, die die Lektion gerade konsumiert. Diese Trennung ist, was eine Quelle mehrere Ausgaben speisen lässt, ohne sich selbst zu widersprechen.

Sie müssen dieses JSON nicht von Hand schreiben. Die Referenz-App liefert einen **Lektions-Editor** mit, der dem Wort "einfach" entwachsen ist: der klassische vierstufige Assistent (Metadaten, Karten, Übungen, Speichern & Teilen), ein Buch-Pfad, der eingefügte oder hochgeladene Lehrbuchkapitel in Wissens-Lektionen verwandelt, ein Erweiterungs-Zweig, der selbst benotete Quizze und Diktate ohne JSON autorierbar macht, und ein Bearbeitungsmodus. All das erzeugt Lektionen in demselben kanonischen Schema und kann sogar direkt aus der App einen Pull Request gegen ein Content-Repository öffnen; [Teil 3 der Serie](create-a-lesson-in-the-app.md) geht jeden Pfad durch. Was darüber hinaus **geplant** ist, ist ein reicherer, auf Lehrende zugeschnittener Editor für die schwereren Fälle (größere Sets). Beides ändert das Modell nicht: Die Quelle bleibt der Vertrag, und jeder Editor (einfach oder reich) ist nur ein weiteres Werkzeug, das ihn liest und schreibt.

> **Additiv per Politik.** Das Schema ist versioniert (aktuell 1.8) und wächst nur additiv: Neue Felder sind optional, eine letztes Jahr geschriebene Lektion validiert also heute noch. Sie werden nie gezwungen, Inhalte zu migrieren, nur weil sich das Schema bewegt hat.

## Validierung ist Rechtschreibprüfung für Test-Logik

Bevor irgendeine Ausgabe erzeugt wird, wird die Quelle validiert. Das ist das nützlichste Einzelne, das die Engine für einen Autor tut, und man denkt am besten genauso darüber wie über eine Rechtschreibprüfung: Sie fängt die Fehler, die man beim Wiederlesen nicht sieht.

Ein Befehl erledigt es, in jedem Content-Repo als `make lint` verdrahtet, oder direkt auf einer Datei:

```shell
make lint                                        # the whole repo, same rules as CI
npx learn-content-engine lint sets/en/de-b1/lessons/*.json
```

Was geprüft wird, ist nicht Rechtschreibung, sondern die *Kohärenz des Tests selbst*: dass die Lücken eines Lückentexts zu seinen `___`-Markern passen, dass jede `card_ids`-Referenz auf eine echte Karte zeigt, dass eine Bildauswahl genau ein richtiges Bild hat, dass sich akzeptierte Antworten und Distraktoren einer Mehrfachauswahl nicht überlappen. Das sind die Fehler, die stillschweigend eine unbewertbare Übung erzeugen, und sie verlassen nie den Rechner des Autors.

Neben harten Fehlern gibt die Engine **Autoren-Lints** aus: Warnungen, die nie blockieren, aber wahrscheinliche Fehler markieren: eine Karte, die keine Übung je verwendet, ein Hinweis, der die Länge der Antwort verrät, eine mehrdeutige Zuordnung. Und in den Content-Repos verlangt ein **Qualitäts-Boden** eine echte Lektion statt eines Fragments: mindestens fünf Übungen, zwei Übungstypen und ein Theorie-Schritt. Nichts davon ist Geschmackssache; alles davon dient einem Test, der für jeden korrekt bewertet, der ihn ausführt.

Wenn eine Warnung auf echte Arbeit zeigt (eine unreferenzierte Karte, die geübt werden sollte), kann die CLI beim Verdrahten helfen:

```shell
npx learn-content-engine suggest-wiring sets/en/de-b1/lessons/03.json
# proposes a wiring only when a card's text appears verbatim in exactly
# one exercise; anything ambiguous goes to "manual review", never auto-applied
```

Für die Tooling-Interessierten: Ein Content-Repo fährt das als zwei Gates in der CI, und beide müssen grün sein. Ein strukturelles Gate prüft Form und Qualitäts-Boden gegen eine gespiegelte Kopie des Schemas; ein semantisches Gate fährt den eigenen Validator der Engine (denselben, den jeder nachgelagerte Consumer fährt), sodass ein grüner Build bedeutet: Der Inhalt ist für *jeden* gültig, der ihn liest, nicht nur für die Umgebung des Autors.

## Eine Quelle, viele Ausgaben

Sobald die Quelle kanonisch und gültig ist, ist jede Ausgabe eine Projektion davon. Keine der drei unten autoriert den Inhalt neu; jede rendert die eine Quelle in ihre eigene Form.

```
                                     +- app   : interactive exercise + spaced repetition
  lesson JSON  -->  validate    -->  +- print : student test PDF + teacher answer key
  + manifest.yaml   canonicalize     +- LMS   : QTI 2.x import / export (mappable subset)
```

### Die App: interaktiv, mit Gedächtnis

Der Referenz-Consumer, eine Lern-App, rendert jeden Übungstyp für den Bildschirm und treibt die verteilte Wiederholung: Sie verfolgt, wie sich ein Lernender auf jeder Karte schlägt, und plant Wiederholungen entsprechend. Die Lektion trägt den Inhalt und die richtigen Antworten; die App besitzt das Rendering und die Planungs-Politik. Dieselbe Lektion, die ein gedruckter Test wird, wird hier eine durchtippbare Übung, ohne zweite Kopie.

### Der gedruckte Test: für das Klassenzimmer

Für den Schultest-Fall liest ein kleines, auf Lehrende zielendes Werkzeug eine benotete Quiz-Lektion und rendert **zwei** PDFs daraus:

- einen **Schüler-Test**: den Fragebogen, mit leeren Kästchen und Antwortzeilen und den Punkten pro Frage, aber ohne sichtbare Antworten;
- einen **Lehrer-Lösungsschlüssel**: dieselben Fragen mit den richtigen Antworten, den Punkten, etwaigen Teilpunkt-Hinweisen und der Bestehens-Schwelle.

Bemerkenswert: Dieses Werkzeug ist *eigenständig*. Es liest die kanonische Lektion und rendert eine Darstellung davon, ruft aber die Engine gar nicht auf, hängt also an keiner bestimmten Engine-Version. Das ist die Grenze, die für Sie arbeitet: Eine neue Ausgabe kann als unabhängiges Werkzeug gegen dieselbe Quelle gebaut werden, ohne sich in den Kern zu verstricken.

### Der LMS-Export: ehrlich über seine Grenzen

Um Inhalte in ein LMS und wieder heraus zu bewegen, liefert die Engine einen optionalen **QTI-2.x-Adapter** hinter einem Subpath-Import (`learn-content-engine/qti`), damit seine XML-Abhängigkeit den abhängigkeitsfreien Kern nie berührt. Er bildet die Teilmenge ab, die sich *treu* abbilden lässt:

| QTI-Interaktion | Engine-Typ |
|---|---|
| choiceInteraction (single / multiple) | multiple_choice |
| textEntryInteraction | free_text |
| matchInteraction | matching |

Alles außerhalb dieser Tabelle (Ordering, Association, Gap-Match, Hotspot, ein Item ohne Interaktion oder mit mehr als einer) wird **laut abgewiesen**. Der Import sammelt jedes nicht abbildbare Item und wirft einen einzigen Fehler, der jedes davon nennt, mit Identifier und Grund. Es gibt kein stilles Überspringen: Sie bekommen nie einen QTI-Import, der vollständig aussieht, aber leise die Hälfte der Fragen verworfen hat. Und ein Import, der eine ungültige Lektion erzeugen würde, wird abgewiesen statt zurückgegeben: dieselbe Disziplin, mit der die ganze Pipeline läuft.

## Was die Engine sich weigert zu tun, und warum Ihnen das hilft

Die Linie ist es wert, ausgesprochen zu werden, denn sie ist es, was die Pipeline wartbar hält statt zu einem Monolithen zu machen. Die Engine validiert und kanonisiert. Das ist alles. Sie rendert nicht, speichert nicht, druckt nicht, spricht nicht mit einem LMS.

| Die Engine tut | Consumer-Tooling tut |
|---|---|
| Quelle in eine kanonische Lektion parsen | Für einen Bildschirm rendern und Wiederholungen planen |
| Struktur, Semantik und Qualität validieren | Einen Test und einen Lösungsschlüssel drucken |
| Die QTI-Teilmenge abbilden, in beide Richtungen | Fortschritt persistieren, synchronisieren, an ein LMS liefern |

Zwei ehrliche Grenzen fallen daraus, und sie zu benennen ist der Punkt:

- Der QTI-Adapter ist eine **Brücke für die abbildbare Teilmenge**, kein schlüsselfertiger "den ganzen Test nach Moodle exportieren"-Knopf. Er bewegt, was sich sauber abbildet, und weist den Rest ab: Ein verlustbehafteter Export, der einen Test stillschweigend verschlechtert, ist schlimmer als kein Export.
- Das PDF-Werkzeug ist **eine Darstellung** einer Lektion, kein Teil der Engine. Ein reicheres Layout, ein anderes LMS-Format, ein visueller Autoren-Editor: All das sind Consumer-Werkzeuge, die jemand gegen dieselbe Quelle baut, nach eigenem Zeitplan.

Für eine Produktmanagerin, die "eine Quelle, viele Ausgaben" abwägt, ist diese Grenze die ganze Antwort darauf, warum es funktioniert: Die Quelle ist der Vertrag, und jede Ausgabe ist ein Projekt, das den Vertrag liest. Fügen Sie eine Ausgabe hinzu, und Sie berühren keine der anderen. Ändern Sie die Quelle, und die Validierung sagt Ihnen, bevor irgendetwas ausgeliefert wird, genau, welche Lektionen gebrochen sind.

## Einmal autorieren, überall validieren, den Rest ableiten

Die Form des Ganzen ist klein genug für den Kopf. Sie schreiben eine Lektion und ein Manifest. Sie fahren einen Validator, der die Fehler fängt, die ein Wiederlesen nicht fängt. Aus dieser einen validierten Quelle rendert die App eine interaktive Übung, ein Werkzeug druckt einen Test samt Lösungsschlüssel, und ein Adapter trägt das Abbildbare in ein LMS. Nichts wird zweimal autoriert.

Die Disziplin darunter ist eine einzige Gewohnheit, überall angewandt: **abweisen statt raten.** Die Validierung weist eine kaputte Lektion ab, statt sie auszuliefern. Der QTI-Adapter weist eine nicht abbildbare Frage ab, statt sie zu verwerfen. Jede Ausgabe ist ehrlich darüber, was sie tragen kann und was nicht. Diese Ehrlichkeit ist keine Einschränkung der Pipeline: Sie ist der Grund, warum Sie ihren Ausgaben überhaupt trauen können.

---

*Einmal autorieren. Überall validieren. Abweisen statt raten.*
