import { parseChord } from './chords.js';

export const LINE_TYPES = Object.freeze({
  LYRICS: 'lyrics',
  CHORD_ONLY: 'chord-only',
  NOTE: 'note'
});

function requireArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }
  return value;
}

function optionalString(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string or null.`);
  }
  return value ?? '';
}

function createEntityId(value, fieldName) {
  if (value !== undefined && value !== null) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
      throw new TypeError(`${fieldName} must be a non-empty string of at most 128 characters.`);
    }
    return value;
  }
  return createId();
}

function optionalChord(value, fieldName) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || value.length > 64 || !parseChord(value)) {
    throw new TypeError(`${fieldName} must be a valid chord symbol.`);
  }
  return value;
}

function validateKey(value) {
  const key = optionalString(value, 'Song key').trim();
  if (key === '') {
    return '';
  }

  const parsed = parseChord(key);
  if (!parsed || !['', 'm'].includes(parsed.suffix) || parsed.bass) {
    throw new TypeError('Song key must be a note name with an optional minor suffix.');
  }
  return key;
}

function createId() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('A secure random UUID generator is required.');
  }
  return globalThis.crypto.randomUUID();
}

export class Word {
  constructor({ id, text = '', chord = null, syllables = [] } = {}) {
    this.id = createEntityId(id, 'Word id');
    this.text = optionalString(text, 'Word text');
    if (this.text.length > 2000) {
      throw new TypeError('Word text must be at most 2000 characters.');
    }
    this.chord = optionalChord(chord, 'Word chord');
    this.syllables = requireArray(syllables, 'Word syllables').map(
      (syllable) => new Syllable(syllable)
    );
    if (this.syllables.length > 100) {
      throw new RangeError('A word cannot contain more than 100 syllables.');
    }
  }

  toJSON() {
    return {
      id: this.id,
      text: this.text,
      chord: this.chord,
      syllables: this.syllables.map((syllable) => syllable.toJSON())
    };
  }
}

export class Syllable {
  constructor({ id, text = '', chord = null } = {}) {
    this.id = createEntityId(id, 'Syllable id');
    this.text = optionalString(text, 'Syllable text');
    if (this.text.length > 2000) {
      throw new TypeError('Syllable text must be at most 2000 characters.');
    }
    this.chord = optionalChord(chord, 'Syllable chord');
  }

  toJSON() {
    return { id: this.id, text: this.text, chord: this.chord };
  }
}

export class Line {
  constructor({ id, type = LINE_TYPES.LYRICS, words = [], chords = [], text = '' } = {}) {
    if (!Object.values(LINE_TYPES).includes(type)) {
      throw new TypeError(`Line type must be one of: ${Object.values(LINE_TYPES).join(', ')}.`);
    }

    this.id = createEntityId(id, 'Line id');
    this.type = type;
    this.words = requireArray(words, 'Line words').map((word) => new Word(word));
    if (this.words.length > 500) {
      throw new RangeError('A line cannot contain more than 500 words.');
    }
    this.chords = requireArray(chords, 'Line chords').map((chord) =>
      optionalChord(chord, 'Line chord')
    );
    if (this.chords.length > 500) {
      throw new RangeError('A chord-only line cannot contain more than 500 chords.');
    }
    this.text = optionalString(text, 'Line text');
    if (this.text.length > 20000) {
      throw new TypeError('Line text must be at most 20000 characters.');
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      words: this.words.map((word) => word.toJSON()),
      chords: [...this.chords],
      text: this.text
    };
  }
}

export class Section {
  constructor({ id, name = '', order = 0, lines = [] } = {}) {
    if (!Number.isInteger(order) || order < 0) {
      throw new TypeError('Section order must be a non-negative integer.');
    }

    this.id = createEntityId(id, 'Section id');
    this.name = optionalString(name, 'Section name');
    if (this.name.length > 100) {
      throw new TypeError('Section name must be at most 100 characters.');
    }
    this.order = order;
    this.lines = requireArray(lines, 'Section lines').map((line) => new Line(line));
    if (this.lines.length > 500) {
      throw new RangeError('A section cannot contain more than 500 lines.');
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      order: this.order,
      lines: this.lines.map((line) => line.toJSON())
    };
  }
}

export class Song {
  constructor({
    id = createId(),
    title = '',
    writers = [],
    performer = '',
    key = '',
    capo = null,
    tempo = null,
    notes = '',
    ccliSongNumber = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    sections = []
  } = {}) {
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
      throw new TypeError('Song id must be a non-empty string of at most 128 characters.');
    }
    if (capo !== null && (!Number.isInteger(capo) || capo < 0)) {
      throw new TypeError('Song capo must be null or a non-negative integer.');
    }
    if (tempo !== null && (!Number.isFinite(tempo) || tempo <= 0)) {
      throw new TypeError('Song tempo must be null or a positive number.');
    }
    if (ccliSongNumber !== null && typeof ccliSongNumber !== 'string') {
      throw new TypeError('CCLI song number must be a string or null.');
    }

    this.id = id;
    this.title = optionalString(title, 'Song title');
    if (this.title.length > 200) {
      throw new TypeError('Song title must be at most 200 characters.');
    }
    this.writers = requireArray(writers, 'Song writers').map((writer) => {
      const normalizedWriter = optionalString(writer, 'Song writer');
      if (normalizedWriter.length > 200) {
        throw new TypeError('Each song writer must be at most 200 characters.');
      }
      return normalizedWriter;
    });
    this.performer = optionalString(performer, 'Song performer');
    if (this.performer.length > 200) {
      throw new TypeError('Song performer must be at most 200 characters.');
    }
    this.key = validateKey(key);
    this.capo = capo;
    this.tempo = tempo;
    this.notes = optionalString(notes, 'Song notes');
    if (this.notes.length > 20000) {
      throw new TypeError('Song notes must be at most 20000 characters.');
    }
    if (ccliSongNumber?.length > 64) {
      throw new TypeError('CCLI song number must be at most 64 characters.');
    }
    this.ccliSongNumber = ccliSongNumber;
    this.createdAt = optionalString(createdAt, 'Song createdAt');
    this.updatedAt = optionalString(updatedAt, 'Song updatedAt');
    this.sections = requireArray(sections, 'Song sections').map(
      (section) => new Section(section)
    );
    if (this.sections.length > 100) {
      throw new RangeError('A song cannot contain more than 100 sections.');
    }
    const entityIds = new Set([this.id]);
    for (const section of this.sections) {
      for (const entity of [
        section,
        ...section.lines,
        ...section.lines.flatMap((line) => [
          ...line.words,
          ...line.words.flatMap((word) => word.syllables)
        ])
      ]) {
        if (entityIds.has(entity.id)) {
          throw new TypeError(`Duplicate entity id: ${entity.id}`);
        }
        entityIds.add(entity.id);
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      writers: [...this.writers],
      performer: this.performer,
      key: this.key,
      capo: this.capo,
      tempo: this.tempo,
      notes: this.notes,
      ccliSongNumber: this.ccliSongNumber,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      sections: this.sections.map((section) => section.toJSON())
    };
  }
}
