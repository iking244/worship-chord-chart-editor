import { Song } from '../shared/models.js';
import { parseSongText } from '../shared/import-parser.js';
import { EditHistory } from '../shared/edit-history.js';
import {
  addLine,
  addSection,
  moveSection,
  pasteLyricsIntoSection,
  removeLine,
  removeSection,
  renameSection,
  removeSyllableChord,
  setWordSyllables,
  setLineChords,
  setLineNote,
  setSyllableChord,
  setLyrics,
  setWordChord,
  removeWordChord
} from '../shared/chart-editor.js';
import { mountEditorView } from './views/editor-view.js';
import { renderLibrary } from './views/library-view.js';

const libraryView = document.querySelector('#library-view');
const editorViewContainer = document.querySelector('#editor-view');
const statusMessage = document.querySelector('#status');
const versionLabel = document.querySelector('#app-version');
const unsavedDialog = document.querySelector('#unsaved-dialog');
const importDialog = document.querySelector('#import-dialog');
const outputDialog = document.querySelector('#output-options-dialog');
const outputForm = document.querySelector('#output-options-form');

let activeSong;
let editorView;
let isDirty = false;
let isSaving = false;
let inFlightSave;
let navigationInProgress = false;
let savedSongFingerprint;
const history = new EditHistory(100);
let autosaveTimer;
let saveRequestedWhileSaving = false;
let pendingImport;
let outputOperationInProgress = false;

const AUTOSAVE_DELAY_MS = 1000;

function songFingerprint(song) {
  const serialized = new Song(song).toJSON();
  serialized.updatedAt = '';
  return JSON.stringify(serialized);
}

function setDirty(nextDirty) {
  isDirty = nextDirty;
  window.chordChart.setEditorDirty(isDirty);
}

function updateDirtyState() {
  if (!activeSong) {
    return;
  }
  const modelDirty = !savedSongFingerprint
    || songFingerprint(activeSong) !== savedSongFingerprint;
  const pendingEdits = editorView?.hasPendingEdits() ?? false;
  setDirty(modelDirty || pendingEdits);
  if (isDirty) {
    scheduleAutosave();
  } else {
    clearTimeout(autosaveTimer);
  }
}

function pushHistory(previousSong) {
  history.record(previousSong.toJSON());
  updateHistoryControls();
}

function updateHistoryControls() {
  editorView?.setHistoryState({ canUndo: history.canUndo, canRedo: history.canRedo });
}

function commitSongChange(nextSong, { save = true } = {}) {
  const previousSong = new Song(activeSong);
  const updatedSong = new Song(nextSong);
  if (songFingerprint(previousSong) === songFingerprint(updatedSong)) {
    return activeSong;
  }
  pushHistory(previousSong);
  activeSong = updatedSong;
  updateDirtyState();
  if (save) {
    scheduleAutosave();
  }
  updateHistoryControls();
  return activeSong;
}

function applyEditorAction(action, payload = {}) {
  try {
    let nextSong;
    switch (action) {
      case 'add-section':
        nextSong = addSection(activeSong, `Section ${activeSong.sections.length + 1}`);
        break;
      case 'rename-section':
        nextSong = renameSection(activeSong, payload.sectionId, payload.name);
        break;
      case 'remove-section':
        nextSong = removeSection(activeSong, payload.sectionId);
        break;
      case 'move-section':
        nextSong = moveSection(activeSong, payload.sectionId, payload.offset);
        break;
      case 'add-line':
        nextSong = addLine(activeSong, payload.sectionId, payload.type);
        break;
      case 'remove-line':
        nextSong = removeLine(activeSong, payload.sectionId, payload.lineId);
        break;
      case 'set-lyrics':
        nextSong = setLyrics(activeSong, payload.sectionId, payload.lineId, payload.text);
        break;
      case 'set-line-note':
        nextSong = setLineNote(activeSong, payload.sectionId, payload.lineId, payload.text);
        break;
      case 'set-line-chords':
        nextSong = setLineChords(activeSong, payload.sectionId, payload.lineId, payload.text);
        break;
      case 'set-word-chord':
        nextSong = setWordChord(
          activeSong,
          payload.sectionId,
          payload.lineId,
          payload.wordId,
          payload.chord
        );
        break;
      case 'remove-word-chord':
        nextSong = removeWordChord(
          activeSong,
          payload.sectionId,
          payload.lineId,
          payload.wordId
        );
        break;
      case 'set-word-syllables':
        nextSong = setWordSyllables(
          activeSong,
          payload.sectionId,
          payload.lineId,
          payload.wordId,
          payload.text
        );
        break;
      case 'set-syllable-chord':
        nextSong = setSyllableChord(
          activeSong,
          payload.sectionId,
          payload.lineId,
          payload.wordId,
          payload.syllableId,
          payload.chord
        );
        break;
      case 'remove-syllable-chord':
        nextSong = removeSyllableChord(
          activeSong,
          payload.sectionId,
          payload.lineId,
          payload.wordId,
          payload.syllableId
        );
        break;
      case 'paste-lyrics':
        nextSong = pasteLyricsIntoSection(activeSong, payload.sectionId, payload.text);
        break;
      default:
        throw new TypeError(`Unsupported editor action: ${action}`);
    }
    return commitSongChange(nextSong);
  } catch (error) {
    statusMessage.textContent = `Could not update chart: ${error.message}`;
    statusMessage.hidden = false;
    return null;
  }
}

