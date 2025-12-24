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
});


