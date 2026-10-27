import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addLine,
  addSection,
  moveSection,
  pasteLyricsIntoSection,
  removeLine,
  removeSection,
  renameSection,
  setLineChords,
  setLineNote,
  setLyrics,
  setSyllableChord,
  setWordSyllables,
  setWordChord,
  removeWordChord,
  removeSyllableChord,
  splitSyllables,
  splitLyrics
} from '../src/shared/chart-editor.js';
import { LINE_TYPES, Song } from '../src/shared/models.js';

function emptySong() {
  return new Song({ id: 'song-phase-three', title: 'Phase Three' });
}

test('splits Unicode lyric text on whitespace and leaves punctuation attached', () => {
  assert.deepEqual(splitLyrics('  Grace,\t amazing\nlove! '), ['Grace,', 'amazing', 'love!']);
  assert.deepEqual(splitLyrics(''), []);
  assert.throws(() => splitLyrics(null), /string/);
});

test('pastes multiline lyrics into structured lines and creates a default section when needed', () => {
  const song = pasteLyricsIntoSection(emptySong(), null, 'Grace, amazing\n\nlove!');
  assert.equal(song.sections[0].name, 'Verse 1');
  assert.equal(song.sections[0].lines.length, 3);
  assert.deepEqual(
    song.sections[0].lines.map((line) => line.words.map((word) => word.text)),
    [['Grace,', 'amazing'], [], ['love!']]
  );
  assert.notEqual(song.sections[0].lines[0].id, song.sections[0].lines[1].id);
});

test('creates, labels, reorders, and removes sections with normalized order', () => {
  let song = addSection(emptySong(), 'Verse');
  const verseId = song.sections[0].id;
  song = addSection(song, 'Chorus');
  const chorusId = song.sections[1].id;
  song = renameSection(song, chorusId, 'Chorus 1');
  song = moveSection(song, chorusId, -1);

  assert.deepEqual(song.sections.map((section) => section.name), ['Chorus 1', 'Verse']);
  assert.deepEqual(song.sections.map((section) => section.order), [0, 1]);
  song = removeSection(song, verseId);
  assert.deepEqual(song.sections.map((section) => section.name), ['Chorus 1']);
  assert.equal(song.sections[0].id, chorusId);
});

test('edits lyric lines and preserves chords on unchanged words', () => {
  let song = addSection(emptySong(), 'Verse');
  const sectionId = song.sections[0].id;
  song = addLine(song, sectionId, LINE_TYPES.LYRICS);
  const lineId = song.sections[0].lines[0].id;
  song = setLyrics(song, sectionId, lineId, 'Amazing grace how sweet');
  let words = song.sections[0].lines[0].words;
  const chordedWordId = words[2].id;
  song = setWordChord(song, sectionId, lineId, chordedWordId, 'G');

  song = setLyrics(song, sectionId, lineId, 'Amazing grace, how sweet');
  words = song.sections[0].lines[0].words;
  assert.deepEqual(words.map((word) => word.text), ['Amazing', 'grace,', 'how', 'sweet']);
  assert.equal(words[2].chord, 'G');
  assert.equal(words[2].id, chordedWordId);

  song = setLyrics(song, sectionId, lineId, 'Amazing grace how sweet');
  words = song.sections[0].lines[0].words;
  assert.equal(words[2].chord, 'G');
  assert.equal(words[2].id, chordedWordId);
});

test('supports word chord replacement/removal and rejects invalid chord symbols', () => {
  let song = addSection(emptySong(), 'Verse');
  const sectionId = song.sections[0].id;
  song = addLine(song, sectionId, LINE_TYPES.LYRICS);
  const lineId = song.sections[0].lines[0].id;
  song = setLyrics(song, sectionId, lineId, 'Grace');
  const wordId = song.sections[0].lines[0].words[0].id;

  song = setWordChord(song, sectionId, lineId, wordId, 'Bb/D');
  assert.equal(song.sections[0].lines[0].words[0].chord, 'Bb/D');
  song = setWordChord(song, sectionId, lineId, wordId, 'F#m');
  assert.equal(song.sections[0].lines[0].words[0].chord, 'F#m');
  song = removeWordChord(song, sectionId, lineId, wordId);
  assert.equal(song.sections[0].lines[0].words[0].chord, null);
  assert.throws(() => setWordChord(song, sectionId, lineId, wordId, 'not-a-chord'), /valid chord/);
});

