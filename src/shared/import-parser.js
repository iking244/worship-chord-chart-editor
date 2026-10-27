import { parseChord } from './chords.js';
import { LINE_TYPES, Song } from './models.js';

const MAX_TEXT_LENGTH = 1_000_000;
const TAB_WIDTH = 4;
const SECTION_NAMES = /^(?:verse|chorus|bridge|intro|outro|tag|pre-chorus|pre chorus|refrain|instrumental)(?:\s+\d+)?$/i;

function expandTabs(line) {
  let column = 0;
  let expanded = '';
  for (const character of line) {
    if (character === '\t') {
      const spaces = TAB_WIDTH - (column % TAB_WIDTH);
      expanded += ' '.repeat(spaces);
      column += spaces;
    } else {
      expanded += character;
      column += 1;
    }
  }
  return expanded;
}

function codePointOffset(text, utf16Offset) {
  return Array.from(text.slice(0, utf16Offset)).length;
}

function scanChordLine(text) {
  const expanded = expandTabs(text);
  const tokens = [];
  const tokenPattern = /\S+/gu;
  let match;
  while ((match = tokenPattern.exec(expanded))) {
    if (!parseChord(match[0])) {
      return null;
    }
    tokens.push({
      chord: match[0],
      start: codePointOffset(expanded, match.index),
      end: codePointOffset(expanded, match.index + match[0].length)
    });
  }
  return tokens.length ? tokens : null;
}

function lyricSpans(text) {
  const expanded = expandTabs(text);
  const words = [];
  const wordPattern = /\S+/gu;
  let match;
  while ((match = wordPattern.exec(expanded))) {
    words.push({
      text: match[0],
      start: codePointOffset(expanded, match.index),
      end: codePointOffset(expanded, match.index + match[0].length)
    });
  }
  return { expanded, words };
}

function isHeading(text) {
  const bracketed = /^\[([^\]]{1,100})\]$/.exec(text.trim());
  if (bracketed) {
    return bracketed[1].trim();
  }
  return SECTION_NAMES.test(text.trim()) ? text.trim() : null;
}

function addWarning(warnings, line, message) {
  warnings.push({ line, message });
}

