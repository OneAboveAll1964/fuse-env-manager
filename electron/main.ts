import { app, BrowserWindow, session, shell } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { handleWindowBlur, handleWindowMinimize, lockNow, registerIpc, shutdown } from './ipc';
import { stopWatching } from './vault';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

app.setName('Fuse');

let mainWindow: BrowserWindow | null = null;

function resolveAsset(file: string): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', file),
    path.join(process.resourcesPath ?? '', 'build', file),
  ];
  return candidates.find((p) => existsSync(p));
}

function appIcon(): string | undefined {
  if (process.platform === 'darwin') return undefined;
  return resolveAsset(process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function createMainWindow(): void {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#fafaf9',
    icon: appIcon(),
    show: false,
    frame: false,
    titleBarStyle: isMac ? 'hidden' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (isMac && typeof mainWindow.setWindowButtonVisibility === 'function') {
    mainWindow.setWindowButtonVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const emitMaximizedChanged = (): void => {
    if (!mainWindow) return;
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', emitMaximizedChanged);
  mainWindow.on('unmaximize', emitMaximizedChanged);
  mainWindow.on('enter-full-screen', emitMaximizedChanged);
  mainWindow.on('leave-full-screen', emitMaximizedChanged);
  mainWindow.on('blur', handleWindowBlur);
  mainWindow.on('minimize', handleWindowMinimize);

  mainWindow.webContents.on('context-menu', (event) => {
    if (!isDev) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(process.env.VITE_DEV_SERVER_URL ?? 'file://')) event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

registerIpc(() => mainWindow);

function setDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  const file = resolveAsset('icon.png');
  if (file) app.dock.setIcon(file);
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    setDockIcon();
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  lockNow();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  lockNow();
  stopWatching();
  shutdown();
});

if (isDev) {
  process.on('SIGTERM', () => app.quit());
}
