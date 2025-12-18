const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;

/**
 * Loads .env.local from the executable's directory (production) or project root (dev)
 * Returns parsed environment variables as an object
 */
function loadEnvLocal() {
  const env = {};

  // In production, check the executable's directory
  // In development, check the project root
  const isDev = !app.isPackaged;
  const envPath = isDev
    ? path.join(__dirname, '..', '.env.local')
    : path.join(path.dirname(process.execPath), '.env.local');

  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      // Simple .env parser (handles KEY=value format, ignores comments and empty lines)
      content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
            env[key] = value;
          }
        }
      });
      console.log(`Loaded .env.local from: ${envPath}`);
    } else {
      console.warn(`.env.local not found at: ${envPath}`);
    }
  } catch (error) {
    console.error('Error loading .env.local:', error);
  }

  return env;
}

function createWindow() {
  // Load environment variables
  const envVars = loadEnvLocal();

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'), // Optional: add icon later
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    backgroundColor: '#0a0a0f',
    show: false, // Don't show until ready
  });

  // Store env vars for preload script access
  // The preload script will read them via IPC
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.send('env-vars', envVars);
  });

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from dist folder
    // Use app.getAppPath() which works correctly in both asar and unpacked scenarios
    const appPath = app.getAppPath();
    const distIndexPath = path.join(appPath, 'dist', 'index.html');
    mainWindow.loadFile(distIndexPath);
  }

  // Show window when ready (smooth appearance)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent, navigationURL) => {
    navigationEvent.preventDefault();
  });
});

// IPC Handlers for Mini Mode
ipcMain.handle('toggle-mini-mode', (event, isMini) => {
  if (!mainWindow) return;

  if (isMini) {
    // Switch to Mini Mode
    mainWindow.setMinimumSize(400, 600);
    mainWindow.setSize(400, 600, true);
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setResizable(false);
  } else {
    // Switch back to Normal Mode
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(1024, 768);
    mainWindow.setSize(1280, 900, true);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.center();
  }
});

ipcMain.handle('set-always-on-top', (event, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
  }
});
