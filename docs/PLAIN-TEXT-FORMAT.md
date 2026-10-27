# Plain-text chart format

The importer and exporter use a small local text format. Import uses UTF-8 and accepts `.txt` and `.text` files up to 1 MB. The parser is deterministic and previews the structured result and warnings before the app saves anything.

## Supported syntax

```text
# Title: Amazing Grace
# Writers: John Newton; John Rees
# Performer: Example artist
# Key: G
# Capo: 2
# Tempo: 72
# CCLI: 12345
# Notes: "Play softly"

[Verse 1]
G                 D/F#
Amazing grace how sweet the sound
> Start quietly

[Chorus]
C       G/B       Am
How great is our God
```

- Metadata is written as `# Field: value`. Supported fields are Title, Writers, Performer, Key, Capo, Tempo, CCLI, and Notes. Writers use semicolons between names. Notes exported by the app are JSON-quoted so line breaks and punctuation round-trip.
- Bracketed labels such as `[Verse 2]` or `[My section]` create sections. Bare common labels such as `Verse`, `Chorus`, `Bridge`, `Intro`, `Outro`, `Tag`, `Pre-Chorus`, `Refrain`, and `Instrumental`, optionally followed by a number, also create sections.
- A chord line contains only valid chord symbols, separated by spaces or tabs. It is paired with the next non-empty lyric line when that line is not a heading, note, or chord line.
- `>` begins a note line. A chord line without a following lyric line is preserved as a chord-only line.
- Blank lines separate visual groups and are ignored in the structured model. Lines that do not match a recognized control form are lyrics; punctuation remains attached to each word.

## Alignment and diagnostics

Tabs expand to the next four-column tab stop. Chord and lyric positions are measured in Unicode code points, not terminal cells or grapheme-cluster display width. A chord whose column falls between words is mapped to the nearest word and marked as uncertain in the review. If multiple chord tokens would occupy one word, the first is assigned to that word and additional symbols are retained as a chord-only line with a warning.

Unicode characters that may display wider or narrower than one code point, long lines over 120 code points, and multiple syllable chords are called out during export. Plain-Text export uses monospace-style columns and does not wrap lines. Transposition requires a known song key and preserves major/minor mode and chord qualities. Syllable chords are represented by the first syllable chord at word level; the structured song remains the authoritative source.

The format does not attempt to infer repeats, alternate endings, multiple simultaneous chords on one word, or syllable-level horizontal offsets. Such material should be checked in the import preview and edited in the chart editor.
