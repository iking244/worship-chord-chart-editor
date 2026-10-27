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
  if (word.syllables.length) {
    appendText(cell, 'span', 'print-chord', word.chord || '');
    const syllables = document.createElement('span');
    syllables.className = 'print-syllables';
    for (const [index, syllable] of word.syllables.entries()) {
      if (index > 0) {
        appendText(syllables, 'span', 'print-syllable-separator', '-');
      }
      const syllableCell = document.createElement('span');
      syllableCell.className = 'print-syllable';
      appendText(syllableCell, 'span', 'print-chord print-syllable-chord', syllable.chord || '');
      appendText(syllableCell, 'span', 'print-lyric', syllable.text);
      syllables.append(syllableCell);
    }
    cell.append(syllables);
  } else {
    appendText(cell, 'span', 'print-chord', word.chord || '');
    appendText(cell, 'span', 'print-lyric', word.text);
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
