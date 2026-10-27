import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dialog } from 'electron';
import { Song } from '../shared/models.js';
import { exportSongText } from '../shared/export-formatter.js';

const MAX_IMPORT_BYTES = 1_000_000;

export async function importSongText(owner) {
  const result = await dialog.showOpenDialog(owner, {
    title: 'Import plain-text song chart',
    properties: ['openFile'],
    filters: [{ name: 'Plain text charts', extensions: ['txt', 'text'] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const fileStats = await stat(filePath);
  if (fileStats.size > MAX_IMPORT_BYTES) {
    throw new RangeError('Selected text file exceeds the 1 MB import limit.');
  }
  const content = await readFile(filePath);
  if (content.byteLength > MAX_IMPORT_BYTES) {
    throw new RangeError('Selected text file exceeds the 1 MB import limit.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch (error) {
    throw new TypeError(`Selected file is not valid UTF-8 text: ${error.message}`);
  }
  return {
    canceled: false,
    sourceName: path.basename(filePath),
    text
  };
}

export async function exportSongTextToFile(owner, input, options = {}) {
  const song = new Song(input).toJSON();
  const { text, warnings } = exportSongText(song, options);
  const safeName = (song.title || 'song').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120);
  const result = await dialog.showSaveDialog(owner, {
    title: 'Export plain-text chart',
    defaultPath: `${safeName}.txt`,
    filters: [{ name: 'Plain text chart', extensions: ['txt'] }]
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true, warnings };
  }

  await writeAtomically(result.filePath, text);
  return { canceled: false, warnings };
}

async function writeAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
