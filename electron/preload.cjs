const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// environment variables loaded from .env.local
let envVars = {};

// Listen for environment variables from main process
ipcRenderer.on('env-vars', (event, vars) => {
  envVars = vars || {};
});

// Expose a function to get environment variables (Proxy can't be cloned by contextBridge)
contextBridge.exposeInMainWorld('electronEnv', {
  get: (key) => envVars[key],
  getAll: () => ({ ...envVars })
});

contextBridge.exposeInMainWorld('electronAPI', {
  toggleMiniMode: (isMini) => ipcRenderer.invoke('toggle-mini-mode', isMini),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
  fetchApi: (url, options) => ipcRenderer.invoke('fetch-api', { url, options }),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quit-and-install'),
  onUpdaterStateChange: (callback) => {
    const handler = (_, state) => callback(state);
    ipcRenderer.on('updater:state', handler);
    return () => ipcRenderer.removeListener('updater:state', handler);
  },
});


