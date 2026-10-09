import { app, BrowserWindow, ipcMain, screen, clipboard } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutBounds, type WindowLayout } from '../shared/window-layout';
import { setupRoster } from './roster';
import { setupLive } from './live-ipc';

let win: BrowserWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.whenReady().then(() => {
  const stateFile = join(app.getPath('userData'), 'window.json');
  let state: { x?: number; y?: number; width?: number; height?: number; pinned?: boolean; maximized?: boolean } = {};
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* First launch or invalid preferences. */ }
  const visible = screen.getAllDisplays().some(d => typeof state.x === 'number' && typeof state.y === 'number' && state.x >= d.workArea.x && state.y >= d.workArea.y && state.x + 100 <= d.workArea.x + d.workArea.width && state.y + 40 <= d.workArea.y + d.workArea.height);
  const area = (visible ? screen.getDisplayNearestPoint({ x: state.x!, y: state.y! }) : screen.getPrimaryDisplay()).workArea;
  const initialBounds = layoutBounds('landscape', area);
  let layout: WindowLayout = 'landscape';
  let switchingLayout = false;
  win = new BrowserWindow({ ...initialBounds, minWidth: 360, minHeight: 480, frame: false, show: false, backgroundColor: '#141417', title: '福佑大乱斗小助手', icon: join(__dirname, '../renderer/app.ico'), alwaysOnTop: !!state.pinned,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Normalize native bounds after construction to avoid frameless DPI border drift on Windows.
  win.setBounds(initialBounds);
  setupRoster(win);
  setupLive(win);
  // Use an explicit level: the default floating level did not remain topmost on this Windows build.
  const setPinned = (pinned: boolean) => win.setAlwaysOnTop(pinned, pinned ? 'screen-saver' : 'normal');
  if (state.pinned) setPinned(true);
  const snapshot = () => ({ pinned: win.isAlwaysOnTop(), maximized: win.isMaximized(), layout });
  const persist = () => { try { writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), ...snapshot() })); } catch { /* Keep the app usable on read-only profiles. */ } };
  const update = () => { win.webContents.send('window:state', snapshot()); persist(); };
  // Capture starts only through the user's explicit live-panel action.
  ipcMain.handle('window:state', snapshot);
  ipcMain.on('window:action', (event, action: string) => {
    if (event.sender !== win.webContents) return;
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'pin') { setPinned(!win.isAlwaysOnTop()); update(); }
    if (action === 'layout' && !switchingLayout) {
      switchingLayout = true;
      const applyLayout = () => {
        layout = layout === 'landscape' ? 'portrait' : 'landscape';
        const bounds = win.getBounds();
        win.setBounds(layoutBounds(layout, screen.getDisplayMatching(bounds).workArea, bounds));
        switchingLayout = false; update();
      };
      if (win.isMaximized()) { win.once('unmaximize', applyLayout); win.unmaximize(); } else applyLayout();
    }
    if (action === 'companion') { if (win.isMaximized()) win.unmaximize(); win.setBounds({ width: 400, height: Math.min(820, screen.getDisplayMatching(win.getBounds()).workArea.height) }); setPinned(true); update(); }
    if (action === 'close') win.close();
  });
  ipcMain.handle('clipboard:write', (event, text: unknown) => { if (event.sender === win.webContents && typeof text === 'string' && text.length < 100000) clipboard.writeText(text); });
  win.on('maximize', update); win.on('unmaximize', update); win.on('close', persist);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.once('ready-to-show', () => { win.show(); });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
});
}
app.on('window-all-closed', () => app.quit());
