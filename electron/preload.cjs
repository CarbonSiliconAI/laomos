const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  clearWhatsAppSession: () => ipcRenderer.invoke('clear-whatsapp-session'),
});

contextBridge.exposeInMainWorld('osUpdater', (function () {
  const noop = () => { };
  return {
    version: () => ipcRenderer.invoke('updater:getAppVersion'),
    channel: {
      get: () => ipcRenderer.invoke('updater:getChannel'),
      set: (channel) => ipcRenderer.invoke('updater:setChannel', channel),
    },
    updates: {
      check: () => ipcRenderer.invoke('updater:checkForUpdates'),
      download: () => ipcRenderer.invoke('updater:downloadUpdate'),
      install: () => ipcRenderer.invoke('updater:quitAndInstall'),
    },
    onStatus: (callback) => {
      if (typeof callback !== 'function') return noop;
      const handlers = {
        'update:checking': () => callback({ type: 'checking' }),
        'update:available': (_e, data) => callback({ type: 'available', version: data?.version, releaseNotes: data?.releaseNotes }),
        'update:not-available': () => callback({ type: 'not-available' }),
        'update:download-progress': (_e, data) => callback({ type: 'download-progress', ...data }),
        'update:downloaded': () => callback({ type: 'downloaded' }),
        'update:error': (_e, message) => callback({ type: 'error', message }),
      };
      Object.keys(handlers).forEach((ch) => ipcRenderer.on(ch, handlers[ch]));
      return () => {
        Object.keys(handlers).forEach((ch) => ipcRenderer.removeAllListeners(ch));
      };
    },
  };
})());
