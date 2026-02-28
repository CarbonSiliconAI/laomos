import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3123', 10);
let serverProcess: ReturnType<typeof spawn> | null = null;

function waitForServer(maxMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryReq() {
      const req = http.get(`http://127.0.0.1:${PORT}/`, { timeout: 500 }, () => resolve());
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

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath();
    const serverPath = path.join(appPath, 'dist', 'index.js');
    const env = { ...process.env, PORT: String(PORT) };
    serverProcess = spawn(process.execPath || 'node', [serverPath], {
      cwd: appPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
    serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
    serverProcess.on('error', reject);
    serverProcess.on('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`Server exited ${code}`));
    });
    resolve();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.setMenuBarVisibility(false);
}

function killServer(): void {
  if (serverProcess?.kill) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

app.whenReady().then(async () => {
  await startServer();
  await waitForServer();
  createWindow();
});

app.on('window-all-closed', () => {
  killServer();
  app.quit();
});

app.on('quit', killServer);
