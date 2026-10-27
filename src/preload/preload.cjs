const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chordChart', {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  listSongs: () => ipcRenderer.invoke('songs:list'),
  getSong: (songId) => ipcRenderer.invoke('songs:get', songId),
  saveSong: (song) => ipcRenderer.invoke('songs:save', song),
  deleteSong: (songId) => ipcRenderer.invoke('songs:delete', songId),
  duplicateSong: (songId) => ipcRenderer.invoke('songs:duplicate', songId),
  importSongText: () => ipcRenderer.invoke('songs:import-text'),
  exportSongText: (song, options) => ipcRenderer.invoke('songs:export-text', song, options),
  exportSongPdf: (song, options) => ipcRenderer.invoke('songs:export-pdf', song, options),
  printSong: (song, options) => ipcRenderer.invoke('songs:print', song, options),
  setEditorDirty: (isDirty) => ipcRenderer.send('editor:set-dirty', isDirty),
  onSaveBeforeClose: (callback) => {
    const listener = async (_event, requestId) => {
      let saved = false;
      try {
        saved = await callback();
      } catch {
        saved = false;
      }
      ipcRenderer.send('app:close-save-result', { requestId, saved });
    };

    ipcRenderer.on('app:save-before-close', listener);
    return () => ipcRenderer.removeListener('app:save-before-close', listener);
  }
});
