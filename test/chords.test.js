import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChord, transposeChord, transposeSong } from '../src/shared/chords.js';

test('parses chord roots, qualities, and slash bass notes', () => {
  assert.deepEqual(parseChord('Bbmaj7/D'), {
    root: 'Bb',
    suffix: 'maj7',
    bass: 'D'
  });
  assert.deepEqual(parseChord('C6/9'), {
    root: 'C',
    suffix: '6/9',
    bass: null
  });
  assert.equal(parseChord('not-a-chord'), null);
  assert.equal(parseChord('G/not-a-bass'), null);
  assert.deepEqual(parseChord('C7sus4'), { root: 'C', suffix: '7sus4', bass: null });
  assert.equal(parseChord('Cfoobar'), null);
});

test('transposes sharp, flat, and slash chord notes', () => {
  assert.equal(transposeChord('Bbmaj7/D', 2), 'Cmaj7/E');
  assert.equal(transposeChord('F#m7/C#', 1), 'Gm7/D');
  assert.equal(transposeChord('Eb/G', 2), 'F/A');
  assert.equal(transposeChord('C', 1, { accidentals: 'flat' }), 'Db');
  assert.equal(transposeChord('G7sus4', 2), 'A7sus4');
});

test('transposes a song without changing lyrics or the input object', () => {
  const song = {
    key: 'Bb',
    sections: [{
      name: 'Verse',
      order: 0,
      lines: [{
        type: 'lyrics',
        text: '',
        words: [{
          text: 'grace',
          chord: 'Bb/D',
          syllables: [{ text: 'grace', chord: 'F' }]
        }]
      }]
    }]
  };

  const result = transposeSong(song, 2);
  assert.equal(result.key, 'C');
  assert.equal(result.sections[0].lines[0].words[0].text, 'grace');
  assert.equal(result.sections[0].lines[0].words[0].chord, 'C/E');
  assert.equal(result.sections[0].lines[0].words[0].syllables[0].chord, 'G');
  assert.equal(song.sections[0].lines[0].words[0].chord, 'Bb/D');
});

test('rejects unsupported chords and non-integer intervals', () => {
  assert.throws(() => transposeChord('invalid', 1), /Invalid chord symbol/);
  assert.throws(() => transposeChord('C', 1.5), /integer/);
});