function changeMetadata(values) {
  try {
    const nextSong = new Song({ ...activeSong.toJSON(), ...values });
    return commitSongChange(nextSong);
  } catch (error) {
    setDirty(true);
    statusMessage.textContent = `Metadata needs attention: ${error.message}`;
    statusMessage.hidden = false;
    return null;
  }
}

function restoreHistory(direction) {
  if (editorView?.hasPendingEdits()) {
    statusMessage.textContent = 'Apply or cancel the open chart edit before using undo or redo.';
    statusMessage.hidden = false;
    return;
  }
  if (!activeSong) {
    return;
  }
  const target = direction === 'undo'
    ? history.undo(activeSong.toJSON())
    : history.redo(activeSong.toJSON());
  if (!target) {
    return;
  }
  activeSong = new Song(target);
  editorView.renderSong(activeSong, { metadata: true });
  updateDirtyState();
  updateHistoryControls();
  statusMessage.textContent = direction === 'undo' ? 'Change undone.' : 'Change restored.';
  statusMessage.hidden = false;
  scheduleAutosave();
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  if (
    !activeSong
    || !isDirty
    || (
      editorView
      && (!editorView.isValid() || editorView.hasUnappliedChartEdits())
    )
  ) {
    return;
  }
  autosaveTimer = setTimeout(() => {
    void saveActiveSong({ automatic: true });
  }, AUTOSAVE_DELAY_MS);
}

function showLibraryStatus(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
}

async function refreshLibrary() {
  showLibraryStatus('Loading songs…');
  try {
    const songs = await window.chordChart.listSongs();
    renderLibrary(libraryView, songs, {
      onOpen: openSong,
      onNew: createSong,
      onImport: startSongImport,
      onDuplicate: duplicateSong
    });
    statusMessage.hidden = true;
    return true;
  } catch (error) {
    showLibraryStatus(`Could not load songs: ${error.message}`);
    return false;
  }
}

async function duplicateSong(songId) {
  try {
    const duplicate = await window.chordChart.duplicateSong(songId);
    if (!duplicate) {
      showLibraryStatus('That song is no longer available to duplicate.');
      return;
    }
    if (await refreshLibrary()) {
      showLibraryStatus(`Created a copy of “${duplicate.title}”.`);
    }
  } catch (error) {
    showLibraryStatus(`Could not duplicate song: ${error.message}`);
  }
}

async function startSongImport() {
  try {
    const selected = await window.chordChart.importSongText();
    if (selected.canceled) {
      return;
    }
    const parsed = parseSongText(selected.text);
    pendingImport = parsed.song;
    document.querySelector('#import-song-title').value = parsed.song.title;
    document.querySelector('#import-source').textContent = `File: ${selected.sourceName}`;
    document.querySelector('#import-summary').textContent =
      `${parsed.song.sections.length} section(s), ${parsed.song.sections.reduce((count, section) => count + section.lines.length, 0)} chart line(s). Review warnings before importing.`;
    const warnings = document.querySelector('#import-warnings');
    warnings.replaceChildren();
    for (const warning of parsed.warnings) {
      const item = document.createElement('li');
      item.textContent = `Line ${warning.line}: ${warning.message}`;
      warnings.append(item);
    }
    const preview = document.querySelector('#import-preview');
    preview.textContent = parsed.song.sections.map((section) => (
      `[${section.name}]\n${section.lines.map((line) => (
        line.type === 'lyrics'
          ? line.words.map((word) => `${word.chord ? `${word.chord} ` : ''}${word.text}`).join(' ')
          : line.type === 'chord-only' ? line.chords.join(' ') : `> ${line.text}`
      )).join('\n')}`
    )).join('\n\n').slice(0, 12000);
    importDialog.showModal();
  } catch (error) {
    showLibraryStatus(`Could not import text chart: ${error.message}`);
  }
}

