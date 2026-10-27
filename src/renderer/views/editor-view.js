import { LINE_TYPES } from '../../shared/models.js';
import { mountChordPicker } from '../components/chord-picker.js';

function createField(labelText, { id, type = 'text', value = '', attributes = {} } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'form-field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.id = id;
  input.name = id;
  if (type !== 'textarea') {
    input.type = type;
  }
  input.value = value ?? '';
  input.dataset.metadataControl = 'true';
  for (const [name, attributeValue] of Object.entries(attributes)) {
    input.setAttribute(name, attributeValue);
  }

  wrapper.append(label, input);
  return { wrapper, input };
}

function createWriterRow(value, index) {
  const row = document.createElement('div');
  row.className = 'writer-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'writer';
  input.value = value;
  input.maxLength = 200;
  input.autocomplete = 'name';
  input.dataset.metadataControl = 'true';
  input.setAttribute('aria-label', `Writer ${index + 1}`);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'secondary-button remove-writer';
  removeButton.textContent = 'Remove';
  removeButton.setAttribute('aria-label', `Remove writer ${index + 1}`);
  removeButton.dataset.metadataControl = 'true';

  row.append(input, removeButton);
  return row;
}

function createButton(label, action, className = 'secondary-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  return button;
}

function createWordButton(word, sectionId, lineId, editingWordId) {
  const cell = document.createElement('span');
  cell.className = 'chart-word-cell';
  cell.dataset.wordId = word.id;
  const chord = document.createElement('span');
  chord.className = 'chart-chord';
  chord.textContent = word.chord ?? '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chart-word';
  button.dataset.action = 'open-chord';
  button.dataset.wordId = word.id;
  button.dataset.sectionId = sectionId;
  button.dataset.lineId = lineId;
  button.textContent = word.text;
  button.setAttribute(
    'aria-label',
    `${word.chord ? `Edit chord ${word.chord} on` : 'Add chord to'} ${word.text}`
  );
  cell.append(chord, button);

  if (word.syllables.length > 0) {
    const syllables = document.createElement('span');
    syllables.className = 'chart-syllables';
    for (const [index, syllable] of word.syllables.entries()) {
      const syllableCell = document.createElement('span');
      syllableCell.className = 'chart-syllable-cell';
      const syllableChord = document.createElement('span');
      syllableChord.className = 'chart-chord syllable-chord';
      syllableChord.textContent = syllable.chord ?? '';
      const syllableButton = document.createElement('button');
      syllableButton.type = 'button';
      syllableButton.className = 'chart-syllable';
      syllableButton.dataset.action = 'open-chord';
      syllableButton.dataset.wordId = word.id;
      syllableButton.dataset.syllableId = syllable.id;
      syllableButton.dataset.sectionId = sectionId;
      syllableButton.dataset.lineId = lineId;
      syllableButton.textContent = syllable.text;
      syllableButton.setAttribute(
        'aria-label',
        `${syllable.chord ? `Edit chord ${syllable.chord} on` : 'Add chord to'} syllable ${syllable.text}`
      );
      syllableCell.append(syllableChord, syllableButton);
      syllables.append(syllableCell);
      if (index < word.syllables.length - 1) {
        const separator = document.createElement('span');
        separator.className = 'syllable-separator';
        separator.textContent = '-';
        syllables.append(separator);
      }
    }
    cell.append(syllables);
  }

  const syllableAction = createButton(
    word.syllables.length ? 'Edit syllables' : 'Split syllables',
    'edit-syllables'
  );
  syllableAction.dataset.wordId = word.id;
  cell.append(syllableAction);

  if (editingWordId === word.id) {
    const edit = document.createElement('div');
    edit.className = 'syllable-editor';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 2000;
    input.value = word.syllables.length
      ? word.syllables.map((syllable) => syllable.text).join('-')
      : word.text;
    input.dataset.syllableInput = 'true';
    input.setAttribute('aria-label', `Split ${word.text} into syllables using hyphens`);
    const actions = document.createElement('div');
    actions.className = 'inline-actions';
    actions.append(
      createButton('Apply split', 'apply-syllables', 'primary-small'),
      createButton('Cancel', 'cancel-syllables')
    );
    edit.append(input, actions);
    cell.append(edit);
  }
  return cell;
}

