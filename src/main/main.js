import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportSongTextToFile, importSongText } from './import-export.js';
import { exportSongPdf, printSong } from './print-manager.js';
import { createSongCopy } from '../shared/song-copy.js';
import { JsonSongStore } from './song-store.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererPath = path.resolve(currentDirectory, '../renderer/index.html');

let mainWindow;
let songStore;
let editorIsDirty = false;
let closeIsApproved = false;
let closeDialogIsOpen = false;
let pendingCloseSave;
let printOperationInProgress = false;

function isTrustedSender(event) {
  const senderUrl = event.senderFrame?.url;
  return senderUrl === pathToFileURL(rendererPath).href;
}

function assertTrustedSender(event) {
  if (!isTrustedSender(event)) {
    throw new Error('IPC request rejected: untrusted sender.');
  }
}

function registerIpcHandlers() {
  ipcMain.handle('songs:list', async (event) => {
    assertTrustedSender(event);
    return songStore.list();
  });

  ipcMain.handle('songs:get', async (event, songId) => {
    assertTrustedSender(event);
    return songStore.get(songId);
  });

  ipcMain.handle('songs:save', async (event, song) => {
    assertTrustedSender(event);
    return songStore.save(song);
  });

  ipcMain.handle('songs:delete', async (event, songId) => {
    assertTrustedSender(event);
    return songStore.delete(songId);
  });

  ipcMain.handle('songs:duplicate', async (event, songId) => {
    assertTrustedSender(event);
    const source = await songStore.get(songId);
    if (!source) {
      return null;
    }
    return songStore.save(createSongCopy(source, { id: randomUUID() }));
  });

  ipcMain.handle('songs:import-text', async (event) => {
    assertTrustedSender(event);
    return importSongText(mainWindow);
  });

  ipcMain.handle('songs:export-text', async (event, song, options) => {
    assertTrustedSender(event);
    return exportSongTextToFile(mainWindow, song, options);
  });

  ipcMain.handle('songs:export-pdf', async (event, song, options) => {
    assertTrustedSender(event);
    if (printOperationInProgress) {
      throw new Error('Another print or PDF operation is already in progress.');
    }
    printOperationInProgress = true;
    try {
      return await exportSongPdf(mainWindow, song, options);
    } finally {
      printOperationInProgress = false;
    }
  });

  ipcMain.handle('songs:print', async (event, song, options) => {
    assertTrustedSender(event);
    if (printOperationInProgress) {
      throw new Error('Another print or PDF operation is already in progress.');
    }
    printOperationInProgress = true;
    try {
      return await printSong(mainWindow, song, options);
    } finally {
      printOperationInProgress = false;
    }
  });

  ipcMain.handle('app:get-version', (event) => {
    assertTrustedSender(event);
    return app.getVersion();
  });

  ipcMain.on('editor:set-dirty', (event, isDirty) => {
    if (!isTrustedSender(event)) {
      console.error('Rejected editor dirty-state update from an untrusted sender.');
      return;
    }
    if (typeof isDirty !== 'boolean') {
      console.error('Rejected editor dirty-state update with an invalid value.');
      return;
    }
    editorIsDirty = isDirty;
  });

  ipcMain.on('app:close-save-result', (event, result) => {
    if (!isTrustedSender(event)) {
      console.error('Rejected close-save response from an untrusted sender.');
      return;
    }
    if (
      !result
      || typeof result.requestId !== 'string'
      || typeof result.saved !== 'boolean'
      || !pendingCloseSave
      || pendingCloseSave.requestId !== result.requestId
    ) {
      return;
    }
    pendingCloseSave.resolve(result.saved);
    pendingCloseSave = undefined;
  });
}

function requestRendererSaveForClose() {
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingCloseSave?.requestId === requestId) {
        pendingCloseSave = undefined;
        resolve(false);
      }
    }, 30000);

    pendingCloseSave = {
      requestId,
      resolve: (saved) => {
        clearTimeout(timeout);
        resolve(saved);
      }
    };
    mainWindow.webContents.send('app:save-before-close', requestId);
  });
}

async function handleWindowClose(event) {
  if (closeIsApproved) {
    return;
  }

  event.preventDefault();
  if (closeDialogIsOpen) {
    return;
  }
  closeDialogIsOpen = true;

  try {
    if (!editorIsDirty) {
      closeIsApproved = true;
      mainWindow?.close();
      return;
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'This song has unsaved changes.',
      detail: 'Save your changes before closing the application?',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    });

    if (response === 0) {
      const saved = await requestRendererSaveForClose();
      if (!saved) {
        return;
      }
      editorIsDirty = false;
      closeIsApproved = true;
      mainWindow?.close();
    } else if (response === 1) {
      editorIsDirty = false;
      closeIsApproved = true;
      mainWindow?.close();
    }
  } catch (error) {
    console.error('Failed to handle the application close request:', error);
  } finally {
    closeDialogIsOpen = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, destination) => {
    if (destination !== pathToFileURL(rendererPath).href) {
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
    closeIsApproved = false;
    editorIsDirty = false;
  });
  mainWindow.on('close', (event) => {
    void handleWindowClose(event);
  });

  void mainWindow.loadFile(rendererPath).catch((error) => {
    console.error('Failed to load the application window:', error);
    app.quit();
  });
}

app.whenReady().then(() => {
  songStore = new JsonSongStore(path.join(app.getPath('userData'), 'songs.json'));
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to start the application:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