importDialog.addEventListener('close', async () => {
  const draft = pendingImport;
  pendingImport = undefined;
  if (importDialog.returnValue !== 'import' || !draft) {
    return;
  }
  const title = document.querySelector('#import-song-title').value.trim();
  try {
    const now = new Date().toISOString();
    const song = new Song({
      ...draft,
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now
    });
    const saved = await window.chordChart.saveSong(song.toJSON());
    if (await refreshLibrary()) {
      showLibraryStatus(`Imported “${saved.title}”.`);
    }
  } catch (error) {
    showLibraryStatus(`Could not save imported song: ${error.message}`);
  }
});

function requestOutputOptions() {
  return new Promise((resolve) => {
    const onClose = () => {
      outputDialog.removeEventListener('close', onClose);
      const action = outputDialog.returnValue;
      if (action === 'cancel' || !action) {
        resolve(null);
        return;
      }
      resolve({
        action,
        options: {
          key: document.querySelector('#output-key').value.trim(),
          pageSize: document.querySelector('#output-page-size').value,
          orientation: document.querySelector('#output-orientation').value,
          fontSize: Number(document.querySelector('#output-font-size').value),
          includeMetadata: document.querySelector('#output-include-metadata').checked
        }
      });
    };
    outputDialog.addEventListener('close', onClose);
    outputDialog.showModal();
  });
}

