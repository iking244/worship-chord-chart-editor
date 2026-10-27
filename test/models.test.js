import assert from 'node:assert/strict';
import test from 'node:test';
import { LINE_TYPES, Line, Section, Song, Word } from '../src/shared/models.js';

test('models preserve song metadata and nested word-level chords', () => {
  const song = new Song({
    id: 'song-1',
    title: 'Amazing Grace',
    writers: ['John Newton'],
    performer: 'Traditional',
    key: 'G',
    capo: 2,
    tempo: 72,
    notes: 'Use a gentle introduction.',
    ccliSongNumber: '123456',
    sections: [{
      name: 'Verse 1',
      order: 0,
      lines: [{
        type: LINE_TYPES.LYRICS,
        words: [{
          text: 'Amazing',
          chord: 'G',
          syllables: [{ text: 'A-', chord: 'G' }, { text: 'maz-ing', chord: 'D' }]
        }]
      }]
    }]
  });

  const json = song.toJSON();
  assert.equal(json.title, 'Amazing Grace');
  assert.equal(json.sections[0].lines[0].words[0].syllables[1].chord, 'D');
  assert.equal(json.ccliSongNumber, '123456');
});

test('line types are restricted to the specification types', () => {
  assert.equal(new Line({ type: LINE_TYPES.CHORD_ONLY }).type, 'chord-only');
  assert.equal(new Line({ type: LINE_TYPES.NOTE, text: 'Repeat twice.' }).text, 'Repeat twice.');
  assert.throws(() => new Line({ type: 'unknown' }), /Line type/);
});

test('word, section, and song input structures are validated', () => {
  assert.equal(new Word({ text: 'word' }).syllables.length, 0);
  assert.equal(new Section({ name: 'Chorus', order: 1 }).lines.length, 0);
  assert.throws(() => new Section({ order: -1 }), /order/);
  assert.throws(() => new Song({ tempo: 0 }), /tempo/);
  assert.throws(() => new Song({ key: 'H' }), /Song key/);
  assert.equal(new Song({ key: 'F#m' }).key, 'F#m');
  assert.throws(() => new Song({ title: 'x'.repeat(201) }), /title/);
});