export function parseSongText(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Import content must be text.');
  }
  if (input.length > MAX_TEXT_LENGTH) {
    throw new RangeError('Import text cannot exceed 1 MB.');
  }

  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const warnings = [];
  const metadata = {
    title: '', writers: [], performer: '', key: '', capo: null, tempo: null,
    ccliSongNumber: null, notes: ''
  };
  const sections = [];
  let currentSection;
  const records = [];

  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index];
    const trimmed = source.trim();
    const lineNumber = index + 1;
    if (!trimmed) {
      records.push({ type: 'blank', lineNumber });
      continue;
    }

    const metadataMatch = /^#\s*(title|writers?|performer|key|capo|tempo|ccli|notes)\s*:\s*(.*)$/i.exec(trimmed);
    if (metadataMatch) {
      const [, field, value] = metadataMatch;
      switch (field.toLowerCase()) {
        case 'title':
          metadata.title = value.slice(0, 200);
          break;
        case 'writer':
        case 'writers':
          metadata.writers = value.split(';').map((writer) => writer.trim()).filter(Boolean).slice(0, 100);
          break;
        case 'performer':
          metadata.performer = value.slice(0, 200);
          break;
        case 'key':
          metadata.key = value;
          break;
        case 'capo':
          metadata.capo = /^\d+$/.test(value) ? Number(value) : null;
          if (metadata.capo === null) {
            addWarning(warnings, lineNumber, 'The capo value was not a non-negative whole number and was ignored.');
          }
          break;
        case 'tempo':
          metadata.tempo = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
          if (metadata.tempo === null || metadata.tempo <= 0) {
            metadata.tempo = null;
            addWarning(warnings, lineNumber, 'The tempo value was not a positive number and was ignored.');
          }
          break;
        case 'ccli':
          metadata.ccliSongNumber = value.slice(0, 64) || null;
          break;
        case 'notes':
          try {
            metadata.notes = JSON.parse(value);
            if (typeof metadata.notes !== 'string') {
              throw new TypeError('Notes metadata must be text.');
            }
          } catch {
            metadata.notes = value;
          }
          break;
        default:
          break;
      }
      records.push({ type: 'metadata', lineNumber });
      continue;
    }

    if (trimmed.startsWith('#')) {
      addWarning(warnings, lineNumber, 'Unrecognized metadata or directive was kept as lyric text.');
    }
    if (/^(?:repeat\b|(?:1st|2nd)\s+ending\b)|\b(?:x|×)\s*\d+\b/i.test(trimmed)) {
      addWarning(warnings, lineNumber, 'Repeat or ending notation is not interpreted and was kept as text.');
    }

    const heading = isHeading(trimmed);
    if (heading) {
      records.push({ type: 'heading', name: heading, lineNumber });
      currentSection = undefined;
      continue;
    }

    if (trimmed.startsWith('>')) {
      records.push({ type: 'note', text: trimmed.slice(1).trimStart(), lineNumber });
      continue;
    }

    const chords = scanChordLine(source);
    if (chords) {
      records.push({ type: 'chords', chords, source, lineNumber });
    } else {
      records.push({ type: 'lyrics', source, lineNumber });
      if (/[^\x00-\x7F]/.test(source)) {
        addWarning(
          warnings,
          lineNumber,
          'Unicode display-width alignment uses code-point columns; visual alignment may vary for emoji or combining marks.'
        );
      }
    }
  }

  function ensureSection(name = 'Verse') {
    if (!currentSection) {
      currentSection = {
        name,
        order: sections.length,
        lines: []
      };
      sections.push(currentSection);
    }
    return currentSection;
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.type === 'blank' || record.type === 'metadata') {
      continue;
    }
    if (record.type === 'heading') {
      currentSection = {
        name: record.name,
        order: sections.length,
        lines: []
      };
      sections.push(currentSection);
      continue;
    }

    const section = ensureSection();
    if (record.type === 'note') {
      section.lines.push({ type: LINE_TYPES.NOTE, text: record.text });
      continue;
    }
    if (record.type === 'lyrics') {
      const { words } = lyricSpans(record.source);
      section.lines.push({
        type: LINE_TYPES.LYRICS,
        words: words.map(({ text }) => ({ text }))
      });
      continue;
    }

    let nextIndex = index + 1;
    while (records[nextIndex]?.type === 'blank' || records[nextIndex]?.type === 'metadata') {
      nextIndex += 1;
    }
    const next = records[nextIndex];
    if (next?.type === 'lyrics') {
      const { words } = lyricSpans(next.source);
      if (words.length) {
        const lyricWords = words.map(({ text }) => ({ text, chord: null }));
        const overflow = [];
        for (const token of record.chords) {
          let targetIndex = words.findIndex((word) => token.start >= word.start && token.start < word.end);
          let uncertain = false;
          if (targetIndex < 0) {
            targetIndex = words.reduce((nearest, word, wordIndex) => {
              const distance = token.start < word.start
                ? word.start - token.start
                : token.start - word.end;
              const previous = words[nearest];
              const previousDistance = token.start < previous.start
                ? previous.start - token.start
                : token.start - previous.end;
              return distance < previousDistance ? wordIndex : nearest;
            }, 0);
            uncertain = true;
          }
          if (lyricWords[targetIndex].chord) {
            overflow.push(token.chord);
            addWarning(warnings, record.lineNumber, `${token.chord} shares a lyric word with another chord and was retained as a chord-only line.`);
          } else {
            lyricWords[targetIndex].chord = token.chord;
            if (uncertain) {
              addWarning(warnings, record.lineNumber, `${token.chord} was aligned to the nearest word "${words[targetIndex].text}" because its column fell between or outside words.`);
            }
          }
        }
        section.lines.push({ type: LINE_TYPES.LYRICS, words: lyricWords });
        if (overflow.length) {
          section.lines.push({ type: LINE_TYPES.CHORD_ONLY, chords: overflow });
        }
        index = nextIndex;
        continue;
      }
      addWarning(warnings, record.lineNumber, 'The following line had no words; the chord line was kept separately.');
    }
    section.lines.push({
      type: LINE_TYPES.CHORD_ONLY,
      chords: record.chords.map((token) => token.chord)
    });
    if (next?.type !== 'lyrics' && next?.type !== 'heading') {
      addWarning(warnings, record.lineNumber, 'Chord line was not followed by lyrics and was imported as chord-only.');
    }
  }

  if (!metadata.title) {
    metadata.title = 'Imported song';
  }
  let song;
  try {
    song = new Song({ ...metadata, sections }).toJSON();
  } catch (error) {
    throw new TypeError(`Imported chart contains invalid metadata: ${error.message}`);
  }
  return { song, warnings };
}
