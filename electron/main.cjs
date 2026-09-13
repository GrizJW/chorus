'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const HOST = '127.0.0.1';

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {{ close: () => Promise<void>, port: number } | null} */
let serverHandle = null;
let quitting = false;

/** Repo root (dev) or packaged app root (asar / unpacked). */
function appRoot() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
}

/** Prefer asar.unpacked when electron-builder unpacked server/client assets. */
function resolveAppPath(...parts) {
  const root = appRoot();
  const primary = path.join(root, ...parts);
  if (fs.existsSync(primary)) return primary;

  if (app.isPackaged && root.endsWith('.asar')) {
    const unpacked = root.replace(/app\.asar$/, 'app.asar.unpacked');
    const alt = path.join(unpacked, ...parts);
    if (fs.existsSync(alt)) return alt;
  }
  return primary;
}

function loadUserEnv() {
  try {
    const dotenv = require('dotenv');
    // Packaged defaults first, then %APPDATA%\Chorus\.env overrides (session cookies, API keys).
    const defaultsPath = resolveAppPath('.env');
    const userPath = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(defaultsPath)) {
      dotenv.config({ path: defaultsPath });
      console.log(`Loaded env defaults from ${defaultsPath}`);
    }
    if (fs.existsSync(userPath)) {
      dotenv.config({ path: userPath, override: true });
      console.log(`Loaded user env from ${userPath}`);
    }
  } catch (err) {
    console.warn('dotenv load skipped:', err);
  }
}

function resolveServerEntry() {
  const candidates = [
    resolveAppPath('server', 'dist', 'server', 'src', 'index.js'),
    resolveAppPath('server', 'dist', 'index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Chorus server build not found. Looked in:\n${candidates.join('\n')}\nRun npm run build:server first.`,
  );
}

async function waitForHealth(port, timeoutMs = 30000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${HOST}:${port}/api/health`);
      if (res.ok) return;
      lastErr = new Error(`health status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Chorus server did not become ready: ${lastErr}`);
}

async function startServer() {
  process.env.CHORUS_ELECTRON = '1';
  process.env.NODE_ENV = 'production';
  process.env.DEMO_MODE = process.env.DEMO_MODE || 'false';
  process.env.PORT = String(PORT);
  process.env.HOST = HOST;
  process.env.CLIENT_ORIGIN = `http://${HOST}:${PORT}`;

  const clientDist = resolveAppPath('client', 'dist');
  process.env.CHORUS_CLIENT_DIST = clientDist;

  const entry = resolveServerEntry();
  const mod = await import(pathToFileURL(entry).href);
  if (typeof mod.startChorusServer !== 'function') {
    throw new Error('startChorusServer export missing from server build');
  }
  serverHandle = await mod.startChorusServer({
    port: PORT,
    host: HOST,
    clientDist,
    clientOrigin: `http://${HOST}:${PORT}`,
  });
  await waitForHealth(serverHandle.port);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Chorus',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  loadUserEnv();
  await startServer();
  createWindow();
}

app.whenReady().then(() => {
  bootstrap().catch((err) => {
    console.error('Failed to start Chorus:', err);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (e) => {
  if (quitting || !serverHandle) return;
  e.preventDefault();
  quitting = true;
  Promise.resolve(serverHandle.close())
    .catch((err) => console.warn('Server close error:', err))
    .finally(() => {
      serverHandle = null;
      app.quit();
    });
});
