import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonSongStore } from '../src/main/song-store.js';

test('song store creates, reads, updates, and preserves creation time', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chord-chart-store-'));
  try {
    const store = new JsonSongStore(path.join(directory, 'songs.json'));
    const created = await store.save({
      id: 'phase-2-song',
      title: 'Amazing Grace',
      writers: ['John Newton'],
      key: 'G',
      sections: []
    });

    assert.equal(created.title, 'Amazing Grace');
    assert.equal(await store.get(created.id).then((song) => song.title), 'Amazing Grace');

    const updated = await store.save({
      ...created,
      title: 'Amazing Grace Updated',
      createdAt: '1999-01-01T00:00:00.000Z'
    });
    assert.equal(updated.title, 'Amazing Grace Updated');
    assert.equal(updated.createdAt, created.createdAt);
    assert.notEqual(updated.updatedAt, created.updatedAt);
    assert.equal((await store.list()).length, 1);
    assert.equal(await store.get('missing-song'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('song store persists stable section, line, word, and syllable identities', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chord-chart-store-'));
  try {
    const store = new JsonSongStore(path.join(directory, 'songs.json'));
    const saved = await store.save({
      id: 'nested-song',
      title: 'Nested data',
      sections: [{
        id: 'section-id',
        name: 'Verse',
        order: 0,
        lines: [{
          id: 'line-id',
          type: 'lyrics',
          words: [{
            id: 'word-id',
            text: 'Amazing',
            chord: 'G',
            syllables: [{ id: 'syllable-id', text: 'A', chord: 'D' }]
          }]
        }]
      }]
    });
    const loaded = await store.get(saved.id);
    assert.equal(loaded.sections[0].id, 'section-id');
    assert.equal(loaded.sections[0].lines[0].id, 'line-id');
    assert.equal(loaded.sections[0].lines[0].words[0].id, 'word-id');
    assert.equal(loaded.sections[0].lines[0].words[0].syllables[0].id, 'syllable-id');
    assert.equal(loaded.sections[0].lines[0].words[0].chord, 'G');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('song store rejects invalid data and reports malformed persisted JSON', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chord-chart-store-'));
  const filePath = path.join(directory, 'songs.json');
  try {
    const store = new JsonSongStore(filePath);
    await assert.rejects(store.save({ id: 'invalid-key', key: 'H' }), /Song key/);
    await assert.rejects(store.save({ id: 'missing-title' }), /Song title is required/);
    await assert.rejects(store.save({ id: 'invalid-tempo', title: 'Valid', tempo: -1 }), /tempo/);
    await writeFile(filePath, '{invalid json', 'utf8');
    await assert.rejects(store.list(), SyntaxError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
