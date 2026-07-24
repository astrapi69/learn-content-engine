# Blog style guide

Formatting rules for every article under `docs/blog/`. They apply from the
first draft on, not as an afterthought. (They extend the repository-wide
no-em-dash rule from the coding standards to prose.)

Rule 1 applies beyond the blog: every self-authored Markdown file under
`docs/` is the same kind of editorial prose and follows it (decided and
swept in #80). The
other rules stay blog-specific. Learner content in the content repositories
is out of scope: that is multilingual material with its own authorship and
its own conventions.

This is the single place the blog formatting guidelines live (elsewhere
referred to as the "formatierungsrichtlinien-blog-engine-cc" rules). Read
it before drafting or reviewing an article.

## 1. No em-dashes

Never use `—` (U+2014), and never fake one with a spaced hyphen used as a
pause. Replace by context:

- **Comma** for an ordinary sentence connection.
- **Colon** when an explanation or enumeration follows.
- **Parentheses** for an inserted aside.
- **Period / new sentence** for two independent thoughts.

The regular hyphen (`-`) stays allowed for compound words
(`framework-agnostic`, `ext:al-graded-quiz`) and ranges (`1.7 to 1.8`).

## 2. Standard UTF-8 only

No hidden control characters, no zero-width spaces, no special Unicode
formatting. German text and examples use real umlauts (ä, ö, ü, Ä, Ö, Ü, ß),
never ae/oe/ue/ss substitutions. ASCII-art diagrams in code fences use plain
ASCII (`+`, `-`, `|`, `>`), not box-drawing characters.

## 3. No emojis unless the context explicitly requires them

By default no emojis in body text or headings. (Artifact tab icons are
tooling metadata, not article text, and are exempt.)

## 4. Rhetorical questions only when they carry the argument

A question in the prose is allowed when it does real work: framing the
piece's central problem, bridging into the next section, or posing a test
the reader is meant to answer (for example the core-or-extension decision
questions in the schema-first article). It is not allowed as a
conversational filler that a plain statement would say better. "Don't
like the mix? Regenerate." is filler; "To change the mix, regenerate."
is the sentence. Question marks inside quoted examples or code
(`"Was ist Berlin?"`) are content, not prose, and are exempt.

## 5. Tables are real Markdown tables

Never flatten a table into running text with column gaps. Always a regular
Markdown table with `|` separators and a header row. Conversely, a bullet
list whose items are prose explanations is a list, not a disguised table:
only convert to a table when the items are genuinely tabular (short,
parallel, two or more aligned columns).

## 6. Close with a summary where it helps

An article that makes an argument or walks a process ends with a short
recap: the italic one-liner these pieces use ("Core owns the contract.
Consumers own the rules.") or a tight bulleted takeaway. It is a default,
not a mandate: a purely referential note needs none.

## Checking

A quick audit before committing an article:

```shell
grep -c $'—' docs/blog/<article>.md          # real em-dashes (U+2014), expect 0
grep -nP '\S - \S' docs/blog/<article>.md     # faked em-dashes (spaced hyphen as a pause), expect none in prose
grep -oP '[^\x00-\x7F]' docs/blog/<article>.md | sort -u   # review every non-ASCII char
```

The second grep matters: a spaced hyphen used as a pause is rule 1's other
half and a plain U+2014 count misses it entirely. Ignore hits inside code
fences (ASCII diagrams) and table rows.

Because rule 1 covers all of `docs/`, its check also runs corpus-wide:

```shell
grep -rnP '\S - \S' docs --include='*.md'   # faked em-dashes anywhere under docs/
```
