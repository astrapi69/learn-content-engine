# Blog style guide

Formatting rules for every article under `docs/blog/`. They apply from the
first draft on, not as an afterthought. (They extend the repository-wide
no-em-dash rule from the coding standards to prose.)

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

## 3. Tables are real Markdown tables

Never flatten a table into running text with column gaps. Always a regular
Markdown table with `|` separators and a header row.

## 4. No emojis unless the context explicitly requires them

By default no emojis in body text or headings. (Artifact tab icons are
tooling metadata, not article text, and are exempt.)

## Checking

A quick audit before committing an article:

```shell
grep -c $'—' docs/blog/<article>.md         # em-dashes, expect 0
grep -oP '[^\x00-\x7F]' docs/blog/<article>.md | sort -u   # review every non-ASCII char
```
