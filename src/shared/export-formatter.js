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

function chordForWord(word, warnings, sectionName, lineIndex) {
  const syllableChords = word.syllables.map((syllable) => syllable.chord).filter(Boolean);
  const distinct = [...new Set(syllableChords)];
  if (distinct.length > 1) {
    warnings.push(`Section "${sectionName}", line ${lineIndex}: multiple syllable chords on "${word.text}" are approximated by the first syllable chord.`);
  }
  return word.chord || syllableChords[0] || '';
}

function alignedLyrics(line, warnings, sectionName, lineIndex) {
  const chords = line.words.map((word) => chordForWord(word, warnings, sectionName, lineIndex));
  const starts = [];
  let column = 0;
  for (const [index, word] of line.words.entries()) {
    starts.push(column);
    column += Math.max(Array.from(word.text).length, Array.from(chords[index]).length) + 1;
  }
  let chordLine = '';
  let lyricLine = '';
  for (const [index, word] of line.words.entries()) {
    const start = starts[index];
    chordLine = chordLine.padEnd(start, ' ');
    lyricLine = lyricLine.padEnd(start, ' ');
    chordLine += chords[index];
    lyricLine += word.text;
    if (index < line.words.length - 1) {
      const next = starts[index + 1];
      chordLine = chordLine.padEnd(next, ' ');
      lyricLine = lyricLine.padEnd(next, ' ');
    }
  }
  return chords.some(Boolean) ? `${chordLine.trimEnd()}\n${lyricLine.trimEnd()}` : lyricLine.trimEnd();
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

  if (exportSong.sections.some((section) =>
    section.lines.some((line) => line.type === 'lyrics'
      && line.words.some((word) => word.syllables.some((syllable) => syllable.chord)))
  )) {
    warnings.push('Syllable chords are approximated as word-level chords in plain-text export.');
  }
  return { text: `${output.join('\n').trimEnd()}\n`, warnings };
}
