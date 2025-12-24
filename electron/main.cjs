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
  console.log('[MINI-MODE] Current size:', mainWindow.getSize());
  console.log('[MINI-MODE] isMaximized:', mainWindow.isMaximized());
  console.log('[MINI-MODE] isFullScreen:', mainWindow.isFullScreen());

  if (isMini) {
    // Switch to Mini Mode
    if (mainWindow.isMaximized()) {
      console.log('[MINI-MODE] Unmaximizing...');
      mainWindow.unmaximize();
    }
    if (mainWindow.isFullScreen()) {
      console.log('[MINI-MODE] Exiting fullscreen...');
      mainWindow.setFullScreen(false);
    }

    // Wait for unmaximize to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get current bounds for animation
    const currentBounds = mainWindow.getBounds();
    const targetBounds = { width: 800, height: 120 };

    console.log('[MINI-MODE] Animating from', currentBounds, 'to', targetBounds);

    // IMPORTANT: Reset resizing constraints to allow shrinking
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setMaximumSize(10000, 10000);

    // Animate resize
    await animateWindowResize(
      mainWindow,
      { width: currentBounds.width, height: currentBounds.height },
      targetBounds,
      350 // 350ms animation
    );

    console.log('[MINI-MODE] Size after animation:', mainWindow.getSize());

    // Lock dimensions
    mainWindow.setMinimumSize(800, 120);
    mainWindow.setMaximumSize(800, 120);

    mainWindow.setAlwaysOnTop(true);
    mainWindow.setResizable(false);

    console.log('[MINI-MODE] Mini mode applied successfully');

  } else {
    // Switch back to Normal Mode
    console.log('[MINI-MODE] Switching to normal mode...');

    // Get current bounds for animation
    const currentBounds = mainWindow.getBounds();
    const targetBounds = { width: 1280, height: 900 };

    mainWindow.setResizable(true);

    // Reset constraints before animation
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setMaximumSize(10000, 10000);

    // Animate resize
    await animateWindowResize(
      mainWindow,
      { width: currentBounds.width, height: currentBounds.height },
      targetBounds,
      350 // 350ms animation
    );

    mainWindow.setMinimumSize(1024, 768);

    mainWindow.setAlwaysOnTop(false);
    mainWindow.center();

    console.log('[MINI-MODE] Normal mode applied, size:', mainWindow.getSize());
  }
});

ipcMain.handle('set-always-on-top', (event, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
  }
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

