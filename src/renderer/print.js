function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderWord(parent, word) {
  const cell = document.createElement('span');
  cell.className = 'print-word';
  const syllables = word.syllables.length
    && word.syllables.map((syllable) => syllable.text).join('') === word.text
    ? word.syllables
    : [{ text: word.text, chord: null }];

  for (const [index, syllable] of syllables.entries()) {
    const chordStack = document.createElement('span');
    chordStack.className = 'print-chord-stack';
    if (index === 0 && word.chord) {
      appendText(chordStack, 'span', 'print-chord', word.chord);
    }
    if (syllable.chord) {
      appendText(chordStack, 'span', 'print-chord print-syllable-chord', syllable.chord);
    }
    chordStack.style.gridRow = '1';
    chordStack.style.gridColumn = String(index + 1);
    cell.append(chordStack);

    const lyric = appendText(cell, 'span', 'print-lyric', syllable.text);
    lyric.style.gridRow = '2';
    lyric.style.gridColumn = String(index + 1);
  }
  parent.append(cell);
}

function renderLine(parent, line) {
  if (line.type === 'lyrics') {
    const row = document.createElement('div');
    row.className = 'print-lyric-line';
    for (const word of line.words) {
      renderWord(row, word);
    }
    parent.append(row);
    return;
  }

  if (line.type === 'chord-only') {
    appendText(parent, 'p', 'print-chord-only', line.chords.join('    '));
  } else {
    appendText(parent, 'p', 'print-note', line.text);
  }
}

window.renderPrintDocument = async ({ song, options }) => {
  const root = document.querySelector('#print-document');
  root.replaceChildren();
  root.style.setProperty('--print-font-size', `${options.fontSize}pt`);
  document.documentElement.dataset.orientation = options.orientation;

  const header = document.createElement('header');
  appendText(header, 'h1', '', song.title || 'Untitled song');
  if (options.includeMetadata) {
    const details = [
      song.key && `Key: ${song.key}`,
      song.capo !== null && `Capo: ${song.capo}`,
      song.tempo !== null && `Tempo: ${song.tempo} BPM`,
      song.performer && `Performer: ${song.performer}`,
      song.writers.length && `Writers: ${song.writers.join(', ')}`,
      song.ccliSongNumber && `CCLI: ${song.ccliSongNumber}`
    ].filter(Boolean);
    if (details.length) {
      appendText(header, 'p', 'print-metadata', details.join(' · '));
    }
  }
  root.append(header);

  for (const section of song.sections) {
    const sectionElement = document.createElement('section');
    sectionElement.className = 'print-section';
    appendText(sectionElement, 'h2', '', section.name || 'Untitled section');
    for (const line of section.lines) {
      renderLine(sectionElement, line);
    }
    root.append(sectionElement);
  }

  if (options.includeMetadata && song.notes) {
    const notes = document.createElement('section');
    notes.className = 'print-song-notes';
    appendText(notes, 'h2', '', 'Song notes');
    appendText(notes, 'p', '', song.notes);
    root.append(notes);
  }
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return true;
};
