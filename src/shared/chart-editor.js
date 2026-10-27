import { parseChord } from './chords.js';
import { LINE_TYPES, Section, Song } from './models.js';

const MAX_WORDS_PER_LINE = 500;

export function splitLyrics(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Lyrics must be a string.');
  }
  const words = text.match(/[^\s]+/gu) ?? [];
  if (words.length > MAX_WORDS_PER_LINE) {
    throw new RangeError(`A lyric line cannot contain more than ${MAX_WORDS_PER_LINE} words.`);
  }
  return words;
}

function copySong(song) {
  return new Song(song).toJSON();
}

function findSection(song, sectionId) {
  const section = song.sections.find((entry) => entry.id === sectionId);
  if (!section) {
    throw new RangeError('Section no longer exists.');
  }
  return section;
}

function findLine(song, sectionId, lineId) {
  const section = findSection(song, sectionId);
  const line = section.lines.find((entry) => entry.id === lineId);
  if (!line) {
    throw new RangeError('Line no longer exists.');
  }
  return line;
}

function finish(song) {
  song.sections.forEach((section, index) => {
    section.order = index;
  });
  return new Song(song);
}

function preserveMatchedItems(previousItems, nextTexts, getText, createItem) {
  const previousTexts = previousItems.map(getText);
  const rows = previousTexts.length + 1;
  const columns = nextTexts.length + 1;
  const lengths = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let oldIndex = previousTexts.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = nextTexts.length - 1; newIndex >= 0; newIndex -= 1) {
      lengths[oldIndex][newIndex] = previousTexts[oldIndex] === nextTexts[newIndex]
        ? lengths[oldIndex + 1][newIndex + 1] + 1
        : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
    }
  }

  const retained = new Map();
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < previousItems.length && newIndex < nextTexts.length) {
    if (previousTexts[oldIndex] === nextTexts[newIndex]) {
      retained.set(newIndex, previousItems[oldIndex]);
      oldIndex += 1;
      newIndex += 1;
    } else if (lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1]) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }

  return nextTexts.map((text, index) => {
    const existing = retained.get(index);
    return existing ? { ...existing, text } : createItem(text);
  });
}

export function addSection(song, name = 'New section') {
  const next = copySong(song);
  next.sections.push({ name, order: next.sections.length, lines: [] });
  return finish(next);
}

export function renameSection(song, sectionId, name) {
  if (typeof name !== 'string' || name.trim().length > 100) {
    throw new TypeError('Section name must be a string of at most 100 characters.');
  }
  const next = copySong(song);
  findSection(next, sectionId).name = name.trim();
  return finish(next);
}

export function removeSection(song, sectionId) {
  const next = copySong(song);
  const index = next.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) {
    throw new RangeError('Section no longer exists.');
  }
  next.sections.splice(index, 1);
  return finish(next);
}

export function moveSection(song, sectionId, offset) {
  if (!Number.isInteger(offset) || Math.abs(offset) !== 1) {
    throw new TypeError('Section movement must be one position at a time.');
  }
  const next = copySong(song);
  const index = next.sections.findIndex((section) => section.id === sectionId);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= next.sections.length) {
    return new Song(next);
  }
  const [section] = next.sections.splice(index, 1);
  next.sections.splice(destination, 0, section);
  return finish(next);
}

export function addLine(song, sectionId, type = LINE_TYPES.LYRICS) {
  if (!Object.values(LINE_TYPES).includes(type)) {
    throw new TypeError('Unsupported line type.');
  }
  const next = copySong(song);
  findSection(next, sectionId).lines.push({
    type,
    words: [],
    chords: [],
    text: ''
  });
  return finish(next);
}

export function pasteLyricsIntoSection(song, sectionId, text) {
  if (typeof text !== 'string' || text.length > 50000) {
    throw new TypeError('Pasted lyrics must be a string of at most 50000 characters.');
  }
  const lines = text.split(/\r\n|\r|\n/u);
  const next = copySong(song);
  if (!sectionId) {
    const section = new Section({
      name: 'Verse 1',
      order: next.sections.length
    });
    next.sections.push(section.toJSON());
    sectionId = section.id;
  }

  const section = findSection(next, sectionId);
  if (section.lines.length + lines.length > 500) {
    throw new RangeError('A section cannot contain more than 500 lines.');
  }
  for (const textLine of lines) {
    section.lines.push({
      type: LINE_TYPES.LYRICS,
      words: splitLyrics(textLine).map((word) => ({ text: word, chord: null, syllables: [] })),
      chords: [],
      text: ''
    });
  }
  return finish(next);
}

