const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow = null;

const NORMAL_WINDOW_BOUNDS = {
  width: 1040,
  height: 720,
  minWidth: 900,
  minHeight: 600,
};

const MINI_WINDOW_BOUNDS = {
  width: 100,
  height: 100,
};

const UPDATER_CHANNEL = 'updater:state';
const DEFAULT_UPDATE_STATE = {
  status: 'idle',
  message: '',
  progressPercent: 0,
  availableVersion: null,
  currentVersion: app.getVersion(),
};

let updateState = { ...DEFAULT_UPDATE_STATE };
let updaterConfigured = false;

function emitUpdaterState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATER_CHANNEL, { ...updateState });
  }
}

function setUpdaterState(partialState) {
  updateState = { ...updateState, ...partialState };
  emitUpdaterState();
}

function configureAutoUpdater(envVars = {}) {
  if (updaterConfigured) {
    return;
  }
  updaterConfigured = true;

  if (!app.isPackaged) {
    setUpdaterState({
      status: 'disabled',
      message: 'Auto-update is disabled in development mode.',
    });
    return;
  }

  const githubOwner = envVars.GH_OWNER || process.env.GH_OWNER;
  const githubRepo = envVars.GH_REPO || process.env.GH_REPO;
  if (!githubOwner || !githubRepo) {
    setUpdaterState({
      status: 'disabled',
      message: 'Set GH_OWNER and GH_REPO in .env.local to enable updates.',
    });
    return;
  }

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: githubOwner,
    repo: githubRepo,
    private: false,
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({
      status: 'checking',
      message: 'Checking for updates...',
      progressPercent: 0,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdaterState({
      status: 'available',
      message: `Update ${info.version} is available.`,
      availableVersion: info.version,
      progressPercent: 0,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdaterState({
      status: 'not-available',
      message: 'You already have the latest version.',
      availableVersion: null,
      progressPercent: 0,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState({
      status: 'downloading',
      message: `Downloading update: ${Math.round(progress.percent)}%`,
      progressPercent: progress.percent,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState({
      status: 'downloaded',
      message: `Update ${info.version} downloaded. Restart to install.`,
      availableVersion: info.version,
      progressPercent: 100,
    });
  });

  autoUpdater.on('error', (error) => {
    setUpdaterState({
      status: 'error',
      message: error?.message || 'Failed to check or download updates.',
      progressPercent: 0,
    });
  });
}

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
    width: NORMAL_WINDOW_BOUNDS.width,
    height: NORMAL_WINDOW_BOUNDS.height,
    minWidth: NORMAL_WINDOW_BOUNDS.minWidth,
    minHeight: NORMAL_WINDOW_BOUNDS.minHeight,
    frame: false, // Frameless for a clean, custom look
    transparent: true, // Support rounded corners and transparency via CSS
    roundedCorners: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#00000000', // Initialize with transparent color
    show: false,
  });

  // Store env vars for preload script access
  // The preload script will read them via IPC
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.send('env-vars', envVars);
    emitUpdaterState();
  });

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    // DevTools are opt-in to avoid noisy protocol logs in terminal.
    if ((process.env.ELECTRON_OPEN_DEVTOOLS || '') === '1') {
      mainWindow.webContents.openDevTools();
    }
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
  const envVars = loadEnvLocal();
  configureAutoUpdater(envVars);
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

/**
 * Smoothly animates window resize from one size to another
 * @param {BrowserWindow} window - The window to animate
 * @param {Object} fromBounds - Starting bounds {width, height}
 * @param {Object} toBounds - Target bounds {width, height}
 * @param {number} duration - Animation duration in milliseconds
 */
function animateWindowResize(window, fromBounds, toBounds, duration = 300) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const deltaWidth = toBounds.width - fromBounds.width;
    const deltaHeight = toBounds.height - fromBounds.height;

    // Easing function (easeInOutCubic for smooth acceleration/deceleration)
    const easeInOutCubic = (t) => {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      const currentWidth = Math.round(fromBounds.width + deltaWidth * eased);
      const currentHeight = Math.round(fromBounds.height + deltaHeight * eased);

      window.setBounds({
        width: currentWidth,
        height: currentHeight
      });

      if (progress < 1) {
        setImmediate(animate);
      } else {
        resolve();
      }
    };

    animate();
  });
}

// IPC Handlers for Mini Mode
ipcMain.handle('toggle-mini-mode', async (event, isMini) => {
  if (!mainWindow) return;

  console.log('[MINI-MODE] Toggle called, isMini:', isMini);

  if (isMini) {
    // Switch to Mini Mode (Square icon-style window)
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Get current bounds for animation
    const currentBounds = mainWindow.getBounds();
    const targetBounds = {
      width: MINI_WINDOW_BOUNDS.width,
      height: MINI_WINDOW_BOUNDS.height,
    }; // Ultra-minimalist square

    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setMaximumSize(10000, 10000);

    // Animate resize
    await animateWindowResize(
      mainWindow,
      { width: currentBounds.width, height: currentBounds.height },
      targetBounds,
      350
    );

    // Lock dimensions
    mainWindow.setMinimumSize(MINI_WINDOW_BOUNDS.width, MINI_WINDOW_BOUNDS.height);
    mainWindow.setMaximumSize(MINI_WINDOW_BOUNDS.width, MINI_WINDOW_BOUNDS.height);
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setResizable(false);

  } else {
    // Switch back to Normal Mode
    const currentBounds = mainWindow.getBounds();
    const targetBounds = {
      width: NORMAL_WINDOW_BOUNDS.width,
      height: NORMAL_WINDOW_BOUNDS.height,
    };

    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setMaximumSize(10000, 10000);

    // Animate resize
    await animateWindowResize(
      mainWindow,
      { width: currentBounds.width, height: currentBounds.height },
      targetBounds,
      350
    );

    mainWindow.setMinimumSize(NORMAL_WINDOW_BOUNDS.minWidth, NORMAL_WINDOW_BOUNDS.minHeight);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.center();
  }
});

// Window Control Handlers
ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('set-always-on-top', (event, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
  }
});

// Auto-updater IPC API
ipcMain.handle('updater:get-state', () => {
  return { ...updateState };
});

ipcMain.handle('updater:check-for-updates', async () => {
  if (!app.isPackaged) {
    return { ...updateState };
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdaterState({
      status: 'error',
      message: error?.message || 'Unable to check for updates.',
    });
  }

  return { ...updateState };
});

ipcMain.handle('updater:download-update', async () => {
  if (!app.isPackaged) {
    return { ...updateState };
  }

  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setUpdaterState({
      status: 'error',
      message: error?.message || 'Unable to download update.',
    });
  }

  return { ...updateState };
});

ipcMain.handle('updater:quit-and-install', () => {
  if (app.isPackaged) {
    autoUpdater.quitAndInstall();
  }
  return { ...updateState };
});

/**
 * IPC Handler: Fetch API requests without CORS restrictions
 * This bypasses browser CORS policy by making requests from main process
 * Uses built-in Node.js http/https modules (no dependencies required)
 */
ipcMain.handle('fetch-api', async (event, { url, options }) => {
  try {
    const https = require('https');
    const http = require('http');
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    return await new Promise((resolve) => {
      const requestOptions = {
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = protocol.request(url, requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage || '',
            text: data,
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          ok: false,
          status: 0,
          error: err.message || String(err),
        });
      });

      // Send request body if present
      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message || String(error),
    };
  }
});

