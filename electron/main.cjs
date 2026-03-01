const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const log = require('electron-log/main');
// AutoUpdater is initialized when app is ready

// Prevent EPIPE crashes when electron-log writes to a broken pipe
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') return;
  log.error('[main] uncaughtException', err);
});

const PORT = parseInt(process.env.PORT || '3123', 10);
let serverProcess = null;
let mainWindow = null;

let SETTINGS_PATH;
const DEFAULT_CHANNEL = process.env.EP_UPDATE_CHANNEL || 'stable';

function loadSettings() {
  if (!SETTINGS_PATH) SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return { updateChannel: data.updateChannel || DEFAULT_CHANNEL };
  } catch (e) {
    return { updateChannel: DEFAULT_CHANNEL };
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    log.error('[updater] saveSettings', e);
  }
}

function getUpdateChannel() {
  return loadSettings().updateChannel;
}

function setUpdateChannel(channel) {
  const settings = loadSettings();
  settings.updateChannel = channel;
  saveSettings(settings);
  applyChannelToUpdater();
}

function applyChannelToUpdater() {
  if (!autoUpdater) return;
  const ch = getUpdateChannel();
  if (ch === 'beta') {
    autoUpdater.channel = 'beta';
    autoUpdater.allowPrerelease = true;
  } else {
    autoUpdater.channel = 'latest';
    autoUpdater.allowPrerelease = false;
  }
  log.info('[updater] channel set to', autoUpdater.channel);
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, ...args);
  }
}

let autoUpdater;

function setupUpdater() {
  autoUpdater = require('electron-updater').autoUpdater;

  // --- Auto Updater config ---
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = log;
  applyChannelToUpdater();

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] checking-for-update');
    sendToRenderer('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] update-available', info.version);
    sendToRenderer('update:available', {
      version: info.version,
      releaseNotes: (info.releaseNotes && typeof info.releaseNotes === 'string')
        ? info.releaseNotes
        : (Array.isArray(info.releaseNotes) ? info.releaseNotes.join('\n') : ''),
    });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] update-not-available');
    sendToRenderer('update:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('[updater] update-downloaded');
    sendToRenderer('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    log.error('[updater] error', err);
    sendToRenderer('update:error', err ? err.message : 'Unknown error');
  });
}

// --- IPC handlers ---
function setupIpc() {
  ipcMain.handle('updater:getAppVersion', () => app.getVersion());
  ipcMain.handle('updater:getChannel', () => getUpdateChannel());
  ipcMain.handle('updater:setChannel', (_e, channel) => {
    if (channel === 'stable' || channel === 'beta') {
      setUpdateChannel(channel);
      return { ok: true };
    }
    return { ok: false };
  });
  ipcMain.handle('updater:checkForUpdates', async () => {
    try {
      if (!autoUpdater) return { ok: false };
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      log.error('[updater] checkForUpdates', err);
      sendToRenderer('update:error', err ? err.message : 'Check failed');
      return { ok: false };
    }
  });
  ipcMain.handle('updater:downloadUpdate', async () => {
    try {
      if (!autoUpdater) return { ok: false };
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      log.error('[updater] downloadUpdate', err);
      sendToRenderer('update:error', err ? err.message : 'Download failed');
      return { ok: false };
    }
  });
  ipcMain.handle('updater:quitAndInstall', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
  });
}

// --- Server ---
function waitForServer(maxMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryReq() {
      const req = http.get(`http://127.0.0.1:${PORT}/`, { timeout: 500 }, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start >= maxMs) return reject(new Error('Server failed to start'));
        setTimeout(tryReq, 200);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start >= maxMs) return reject(new Error('Server timeout'));
        setTimeout(tryReq, 200);
      });
    }
    tryReq();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath();
    const isPackaged = appPath.endsWith('.asar');
    let serverPath;
    let cwd;
    if (isPackaged) {
      cwd = process.resourcesPath;
      serverPath = path.join(appPath, 'dist', 'index.js');
    } else {
      cwd = appPath;
      serverPath = path.join(appPath, 'dist', 'index.js');
    }
    const env = {
      ...process.env,
      PORT: String(PORT),
      ELECTRON_RUN_AS_NODE: '1',
    };
    if (isPackaged) {
      env.APP_ROOT = appPath;
    }
    serverProcess = spawn(process.execPath || 'node', [serverPath], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (d) => log.info('[server]', d.toString().trimEnd()));
    serverProcess.stderr.on('data', (d) => log.error('[server]', d.toString().trimEnd()));
    serverProcess.on('error', (err) => {
      log.error('[server] spawn error', err.message);
      reject(err);
    });
    serverProcess.on('exit', (code, signal) => {
      log.warn('[server] process exited', { code, signal });
    });
    resolve();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  // Force external links (like Google OAuth) to open in the native OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('oauth2')) {
      electron.shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function killServer() {
  if (serverProcess && serverProcess.kill) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// --- WhatsApp Window IPC ---
ipcMain.handle('clear-whatsapp-session', async () => {
  const whatsappSession = electron.session.fromPartition('persist:whatsapp');
  await whatsappSession.clearStorageData();
  return { cleared: true };
});

app.whenReady().then(async () => {
  // Ensure the WhatsApp webview partition has permissions (camera, mic, notifications)
  electron.session.fromPartition('persist:whatsapp').setPermissionRequestHandler((_wc, _perm, cb) => cb(true));

  setupIpc();
  setupUpdater();
  await startServer();
  try {
    await waitForServer();
    createWindow();
  } catch (err) {
    log.error('[main]', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  killServer();
  app.quit();
});

app.on('quit', killServer);
