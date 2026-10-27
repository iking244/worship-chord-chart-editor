import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Song } from '../shared/models.js';

export class JsonSongStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async list() {
    const songs = await this.#readAll();
    return songs.sort((left, right) => left.title.localeCompare(right.title));
  }

  async get(songId) {
    this.#validateSongId(songId);
    const songs = await this.#readAll();
    const song = songs.find((entry) => entry.id === songId);
    return song ? structuredClone(song) : null;
  }

  save(input) {
    return this.#enqueue(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Song data must be an object.');
      }
      const submitted = new Song(input);
      if (!submitted.title.trim()) {
        throw new TypeError('Song title is required.');
      }
      const songs = await this.#readAll();
      const existingIndex = songs.findIndex((song) => song.id === submitted.id);
      const now = new Date().toISOString();
      const saved = new Song({
        ...submitted.toJSON(),
        createdAt: existingIndex < 0 ? submitted.createdAt : songs[existingIndex].createdAt,
        updatedAt: now
      });

      if (existingIndex < 0) {
        songs.push(saved.toJSON());
      } else {
        songs[existingIndex] = saved.toJSON();
      }

      await this.#writeAll(songs);
      return saved.toJSON();
    });
  }

  delete(songId) {
    return this.#enqueue(async () => {
      this.#validateSongId(songId);
      const songs = await this.#readAll();
      const remaining = songs.filter((song) => song.id !== songId);
      if (remaining.length === songs.length) {
        return false;
      }
      await this.#writeAll(remaining);
      return true;
    });
  }

  #validateSongId(songId) {
    if (typeof songId !== 'string' || songId.length === 0 || songId.length > 128) {
      throw new TypeError('Song id must be a non-empty string of at most 128 characters.');
    }
  }

  #enqueue(operation) {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async #readAll() {
    let content;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('Song data file must contain a JSON array.');
    }
    return parsed.map((song) => new Song(song).toJSON());
  }

  async #writeAll(songs) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(songs, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx'
      });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
