# Exploration: discoverability (SEO)

> **Merged (2026-08-05):** the same exploration was produced twice,
> independently - here and in the app repository. The MERGED and complete
> version lives in the app:
> `adaptive-learner/docs/explorations/EXP-049-auffindbarkeit.md`
> (umbrella issue adaptive-learner#2400; first-slice issues #2403-#2406;
> architect decisions recorded there). This copy stays for the
> engine-local part (this repository's Pages metadata, step 2 below) and
> as the source of the measured table, but it is NOT the complete
> picture any more - two findings exist only in the merged version (the
> four divergent set counts in delivered text, and the indexable preview
> deployment).

Exploration only, no code and no sitemap. Written from this repository, but
most of the surface it describes belongs to the app and the content repos:
for those, this document registers a NEED rather than making a decision.

All figures were measured against the live public URLs on 2026-08-05, not
read from configuration.

---

## Part 1: What is public today, and what does a crawler receive?

| URL | HTTP | body text a crawler sees | meta description | og tags | sitemap | robots |
|---|---|---|---|---|---|---|
| `astrapi69.github.io/adaptive-learner/` | 200 | **0 characters** | yes (stale, see below) | 11 | yes, 2 URLs | yes, `Allow: /` |
| `.../adaptive-learner/content` | 301 to the same shell | 0 | inherited | inherited | listed in the sitemap | - |
| `.../adaptive-learner/docs/` | 200 | **5155 characters** | - | - | **yes, 480 URLs** | - |
| `astrapi69.github.io/learn-content-engine/` | 200 | 570 characters | **no** | **no** | **no** | **no** |
| `.../learn-content-engine/api/` | 200 | 9989 characters | yes | - | no | no |
| `.../learn-content-engine/schema/*.json` | 200 | (JSON, not a page) | - | - | - | - |
| `astrapi69.github.io/adaptive-learner-content/` | **404** | - | - | - | - | - |
| `raw.githubusercontent.com/.../search-index.json` | 200 | (JSON, not a page) | - | - | - | - |

Three findings decide everything below.

### The one page a user should land on has zero indexable text

The app's landing page returns a shell: after stripping scripts, styles and
comments, the `<body>` contains **0 characters**. Everything is filled in by
the browser. A crawler sees the `<title>`, the meta description and the
Open Graph block, and nothing else.

That is not a defect to fix by "adding SEO". It is what a client-rendered
app is, and the honest options are to accept it or to give the landing page
real server-rendered prose - which is an app decision, not an engine one.

### The meta description that IS indexed is stale, in the way we just codified

```
Lerne Sprachen mit KI-generierten Übungen, 7 Lernmodi, Spaced Repetition
und 26 Content-Sets in 10 Sprachen.
```

Measured: **28 sets**, and **9 target languages taught from 4 source
languages**. The "26 sets / 10 languages" claim is the same drift that this
week produced "432 lessons" in a repository description while the corpus
held 325 - content moved into the `alc-*` repos and the number stayed
behind.

This one matters more than the repository descriptions did, because it is
the single line a search engine actually shows. It is also the same class
we just decided about: a count in a place no gate can reach. Here the place
is `index.html` in the app repo, which IS gate-able, so the rule from that
decision applies in its other half - make it measurable rather than drop it.

### The documentation site is the asset, and it is already healthy

480 URLs, real HTML, a sitemap, and eight language directories
(`en`, `de`, `el`, `es`, `fr`, `ja`, `pt`, `tr`, 60 pages each) plus
`user-guide`, `developer` and `features`. For the third audience this is
essentially solved, and it is the only public surface that a search engine
can read in bulk today.

### The app sitemap lists a URL that is not a page

`/adaptive-learner/content` is in the sitemap and answers 301 into the same
shell. A sitemap entry that redirects to the page above it adds nothing and
costs crawl budget. Small, but it is the shape of a sitemap that is
maintained by hand rather than generated.

---

## Part 2: Three audiences, three different answers

### Users looking for a learning app

**Where they should land:** the app landing page.

**What they find today:** a title, a meta description with two wrong
numbers, and no readable text.

**What is missing:** prose in the delivered HTML that says what the product
is and for whom, in the first two sentences. Everything else is secondary -
without indexable text there is nothing for a search engine to rank.

**Whose:** the app. This document registers the need; it does not propose
the implementation.

### Learners looking for content

**Where they should land:** nowhere that exists today. There is no public
HTML page for any set or lesson. 28 sets exist as JSON in repositories,
plus `search-index.json` per repo, none of which is an indexable page.

This is the interesting audience and it is treated in Part 3.

### Developers and contributors

**Where they should land:** the documentation site, and for this repository
the TypeDoc reference.

**What they find today:** 480 readable pages with a sitemap, in eight
languages. The engine's API reference is readable too (9989 characters).

**What is missing, and it is cheap:** this repository's own Pages landing
page carries 570 characters, **no meta description, no Open Graph block, no
robots.txt and no sitemap**. It is the entry point for the schema `$id`
URLs, so it is visited by machines and occasionally by people. Four lines of
HTML in `docs/` would fix the metadata half.

The npm listing is in good shape: seven keywords, a homepage, a description.
For a library, npm and the GitHub repository page are the discovery surface
that actually matters, and both already work.

---

## Part 3: The content, and the product question inside it

### Granularity decides the order of magnitude

| Granularity | Pages | What a search engine could match |
|---|---|---|
| one page per repository | 11 | "German lesson sets about X" |
| one page per set | 47 listed sets | "Spanish A2 course", "dog training basics" |
| one page per lesson | ~600 lessons | "Present perfect vs simple past exercises" |
| one page per topic/tag | ~13 400 tag occurrences, far fewer distinct | "irregular verbs" |

Per-lesson is where the searchable long tail lives, and it is also the only
level that raises the product question below. Per-set is roughly 47 pages,
generatable from data that already exists.

### Who generates them

Two honest paths:

1. **From `search-index.json`.** Every content repo already publishes one,
   with set id, title, description, languages, level, domain, counts,
   `visibility` and `review_status`. A per-set overview page needs nothing
   else. The registry (`recommended-repos.json`) already enumerates the
   repos, so one generator over the registry produces the whole set-level
   layer. **No new data, no schema change.**
2. **From the lesson files.** Full readable pages need the lesson JSON, and
   that is where the product question sits.

### The product question, both sides

**Publishing lessons as readable pages means the content is consumable
without the app.** Someone who reads the lesson has the theory and the
answers; the app is then only needed for the practice loop and the spaced
repetition.

For: the content is CC-BY-SA and openly licensed by design, the project's
stated position is that no vendor should lock it away, and unreadable
content cannot be found at all. Against: the app's distinct value is the
practice loop, and a page that gives away answers is a worse learning
artifact than an exercise.

A middle position exists and should be named: publish the **theory** steps
and the set structure, not the exercise answers. That is derivable from the
lesson JSON (`type: "theory"` steps carry the prose; `accept`, `pairs` and
`blanks` carry the answers) and it makes the content findable without
publishing the drill.

**This is a decision for the architect, not a technical question.**

### Review status must gate any of this

Three sets are machine-generated and not reviewed (`review_status:
generated`), and two more arrived in `alc-books` this week with the same
marking. The app already treats `review_status != "generated"` as the
advertisable condition.

Publishing an unreviewed set as a public page while the app marks it as
unreviewed would contradict the app. **Any generated page layer must apply
the same filter**, and the filter already exists in the index. Marking
rather than excluding is defensible too, but it must be a decision, not an
oversight - and the honest default is to exclude, because a search engine
result carries no badge.

Note the same rule already covers `visibility: hidden`, which is set on the
demo and example sets.

### Where the pages would live

Three options, and the choice touches ownership:

- **In the app's Pages deployment.** Same origin as the app, so a link from
  a found page into the app is trivial. Owned by the app repo.
- **In each content repository's own Pages site.** Distributes the work and
  keeps each repo self-describing, but means eleven deployments to keep
  alike - the drift shape this ecosystem keeps paying for.
- **A third site.** Cleanest ownership, most new infrastructure.

Recommendation, not decision: the app's deployment, because it already has a
Pages site, a sitemap and a robots file, and because the link target for
"open this set" is the app anyway.

---

## Part 4: The implementation questions, in order of effect

| # | Step | Effect | Effort | Whose |
|---|---|---|---|---|
| 1 | Correct the app's stale meta description, and gate it against the index | The single line search results show is wrong today | very small | app |
| 2 | Give this repository's Pages landing page a meta description, Open Graph block and robots.txt | Cheap, entirely local, unblocks link previews | very small | **this repo** |
| 3 | Decide the content question (Part 3) | Everything below depends on it | decision only | architect |
| 4 | Per-set pages generated from the registry + each `search-index.json`, filtered by `review_status` and `visibility` | The first real content surface, ~47 pages | medium | app (needs registry read) |
| 5 | Generated sitemap for whichever site gains pages | Only useful once there are pages | small | follows 4 |
| 6 | `hreflang` per language on generated pages | The corpus is multilingual; without it the wrong language is shown to the wrong user | small | follows 4 |
| 7 | Structured data | See below | small | follows 4 |

On structured data: schema.org has `Course`, `LearningResource` and
`Quiz`, so a matching type does exist. It is worth doing ON generated pages
and worthless without them, so it belongs after step 4 and not before.

Steps 1 and 2 are independent of the big decision and are the only ones
worth doing before it.

---

## What is explicitly NOT worth doing

- **SEO work on the app landing page beyond the metadata.** It is a
  client-rendered shell. Short of server rendering, no amount of tuning
  produces indexable text, and server rendering is a large architectural
  change for an app that is deliberately local-first.
- **A sitemap for this repository's Pages site as it stands.** It has two
  pages and a directory of JSON artifacts. A sitemap would list what a
  crawler finds in one hop anyway. It becomes worthwhile only if this site
  gains pages.
- **Per-lesson pages before the product question is decided.** That is the
  step that publishes the answers, and building it first would decide the
  question by accident.
- **Pages sites in each of the eleven content repositories.** Eleven
  deployments that must stay alike is the exact drift shape this ecosystem
  has paid for repeatedly this week; the generator belongs in one place.
- **Chasing the app's local-only reachability.** It is a deliberate
  architectural property, not a discoverability bug.

---

## Registered needs (not decisions)

- **App:** the landing page's meta description states counts that are wrong,
  and there is no check tying them to the measured corpus. Same class as the
  repository descriptions, but here a gate is possible because the file is
  in the repo.
- **App:** the sitemap lists `/content`, which 301s to the landing page.
- **Content repos:** none. Everything the set-level layer needs is already
  published in `search-index.json`; no schema change and no per-repo work is
  required for step 4.
