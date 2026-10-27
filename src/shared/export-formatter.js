import { parseChord, transposeSong } from './chords.js';
import { Song } from './models.js';

const PITCH_CLASSES = Object.freeze({
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11
});

function normalizedKey(key) {
  const parsed = parseChord(key);
  if (!parsed || !['', 'm'].includes(parsed.suffix) || parsed.bass) {
    throw new TypeError(`Invalid export key: ${key}`);
  }
  return `${parsed.root}${parsed.suffix}`;
}

export function songInKey(input, targetKey) {
  const song = new Song(input).toJSON();
  const sourceKey = song.key;
  const normalizedTarget = normalizedKey(targetKey);
  const source = parseChord(sourceKey);
  const target = parseChord(normalizedTarget);
  if (!source) {
    throw new TypeError('Set the song key before exporting in a different key.');
  }
  if ((source.suffix === 'm') !== (target.suffix === 'm')) {
    throw new TypeError('Choose an export key with the same major or minor mode as the song.');
  }
  const interval = ((PITCH_CLASSES[target.root] - PITCH_CLASSES[source.root]) % 12 + 12) % 12;
  const transposed = transposeSong(song, interval, {
    accidentals: normalizedTarget.includes('b') ? 'flat' : 'sharp'
  });
  transposed.key = normalizedTarget;
  return new Song(transposed).toJSON();
}

function chordPlacements(word, warnings, sectionName, lineIndex) {
  const placements = [];
  if (word.chord) {
    placements.push({ column: 0, chord: word.chord });
  }

  const syllableText = word.syllables.map((syllable) => syllable.text).join('');
  const hasValidSyllables = syllableText === word.text;
  if (word.syllables.length && !hasValidSyllables) {
    warnings.push(`Section "${sectionName}", line ${lineIndex}: syllables on "${word.text}" do not match the word and their chords are placed at the word start.`);
  }

  let column = 0;
  for (const syllable of word.syllables) {
    if (syllable.chord) {
      placements.push({
        column: hasValidSyllables ? column : 0,
        chord: syllable.chord
      });
    }
    column += Array.from(syllable.text).length;
  }

  let end = 0;
  const positioned = [];
  for (const placement of placements) {
    const start = Math.max(placement.column, end ? end + 1 : 0);
    if (start !== placement.column) {
      warnings.push(`Section "${sectionName}", line ${lineIndex}: overlapping chords on "${word.text}" are shifted to avoid overlap.`);
    }
    positioned.push({ ...placement, column: start });
    end = start + Array.from(placement.chord).length;
  }
  return positioned;
}

function alignedLyrics(line, warnings, sectionName, lineIndex) {
  const placements = line.words.map((word) =>
    chordPlacements(word, warnings, sectionName, lineIndex)
  );
  const starts = [];
  let column = 0;
  for (const [index, word] of line.words.entries()) {
    starts.push(column);
    const chordWidth = placements[index].reduce(
      (width, placement) => Math.max(width, placement.column + Array.from(placement.chord).length),
      0
    );
    column += Math.max(Array.from(word.text).length, chordWidth) + 1;
  }
  let chordLine = '';
  let lyricLine = '';
  for (const [index, word] of line.words.entries()) {
    const start = starts[index];
    chordLine = chordLine.padEnd(start, ' ');
    lyricLine = lyricLine.padEnd(start, ' ');
    for (const placement of placements[index]) {
      chordLine = chordLine.padEnd(start + placement.column, ' ');
      chordLine += placement.chord;
    }
    lyricLine += word.text;
    if (index < line.words.length - 1) {
      const next = starts[index + 1];
      chordLine = chordLine.padEnd(next, ' ');
      lyricLine = lyricLine.padEnd(next, ' ');
    }
  }
  return placements.some((wordPlacements) => wordPlacements.length > 0)
    ? `${chordLine.trimEnd()}\n${lyricLine.trimEnd()}`
    : lyricLine.trimEnd();
}

export function exportSongText(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Text export options must be an object.');
  }
  if (Object.keys(options).some((field) => field !== 'key')) {
    throw new TypeError('Text export options contain an unsupported field.');
  }
  const { key = '' } = options;
  if (typeof key !== 'string') {
    throw new TypeError('Export key must be text.');
  }
  const song = new Song(input).toJSON();
  const warnings = [];
  const exportSong = key && normalizedKey(key) !== song.key
    ? songInKey(song, key)
    : song;
  const output = [
    `# Title: ${exportSong.title}`,
    ...(exportSong.writers.length ? [`# Writers: ${exportSong.writers.join('; ')}`] : []),
    ...(exportSong.performer ? [`# Performer: ${exportSong.performer}`] : []),
    ...(exportSong.key ? [`# Key: ${exportSong.key}`] : []),
    ...(exportSong.capo === null ? [] : [`# Capo: ${exportSong.capo}`]),
    ...(exportSong.tempo === null ? [] : [`# Tempo: ${exportSong.tempo}`]),
    ...(exportSong.ccliSongNumber ? [`# CCLI: ${exportSong.ccliSongNumber}`] : []),
    ...(exportSong.notes ? [`# Notes: ${JSON.stringify(exportSong.notes)}`] : []),
    ''
  ];

  for (const section of exportSong.sections) {
    output.push(`[${section.name || 'Untitled section'}]`);
    for (const [index, line] of section.lines.entries()) {
      if (line.type === 'lyrics') {
        const aligned = alignedLyrics(line, warnings, section.name, index + 1);
        if (Array.from(aligned.split('\n').at(-1)).length > 120) {
          warnings.push(`Section "${section.name}", line ${index + 1}: lyric line exceeds 120 code-point columns and is not wrapped.`);
        }
        if (/[^\x00-\x7F]/.test(aligned)) {
          warnings.push(`Section "${section.name}", line ${index + 1}: Unicode display-width alignment uses code-point columns and may vary by font.`);
        }
        output.push(aligned);
      } else if (line.type === 'chord-only') {
        output.push(line.chords.join(' '));
      } else {
        output.push(`> ${line.text}`);
      }
    }
    output.push('');
  }

  return { text: `${output.join('\n').trimEnd()}\n`, warnings };
}
