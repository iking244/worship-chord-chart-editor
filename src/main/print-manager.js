import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Song } from '../shared/models.js';
import { songInKey } from '../shared/export-formatter.js';
import { normalizePrintOptions } from '../shared/print-options.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const printDocumentPath = path.resolve(currentDirectory, '../renderer/print.html');
function getPrintSong(inputSong, options) {
  const song = new Song(inputSong).toJSON();
  return options.key ? songInKey(song, options.key) : song;
}

async function createPrintWindow(owner, { song, options, show }) {
  const printWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    parent: owner,
    show,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  printWindow.webContents.on('will-navigate', (event, destination) => {
    if (destination !== pathToFileURL(printDocumentPath).href) {
      event.preventDefault();
    }
  });

  try {
    await printWindow.loadFile(printDocumentPath);
    const serializedPayload = JSON.stringify(JSON.stringify({ song, options }));
    await printWindow.webContents.executeJavaScript(
      `window.renderPrintDocument(JSON.parse(${serializedPayload}))`
    );
    return printWindow;
  } catch (error) {
    if (!printWindow.isDestroyed()) {
      printWindow.destroy();
    }
    throw error;
  }
}

async function writePdfAtomically(filePath, pdfBuffer) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, pdfBuffer, { flag: 'wx' });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function exportSongPdf(owner, inputSong, inputOptions = {}) {
  const options = normalizePrintOptions(inputOptions);
  const song = getPrintSong(inputSong, options);
  const safeName = (song.title || 'song').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120);
  const destination = await dialog.showSaveDialog(owner, {
    title: 'Export chart as PDF',
    defaultPath: `${safeName}.pdf`,
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (destination.canceled || !destination.filePath) {
    return { canceled: true };
  }

  let printWindow;
  try {
    printWindow = await createPrintWindow(owner, { song, options, show: false });
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: options.pageSize,
      landscape: options.orientation === 'landscape',
      printBackground: true,
      margins: { top: 0.55, bottom: 0.55, left: 0.55, right: 0.55 },
      preferCSSPageSize: false
    });
    if (pdf.byteLength < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Electron returned invalid PDF data.');
    }
    await writePdfAtomically(destination.filePath, pdf);
    return { canceled: false };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy();
    }
  }
}

export async function printSong(owner, inputSong, inputOptions = {}) {
  const options = normalizePrintOptions(inputOptions);
  const song = getPrintSong(inputSong, options);
  let printWindow;
  try {
    printWindow = await createPrintWindow(owner, { song, options, show: true });
    return await new Promise((resolve, reject) => {
      printWindow.webContents.print({
        silent: false,
        printBackground: true,
        pageSize: options.pageSize,
        landscape: options.orientation === 'landscape'
      }, (success, failureReason) => {
        if (success) {
          resolve({ printed: true, canceled: false });
        } else if (/cancel/i.test(failureReason || '')) {
          resolve({ printed: false, canceled: true });
        } else {
          reject(new Error(failureReason || 'The operating system could not print the chart.'));
        }
      });
    });
  } finally {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy();
    }
  }
}
