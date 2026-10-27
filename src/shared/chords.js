const PITCH_PATTERN = /^([A-Ga-g])([#b]?)$/;
const CHORD_PATTERN = /^([A-Ga-g])([#b]?)([^\s]*)$/;
const CHORD_QUALITY_PATTERN = /^(?:|m|min|minor|maj|M|dim|°|aug|\+|sus|sus2|sus4|2|4|5|6|7|maj7|M7|m7|min7|mMaj7|mM7|dim7|°7|aug7|\+7|9|maj9|m9|11|13|6\/9|add2|add4|add9|add11|add13|m7b5|ø7|7sus2|7sus4|9sus4)(?:(?:b|#)(?:5|9|11|13))*$/;
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PITCH_CLASSES = Object.freeze({
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7,
  'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  'B#': 0, Cb: 11
});

function parsePitch(token) {
  const match = PITCH_PATTERN.exec(token);
  if (!match) {
    return null;
  }

  const normalized = `${match[1].toUpperCase()}${match[2]}`;
  const pitchClass = PITCH_CLASSES[normalized];
  return pitchClass === undefined ? null : { normalized, pitchClass };
}

function transposePitch(token, semitones, accidentals) {
  const pitch = parsePitch(token);
  if (!pitch) {
    throw new TypeError(`Invalid pitch: ${token}`);
  }

  const useFlats = accidentals === 'flat'
    || (accidentals === 'preserve' && token.endsWith('b'));
  const notes = useFlats ? FLAT_NOTES : SHARP_NOTES;
  const pitchClass = ((pitch.pitchClass + semitones) % 12 + 12) % 12;
  return notes[pitchClass];
}

export function parseChord(symbol) {
  if (typeof symbol !== 'string' || symbol.trim() !== symbol || symbol.length === 0) {
    return null;
  }

  const match = CHORD_PATTERN.exec(symbol);
  if (!match) {
    return null;
  }

  const root = parsePitch(`${match[1]}${match[2]}`);
  if (!root) {
    return null;
  }

  let suffix = match[3];
  let bass = null;
  const slashIndex = suffix.lastIndexOf('/');
  if (slashIndex >= 0) {
    const possibleBass = suffix.slice(slashIndex + 1);
    if (parsePitch(possibleBass)) {
      bass = possibleBass;
      suffix = suffix.slice(0, slashIndex);
    } else if (suffix !== '6/9') {
      return null;
    }
  }
  if (!CHORD_QUALITY_PATTERN.test(suffix)) {
    return null;
  }

  return {
    root: root.normalized,
    suffix,
    bass: bass ? parsePitch(bass).normalized : null
  };
}

export function transposeChord(symbol, semitones, { accidentals = 'preserve' } = {}) {
  if (!Number.isInteger(semitones)) {
    throw new TypeError('Transpose interval must be an integer number of semitones.');
  }
  if (!['preserve', 'sharp', 'flat'].includes(accidentals)) {
    throw new TypeError('Accidentals must be "preserve", "sharp", or "flat".');
  }

  const chord = parseChord(symbol);
  if (!chord) {
    throw new TypeError(`Invalid chord symbol: ${symbol}`);
  }

  const root = transposePitch(chord.root, semitones, accidentals);
  const bass = chord.bass
    ? `/${transposePitch(chord.bass, semitones, accidentals)}`
    : '';
  return `${root}${chord.suffix}${bass}`;
}

export function transposeSong(song, semitones, options) {
  if (!song || !Array.isArray(song.sections)) {
    throw new TypeError('Song must contain a sections array.');
  }
  if (!Number.isInteger(semitones)) {
    throw new TypeError('Transpose interval must be an integer number of semitones.');
  }

  const transposed = structuredClone(song);
  if (transposed.key) {
    transposed.key = transposeChord(transposed.key, semitones, options);
  }

  for (const section of transposed.sections) {
    if (!Array.isArray(section.lines)) {
      throw new TypeError('Every section must contain a lines array.');
    }
    for (const line of section.lines) {
      if (!Array.isArray(line.words)) {
        throw new TypeError('Every line must contain a words array.');
      }
      for (const word of line.words) {
        if (word.chord) {
          word.chord = transposeChord(word.chord, semitones, options);
        }
        if (!Array.isArray(word.syllables)) {
          throw new TypeError('Every word must contain a syllables array.');
        }
        for (const syllable of word.syllables) {
          if (syllable.chord) {
            syllable.chord = transposeChord(syllable.chord, semitones, options);
          }
        }
      }
    }
  }

  return transposed;
}
