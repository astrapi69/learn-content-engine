# **Comparative Analysis of Exercise Types in E-Learning Platforms**
**Benchmark Study for the `learn-content-engine` (package 0.23.0, lesson schema 1.13)**

**Version:** 1.2  
**Date:** September 15, 2026  
**Author:** Asterios Raptis (astrapi69)  
**Project:** learn-content-engine / adaptive-learner  
**License:** MIT

---

## **Executive Summary**

This document presents a systematic comparative analysis of exercise types across established e-learning platforms (Moodle, H5P, QTI 3.0, Canvas LMS, Duolingo) in the context of the `learn-content-engine`. Two version numbers matter and are easy to conflate: the npm package is at **0.23.0**, the lesson schema it validates against is at **1.13** (`x-schema-version` in `schema/lesson.schema.json`). This document benchmarks the schema's exercise types.

The analysis demonstrates that the engine, with its six core exercise types (`matching`, `picture_choice`, `free_text`, `word_tiles`, `cloze`, `multiple_choice`), fully covers the **global standard for text-based foundational assessments**.

The identified gaps (hotspot interactions, sequencing/ordering tasks, Parsons problems, categorization, audio input) are not architectural deficits, but rather the result of a deliberate **Lean-Core Design** decision. The `ext:<vendor>-<name>` extension concept aligns with modern best practices (comparable to QTI 3.0 Portable Custom Interactions) and enables the incremental introduction of specialized exercise types without bloating the core schema.