test('splits words into syllables and retains syllable chords on unchanged parts', () => {
  let song = addSection(emptySong(), 'Verse');
  const sectionId = song.sections[0].id;
  song = addLine(song, sectionId, LINE_TYPES.LYRICS);
  const lineId = song.sections[0].lines[0].id;
  song = setLyrics(song, sectionId, lineId, 'Amazing');
  const wordId = song.sections[0].lines[0].words[0].id;
  song = setWordSyllables(song, sectionId, lineId, wordId, 'A-maz-ing');
  const syllables = song.sections[0].lines[0].words[0].syllables;
  assert.deepEqual(syllables.map((syllable) => syllable.text), ['A', 'maz', 'ing']);
  assert.deepEqual(splitSyllables('A-maz-ing', 'Amazing'), ['A', 'maz', 'ing']);

  song = setSyllableChord(song, sectionId, lineId, wordId, syllables[1].id, 'D/F#');
  assert.equal(song.sections[0].lines[0].words[0].syllables[1].chord, 'D/F#');
  song = setWordSyllables(song, sectionId, lineId, wordId, 'A-maz-ing');
  assert.equal(song.sections[0].lines[0].words[0].syllables[1].chord, 'D/F#');
  song = removeSyllableChord(song, sectionId, lineId, wordId, syllables[1].id);
  assert.equal(song.sections[0].lines[0].words[0].syllables[1].chord, null);
  assert.throws(() => setWordSyllables(song, sectionId, lineId, wordId, 'A-maz-ing!'), /exactly match/);
  song = setWordSyllables(song, sectionId, lineId, wordId, 'Amazing');
  assert.deepEqual(song.sections[0].lines[0].words[0].syllables, []);
});

test('keeps chord-only and note lines in their own structured fields', () => {
  let song = addSection(emptySong(), 'Intro');
  const sectionId = song.sections[0].id;
  song = addLine(song, sectionId, LINE_TYPES.CHORD_ONLY);
  const chordLine = song.sections[0].lines[0];
  song = setLineChords(song, sectionId, chordLine.id, 'G D/F# Em C');
  assert.deepEqual(song.sections[0].lines[0].chords, ['G', 'D/F#', 'Em', 'C']);
  assert.deepEqual(song.sections[0].lines[0].words, []);
  assert.throws(() => setLineChords(song, sectionId, chordLine.id, 'G invalid'), /valid chord/);

  song = addLine(song, sectionId, LINE_TYPES.NOTE);
  const noteLineId = song.sections[0].lines[1].id;
  song = setLineNote(song, sectionId, noteLineId, 'Repeat twice.');
  assert.equal(song.sections[0].lines[1].text, 'Repeat twice.');
  assert.throws(() => setLineNote(song, sectionId, chordLine.id, 'wrong type'), /note line/);

  song = removeLine(song, sectionId, chordLine.id);
  assert.equal(song.sections[0].lines.length, 1);
  assert.equal(song.sections[0].lines[0].type, LINE_TYPES.NOTE);
});

test('assigns stable nested IDs and rejects duplicate IDs in a song', () => {
  const song = new Song({
    id: 'stable-song',
    title: 'Stable IDs',
    sections: [{
      id: 'section-1',
      order: 0,
      lines: [{
        id: 'line-1',
        type: LINE_TYPES.LYRICS,
        words: [{ id: 'word-1', text: 'Grace' }]
      }]
    }]
  }).toJSON();
  assert.equal(song.sections[0].id, 'section-1');
  assert.equal(song.sections[0].lines[0].words[0].id, 'word-1');
  assert.ok(song.sections[0].lines[0].words[0].syllables.length === 0);
  assert.throws(() => new Song({
    id: 'duplicate',
    sections: [
      { id: 'same', order: 0 },
      { id: 'same', order: 1 }
    ]
  }), /Duplicate entity id/);
});
