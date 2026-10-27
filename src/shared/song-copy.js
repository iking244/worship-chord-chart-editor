import { Song } from './models.js';

export function createSongCopy(input, { id = crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  const source = new Song(input).toJSON();
  const copy = structuredClone(source);
  copy.id = id;
  copy.title = source.title
    ? `${source.title.slice(0, 194)} (Copy)`
    : 'Untitled song (Copy)';
  copy.createdAt = now;
  copy.updatedAt = now;
  for (const section of copy.sections) {
    delete section.id;
    for (const line of section.lines) {
      delete line.id;
      for (const word of line.words) {
        delete word.id;
        for (const syllable of word.syllables) {
          delete syllable.id;
        }
      }
    }
  }
  return new Song(copy).toJSON();
}