export function removeLine(song, sectionId, lineId) {
  const next = copySong(song);
  const section = findSection(next, sectionId);
  const index = section.lines.findIndex((line) => line.id === lineId);
  if (index < 0) {
    throw new RangeError('Line no longer exists.');
  }
  section.lines.splice(index, 1);
  return finish(next);
}

export function setLyrics(song, sectionId, lineId, text) {
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  if (line.type !== LINE_TYPES.LYRICS) {
    throw new TypeError('Lyrics can only be set on a lyrics line.');
  }
  const tokens = splitLyrics(text);
  line.words = preserveMatchedItems(
    line.words,
    tokens,
    (word) => word.text,
    (wordText) => ({ text: wordText, chord: null, syllables: [] })
  );
  return finish(next);
}

export function splitSyllables(text, wordText) {
  if (typeof text !== 'string' || typeof wordText !== 'string') {
    throw new TypeError('Syllable input and word text must be strings.');
  }
  const trimmed = text.trim();
  if (trimmed === '') {
    return [];
  }
  if (!trimmed.includes('-')) {
    if (trimmed === wordText) {
      return [];
    }
    throw new TypeError('Syllable parts must join to exactly match the word.');
  }
  const syllables = trimmed.split('-').map((syllable) => syllable.trim());
  if (syllables.length > 100 || syllables.some((syllable) => syllable.length === 0)) {
    throw new TypeError('Enter syllable parts separated by single hyphens.');
  }
  if (syllables.join('') !== wordText) {
    throw new TypeError('Syllable parts must join to exactly match the word.');
  }
  return syllables;
}

export function setWordSyllables(song, sectionId, lineId, wordId, syllableText) {
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  const word = line.words.find((entry) => entry.id === wordId);
  if (!word) {
    throw new RangeError('Word no longer exists.');
  }
  const segments = splitSyllables(syllableText, word.text);
  word.syllables = preserveMatchedItems(
    word.syllables,
    segments,
    (syllable) => syllable.text,
    (text) => ({ text, chord: null })
  );
  return finish(next);
}

export function setSyllableChord(song, sectionId, lineId, wordId, syllableId, chord) {
  if (!parseChord(chord)) {
    throw new TypeError('Enter a valid chord symbol.');
  }
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  const word = line.words.find((entry) => entry.id === wordId);
  const syllable = word?.syllables.find((entry) => entry.id === syllableId);
  if (!syllable) {
    throw new RangeError('Syllable no longer exists.');
  }
  syllable.chord = chord;
  return finish(next);
}

export function removeSyllableChord(song, sectionId, lineId, wordId, syllableId) {
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  const word = line.words.find((entry) => entry.id === wordId);
  const syllable = word?.syllables.find((entry) => entry.id === syllableId);
  if (!syllable) {
    throw new RangeError('Syllable no longer exists.');
  }
  syllable.chord = null;
  return finish(next);
}

export function setLineNote(song, sectionId, lineId, text) {
  if (typeof text !== 'string' || text.length > 20000) {
    throw new TypeError('Line note must be a string of at most 20000 characters.');
  }
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  if (line.type !== LINE_TYPES.NOTE) {
    throw new TypeError('Notes can only be set on a note line.');
  }
  line.text = text;
  return finish(next);
}

export function setLineChords(song, sectionId, lineId, chordText) {
  if (typeof chordText !== 'string') {
    throw new TypeError('Chord line must be a string.');
  }
  const chords = chordText.trim() === '' ? [] : chordText.trim().split(/\s+/u);
  if (chords.some((chord) => !parseChord(chord))) {
    throw new TypeError('Enter valid chord symbols separated by spaces.');
  }
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  if (line.type !== LINE_TYPES.CHORD_ONLY) {
    throw new TypeError('Chord symbols can only be set on a chord-only line.');
  }
  line.chords = chords;
  return finish(next);
}

export function setWordChord(song, sectionId, lineId, wordId, chord) {
  if (!parseChord(chord)) {
    throw new TypeError('Enter a valid chord symbol.');
  }
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  if (line.type !== LINE_TYPES.LYRICS) {
    throw new TypeError('Word chords can only be placed on a lyrics line.');
  }
  const word = line.words.find((entry) => entry.id === wordId);
  if (!word) {
    throw new RangeError('Word no longer exists.');
  }
  word.chord = chord;
  return finish(next);
}

export function removeWordChord(song, sectionId, lineId, wordId) {
  const next = copySong(song);
  const line = findLine(next, sectionId, lineId);
  const word = line.words.find((entry) => entry.id === wordId);
  if (!word) {
    throw new RangeError('Word no longer exists.');
  }
  word.chord = null;
  return finish(next);
}
