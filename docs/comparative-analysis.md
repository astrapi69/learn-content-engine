# **Comparative Analysis of Exercise Types in E-Learning Platforms**
**Benchmark Study for the `learn-content-engine` (v1.13)**

**Version:** 1.1  
**Date:** September 14, 2026  
**Author:** Asterios Raptis (astrapi69)  
**Project:** learn-content-engine / adaptive-learner  
**License:** MIT

---

## **Executive Summary**

This document presents a systematic comparative analysis of exercise types across established e-learning platforms (Moodle, H5P, QTI 3.0, Canvas LMS, Duolingo) in the context of the `learn-content-engine` (v1.13). 

The analysis demonstrates that the engine, with its six core exercise types (`matching`, `picture_choice`, `free_text`, `word_tiles`, `cloze`, `multiple_choice`), fully covers the **global standard for text-based foundational assessments**. 

The identified gaps—specifically **hotspot interactions**, **sequencing/ordering tasks**, and **Parsons problems**—are not architectural deficits, but rather the result of a deliberate **Lean-Core Design** decision. The implemented `ext:<vendor>-<name>` extension concept aligns with modern best practices (comparable to QTI 3.0 Portable Custom Interactions) and enables the incremental introduction of specialized exercise types without bloating the core schema.

**Recommendation:** Prioritize the implementation of `ext:astrapi69-parsons@1` for `alc-programming` and `ext:astrapi69-hotspot@1` for `alc-traffic-knowledge` via the extension registry pattern.

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
1. **Didactic Reach** (Bloom’s Taxonomy: Remembering → Understanding → Applying → Analyzing)
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
- **Numerical:** Mathematical input with an allowed tolerance range (e.g., $10.5 \pm 0.2$).
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

**Visual & Spatial Types:**
- **Image Hotspots:** Interactive info points with popups (text, audio, image).
- **Find the Hotspot(s):** Assessment tasks requiring clicks on specific image areas.
- **Image Pairing:** Matching images to images or images to text.
- **Image Choice:** Selecting one or more graphics as an answer.

**Text & Structure Interactions:**
- **Drag the Words:** Drag-and-drop words into text gaps.
- **Fill in the Blanks:** Manual text input.
- **Mark the Words:** Direct clicking/highlighting of correct words in a text (e.g., "Mark all verbs").

**Sequencing:**
- **Sort the Paragraphs:** Arranging paragraphs in a logical order.

**Audio/Speech:**
- **Speak the Words Set:** Web Speech API for pronunciation checks.

**Assessment:** H5P is the market leader for visual interactivity. However, it is designed as a content format, not a strict validation engine like the `learn-content-engine`.

---

### 2.3 QTI 3.0 (IMS Question & Test Interoperability)
**Characteristics:** The international standard for exchanging assessment items (IMS Global Learning Consortium, 1EdTech).

**Interaction Types (Excerpt):**
- **Choice Interaction:** Standard Multiple/Single-Choice.
- **Text Entry Interaction:** Simple fill-in-the-blank.
- **Extended Text Interaction:** Essay input.
- **Hotspot Interaction:** Geometric regions (Circle, Rect, Poly) on an image.
- **Select Point Interaction:** Exact coordinate ($x, y$) clicks.
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
- **Listen & Type:** Audio dictation.
- **Listen & Select:** Matching audio snippets to concepts/images.
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

### 3.6 Summary Matrix: Licensing & Accessibility

