import assert from 'node:assert/strict';
import test from 'node:test';
import { exportSongText, songInKey } from '../src/shared/export-formatter.js';
import { parseSongText } from '../src/shared/import-parser.js';

test('text parser recognizes metadata, named sections, lyric lines, and note lines', () => {
  const { song, warnings } = parseSongText([
    '# Title: Grace',
    '# Writers: John Newton; Unknown Writer',
    '# Key: G',
    '# Capo: 2',
    '# Tempo: 72',
    '# CCLI: 12345',
    '# Notes: "Play softly"',
    '',
    '[Verse 1]',
    'Amazing grace',
    '> Repeat the chorus',
    '',
    '[My custom section]',
    'D A',
  ].join('\r\n'));

  assert.equal(song.title, 'Grace');
  assert.deepEqual(song.writers, ['John Newton', 'Unknown Writer']);
  assert.equal(song.key, 'G');
  assert.equal(song.capo, 2);
  assert.equal(song.tempo, 72);
  assert.equal(song.ccliSongNumber, '12345');
  assert.equal(song.notes, 'Play softly');
  assert.equal(song.sections[0].name, 'Verse 1');
  assert.equal(song.sections[0].lines[0].words[0].text, 'Amazing');
  assert.equal(song.sections[0].lines[1].type, 'note');
  assert.equal(song.sections[1].name, 'My custom section');
  assert.equal(song.sections[1].lines[0].type, 'chord-only');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /chord-only/);
});

test('text parser creates separate numbered verse and chorus sections', () => {
  const { song } = parseSongText([
    '[Verse 1]',
    'First verse lyrics',
    '[Chorus 1]',
    'First chorus lyrics',
    '[Verse 2]',
    'Second verse lyrics',
    '[Chorus 2]',
    'Second chorus lyrics'
  ].join('\n'));

  assert.deepEqual(
    song.sections.map((section) => section.name),
    ['Verse 1', 'Chorus 1', 'Verse 2', 'Chorus 2']
  );
  assert.deepEqual(
    song.sections.map((section) => section.lines[0].words.map((word) => word.text).join(' ')),
    ['First verse lyrics', 'First chorus lyrics', 'Second verse lyrics', 'Second chorus lyrics']
  );
});

test('parser maps multiple and slash chords by expanded tab and code-point columns', () => {
  const { song, warnings } = parseSongText([
    '[Chorus]',
    'G/B\t\tD/F#',
    'Amazing\tgrace'
  ].join('\n'));
  const words = song.sections[0].lines[0].words;
  assert.equal(words[0].text, 'Amazing');
  assert.equal(words[0].chord, 'G/B');
  assert.equal(words[1].text, 'grace');
  assert.equal(words[1].chord, 'D/F#');
  assert.equal(warnings.length, 0);

  const unicode = parseSongText('[Verse]\nC\néclair').song.sections[0].lines[0];
  assert.equal(unicode.words[0].text, 'éclair');
});

test('parser reports uncertain mappings and preserves chords that cannot share a word', () => {
  const uncertain = parseSongText([
    '[Verse]',
    '   D',
    'one  two'
  ].join('\n'));
  assert.equal(uncertain.song.sections[0].lines[0].words[0].chord, 'D');
  assert.ok(uncertain.warnings.some((warning) => /nearest word/.test(warning.message)));

  const { song, warnings } = parseSongText([
    '[Verse]',
    'C  D  E',
    'one two'
  ].join('\n'));
  const lines = song.sections[0].lines;
  assert.equal(lines[0].type, 'lyrics');
  assert.equal(lines[1].type, 'chord-only');
  assert.deepEqual(lines[1].chords, ['D']);
  assert.ok(warnings.some((warning) => /shares a lyric word/.test(warning.message)));
});

test('export is deterministic and another key transposes a copy only', () => {
  const { song } = parseSongText([
    '# Title: Grace',
    '# Key: C',
    '[Verse]',
    'C       G/B',
    'Amazing grace'
  ].join('\n'));
  const original = structuredClone(song);
  const first = exportSongText(song, { key: 'D' });
  const second = exportSongText(song, { key: 'D' });
  assert.equal(first.text, second.text);
  assert.match(first.text, /# Key: D/);
  assert.match(first.text, /D\s+ A\/C#/);
  assert.deepEqual(song, original);

  const transposed = songInKey(song, 'D');
  assert.equal(transposed.sections[0].lines[0].words[0].chord, 'D');
  assert.equal(song.sections[0].lines[0].words[0].chord, 'C');
});

test('export rejects a requested key when the original key is unknown', () => {
  const { song } = parseSongText('[Verse]\nC\nhello');
  assert.throws(() => exportSongText(song, { key: 'D' }), /Set the song key/);
});

test('plain-text output can be parsed back and transposition preserves key mode', () => {
  const { song } = parseSongText([
    '# Title: Round trip',
    '# Key: C',
    '# Notes: "First line\\nSecond line"',
    '[Verse]',
    'C       G',
    'Amazing grace'
  ].join('\n'));
  const exported = exportSongText(song).text;
  const imported = parseSongText(exported).song;
  assert.equal(imported.title, song.title);
  assert.equal(imported.notes, song.notes);
  assert.deepEqual(
    imported.sections[0].lines[0].words.map((word) => word.chord),
    song.sections[0].lines[0].words.map((word) => word.chord)
  );
  assert.throws(() => exportSongText(song, { key: 'Am' }), /same major or minor mode/);
});

test('text export places word and syllable chords at their lyric positions', () => {
  const { song } = parseSongText('[Verse]\nIn troubled times');
  const words = song.sections[0].lines[0].words;
  words[0].chord = 'B';
  words[1].syllables = [
    { text: 'trou', chord: 'F#' },
    { text: 'bled', chord: 'C#m7' }
  ];
  words[2].chord = 'A';

  const result = exportSongText(song);
  const lines = result.text.split('\n');
  const sectionIndex = lines.indexOf('[Verse]');
  assert.equal(lines[sectionIndex + 1], 'B  F#  C#m7 A');
  assert.equal(lines[sectionIndex + 2], 'In troubled times');
  assert.deepEqual(result.warnings, []);
});

test('parser enforces the import size limit and rejects invalid metadata', () => {
  assert.throws(() => parseSongText('x'.repeat(1_000_001)), /1 MB/);
  assert.throws(() => parseSongText('# Key: H\n[Verse]\nhello'), /invalid metadata/);
  const repeatNotation = parseSongText('[Chorus]\nRepeat Chorus x2');
  assert.ok(repeatNotation.warnings.some((warning) => /Repeat or ending notation/.test(warning.message)));
});