**State of play (version 1.2 of this document):** every one of those five gaps now has a reference extension under `src/examples/ext-ref-*` in the engine repository. Three existed before this document was written (ordering, categorization, and three audio variants); the two this document originally singled out as missing, hotspot and Parsons, were added in response to it (engine#149). What remains open is not engine-side implementation but **consumer adoption**: `adaptive-learner` decides per extension whether to register it, under its own vendor namespace.

**Recommendation:** Adopt `ext:ref-parsons` in `adaptive-learner` for `alc-programming` and `ext:ref-hotspot` for `alc-traffic-knowledge`, following the consumer-parity gate in section 6.4.

---

## **1. Introduction and Objectives**

### 1.1 Background
The `learn-content-engine` serves as a framework-agnostic TypeScript engine for parsing and validating learning content for the adaptive learning ecosystem (`adaptive-learner`, `alc-*` domain repositories). With over 28 production sets across domains such as language, programming, psychology, and traffic knowledge, there is a need for a well-founded positioning within the e-learning standards landscape.

### 1.2 Objectives
- **Benchmarking:** Systematic comparison of functional coverage of exercise types.
- **Gap Analysis:** Identification of didactically and technically relevant gaps.
- **Architectural Evaluation:** Assessment of the `ext:` extension concept in the context of established standards, including their licensing and accessibility.
- **Roadmap Recommendations:** Prioritized action items for future development.

### 1.3 Methodology
The comparison is based on the analysis of official documentation and specifications of the reference systems (as of 2026). Evaluation is conducted along three dimensions:
1. **Didactic Reach** (Bloom's Taxonomy: Remembering, Understanding, Applying, Analyzing)
2. **Technical Complexity** (Schema declaration vs. Runtime execution)
3. **Domain Relevance** (Alignment with `alc-*` repositories)

---

## **2. Detailed Platform Analysis**

### 2.1 Moodle
**Characteristics:** Classic LMS with a plugin-based architecture, widely used in higher education.

**Core Exercise Types:**
- **Multiple-Choice / Single-Choice:** With optional partial credit scoring.
- **True/False:** Binary decision questions.
- **Short Answer:** Text input checked against wildcard patterns.
- **Numerical:** Mathematical input with an allowed tolerance range (e.g., 10.5 plus or minus 0.2).
- **Cloze (Embedded Answers):** Fill-in-the-blanks within running text.
- **Matching:** 1:1 pairing of items.
- **Essay:** Requires manual grading by instructors.
- **Calculated:** Parametric math questions with randomized variables.

**Extended Plugins:**
- **Drag and Drop onto Image:** Target zone marking on graphics.
- **STACK:** Computer Algebra System (Maxima) integration for symbolic mathematics.

**Assessment:** Moodle comprehensively covers the cognitivist standard but suffers from technical debt due to its monolithic core. The plugin system allows extensions but leads to ecosystem fragmentation.

---

### 2.2 H5P (HTML5 Package)
**Characteristics:** Open-source framework for interactive, media-centric learning content.

**Visual and Spatial Types:**
- **Image Hotspots:** Interactive info points with popups (text, audio, image).
- **Find the Hotspot(s):** Assessment tasks requiring clicks on specific image areas.
- **Image Pairing:** Matching images to images or images to text.
- **Image Choice:** Selecting one or more graphics as an answer.

**Text and Structure Interactions:**
- **Drag the Words:** Drag-and-drop words into text gaps.
- **Fill in the Blanks:** Manual text input.
- **Mark the Words:** Direct clicking/highlighting of correct words in a text (e.g., "Mark all verbs").

**Sequencing:**
- **Sort the Paragraphs:** Arranging paragraphs in a logical order.

**Audio/Speech:**
- **Speak the Words Set:** Web Speech API for pronunciation checks.

**Assessment:** H5P is the market leader for visual interactivity. However, it is designed as a content format, not a strict validation engine like the `learn-content-engine`.

---

### 2.3 QTI 3.0 (IMS Question and Test Interoperability)
**Characteristics:** The international standard for exchanging assessment items (IMS Global Learning Consortium, 1EdTech).

**Interaction Types (Excerpt):**
- **Choice Interaction:** Standard Multiple/Single-Choice.
- **Text Entry Interaction:** Simple fill-in-the-blank.
- **Extended Text Interaction:** Essay input.
- **Hotspot Interaction:** Geometric regions (Circle, Rect, Poly) on an image.
- **Select Point Interaction:** Exact coordinate (x, y) clicks.
- **Graphic Associate Interaction:** Connecting object pairs on an image.
- **Graphic Order Interaction:** Visually arranging objects.
- **Graphic Gap Match Interaction:** Drag-and-drop image elements into target zones.
- **Order Interaction:** Linear sorting of a list.
- **Match Interaction:** n:m matrix matching.
- **Portable Custom Interaction (PCI):** Interface for arbitrary custom extensions.

**Assessment:** QTI 3.0 is the most comprehensive standard but is highly complex (XML-based). Its **PCI concept** is the direct equivalent of the `learn-content-engine`'s `ext:` pattern.

---

### 2.4 Canvas LMS (New Quizzes)
**Characteristics:** Modern higher-education LMS focusing on usability and streamlined workflows.

**Core Types:**
- **Categorization:** 1:n drag-and-drop assignment into category buckets.
- **Formula:** Parametric math questions with variables.
- **Hot Spot:** Image-based target zone tasks.
- **Matching:** Dropdown or drag-based pair matching.
- **Ordering:** Vertical drag-and-drop sorting of lists.
- **File Upload:** Submission of files (PDF, code, ZIP) as a solution.
- **Stimulus:** A complex type where a main medium (e.g., long source code, article, or video) is fixed on the page with multiple sub-questions alongside it.

**Assessment:** Canvas deliberately reduces complexity in favor of intuitive operation. **Categorization (1:n)** is a didactically valuable type for taxonomies.

---

### 2.5 Duolingo
**Characteristics:** Gamified language learning app optimized for micro-interactions and rapid feedback loops.

**Types:**
- **Word Bank / Word Tiles:** Sentence construction from provided building blocks (equivalent to `word_tiles`).
- **Translate:** Bidirectional free-text translation.
- **Listen and Type:** Audio dictation.
- **Listen and Select:** Matching audio snippets to concepts/images.
- **Speak / Pronunciation Check:** Real-time speech recognition with phoneme matching.
- **Character Tracing:** Interactive tracing of characters (e.g., Kanji, Hanzi) on touchscreens.
- **Conversation / Dialogue Completion:** Chat-based role-playing scenarios.

**Assessment:** Duolingo optimizes for low extraneous cognitive load and high engagement through gamification, avoiding complex interactions in favor of didactic efficiency.

---

## **3. Licensing and Accessibility of Reference Systems**

Understanding the licensing models and UI accessibility of these platforms is crucial for evaluating their suitability as architectural references or integration targets.

### 3.1 Moodle
- **License:** **GPLv3+** (GNU General Public License).
- **Open Source:** Yes. Fully free, open-source, and usable for commercial purposes.
- **Publicly Accessible UI:** **Yes**. Moodle provides a freely accessible sandbox environment at [sandbox.moodledemo.net](https://sandbox.moodledemo.net) for learners, educators, and administrators. When self-hosted, the UI is natively included in the core package.

### 3.2 H5P
- **License:** **MIT License** (Core / Framework).
- **Open Source:** Yes. Highly permissive. The source code and individual content types are free to use, modify, and deploy commercially. *(Note: H5P.com is the paid SaaS variant, while the underlying framework at H5P.org is open source).*
- **Publicly Accessible UI:** **Yes**. The interactive authoring editor can be tested directly in the browser at [H5P.org](https://h5p.org) (requires a free account). Additionally, free plugins integrate this editor directly into WordPress, Moodle, and Drupal.

### 3.3 QTI 3.0 (IMS Global / 1EdTech)
- **License:** **Open Standard / Free Specification License**.
- **Open Source:** N/A (It is a specification, not software). The specification itself is freely accessible and royalty-free. *(Note: QTI 3.0 is a data format (XML Schema), not a finished software product).*
- **Publicly Accessible UI:** **Indirectly**. Since QTI is a standard, it has no "official" UI. However, open-source authoring tools and players, such as **TAO Testing** (Community Edition) or **Onyx**, provide functional UIs for creating and rendering QTI content.

### 3.4 Canvas LMS
- **License:** **AGPLv3** (Canvas LMS Courseware / Open Source Edition).
- **Open Source:** Yes. The core LMS is available on GitHub. *(Note: Some add-ons and Instructure's hosted cloud infrastructure are proprietary).*
- **Publicly Accessible UI:** **Yes**. Instructure offers a permanent "Free-for-Teacher" account, allowing educators to test the complete UI, including the New Quizzes engine, at no cost.

### 3.5 Duolingo
- **License:** **Proprietary / Commercial Software**.
- **Open Source:** No. Both the source code and the didactic system are protected and commercial.
- **Publicly Accessible UI:** **Yes (Freemium)**. The end-user interface is freely accessible via app and web. *(Note: "Duolingo for Schools" allows teachers to create classrooms for free, but there is no public authoring editor for creating custom, user-generated content).*

### 3.6 Summary Matrix: Licensing and Accessibility

| Tool / Standard | License Model | Open Source? | Freely Accessible UI for Testing? |
| :--- | :--- | :--- | :--- |
| **Moodle** | GPLv3+ | **Yes** | **Yes** ([sandbox.moodledemo.net](https://sandbox.moodledemo.net)) |
| **H5P** | MIT | **Yes** | **Yes** ([H5P.org Editor](https://h5p.org)) |
| **QTI 3.0** | Open Standard | *(Specification)* | **Indirectly** (via open-source tools like TAO) |
| **Canvas LMS** | AGPLv3 | **Yes** | **Yes** (Free-for-Teacher Account) |
| **Duolingo** | Proprietary | **No** | **Yes** (App/Web as learner; no authoring tool) |

---

## **4. Comparison Matrix: Exercise Types**

The engine column distinguishes three tiers. **Core** types are in the schema's `ExerciseType` enum and are guaranteed to load in every consumer. **Reference extension** types exist under `src/examples/ext-ref-*` in the engine repository with full validation, a doc-gated example lesson, and a minimal consumer half; they are excluded from the published package and become usable in a given consumer only once that consumer adopts them under its own vendor namespace (`docs/extensions.md`). **Missing** means neither.

| **Exercise Type Category** | **Moodle** | **H5P** | **QTI 3.0** | **Duolingo** | **learn-content-engine (schema 1.13)** |
|----------------------------|------------|---------|-------------|--------------|----------------------------------|
| **Multiple / Single Choice** | yes | yes | yes | yes | Core (`multiple_choice`, `picture_choice`) |
| **Fill-in-the-Blank (Cloze)** | yes | yes | yes | yes | Core (`cloze`) |
| **Matching (1:1)** | yes | yes | yes | no | Core (`matching`) |
| **Short Answer (Free Text)** | yes | yes | yes | yes | Core (`free_text`) |
| **Word Tiles / Word Bank** | no | yes | no | yes | Core (`word_tiles`) |
| **Hotspot / Image Mapping** | (Plugin) | yes | yes | no | Reference extension (`ext:ref-hotspot`, engine#149) |
| **Sequencing / Ordering** | (Plugin) | yes | yes | no | Reference extension (`ext:ref-ordering`) |
| **Parsons Problems (Code)** | (Plugin) | no | no | no | Reference extension (`ext:ref-parsons`, engine#149) |
| **Categorization (1:n)** | (Plugin) | yes | yes | no | Reference extension (`ext:ref-categorization`) |
| **Audio Input / Voice** | no | yes | no | yes | Reference extensions (`ext:ref-speak-and-record`, `ext:ref-audio-choice`, `ext:ref-audio-tiles`) |
| **Parametric / Formulas** | yes | no | yes | no | **Missing** |

**Legend:**  
yes = Native support  
no = Not available  
(Plugin) = Extensible via plugin system

---

## **5. Gap Analysis for `learn-content-engine`**

### 5.1 Identified Gaps (Prioritized)

Each entry below carries one example lesson. The examples are copies of the reference lessons in `docs/extensions.md`, where they are validated by the engine's doc gate (`src/docs-extensions-examples.test.ts`); this document is not gate-scanned, so the copies here are illustrative and the copies there are authoritative.

#### **Priority 1: Hotspot / Image Mapping**
- **Status:** Reference extension `ext:ref-hotspot` (`src/examples/ext-ref-hotspot/`, engine#149).
- **Didactic Value:** High for visual domains (`alc-traffic-knowledge`, `alc-technology`, `alc-dog-training`).
- **Bloom's Level:** Applying, Analyzing.
- **Technical Complexity:** Medium (Schema declaration is simple; consumer rendering requires Canvas/SVG).
- **Reference Implementation:** QTI 3.0 Hotspot Interaction, H5P Find the Hotspot.
- **Design:** `rect` and `circle` zones in percentage coordinates (0-100), so the payload is resolution-independent; exactly one zone correct, mirroring `picture_choice`; graded by point-in-zone hit test with inclusive edges.

```json
{
  "id": "verkehrszeichen-erkennen",
  "title": "Verkehrskunde: Verkehrszeichen erkennen",
  "requires_extensions": ["ext:ref-hotspot@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-hotspot",
        "prompt": "Tippe auf das Zeichen, das Vorfahrt gewaehren bedeutet",
        "ext_payload": {
          "src": "assets/images/kreuzung-schilder.png",
          "zones": [
            { "shape": "rect", "coords": [8, 12, 18, 18] },
            { "shape": "rect", "coords": [40, 10, 18, 18], "is_correct": "true" },
            { "shape": "circle", "coords": [78, 20, 9] }
          ]
        }
      }
    }
  ]
}
```

#### **Priority 2: Sequencing / Ordering**
- **Status:** Reference extension `ext:ref-ordering` (`src/examples/ext-ref-ordering/`), the engine's first worked extension.
- **Didactic Value:** High for procedural knowledge (algorithms, traffic procedures, chronologies).
- **Bloom's Level:** Understanding, Applying.
- **Technical Complexity:** Low-Medium (Array-based validation).
- **Reference Implementation:** Canvas Ordering, QTI 3.0 Order Interaction.
- **Design:** `items` in their correct order, at least two, unique (a duplicate makes the order ambiguous); the consumer shuffles.

```json
{
  "id": "anfahren-am-berg",
  "title": "Verkehrskunde: Anfahren am Berg",
  "requires_extensions": ["ext:ref-ordering@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-ordering",
        "prompt": "Bringe die Schritte in die richtige Reihenfolge",
        "ext_payload": {
          "items": [
            "Handbremse anziehen",
            "Kupplung treten und ersten Gang einlegen",
            "Kupplung bis zum Schleifpunkt kommen lassen",
            "Gas geben und Handbremse loesen"
          ]
        }
      }
    }
  ]
}
```

#### **Priority 3: Parsons Problems**
- **Status:** Reference extension `ext:ref-parsons` (`src/examples/ext-ref-parsons/`, engine#149).
- **Didactic Value:** Very high for `alc-programming` (reduces syntax frustration, focuses on logic).
- **Bloom's Level:** Applying, Analyzing.
- **Technical Complexity:** Medium (Specialized ordering with indentation checking).
- **Reference Implementation:** Niche; no direct equivalent in major reference systems.
- **Academic Basis:** Denny et al. (2008) prove significantly better learning outcomes compared to free-text code tasks.
- **Design:** `lines` in their correct order, each with a 0-based `indent`; graded on order AND indentation. Deliberately no uniqueness rule, unlike ordering: real programs repeat statements, and a Parsons UI identifies tiles by position, not by text.

```json
{
  "id": "python-funktion-zusammensetzen",
  "title": "Python-Grundlagen: Funktion zusammensetzen",
  "requires_extensions": ["ext:ref-parsons@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-parsons",
        "prompt": "Bringe die Zeilen in die richtige Reihenfolge und Einrueckung",
        "ext_payload": {
          "language": "python",
          "lines": [
            { "code": "def begruessung(name):", "indent": 0 },
            { "code": "if name:", "indent": 1 },
            { "code": "return f\"Hallo {name}\"", "indent": 2 },
            { "code": "return \"Hallo\"", "indent": 1 }
          ]
        }
      }
    }
  ]
}
```

#### **Priority 4: Categorization (1:n)**
- **Status:** Reference extension `ext:ref-categorization` (`src/examples/ext-ref-categorization/`); already adopted by `adaptive-learner` as `ext:al-categorization` and in use in several `alc-*` repositories.
- **Didactic Value:** Medium-High for taxonomies (psychology, biology, language classification).
- **Bloom's Level:** Analyzing, Evaluating.
- **Technical Complexity:** Medium (Similar to matching, but with grouping).
- **Reference Implementation:** Canvas Categorization, QTI 3.0 Graphic Gap Match.
- **Design:** `categories` with their correct `items`; at least two categories, every item in exactly one; the consumer shuffles the combined pool.

```json
{
  "id": "hunde-signale-einordnen",
  "title": "Hundetraining: Signale einordnen",
  "requires_extensions": ["ext:ref-categorization@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-categorization",
        "prompt": "Ordne jedes Signal der richtigen Kategorie zu",
        "ext_payload": {
          "categories": [
            {
              "name": "Sichtzeichen",
              "items": ["flache Hand senken", "Zeigefinger hoch", "Handflaeche zeigen"]
            },
            {
              "name": "Hoerzeichen",
              "items": ["Sitz", "Platz", "Hier"]
            },
            {
              "name": "Koerpersprache",
              "items": ["sich abwenden", "in die Hocke gehen"]
            }
          ]
        }
      }
    }
  ]
}
```

#### **Priority 5: Audio Input**
- **Status:** Three reference extensions cover the audio stimulus and production space: `ext:ref-speak-and-record` (hear a sentence, reveal it, record yourself; deliberately ungraded), `ext:ref-audio-choice` (gapped sentence, pick the audio clip that fills it), `ext:ref-audio-tiles` (hear a sentence, build its translation from tiles). `ext:ref-dictation` (hear, type) is the fourth member of the family.
- **Didactic Value:** High for the language domain (`adaptive-learner-content`).
- **Bloom's Level:** Applying (Production).
- **Technical Complexity:** High for GRADED speech (requires Web Speech API or external STT, strictly consumer-side); low for the ungraded record-for-self-review shape shipped here.
- **Reference Implementation:** Duolingo Speak, H5P Speak the Words Set.
- **Design:** The engine validates only the shape of `sentence` and the optional `audio` reference; capturing, storing and reviewing the learner's own recording is consumer-side.

```json
{
  "id": "hunde-nachsprechen",
  "title": "Hundetraining: Nachsprechen",
  "requires_extensions": ["ext:ref-speak-and-record@1"],
  "steps": [
    {
      "id": "s1",
      "type": "exercise",
      "exercise": {
        "id": "e1",
        "type": "ext:ref-speak-and-record",
        "prompt": "Hoere den Satz, zeige ihn dir an und nimm dich selbst auf.",
        "ext_payload": {
          "sentence": "Sitz, bitte, sofort.",
          "audio": "assets/audio/sitz-bitte-sofort.mp3"
        }
      }
    }
  ]
}
```

---

### 5.2 Architectural Evaluation

#### **Strengths of `learn-content-engine`**
1. **Lean-Core Design:** No schema bloat; focused on proven standard types.
2. **Extension Architecture:** `ext:<vendor>-<name>` aligns with QTI 3.0 PCI principles, enabling incremental expansion.
3. **Consumer Parity:** Clear separation of schema declaration (Engine) and runtime execution (`adaptive-learner`).
4. **Domain Flexibility:** The `domain` field enables usage beyond language learning (programming, psychology, traffic knowledge).

#### **Weaknesses / Risks**
1. **No Parametric Tasks:** No native support for randomized values (like Moodle Calculated). This is the one matrix row still marked Missing, and it is a different class of problem from the others: it needs a variable-definition contract in the CORE schema (the engine validates the syntax, the consumer evaluates), not an `ext_payload`.
2. **No Complex Mathematics:** No symbolic evaluation (like STACK in Moodle).
3. **No Graded Speech Input:** The core has no audio field at all (engine#68's decision); the reference extensions cover audio stimulus and ungraded recording; grading a recording (STT, phoneme matching) remains consumer-side and unimplemented.

---

## **6. Recommendations for Future Development**

### 6.1 Short-Term (Q4 2026 / Q1 2027)
1. **Adopt `ext:ref-parsons` in `adaptive-learner`:**
   - Target Repository: `alc-programming`
   - Engine side: done (`refParsonsExtension`, semantic rules for shape, minimum, non-empty code, non-negative integer indent).
   - Consumer side: register under the app's vendor namespace, render shuffled tiles with an indent control, grade with `{order, indents}`.
   - Didactic Value: Immediate benefit for programming beginners.

2. **Adopt `ext:ref-hotspot` in `adaptive-learner`:**
   - Target Repository: `alc-traffic-knowledge`
   - Engine side: done (`refHotspotExtension`, percentage-coordinate zones, shape and bounds checks, exactly-one-correct).
   - Consumer side: Canvas/SVG overlay mapping percentages onto the rendered image, click to point, grade by hit test.
   - Didactic Value: Essential for traffic scenarios (right-of-way, signs).

### 6.2 Mid-Term (Q2 to Q3 2027)
3. **Adopt `ext:ref-ordering` in `adaptive-learner`:**
   - Target Repositories: `alc-technology` (algorithms), `alc-traffic-knowledge` (procedures).
4. **Extend `ext:al-categorization` usage:**
   - Already adopted; target further repositories (`alc-psychology`, `alc-dog-training`).

### 6.3 Long-Term (Q4 2027+)
5. **Parametric Tasks:** Schema-level variable definitions (Engine validates syntax, Consumer evaluates).
6. **Graded Audio Input:** STT service integration on top of `ext:ref-speak-and-record` (strictly Consumer responsibility).

### 6.4 Architectural Principles for Extensions
1. **Separation of Concerns:** Core schema (`prompt`, `hint`, `explanation`) remains untouched; extensions define only `ext_payload`. No extension adds a `$defs` entry to `lesson.schema.json`.
2. **Reference First:** A new type is worked out as `ext:ref-<name>` in `src/examples/` (engine half, consumer half, tests, doc-gated example lesson) before any consumer commits to it.
3. **Test-Driven Development (TDD):** Unit tests for validation logic before production release.
4. **Consumer-Parity Gate:** An extension is only promoted to the core `ExerciseType` enum once the `adaptive-learner` provides full support.
5. **Documentation:** Every reference extension has its own section in `docs/extensions.md` with payload rules and a reference lesson.

---

## **7. Didactic Framework**

### 7.1 Bloom's Taxonomy
The core types (schema 1.13) primarily cover the lower levels:
- **Remembering:** `free_text`, `cloze`, `matching`
- **Understanding:** `multiple_choice`, `picture_choice`
- **Applying:** `word_tiles` (limited)

The reference extensions systematically unlock higher cognitive levels:
- **Applying:** `ext:ref-parsons`, `ext:ref-hotspot`
- **Analyzing:** `ext:ref-ordering`, `ext:ref-categorization`

> **Reference:** Bloom, B. S. (1956). *Taxonomy of educational objectives: The classification of educational goals*. Longmans, Green.

### 7.2 Cognitive Theory of Multimedia Learning
The visual extensions align with Mayer's **Multimedia Principle**: Learning is more effective when words and pictures are integrated (Mayer, 2021).

> **Reference:** Mayer, R. E. (2021). *Multimedia learning* (3rd ed.). Cambridge University Press. https://doi.org/10.1017/9781316941355

### 7.3 Constructive Alignment
The extensions enable **Constructive Alignment** (Biggs, 1996): Teaching/learning activities and assessments are directly aligned with the stated learning objectives.
*Example:* If the objective is "The learner can *apply* the steps of a safe hill start," a Multiple-Choice question only tests recognition, whereas `ext:ref-ordering` requires active construction of the sequence.

> **Reference:** Biggs, J. B. (1996). Enhancing teaching through constructive alignment. *Higher Education, 32*(3), 347-364. https://doi.org/10.1007/BF00138871

---

## **8. Conclusion**

The `learn-content-engine` (package 0.23.0, schema 1.13) is in an **excellent strategic position**:
1. **Standard Parity:** The six core exercise types fully cover the global standard for text-based foundational assessments.
2. **Architectural Maturity:** The `ext:` concept matches modern best practices (QTI 3.0 PCI) and prevents schema bloat.
3. **Didactic Growth Potential:** Every gap this analysis identified now has a reference extension; the higher Bloom levels are reachable without compromising core stability.
4. **Cross-Domain Relevance:** The engine is not limited to language learning; the `domain` field actively supports programming, psychology, traffic knowledge, and more.

**Recommended Next Step:**  
Adopt `ext:ref-parsons` in `adaptive-learner` as the first consumer-side adoption from this analysis, followed by `ext:ref-hotspot`. Both provide immediate value to existing repositories, and both engine halves are ready.

---

## **References**

Biggs, J. B. (1996). Enhancing teaching through constructive alignment. *Higher Education, 32*(3), 347-364. https://doi.org/10.1007/BF00138871

Bloom, B. S. (1956). *Taxonomy of educational objectives: The classification of educational goals*. Longmans, Green.

Denny, P., Luxton-Reilly, A., and Simon, B. (2008). Evaluating a new exam question: Parsons problems. *Proceedings of the Fourth International Workshop on Computing Education Research*, 113-124. https://doi.org/10.1145/1404520.1404531

IMS Global Learning Consortium (1EdTech). (2023). *QTI 3.0 Best Practices and Implementation Guide*. https://www.imsglobal.org/spec/qti/v3p0

Mayer, R. E. (2021). *Multimedia learning* (3rd ed.). Cambridge University Press. https://doi.org/10.1017/9781316941355

---

## **Appendix A: Technical References**

- **learn-content-engine Repository:** https://github.com/astrapi69/learn-content-engine
- **adaptive-learner (Reference Consumer):** https://github.com/astrapi69/adaptive-learner
- **Extension tier:** `docs/extensions.md` (portability contract, every reference extension with payload rules and a doc-gated example lesson)
- **Domain Repositories:** 
  - `alc-programming`: https://github.com/astrapi69/alc-programming
  - `alc-traffic-knowledge`: https://github.com/astrapi69/alc-traffic-knowledge
  - `alc-psychology`: https://github.com/astrapi69/alc-psychology
  - `alc-technology`: https://github.com/astrapi69/alc-technology
- **Schema Documentation:** https://astrapi69.github.io/learn-content-engine/schema/lesson.schema.json

---