| Tool / Standard | License Model | Open Source? | Freely Accessible UI for Testing? |
| :--- | :--- | :--- | :--- |
| **Moodle** | GPLv3+ | **Yes** | **Yes** ([sandbox.moodledemo.net](https://sandbox.moodledemo.net)) |
| **H5P** | MIT | **Yes** | **Yes** ([H5P.org Editor](https://h5p.org)) |
| **QTI 3.0** | Open Standard | *(Specification)* | **Indirectly** (via open-source tools like TAO) |
| **Canvas LMS** | AGPLv3 | **Yes** | **Yes** (Free-for-Teacher Account) |
| **Duolingo** | Proprietary | **No** | **Yes** (App/Web as learner; no authoring tool) |

---

## **4. Comparison Matrix: Exercise Types**

| **Exercise Type Category** | **Moodle** | **H5P** | **QTI 3.0** | **Duolingo** | **learn-content-engine (v1.13)** |
|----------------------------|------------|---------|-------------|--------------|----------------------------------|
| **Multiple / Single Choice** | ✓ | ✓ | ✓ | ✓ | ✓ (`multiple_choice`, `picture_choice`) |
| **Fill-in-the-Blank (Cloze)** | ✓ | ✓ | ✓ | ✓ | ✓ (`cloze`) |
| **Matching (1:1)** | ✓ | ✓ | ✓ | ✗ | ✓ (`matching`) |
| **Short Answer (Free Text)** | ✓ | ✓ | ✓ | ✓ | ✓ (`free_text`) |
| **Word Tiles / Word Bank** | ✗ | ✓ | ✗ | ✓ | ✓ (`word_tiles`) |
| **Hotspot / Image Mapping** | (Plugin) | ✓ | ✓ | ✗ | **Missing** (Planned via `ext:`) |
| **Sequencing / Ordering** | (Plugin) | ✓ | ✓ | ✗ | **Missing** (Planned via `ext:`) |
| **Parsons Problems (Code)** | (Plugin) | ✗ | ✗ | ✗ | **Missing** (Candidate: `ext:astrapi69-parsons@1`) |
| **Categorization (1:n)** | (Plugin) | ✓ | ✓ | ✗ | **Missing** |
| **Audio Input / Voice** | ✗ | ✓ | ✗ | ✓ | **Missing** |
| **Parametric / Formulas** | ✓ | ✗ | ✓ | ✗ | **Missing** |

**Legend:**  
✓ = Native support  
✗ = Not available  
(Plugin) = Extensible via plugin system

---

## **5. Gap Analysis for `learn-content-engine`**

### 5.1 Identified Gaps (Prioritized)

#### **Priority 1: Hotspot / Image Mapping**
- **Didactic Value:** High for visual domains (`alc-traffic-knowledge`, `alc-technology`, `alc-dog-training`).
- **Bloom’s Level:** Applying, Analyzing.
- **Technical Complexity:** Medium (Schema declaration is simple; consumer rendering requires Canvas/SVG).
- **Reference Implementation:** QTI 3.0 Hotspot Interaction, H5P Find the Hotspot.
- **Recommended Extension:** `ext:astrapi69-hotspot@1`

#### **Priority 2: Sequencing / Ordering**
- **Didactic Value:** High for procedural knowledge (algorithms, traffic procedures, chronologies).
- **Bloom’s Level:** Understanding, Applying.
- **Technical Complexity:** Low-Medium (Array-based validation).
- **Reference Implementation:** Canvas Ordering, QTI 3.0 Order Interaction.
- **Recommended Extension:** `ext:astrapi69-ordering@1`

#### **Priority 3: Parsons Problems**
- **Didactic Value:** Very high for `alc-programming` (reduces syntax frustration, focuses on logic).
- **Bloom’s Level:** Applying, Analyzing.
- **Technical Complexity:** Medium (Specialized ordering with indentation checking).
- **Reference Implementation:** Niche; no direct equivalent in major reference systems.
- **Recommended Extension:** `ext:astrapi69-parsons@1`
- **Academic Basis:** Denny et al. (2008) prove significantly better learning outcomes compared to free-text code tasks.

#### **Priority 4: Categorization (1:n)**
- **Didactic Value:** Medium-High for taxonomies (psychology, biology, language classification).
- **Bloom’s Level:** Analyzing, Evaluating.
- **Technical Complexity:** Medium (Similar to matching, but with grouping).
- **Reference Implementation:** Canvas Categorization, QTI 3.0 Graphic Gap Match.
- **Recommended Extension:** `ext:astrapi69-categorization@1`

#### **Priority 5: Audio Input**
- **Didactic Value:** High for the language domain (`adaptive-learner-content`).
- **Bloom’s Level:** Applying (Production).
- **Technical Complexity:** High (Requires Web Speech API or external STT services).
- **Reference Implementation:** Duolingo Speak, H5P Speak the Words Set.
- **Recommended Extension:** `ext:astrapi69-audio-input@1` (Long-term)

---

### 5.2 Architectural Evaluation

#### **Strengths of `learn-content-engine`**
1. **Lean-Core Design:** No schema bloat; focused on proven standard types.
2. **Extension Architecture:** `ext:<vendor>-<name>` aligns with QTI 3.0 PCI principles, enabling incremental expansion.
3. **Consumer Parity:** Clear separation of schema declaration (Engine) and runtime execution (`adaptive-learner`).
4. **Domain Flexibility:** The `domain` field enables usage beyond language learning (programming, psychology, traffic knowledge).

#### **Weaknesses / Risks**
1. **No Parametric Tasks:** No native support for randomized values (like Moodle Calculated).
2. **No Complex Mathematics:** No symbolic evaluation (like STACK in Moodle).
3. **Audio Playback Only:** No recording/validation of speech input in the core.

---

## **6. Recommendations for Future Development**

### 6.1 Short-Term (Q4 2026 / Q1 2027)
1. **Implement `ext:astrapi69-parsons@1`:**
   - Target Repository: `alc-programming`
   - Schema: `$defs/ParsonsExercisePayload` (already drafted)
   - Validation: `validateParsonsPayload` with semantic rules (completeness, disjointness, uniqueness)
   - Didactic Value: Immediate benefit for programming beginners.

2. **Implement `ext:astrapi69-hotspot@1`:**
   - Target Repository: `alc-traffic-knowledge`
   - Schema: Coordinate-based target zones (percentages, shape types)
   - Validation: Overlap checking, bounds checking
   - Didactic Value: Essential for traffic scenarios (right-of-way, signs).

### 6.2 Mid-Term (Q2–Q3 2027)
3. **Implement `ext:astrapi69-ordering@1`:**
   - Target Repositories: `alc-technology` (algorithms), `alc-traffic-knowledge` (procedures).
4. **Evaluate `ext:astrapi69-categorization@1`:**
   - Target Repositories: `alc-psychology`, `alc-dog-training`.

### 6.3 Long-Term (Q4 2027+)
5. **Parametric Tasks:** Schema-level variable definitions (Engine validates syntax, Consumer evaluates).
6. **Audio Input Extension:** STT service integration (strictly Consumer responsibility).

### 6.4 Architectural Principles for Extensions
1. **Separation of Concerns:** Core schema (`prompt`, `hint`, `explanation`) remains untouched; extensions define only `ext_payload`.
2. **Schema-First Approach:** JSON Schema definition → TypeScript interfaces → Consumer implementation.
3. **Test-Driven Development (TDD):** Unit tests for validation logic before production release.
4. **Consumer-Parity Gate:** An extension is only promoted to the core `ExerciseType` enum once the `adaptive-learner` provides full support.
5. **Documentation:** Every extension receives a dedicated `docs/extensions/<name>.md` with examples and didactic context.

---

## **7. Didactic Framework**

### 7.1 Bloom’s Taxonomy
The current engine (v1.13) primarily covers the lower levels:
- **Remembering:** `free_text`, `cloze`, `matching`
- **Understanding:** `multiple_choice`, `picture_choice`
- **Applying:** `word_tiles` (limited)

The planned extensions systematically unlock higher cognitive levels:
- **Applying:** `ext:astrapi69-parsons@1`, `ext:astrapi69-hotspot@1`
- **Analyzing:** `ext:astrapi69-ordering@1`, `ext:astrapi69-categorization@1`

> **Reference:** Bloom, B. S. (1956). *Taxonomy of educational objectives: The classification of educational goals*. Longmans, Green.

### 7.2 Cognitive Theory of Multimedia Learning
The planned visual extensions align with Mayer’s **Multimedia Principle**: Learning is more effective when words and pictures are integrated (Mayer, 2021).

> **Reference:** Mayer, R. E. (2021). *Multimedia learning* (3rd ed.). Cambridge University Press. https://doi.org/10.1017/9781316941355

### 7.3 Constructive Alignment
The extensions enable **Constructive Alignment** (Biggs, 1996): Teaching/learning activities and assessments are directly aligned with the stated learning objectives.
*Example:* If the objective is "The learner can *apply* the steps of a safe hill start," a Multiple-Choice question only tests recognition, whereas `ext:astrapi69-ordering@1` requires active construction of the sequence.

> **Reference:** Biggs, J. B. (1996). Enhancing teaching through constructive alignment. *Higher Education, 32*(3), 347–364. https://doi.org/10.1007/BF00138871

---

## **8. Conclusion**

The `learn-content-engine` (v1.13) is in an **excellent strategic position**:
1. **Standard Parity:** The six core exercise types fully cover the global standard for text-based foundational assessments.
2. **Architectural Maturity:** The `ext:` concept matches modern best practices (QTI 3.0 PCI) and prevents schema bloat.
3. **Didactic Growth Potential:** The identified extensions systematically unlock higher Bloom’s taxonomy levels without compromising core stability.
4. **Cross-Domain Relevance:** The engine is not limited to language learning; the `domain` field actively supports programming, psychology, traffic knowledge, and more.

**Recommended Next Step:**  
Implement `ext:astrapi69-parsons@1` as a proof-of-concept for the extension pattern, followed by `ext:astrapi69-hotspot@1`. Both provide immediate value to existing repositories and demonstrate the scalability of the architecture.

---

## **References**

Biggs, J. B. (1996). Enhancing teaching through constructive alignment. *Higher Education, 32*(3), 347–364. https://doi.org/10.1007/BF00138871

Bloom, B. S. (1956). *Taxonomy of educational objectives: The classification of educational goals*. Longmans, Green.

Denny, P., Luxton-Reilly, A., & Simon, B. (2008). Evaluating a new exam question: Parsons problems. *Proceedings of the Fourth International Workshop on Computing Education Research*, 113–124. https://doi.org/10.1145/1404520.1404531

IMS Global Learning Consortium (1EdTech). (2023). *QTI 3.0 Best Practices and Implementation Guide*. https://www.imsglobal.org/spec/qti/v3p0

Mayer, R. E. (2021). *Multimedia learning* (3rd ed.). Cambridge University Press. https://doi.org/10.1017/9781316941355

---

## **Appendix A: Technical References**

- **learn-content-engine Repository:** https://github.com/astrapi69/learn-content-engine
- **adaptive-learner (Reference Consumer):** https://github.com/astrapi69/adaptive-learner
- **Domain Repositories:** 
  - `alc-programming`: https://github.com/astrapi69/alc-programming
  - `alc-traffic-knowledge`: https://github.com/astrapi69/alc-traffic-knowledge
  - `alc-psychology`: https://github.com/astrapi69/alc-psychology
  - `alc-technology`: https://github.com/astrapi69/alc-technology
- **Schema Documentation:** https://astrapi69.github.io/learn-content-engine/schema/lesson.schema.json

---
