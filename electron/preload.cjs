const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// environment variables loaded from .env.local
let envVars = {};

// Listen for environment variables from main process
ipcRenderer.on('env-vars', (event, vars) => {
  envVars = vars || {};
});

// Expose environment variables via contextBridge
// Use a Proxy to allow dynamic updates after initial exposure
const electronEnvProxy = new Proxy({}, {
  get: (target, prop) => {
    return envVars[prop];
  },
  ownKeys: () => {
    return Object.keys(envVars);
  },
  has: (target, prop) => {
    return prop in envVars;
  },
  getOwnPropertyDescriptor: (target, prop) => {
    if (prop in envVars) {
      return {
        enumerable: true,
        configurable: true,
        value: envVars[prop]
      };
    }
    return undefined;
  }
});

contextBridge.exposeInMainWorld('electronEnv', electronEnvProxy);

contextBridge.exposeInMainWorld('electronAPI', {
  toggleMiniMode: (isMini) => ipcRenderer.invoke('toggle-mini-mode', isMini),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
});

