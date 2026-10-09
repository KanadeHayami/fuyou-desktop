import { BrowserWindow, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clampOverlayAnchor, overlayLayout, ORB_SIZE, type OverlayLayout, type OverlayPoint, type OverlayState } from '../shared/overlay-layout';

export class OverlayWindow {
  private window?: BrowserWindow;
  private expanded = false;
  private anchor?: OverlayPoint;
  private geometry?: OverlayLayout;
  private saveTimer?: ReturnType<typeof setTimeout>;
  constructor(private notify: () => void, private stateFile?: string) {
    if (!stateFile) return;
    try {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (saved && [saved.x, saved.y].every(v => Number.isSafeInteger(v) && Math.abs(v) < 1000000)) this.anchor = { x: saved.x, y: saved.y };
    } catch { /* First launch or invalid position: use the default screen edge. */ }
  }
  owns(sender: Electron.WebContents) { return !!this.window && !this.window.isDestroyed() && sender === this.window.webContents; }
  state(): OverlayState { return { visible: !!this.window && !this.window.isDestroyed(), expanded: this.expanded, layout: this.geometry }; }
  send(channel: string, value: unknown) { if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, value); }
  hide() { this.window?.close(); }
  show() {
    if (this.window && !this.window.isDestroyed()) { this.window.showInactive(); return; }
    const primary = screen.getPrimaryDisplay().workArea;
    this.anchor ??= { x: primary.x + 24, y: primary.y + 180 };
    const area = screen.getDisplayNearestPoint(this.anchor).workArea;
    this.anchor = clampOverlayAnchor(this.anchor, area);
    this.expanded = false;
    this.geometry = overlayLayout(this.anchor, area, false);
    this.window = new BrowserWindow({ ...this.geometry.bounds, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, focusable: false, show: false, hasShadow: false, title: '福佑本局面板', webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const window = this.window;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    const refresh = () => this.layout();
    screen.on('display-metrics-changed', refresh);
    screen.on('display-removed', refresh);
    window.once('ready-to-show', () => { this.layout(); window.showInactive(); this.notify(); });
    window.on('closed', () => {
      this.persist();
      screen.removeListener('display-metrics-changed', refresh);
      screen.removeListener('display-removed', refresh);
      this.window = undefined; this.expanded = false; this.notify();
    });
    if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL + '?overlay=1');
    else void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { overlay: '1' } });
  }
  toggle() { if (!this.window) return; this.expanded = !this.expanded; this.layout(); this.notify(); }
  move(dx: unknown, dy: unknown) {
    if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 500 || Math.abs(dy) > 500 || !this.window || !this.anchor) return;
    this.anchor = { x: Math.round(this.anchor.x + dx), y: Math.round(this.anchor.y + dy) };
    this.layout();
    clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.persist(), 200);
  }
  private persist() {
    clearTimeout(this.saveTimer);
    if (this.stateFile && this.anchor) try { writeFileSync(this.stateFile, JSON.stringify(this.anchor)); } catch { /* Keep the overlay usable on read-only profiles. */ }
  }
  private layout() {
    const window = this.window; if (!window || !this.anchor) return;
    const area = screen.getDisplayNearestPoint(this.anchor).workArea;
    this.anchor = clampOverlayAnchor(this.anchor, area);
    this.geometry = overlayLayout(this.anchor, area, this.expanded);
    const { bounds, orb, menu } = this.geometry;
    window.setBounds(bounds);
    if (process.platform === 'win32') {
      const shape = Array.from({ length: ORB_SIZE }, (_, y) => {
        const half = Math.sqrt(Math.max(0, 32 ** 2 - (y - 31.5) ** 2));
        return { x: orb.x + Math.ceil(32 - half), y: orb.y + y, width: Math.floor(half * 2), height: 1 };
      });
      if (menu) shape.push(menu);
      window.setShape(shape);
    }
    this.send('overlay:state', this.state());
  }
}
