# Proposal: sung and chanted lessons, and the voices behind lesson audio

Status: **planned, not started** (owner, 2026-09-30: a bigger task; document
it now, start later). Tracked in engine#232. Idea by the owner:
short phrases learned by singing them ("¿Cómo se dice 'ich habe nicht'?" sung
as "no tengo") stick better than phrases read or spoken. This document records
what the idea rests on, what already exists, where the voices come from, and
what each part of the ecosystem would do, so the work can be planned and the
engine supports it when it starts.

## What the evidence supports, and what it does not

- **Singing helps recall of foreign phrases.** Adults who learned Hungarian
  phrases by singing them recalled them better than a group that learned them
  by speaking (Ludke, Ferreira & Overy 2014, *Memory & Cognition* 42(1)).
  Word boundaries of an unknown language are found more easily in sung than in
  spoken input (Schön et al. 2008, *Cognition* 106(2)).
- **Only simple, repeated melodies help.** A melody aids recall of a text when
  it is simple and repeated; a complex one makes recall worse (Wallace 1994,
  *Journal of Experimental Psychology: Learning, Memory, and Cognition* 20(6)).
- **It helps verbatim recall, not grammar.** What the melody carries is the
  exact wording. That suits formulaic chunks (`no tengo`, `me gustaría`,
  `¿dónde está?`), and it is no substitute for exercises that use the chunk in
  new sentences.
- **Rhythm without melody is the established low-cost variant.** Jazz Chants
  (Carolyn Graham, since 1978, widely used in English teaching) are phrases
  spoken to a beat; no one has to sing.

Consequence for the design: **short sung or chanted chunks, repeated, with
meaning and use around them**, not whole songs first.

## What exists today

| Activity | Carried by | In the reference app |
|---|---|---|
| Hear the sung chunk before answering | a card's `audio` (a path in the set's `assets/`) | played before `free_text` and `matching` (`ListenFirstAudio`) |
| Sing along: hear it, reveal the text, record oneself | `ext:ref-speak-and-record` (ungraded) | adopted as `ext:al-speak-and-record` |
| Hear a line, write it | `ext:ref-dictation` | adopted as `ext:al-dictation` |
| A gapped sentence with audio options | `ext:ref-audio-choice` | adopted as `ext:al-audio-choice` |
| Hear a sentence, build its translation from tiles | `ext:ref-audio-tiles` | adopted as `ext:al-audio-tiles` |
| Repeat over time | the consumer's spaced repetition over the cards | running |

A lesson "Singing: no tengo" can be written today: a theory step with the
lyrics and their translation, sing-along steps, dictation steps, and cards
whose `audio` is the sung chunk. With five exercises of two types and a theory
step it also meets the [quality minimums](../lesson-format.md#quality-minimums).
The lessons are optional by being their own set ("Learning with music"), not
by a new flag.

What does **not** exist: a player that shows lyrics in time with the audio
(karaoke-style highlighting, looping one line, filling gaps while listening).
Only whole songs need it.

## Voices: where the audio comes from

The engine never produces audio. It is framework-agnostic and makes no network
calls (see [architecture](../architecture.md)); it carries the format (`audio`
fields) and validates it. Audio is made by repository tooling and stored as
assets.

**The family already has the text-to-speech part.** manuscripta's audiobook
module (`manuscripta.audiobook.tts`) has one adapter interface (`TTSAdapter`:
`synthesize`, `list_voices`, `validate`) and adapters for `edge`, `google`,
`pyttsx3` and `elevenlabs`. On 2026-09-30 a `voicestudio` adapter was added on
the branch `feature/voicestudio-tts-adapter` (not merged or released yet):

- [VoiceStudio](https://voicestudio.sh) runs speech models (such as OmniVoice)
  on the local machine and serves an OpenAI-compatible API
  (`POST /v1/audio/speech`) while the app is open. No cloud, no quota, no
  per-character cost.
- Voices are profiles, cloned from a short sample or designed, addressed by id
  or name (for example the owner's own voice).
- The adapter sends the language as its primary subtag (`de-AT` becomes `de`),
  so the model pronounces the text in that language.

It **speaks, it does not sing.** That covers spoken card audio, whole spoken
lessons, and chants (speech placed on a beat by mixing). Real singing needs a
human recording or a singing-synthesis tool; which one is an open decision
below.

**Reuse, do not rewrite.** The content template's tooling is Python, like
manuscripta, so an audio script there uses manuscripta's adapters instead of a
new TTS client (the family-first rule). The gap to settle before it does: the
adapters live inside a book-production package, so a consumer that needs only
speech installs all of it. Either the template depends on manuscripta as it
is, or the TTS module becomes its own small family library that both use.

## Plan

Each stage starts only when the previous one has shown it is worth it.

| Stage | What | Where | Engine work |
|---|---|---|---|
| 1. Pilot | One set "Learning with music" in one language (Spanish), 10 to 20 chunks, sung by a person or chanted with a VoiceStudio voice; built from the existing types above | one content repository | none |
| 2. Tooling | A script that turns card text into audio assets with a chosen adapter and voice, writes `assets/audio/<card-id>.mp3` and sets the card's `audio`; the repository gate checks that every `audio` path exists | content template | none |
| 3. Measure | Do the sung or chanted cards do better in spaced repetition than comparable spoken ones? | reference app (its review data) | none |
| 4. Songs | Only if stage 3 says yes: a sing-along extension with timed lyrics | engine, then app | `ext:ref-sing-along` |

**The engine's part in stage 4** would follow the pattern of the other audio
extensions (engine#68: audio is a consumer capability, carried in
`ext_payload`, not a core field): `audio` (the song), `lines` with a start and
end time and the text of each line (the timing model of the widely used LRC
lyric format), an optional `translation` per line, and optional gaps for a
listening cloze. The engine would validate the shape: times ascending and
within the clip, gaps marked in the line text. Playback and highlighting stay
the consumer's.

**A question for the engine now, not later: where an audio clip came from.**
A clip can be a person's recording, a cloned voice, or a synthetic one. Rights
and disclosure depend on which. For synthetic audio, a machine-readable marker
is the direction the EU AI Act's transparency rules take (Art. 50). Nothing in
the schema records this today. A candidate: an optional provenance on a set's
assets (voice, tool, `generated: true`), declared once per set rather than per
clip. It is a decision to make before stage 2 writes the first generated clip.

## Open decisions

1. **Sung, chanted or both for the pilot?** Recommendation: sung where a person
   sings, chanted with a VoiceStudio voice elsewhere, and compare the two in
   stage 3.
2. **Which voice?** Recommendation: the owner's cloned voice for the pilot
   (rights are clear), checked by a native speaker for pronunciation.
3. **manuscripta as a dependency, or its TTS module as its own library?**
   Recommendation: its own library once a second consumer (the template)
   exists; until then the template may depend on manuscripta directly.
4. **Audio provenance in the schema?** Recommendation: yes, optional and per
   set, decided before stage 2.
5. **Rights for song texts and melodies.** Only own texts and melodies, or
   public-domain folk songs; lyrics of known songs are protected even in
   excerpts, so the approach of apps that gap-fill real pop songs is not open
   to us.