function lineText(line) {
  return line.words.map((word) => word.text).join(' ');
}

export function mountEditorView(container, song, {
  onBack,
  onSave,
  onMetadataChange,
  onPendingChange,
  onAction,
  onHistory,
  onOutput
}) {
  const form = document.createElement('form');
  form.className = 'editor-form';

  const heading = document.createElement('div');
  heading.className = 'editor-heading';
  const backButton = createButton('Back to library', 'back');
  const headingTitle = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Song details';
  const title = document.createElement('h2');
  title.id = 'editor-heading';
  title.textContent = song.title || 'New song';
  headingTitle.append(eyebrow, title);
  heading.append(backButton, headingTitle);
  form.append(heading);

  const grid = document.createElement('div');
  grid.className = 'form-grid';
  const titleField = createField('Title', {
    id: 'song-title',
    value: song.title,
    attributes: { maxlength: '200', required: 'required', autocomplete: 'off' }
  });
  titleField.wrapper.classList.add('wide-field');
  const performerField = createField('Performer', {
    id: 'song-performer',
    value: song.performer,
    attributes: { maxlength: '200', autocomplete: 'off' }
  });
  const keyField = createField('Key', {
    id: 'song-key',
    value: song.key,
    attributes: {
      maxlength: '4',
      pattern: '[A-Ga-g](#|b)?m?',
      title: 'Enter a key such as C, Bb, or F#m.'
    }
  });
  const capoField = createField('Capo', {
    id: 'song-capo',
    type: 'number',
    value: song.capo,
    attributes: { min: '0', step: '1', inputmode: 'numeric' }
  });
  const tempoField = createField('Tempo (BPM)', {
    id: 'song-tempo',
    type: 'number',
    value: song.tempo,
    attributes: { min: '1', step: 'any', inputmode: 'decimal' }
  });
  const ccliField = createField('CCLI song number', {
    id: 'song-ccli',
    value: song.ccliSongNumber,
    attributes: { maxlength: '64', autocomplete: 'off' }
  });
  const notesField = createField('Notes', {
    id: 'song-notes',
    type: 'textarea',
    value: song.notes,
    attributes: { rows: '3', maxlength: '20000' }
  });
  notesField.wrapper.classList.add('wide-field');
  grid.append(
    titleField.wrapper,
    performerField.wrapper,
    keyField.wrapper,
    capoField.wrapper,
    tempoField.wrapper,
    ccliField.wrapper,
    notesField.wrapper
  );
  form.append(grid);

  const writersSection = document.createElement('section');
  writersSection.className = 'writers-section';
  const writersHeading = document.createElement('div');
  writersHeading.className = 'writers-heading';
  const writersTitle = document.createElement('h3');
  writersTitle.textContent = 'Writers';
  const addWriter = createButton('Add writer', 'add-writer');
  const writerRows = document.createElement('div');
  writerRows.className = 'writer-rows';
  const initialWriters = song.writers.length ? song.writers : [''];
  initialWriters.forEach((writer, index) => writerRows.append(createWriterRow(writer, index)));
  writersHeading.append(writersTitle, addWriter);
  writersSection.append(writersHeading, writerRows);
  form.append(writersSection);

  const editorToolbar = document.createElement('div');
  editorToolbar.className = 'chart-toolbar';
  const chartHeading = document.createElement('h3');
  chartHeading.textContent = 'Chart';
  const historyActions = document.createElement('div');
  historyActions.className = 'history-actions';
  const undoButton = createButton('Undo', 'undo');
  const redoButton = createButton('Redo', 'redo');
  undoButton.disabled = true;
  redoButton.disabled = true;
  historyActions.append(undoButton, redoButton);
  editorToolbar.append(chartHeading, historyActions);
  const chartRoot = document.createElement('div');
  chartRoot.className = 'chart-editor';
  chartRoot.setAttribute('aria-label', 'Song chart');
  const chartActions = document.createElement('div');
  chartActions.className = 'chart-actions';
  chartActions.append(
    createButton('Add section', 'add-section', 'primary-small'),
    createButton('Paste lyrics', 'open-paste-dialog', 'primary-small')
  );
  form.append(editorToolbar, chartRoot, chartActions);

  const saveActions = document.createElement('div');
  saveActions.className = 'editor-actions';
  saveActions.append(createButton('Export / Print', 'output', 'secondary-button'));
  const saveButton = createButton('Save song', 'save', 'primary-small');
  saveButton.type = 'submit';
  saveActions.append(saveButton);
  form.append(saveActions);
  container.replaceChildren(form);

  const overlayRoot = document.querySelector('#overlay-root');
  const chordPicker = mountChordPicker(overlayRoot, {
    onPendingChange,
    onApply: (target, chord) => {
      if (!target) {
        return;
      }
      applyAction(target.dataset.syllableId ? 'set-syllable-chord' : 'set-word-chord', {
        sectionId: target.dataset.sectionId,
        lineId: target.dataset.lineId,
        wordId: target.dataset.wordId,
        syllableId: target.dataset.syllableId,
        chord
      });
      focusChartTarget(target.dataset.wordId, target.dataset.syllableId);
    },
    onRemove: (target) => {
      if (!target) {
        return;
      }
      applyAction(target.dataset.syllableId ? 'remove-syllable-chord' : 'remove-word-chord', {
        sectionId: target.dataset.sectionId,
        lineId: target.dataset.lineId,
        wordId: target.dataset.wordId,
        syllableId: target.dataset.syllableId
      });
      focusChartTarget(target.dataset.wordId, target.dataset.syllableId);
    }
  });

  let currentSong = song;
  let editingLineId;
  let editingWordId;
  let pasteDialog;
  let pasteTextarea;

  function focusChartTarget(wordId, syllableId) {
    const selector = syllableId
      ? `[data-syllable-id="${CSS.escape(syllableId)}"]`
      : `.chart-word[data-word-id="${CSS.escape(wordId)}"]`;
    chartRoot.querySelector(selector)?.focus();
  }

  function applyAction(action, payload = {}) {
    const updatedSong = onAction(action, payload);
    if (updatedSong) {
      renderSong(updatedSong);
      onPendingChange();
    }
    return updatedSong;
  }

  function makeLine(section, line) {
    const row = document.createElement('article');
    row.className = `chart-line chart-line-${line.type}`;
    row.dataset.lineId = line.id;
    row.dataset.sectionId = section.id;

    const lineHeader = document.createElement('div');
    lineHeader.className = 'chart-line-header';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'line-type-label';
    typeLabel.textContent = line.type === LINE_TYPES.LYRICS
      ? 'Lyrics'
      : line.type === LINE_TYPES.CHORD_ONLY ? 'Chords' : 'Note';
    const remove = createButton('Remove line', 'remove-line');
    lineHeader.append(typeLabel, remove);
    row.append(lineHeader);

    if (line.type === LINE_TYPES.LYRICS) {
      const words = document.createElement('div');
      words.className = 'chart-words';
      for (const word of line.words) {
        const cell = createWordButton(word, section.id, line.id, editingWordId);
        words.append(cell);
      }
      if (line.words.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'line-empty';
        empty.textContent = 'No lyrics yet.';
        words.append(empty);
      }
      row.append(words);

      if (editingLineId === line.id) {
        const editForm = document.createElement('div');
        editForm.className = 'inline-line-editor';
        const textarea = document.createElement('textarea');
        textarea.value = lineText(line);
        textarea.rows = 2;
        textarea.maxLength = 10000;
        textarea.setAttribute('aria-label', 'Edit lyric line');
        textarea.dataset.lineInput = 'lyrics';
        const actions = document.createElement('div');
        actions.className = 'inline-actions';
        const apply = createButton('Apply lyrics', 'apply-lyrics', 'primary-small');
        const cancel = createButton('Cancel', 'cancel-line-edit');
        actions.append(apply, cancel);
        editForm.append(textarea, actions);
        row.append(editForm);
      }
    } else {
      const value = line.type === LINE_TYPES.CHORD_ONLY
        ? line.chords.join(' ')
        : line.text;
      const display = document.createElement('p');
      display.className = line.type === LINE_TYPES.CHORD_ONLY ? 'chord-only-content' : 'note-content';
      display.textContent = value || (line.type === LINE_TYPES.NOTE ? 'No note yet.' : 'No chords yet.');
      row.append(display);

      if (editingLineId === line.id) {
        const input = document.createElement(line.type === LINE_TYPES.NOTE ? 'textarea' : 'input');
        if (line.type !== LINE_TYPES.NOTE) {
          input.type = 'text';
        } else {
          input.rows = 3;
        }
        input.value = value;
        input.maxLength = line.type === LINE_TYPES.NOTE ? 20000 : 1000;
        input.setAttribute(
          'aria-label',
          line.type === LINE_TYPES.CHORD_ONLY ? 'Edit chord-only line' : 'Edit note line'
        );
        input.dataset.lineInput = line.type;
        const actions = document.createElement('div');
        actions.className = 'inline-actions';
        actions.append(
          createButton(line.type === LINE_TYPES.CHORD_ONLY ? 'Apply chords' : 'Apply note', 'apply-line', 'primary-small'),
          createButton('Cancel', 'cancel-line-edit')
        );
        row.append(input, actions);
      }
    }

    if (line.type !== LINE_TYPES.LYRICS || editingLineId !== line.id) {
      row.append(createButton(
        line.type === LINE_TYPES.LYRICS ? 'Edit lyrics' : line.type === LINE_TYPES.CHORD_ONLY ? 'Edit chords' : 'Edit note',
        'edit-line'
      ));
    }
    return row;
  }

  function renderSong(nextSong, { metadata = false } = {}) {
    currentSong = nextSong;
    if (metadata) {
      updateMetadataFields(nextSong);
    }
    const fragment = document.createDocumentFragment();
    if (nextSong.sections.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'chart-empty';
      empty.textContent = 'Add a section to start building this chart.';
      fragment.append(empty);
    }

    for (const [index, section] of nextSong.sections.entries()) {
      const sectionElement = document.createElement('section');
      sectionElement.className = 'chart-section';
      sectionElement.dataset.sectionId = section.id;
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'chart-section-header';
      const sectionName = document.createElement('input');
      sectionName.type = 'text';
      sectionName.value = section.name;
      sectionName.maxLength = 100;
      sectionName.placeholder = 'Section name';
      sectionName.setAttribute('aria-label', `Section ${index + 1} name`);
      sectionName.dataset.sectionName = section.id;
      const sectionActions = document.createElement('div');
      sectionActions.className = 'section-actions';
      const moveUp = createButton('Move up', 'move-section-up');
      const moveDown = createButton('Move down', 'move-section-down');
      moveUp.disabled = index === 0;
      moveDown.disabled = index === nextSong.sections.length - 1;
      sectionActions.append(
        moveUp,
        moveDown,
        createButton('Remove section', 'remove-section', 'danger-small')
      );
      sectionHeader.append(sectionName, sectionActions);
      sectionElement.append(sectionHeader);

      for (const line of section.lines) {
        sectionElement.append(makeLine(section, line));
      }

      const addActions = document.createElement('div');
      addActions.className = 'section-add-actions';
      addActions.append(
        createButton('Add lyrics line', 'add-lyrics-line', 'primary-small'),
        createButton('Add chord-only line', 'add-chord-line'),
        createButton('Add note line', 'add-note-line')
      );
      sectionElement.append(addActions);
      fragment.append(sectionElement);
    }
    chartRoot.replaceChildren(fragment);
    chordPicker.reposition();
  }

  function updateMetadataFields(nextSong) {
    titleField.input.value = nextSong.title;
    title.textContent = nextSong.title || 'New song';
    performerField.input.value = nextSong.performer;
    keyField.input.value = nextSong.key;
    keyField.input.setCustomValidity(
      nextSong.key === '' || /^[A-G](?:#|b)?m?$/i.test(nextSong.key)
        ? ''
        : 'Enter a key such as C, Bb, or F#m.'
    );
    capoField.input.value = nextSong.capo ?? '';
    tempoField.input.value = nextSong.tempo ?? '';
    ccliField.input.value = nextSong.ccliSongNumber ?? '';
    notesField.input.value = nextSong.notes;
    writerRows.replaceChildren();
    (nextSong.writers.length ? nextSong.writers : [''])
      .forEach((writer, index) => writerRows.append(createWriterRow(writer, index)));
  }

  function hasUnappliedChartEdits() {
    for (const input of form.querySelectorAll('[data-line-input]')) {
      const row = input.closest('[data-section-id][data-line-id]');
      const line = currentSong.sections
        .find((section) => section.id === row?.dataset.sectionId)?.lines
        .find((entry) => entry.id === row?.dataset.lineId);
      if (!line) {
        return true;
      }
      const expected = line.type === LINE_TYPES.LYRICS
        ? lineText(line)
        : line.type === LINE_TYPES.CHORD_ONLY ? line.chords.join(' ') : line.text;
      if (input.value !== expected) {
        return true;
      }
    }

    for (const input of form.querySelectorAll('[data-syllable-input]')) {
      const word = currentSong.sections
        .flatMap((section) => section.lines)
        .flatMap((line) => line.words)
        .find((entry) => entry.id === input.closest('[data-word-id]')?.dataset.wordId);
      if (!word) {
        return true;
      }
      const expected = word.syllables.length
        ? word.syllables.map((syllable) => syllable.text).join('-')
        : word.text;
      if (input.value !== expected) {
        return true;
      }
    }

    for (const input of form.querySelectorAll('[data-section-name]')) {
      const section = currentSong.sections.find((entry) => entry.id === input.dataset.sectionName);
      if (!section || input.value.trim() !== section.name) {
        return true;
      }
    }

    return Boolean(
      (pasteDialog?.open && pasteTextarea.value.length > 0)
      || chordPicker.hasPendingValue()
    );
  }

  function createPasteDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'paste-dialog';
    const dialogForm = document.createElement('form');
    dialogForm.method = 'dialog';
    dialogForm.className = 'dialog-content';
    const heading = document.createElement('h3');
    heading.textContent = 'Paste lyrics';
    const hint = document.createElement('p');
    hint.textContent = 'Each line becomes a lyric line. Words split on whitespace; punctuation stays with its word.';
    const textarea = document.createElement('textarea');
    textarea.rows = 10;
    textarea.maxLength = 50000;
    textarea.setAttribute('aria-label', 'Pasted song lyrics');
    const sectionLabel = document.createElement('label');
    sectionLabel.textContent = 'Add to section';
    const select = document.createElement('select');
    select.dataset.pasteSection = 'true';
    sectionLabel.append(select);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'submit';
    cancel.value = 'cancel';
    cancel.className = 'secondary-button';
    cancel.textContent = 'Cancel';
    const paste = document.createElement('button');
    paste.type = 'submit';
    paste.value = 'paste';
    paste.className = 'primary-small';
    paste.textContent = 'Add lyrics';
    actions.append(cancel, paste);
    dialogForm.append(heading, hint, textarea, sectionLabel, actions);
    dialog.append(dialogForm);
    container.append(dialog);
    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'paste' || textarea.value.length === 0) {
        onPendingChange();
        return;
      }
      const sectionId = select.value || null;
      const updatedSong = applyAction('paste-lyrics', { sectionId, text: textarea.value });
      if (updatedSong) {
        textarea.value = '';
      } else {
        setTimeout(() => {
          if (!pasteDialog.open) {
            pasteDialog.showModal();
            pasteTextarea.focus();
          }
        }, 0);
      }
      onPendingChange();
    });
    textarea.addEventListener('input', onPendingChange);
    pasteDialog = dialog;
    pasteTextarea = textarea;
  }

  const onMetadataInput = () => {
    const key = keyField.input.value.trim();
    keyField.input.setCustomValidity(
      key === '' || /^[A-G](?:#|b)?m?$/i.test(key)
        ? ''
        : 'Enter a key such as C, Bb, or F#m.'
    );
    title.textContent = titleField.input.value.trim() || 'New song';
    const updatedSong = onMetadataChange(getValues());
    if (updatedSong) {
      currentSong = updatedSong;
    }
    onPendingChange();
  };

  function getValues() {
    const capoValue = capoField.input.value.trim();
    const tempoValue = tempoField.input.value.trim();
    return {
      title: titleField.input.value.trim(),
      writers: [...writerRows.querySelectorAll('input')]
        .map((input) => input.value.trim())
        .filter(Boolean),
      performer: performerField.input.value.trim(),
      key: keyField.input.value.trim(),
      capo: capoValue === '' ? null : Number(capoValue),
      tempo: tempoValue === '' ? null : Number(tempoValue),
      notes: notesField.input.value,
      ccliSongNumber: ccliField.input.value.trim() || null
    };
  }

  form.addEventListener('input', (event) => {
    if (event.isComposing) {
      return;
    }
    if (event.target.matches('[data-metadata-control]') && event.target.name !== 'writer') {
      onMetadataInput();
    } else if (event.target.name === 'writer') {
      onMetadataInput();
    } else if (event.target.matches('[data-line-input], [data-syllable-input], [data-section-name]')) {
      onPendingChange();
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target.matches('[data-metadata-control]')) {
      onMetadataInput();
    } else if (event.target.matches('[data-section-name]')) {
      applyAction('rename-section', {
        sectionId: event.target.dataset.sectionName,
        name: event.target.value
      });
    }
  });
  form.addEventListener('compositionend', onMetadataInput);
  form.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !form.contains(button)) {
      return;
    }
    const row = button.closest('[data-line-id]');
    const section = button.closest('[data-section-id]');
    const sectionId = row?.dataset.sectionId || section?.dataset.sectionId;
    const lineId = row?.dataset.lineId;
    switch (button.dataset.action) {
      case 'back':
        onBack();
        break;
      case 'edit-syllables': {
        editingWordId = button.dataset.wordId;
        renderSong(currentSong);
        chartRoot.querySelector(`[data-syllable-input]`)?.focus();
        break;
      }
      case 'cancel-syllables':
        editingWordId = undefined;
        renderSong(currentSong);
        onPendingChange();
        break;
      case 'apply-syllables': {
        const cell = button.closest('.chart-word-cell');
        const input = cell.querySelector('[data-syllable-input]');
        if (applyAction('set-word-syllables', {
          sectionId,
          lineId,
          wordId: cell.dataset.wordId,
          text: input.value
        })) {
          editingWordId = undefined;
          renderSong(currentSong);
        }
        break;
      }
      case 'save':
        break;
      case 'output':
        onOutput();
        break;
      case 'add-writer':
        writerRows.append(createWriterRow('', writerRows.children.length));
        writerRows.lastElementChild.querySelector('input').focus();
        onMetadataInput();
        break;
      case 'remove-writer':
        if (writerRows.children.length === 1) {
          writerRows.firstElementChild.querySelector('input').value = '';
        } else {
          button.closest('.writer-row').remove();
        }
        writerRows.querySelectorAll('.writer-row').forEach((writerRow, index) => {
          writerRow.querySelector('input').setAttribute('aria-label', `Writer ${index + 1}`);
          writerRow.querySelector('button').setAttribute('aria-label', `Remove writer ${index + 1}`);
        });
        onMetadataInput();
        break;
      case 'undo':
        onHistory('undo');
        break;
      case 'redo':
        onHistory('redo');
        break;
      case 'add-section':
        applyAction('add-section');
        break;
      case 'open-paste-dialog': {
        const select = pasteDialog.querySelector('[data-paste-section]');
        select.replaceChildren();
        for (const item of currentSong.sections) {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.name || 'Untitled section';
          select.append(option);
        }
        if (currentSong.sections.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'Create a new Verse section';
          select.append(option);
        }
        pasteDialog.showModal();
        pasteTextarea.focus();
        break;
      }
      case 'move-section-up':
      case 'move-section-down':
        applyAction('move-section', {
          sectionId,
          offset: button.dataset.action === 'move-section-up' ? -1 : 1
        });
        break;
      case 'remove-section':
        if (window.confirm('Remove this section and all of its lines?')) {
          applyAction('remove-section', { sectionId });
        }
        break;
      case 'add-lyrics-line':
      case 'add-chord-line':
      case 'add-note-line': {
        const type = button.dataset.action === 'add-lyrics-line'
          ? LINE_TYPES.LYRICS
          : button.dataset.action === 'add-chord-line'
            ? LINE_TYPES.CHORD_ONLY
            : LINE_TYPES.NOTE;
        const updated = applyAction('add-line', { sectionId, type });
        const newSection = updated?.sections.find((item) => item.id === sectionId);
        editingLineId = newSection?.lines.at(-1)?.id;
        if (updated) {
          renderSong(updated);
          chartRoot.querySelector(`[data-line-id="${CSS.escape(editingLineId)}"] [data-line-input]`)?.focus();
        }
        break;
      }
      case 'remove-line':
        applyAction('remove-line', { sectionId, lineId });
        break;
      case 'edit-line':
        editingLineId = lineId;
        renderSong(currentSong);
        chartRoot.querySelector(`[data-line-id="${CSS.escape(lineId)}"] [data-line-input]`)?.focus();
        break;
      case 'cancel-line-edit':
        editingLineId = undefined;
        renderSong(currentSong);
        onPendingChange();
        break;
      case 'apply-lyrics': {
        const input = row.querySelector('[data-line-input="lyrics"]');
        if (applyAction('set-lyrics', { sectionId, lineId, text: input.value })) {
          editingLineId = undefined;
          renderSong(currentSong);
        }
        break;
      }
      case 'apply-line': {
        const input = row.querySelector('[data-line-input]');
        if (applyAction(
          input.dataset.lineInput === LINE_TYPES.CHORD_ONLY ? 'set-line-chords' : 'set-line-note',
          { sectionId, lineId, text: input.value }
        )) {
          editingLineId = undefined;
          renderSong(currentSong);
        }
        break;
      }
      case 'open-chord': {
        const wordButton = button;
        const word = currentSong.sections
          .find((item) => item.id === sectionId)?.lines
          .find((item) => item.id === lineId)?.words
          .find((item) => item.id === wordButton.dataset.wordId);
        const chord = wordButton.dataset.syllableId
          ? word?.syllables.find((item) => item.id === wordButton.dataset.syllableId)?.chord
          : word?.chord;
        chordPicker.open(wordButton, chord ?? '');
        break;
      }
      default:
        break;
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.reportValidity()) {
      onSave();
    }
  });
  form.addEventListener('keydown', (event) => {
    const editingText = event.target.matches('input, textarea, select');
    if (editingText || !(event.ctrlKey || event.metaKey)) {
      return;
    }
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      onHistory(event.shiftKey ? 'redo' : 'undo');
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      onHistory('redo');
    }
  });

  createPasteDialog();
  renderSong(song);
  let historyState = { canUndo: false, canRedo: false };

  function updateHistoryState() {
    undoButton.disabled = !historyState.canUndo;
    redoButton.disabled = !historyState.canRedo;
  }

  return {
    getValues,
    validate() {
      return form.reportValidity();
    },
    isValid() {
      return form.checkValidity();
    },
    hasPendingEdits() {
      const metadata = getValues();
      const currentMetadata = {
        title: currentSong.title,
        writers: currentSong.writers,
        performer: currentSong.performer,
        key: currentSong.key,
        capo: currentSong.capo,
        tempo: currentSong.tempo,
        notes: currentSong.notes,
        ccliSongNumber: currentSong.ccliSongNumber
      };
      if (JSON.stringify(metadata) !== JSON.stringify(currentMetadata)) {
        return true;
      }

      return !form.checkValidity() || hasUnappliedChartEdits();
    },
    hasUnappliedChartEdits,
    setSaving(isSaving) {
      for (const control of form.querySelectorAll('button, input, textarea, select')) {
        control.disabled = isSaving;
      }
      chordPicker.setDisabled(isSaving);
      saveButton.textContent = isSaving ? 'Saving…' : 'Save song';
      if (!isSaving) {
        updateHistoryState();
      }
    },
    setHistoryState({ canUndo, canRedo }) {
      historyState = { canUndo, canRedo };
      updateHistoryState();
    },
    renderSong,
    focus() {
      titleField.input.focus();
    },
    destroy() {
      chordPicker.close({ restoreFocus: false });
      chordPicker.destroy();
      pasteDialog?.remove();
      overlayRoot.replaceChildren();
    }
  };
}