async function exportOrPrintSong() {
  if (!activeSong || outputOperationInProgress) {
    return;
  }
  if (!editorView.validate()) {
    return;
  }
  if (editorView.hasPendingEdits()) {
    showLibraryStatus('Apply or cancel unfinished chart or chord edits before exporting or printing.');
    return;
  }
  const request = await requestOutputOptions();
  if (!request) {
    return;
  }
  outputOperationInProgress = true;
  statusMessage.hidden = false;
  statusMessage.textContent = request.action === 'print'
    ? 'Preparing print document…'
    : request.action === 'export-pdf' ? 'Preparing PDF…' : 'Preparing text export…';
  try {
    const song = activeSong.toJSON();
    if (request.action === 'export-text') {
      const result = await window.chordChart.exportSongText(song, { key: request.options.key });
      if (result.canceled) {
        showLibraryStatus('Text export canceled.');
      } else {
        const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join(' ')}` : '';
        showLibraryStatus(`Text chart exported.${warningText}`);
      }
    } else if (request.action === 'export-pdf') {
      const result = await window.chordChart.exportSongPdf(song, request.options);
      showLibraryStatus(result.canceled ? 'PDF export canceled.' : 'PDF exported successfully.');
    } else {
      const result = await window.chordChart.printSong(song, request.options);
      showLibraryStatus(result.canceled ? 'Printing canceled.' : 'Chart sent to the printer.');
    }
  } catch (error) {
    showLibraryStatus(`Could not complete output operation: ${error.message}`);
  } finally {
    outputOperationInProgress = false;
  }
}

outputForm.addEventListener('submit', (event) => {
  if (!outputForm.reportValidity()) {
    event.preventDefault();
  }
});

function showEditor(song, { isNew = false } = {}) {
  editorView?.destroy();
  activeSong = new Song(song);
  history.clear();
  savedSongFingerprint = isNew ? '' : songFingerprint(activeSong);
  editorView = mountEditorView(editorViewContainer, activeSong, {
    onBack: () => navigateToLibrary(),
    onSave: () => saveActiveSong(),
    onMetadataChange: changeMetadata,
    onPendingChange: updateDirtyState,
    onAction: applyEditorAction,
    onHistory: restoreHistory,
    onOutput: exportOrPrintSong
  });
  libraryView.hidden = true;
  editorViewContainer.hidden = false;
  statusMessage.hidden = false;
  statusMessage.textContent = '';
  setDirty(isNew);
  updateHistoryControls();
  editorView.focus();
}

async function createSong() {
  if (navigationInProgress) {
    return;
  }
  const now = new Date().toISOString();
  try {
    showEditor(new Song({
      id: crypto.randomUUID(),
      title: '',
      createdAt: now,
      updatedAt: now
    }).toJSON(), { isNew: true });
  } catch (error) {
    showLibraryStatus(`Could not create a song: ${error.message}`);
  }
}

async function openSong(songId) {
  if (navigationInProgress || !(await confirmDiscardOrSave())) {
    return;
  }

  navigationInProgress = true;
  showLibraryStatus('Opening song…');
  try {
    const song = await window.chordChart.getSong(songId);
    if (!song) {
      showLibraryStatus('That song is no longer in the library. Refresh and try again.');
      return;
    }
    showEditor(song);
  } catch (error) {
    showLibraryStatus(`Could not open song: ${error.message}`);
  } finally {
    navigationInProgress = false;
  }
}

async function saveActiveSong({ automatic = false } = {}) {
  if (!activeSong) {
    return false;
  }
  if (isSaving) {
    saveRequestedWhileSaving = true;
    if (inFlightSave) {
      await inFlightSave;
      return !isDirty;
    }
    return false;
  }
  if (!automatic) {
    clearTimeout(autosaveTimer);
  }
  if (!automatic && !editorView.validate()) {
    return false;
  }
  if (editorView.hasUnappliedChartEdits()) {
    statusMessage.textContent = 'Apply or cancel the open chart edit before saving.';
    statusMessage.hidden = false;
    return false;
  }
  if (automatic && !editorView.isValid()) {
    return false;
  }
  if (automatic && !activeSong.title.trim()) {
    statusMessage.textContent = 'Add a title before autosave can store this new song.';
    statusMessage.hidden = false;
    return false;
  }
  isSaving = true;
  editorView.setSaving(true);
  statusMessage.textContent = 'Saving song…';
  statusMessage.hidden = false;

  inFlightSave = (async () => {
    try {
      const updatedSong = new Song({ ...activeSong.toJSON(), ...editorView.getValues() });
      if (!updatedSong.title.trim()) {
        if (!automatic) {
          statusMessage.textContent = 'A title is required before the song can be saved.';
        } else {
          statusMessage.textContent = 'Add a title before autosave can store this new song.';
          statusMessage.hidden = false;
        }
        return false;
      }
      const capturedFingerprint = songFingerprint(updatedSong);
      const savedSong = await window.chordChart.saveSong(updatedSong.toJSON());
      activeSong = new Song(savedSong);
      savedSongFingerprint = capturedFingerprint;
      editorView.renderSong(activeSong);
      updateDirtyState();
      statusMessage.textContent = isDirty
        ? 'A previous edit was saved. Saving the latest changes…'
        : 'Song saved.';
      statusMessage.hidden = false;
      return true;
    } catch (error) {
      statusMessage.textContent = `Could not save song: ${error.message}`;
      statusMessage.hidden = false;
      return false;
    } finally {
      isSaving = false;
      editorView?.setSaving(false);
      if (isDirty && saveRequestedWhileSaving) {
        saveRequestedWhileSaving = false;
        scheduleAutosave();
      } else {
        saveRequestedWhileSaving = false;
      }
    }
  })();
  const result = await inFlightSave;
  inFlightSave = undefined;
  return result;
}

function requestUnsavedDecision() {
  return new Promise((resolve) => {
    const onClose = () => {
      unsavedDialog.removeEventListener('close', onClose);
      resolve(unsavedDialog.returnValue || 'cancel');
    };
    unsavedDialog.addEventListener('close', onClose);
    unsavedDialog.showModal();
  });
}

async function confirmDiscardOrSave() {
  if (!isDirty) {
    return true;
  }
  const decision = await requestUnsavedDecision();
  if (decision === 'discard') {
    clearTimeout(autosaveTimer);
    setDirty(false);
    return true;
  }
  if (decision === 'save') {
    return saveUntilClean();
  }
  return false;
}

async function saveUntilClean() {
  while (isDirty) {
    const saved = await saveActiveSong();
    if (!saved) {
      return false;
    }
    if (isDirty) {
      continue;
    }
  }
  return true;
}

async function navigateToLibrary() {
  if (navigationInProgress || !(await confirmDiscardOrSave())) {
    return;
  }

  navigationInProgress = true;
  try {
    clearTimeout(autosaveTimer);
    editorView?.destroy();
    editorViewContainer.hidden = true;
    libraryView.hidden = false;
    activeSong = undefined;
    editorView = undefined;
    savedSongFingerprint = undefined;
    setDirty(false);
    await refreshLibrary();
  } finally {
    navigationInProgress = false;
  }
}

window.chordChart.onSaveBeforeClose(async () => {
  if (!isDirty) {
    return true;
  }
  clearTimeout(autosaveTimer);
  return saveUntilClean();
});

try {
  versionLabel.textContent = `Version ${await window.chordChart.getAppVersion()}`;
} catch (error) {
  versionLabel.textContent = 'Version unavailable';
  showLibraryStatus(`Could not read app version: ${error.message}`);
}

await refreshLibrary();
