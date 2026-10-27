import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePrintOptions } from '../src/shared/print-options.js';
import { createSongCopy } from '../src/shared/song-copy.js';

test('print options are normalized and bounded', () => {
  assert.deepEqual(normalizePrintOptions(), {
    pageSize: 'A4',
    orientation: 'portrait',
    fontSize: 12,
    includeMetadata: true,
    key: ''
  });
  assert.deepEqual(normalizePrintOptions({
    pageSize: 'Letter',
    orientation: 'landscape',
    fontSize: 18,
    includeMetadata: false,
    key: 'Bb'
  }), {
    pageSize: 'Letter',
    orientation: 'landscape',
    fontSize: 18,
    includeMetadata: false,
    key: 'Bb'
  });
  assert.throws(() => normalizePrintOptions({ pageSize: 'A3' }), /Page size/);
  assert.throws(() => normalizePrintOptions({ fontSize: 25 }), /font size/);
  assert.throws(() => normalizePrintOptions({ includeMetadata: 'yes' }), /boolean/);
  assert.throws(() => normalizePrintOptions({ filePath: 'C:\\private.pdf' }), /unsupported field/);
});

test('song copy preserves content, assigns fresh nested IDs and timestamps, and labels its title', () => {
  const source = {
    id: 'source',
    title: 'A song',
    key: 'G',
    sections: [{
      id: 'section',
      name: 'Verse',
      lines: [{
        id: 'line',
        type: 'lyrics',
        words: [{
          id: 'word',
          text: 'Grace',
          chord: 'G',
          syllables: [{ id: 'syllable', text: 'Grace', chord: 'D' }]
        }]
      }]
    }]
  };
  const copy = createSongCopy(source, {
    id: 'copy',
    now: '2026-10-26T00:00:00.000Z'
  });
  assert.equal(copy.id, 'copy');
  assert.equal(copy.title, 'A song (Copy)');
  assert.equal(copy.key, 'G');
  assert.equal(copy.sections[0].lines[0].words[0].chord, 'G');
  assert.equal(copy.createdAt, copy.updatedAt);
  assert.notEqual(copy.sections[0].id, source.sections[0].id);
  assert.notEqual(copy.sections[0].lines[0].id, source.sections[0].lines[0].id);
  assert.notEqual(copy.sections[0].lines[0].words[0].id, source.sections[0].lines[0].words[0].id);
  assert.notEqual(
    copy.sections[0].lines[0].words[0].syllables[0].id,
    source.sections[0].lines[0].words[0].syllables[0].id
  );
  assert.equal(source.title, 'A song');
});
