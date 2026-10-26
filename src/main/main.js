// Main process: windows, menu-bar/tray, notifications, files.
//
// The timer itself runs in the main window's renderer (src/renderer/engine.js),
// which keeps running while the window is hidden. It publishes its state here
// so the tray and the floating mini timer can show it.

import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, nativeImage, shell, powerMonitor, screen } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './storage.js';
import { readXlsx, writeXlsx } from './xlsx.js';
import { parseCsv } from '../core/csv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const asset = (name) => path.join(root, 'assets', name);
const isMac = process.platform === 'darwin';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId('com.convergesigns.timeblock');

if (!app.requestSingleInstanceLock()) app.quit();

let mainWin = null;
let miniWin = null;
let tray = null;
let quitting = false;
let lastState = null;
let lastMenuKey = '';
const store = createStore(path.join(app.getPath('userData'), 'data'));

const webPreferences = {
  preload: path.join(here, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Keep timers and audio running while the window is hidden.
  backgroundThrottling: false,
};

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 780,
    minHeight: 560,
    show: false,
    title: 'Timeblock',
    backgroundColor: '#f7f7f4',
    icon: asset('icon.png'),
    webPreferences,
  });
  mainWin.removeMenu?.();
  mainWin.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWin.show();
  });
  // Closing the window hides it; the app keeps running in the menu bar / tray.
  mainWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showMain(view) {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
  if (view) mainWin.webContents.send('action', `view:${view}`);
}

function createMiniWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 360;
  const height = 112;
  miniWin = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#1b2430',
    webPreferences,
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniWin.loadFile(path.join(root, 'src', 'renderer', 'mini.html'));
  miniWin.once('ready-to-show', () => {
    if (lastState) miniWin.webContents.send('mini:state', lastState);
    miniWin.showInactive();
  });
  miniWin.on('closed', () => {
    miniWin = null;
    if (quitting) return;
    sendAction('mini:closed');
    rebuildTrayMenu(true);
  });
}

function setMini(on) {
  if (on && !miniWin) createMiniWindow();
  else if (!on && miniWin) miniWin.close();
}

function trayImage() {
  if (isMac) {
    const img = nativeImage.createFromPath(asset('trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createFromPath(asset('tray.png'));
}

function sendAction(action) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('action', action);
}

function rebuildTrayMenu(force = false) {
  if (!tray) return;
  const s = lastState || {};
  const key = JSON.stringify([s.nowLabel, s.nextLabel, s.canAdjust, Boolean(miniWin)]);
  if (!force && key === lastMenuKey) return;
  lastMenuKey = key;
  const menu = Menu.buildFromTemplate([
    { label: s.nowLabel || 'Timeblock', enabled: false },
    ...(s.nextLabel ? [{ label: s.nextLabel, enabled: false }] : []),
    { type: 'separator' },
    {
      label: 'Extend current block',
      enabled: Boolean(s.canAdjust),
      submenu: [5, 10, 15, 30].map((m) => ({ label: `+${m} minutes`, click: () => sendAction(`extend:${m}`) })),
    },
    { label: 'Skip to next block', enabled: Boolean(s.canAdjust), click: () => sendAction('skip') },
    { type: 'separator' },
    { label: 'Show Timeblock', click: () => showMain('now') },
    { label: 'Mini timer', type: 'checkbox', checked: Boolean(miniWin), click: (item) => setMini(item.checked) },
    { label: "Today's journal", click: () => showMain('journal') },
    { type: 'separator' },
    { label: 'Quit Timeblock', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('Timeblock');
  // Windows: left-click opens the app; the menu is on right-click.
  if (!isMac) tray.on('click', () => showMain());
  rebuildTrayMenu(true);
}

ipcMain.handle('store:load', (_e, name) => store.load(name));
ipcMain.handle('store:save', (_e, name, data) => store.save(name, data));

ipcMain.handle('file:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: 'Import schedule',
    properties: ['openFile'],
    filters: [
      { name: 'Schedules', extensions: ['xlsx', 'csv', 'json'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths[0]) return null;
  const file = filePaths[0];
  const ext = path.extname(file).toLowerCase();
  const fileName = path.basename(file);
  if (ext === '.xlsx') return { kind: 'sheets', fileName, sheets: await readXlsx(file) };
  const text = await fs.readFile(file, 'utf8');
  if (ext === '.csv') return { kind: 'sheets', fileName, sheets: [{ name: path.basename(file, ext), rows: parseCsv(text) }] };
  return { kind: 'json', fileName, json: JSON.parse(text) };
});

ipcMain.handle('file:export', async (_e, { format, defaultName, sheets, text }) => {
  const filters = {
    xlsx: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
    json: [{ name: 'JSON', extensions: ['json'] }],
    csv: [{ name: 'CSV', extensions: ['csv'] }],
  }[format];
  const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters,
  });
  if (canceled || !filePath) return null;
  if (format === 'xlsx') await writeXlsx(filePath, sheets);
  else await fs.writeFile(filePath, text, 'utf8');
  return filePath;
});

ipcMain.on('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  // Silent: the renderer plays its own chime and voice.
  const n = new Notification({ title, body, silent: true });
  n.on('click', () => showMain('now'));
  n.show();
});

ipcMain.on('state', (_e, state) => {
  lastState = state;
  if (tray) {
    if (isMac) tray.setTitle(state.trayTitle || '', { fontType: 'monospacedDigit' });
    tray.setToolTip(state.tooltip || 'Timeblock');
    rebuildTrayMenu();
  }
  if (miniWin && !miniWin.isDestroyed()) miniWin.webContents.send('mini:state', state);
});

ipcMain.on('mini:set', (_e, on) => setMini(on));
ipcMain.on('mini:action', (_e, action) => {
  if (action === 'open') showMain('now');
  else if (action === 'close') setMini(false);
  else sendAction(action);
});
ipcMain.on('window:show', () => showMain());
ipcMain.on('app:open-data', () => shell.openPath(store.dir));

ipcMain.handle('app:login-item', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(on), args: ['--hidden'] });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  dataDir: store.dir,
  openAtLogin: app.getLoginItemSettings().openAtLogin,
}));

app.on('second-instance', () => showMain());
app.on('before-quit', () => { quitting = true; });
app.on('activate', () => showMain());
app.on('window-all-closed', () => {
  // Stay alive in the tray.
});

app.whenReady().then(() => {
  if (isMac) app.dock?.setIcon(nativeImage.createFromPath(asset('icon.png')));
  createMainWindow();
  createTray();
  powerMonitor.on('resume', () => mainWin?.webContents.send('power:resume'));
});
