import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { overlayLayout } from '../src/shared/overlay-layout';
const fake = vi.hoisted(() => ({ windows: [] as any[], area: { x: 0, y: 0, width: 1000, height: 800 } }));
vi.mock('electron', () => ({
  screen: { getPrimaryDisplay: () => ({ workArea: fake.area }), getDisplayNearestPoint: () => ({ workArea: fake.area }), on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: class {
    options: any; bounds: any; events: Record<string, () => void> = {}; dead = false;
    webContents = { send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
    setAlwaysOnTop = vi.fn(); setShape = vi.fn(); showInactive = vi.fn();
    loadFile = vi.fn(); loadURL = vi.fn();
    constructor(options: any) { this.options = options; this.bounds = options; fake.windows.push(this); }
    getBounds() { return this.bounds; } setBounds(value: any) { this.bounds = value; }
    once(name: string, fn: () => void) { this.events[name] = fn; } on(name: string, fn: () => void) { this.events[name] = fn; }
    isDestroyed() { return this.dead; } close() { this.dead = true; this.events.closed?.(); }
  }
}));
import { OverlayWindow } from '../src/main/overlay';
let profile: string;
beforeEach(() => { fake.windows = []; fake.area = { x: 0, y: 0, width: 1000, height: 800 }; profile = mkdtempSync(join(tmpdir(), 'fuyou-overlay-test-')); });
afterEach(() => { for (const window of fake.windows) if (!window.dead) window.close(); rmSync(profile, { recursive: true, force: true }); });
const anchorOf = (overlay: OverlayWindow) => { const { bounds, orb } = overlay.state().layout!; return { x: bounds.x + orb.x, y: bounds.y + orb.y }; };

it('keeps the circle fixed while expanding, moving near an edge and collapsing', () => {
  const notify = vi.fn(), overlay = new OverlayWindow(notify);
  overlay.show(); const window = fake.windows.at(-1);
  expect(window.options.focusable).toBe(false);
  expect(window.options.skipTaskbar).toBe(true);
  expect(window.options.webPreferences).toMatchObject({ sandbox: true, nodeIntegration: false, contextIsolation: true });
  window.events['ready-to-show']();
  expect(window.showInactive).toHaveBeenCalledTimes(1);
  overlay.show(); expect(fake.windows).toHaveLength(1);
  const initial = anchorOf(overlay);
  overlay.toggle(); expect(overlay.state().expanded).toBe(true);
  expect(anchorOf(overlay)).toEqual(initial);
  expect(window.bounds.width).toBe(268);
  expect(overlay.state().layout!.menu!.y).toBe(72);
  overlay.move(500, 500); expect(anchorOf(overlay)).toEqual({ x: 524, y: 680 });
  expect(overlay.state().layout!.direction).toBe('up');
  const moved = anchorOf(overlay);
  const bounds = { ...window.bounds }; overlay.move(NaN, 10); expect(window.bounds).toEqual(bounds);
  expect(overlay.owns(window.webContents)).toBe(true);
  overlay.toggle(); expect(window.bounds.width).toBe(64);
  expect(anchorOf(overlay)).toEqual(moved);
  overlay.hide(); expect(overlay.state().visible).toBe(false);
  expect(overlay.owns(window.webContents)).toBe(false);
});

it('persists the circle anchor across restarts and recovers invalid or disconnected display positions', () => {
  const path = join(profile, 'overlay.json');
  let overlay = new OverlayWindow(vi.fn(), path);
  overlay.show(); overlay.move(500, 500); overlay.toggle(); overlay.hide();
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ x: 524, y: 680 });
  overlay = new OverlayWindow(vi.fn(), path); overlay.show();
  expect(overlay.state().expanded).toBe(false);
  expect(anchorOf(overlay)).toEqual({ x: 524, y: 680 });
  overlay.hide();
  fake.area = { x: -800, y: -200, width: 800, height: 600 };
  overlay = new OverlayWindow(vi.fn(), path); overlay.show();
  expect(anchorOf(overlay)).toEqual({ x: -64, y: 336 }); overlay.hide();
  for (const invalid of ['{bad', 'null', '{"x":"20","y":3}', '{"x":1e300,"y":0}']) {
    writeFileSync(path, invalid);
    overlay = new OverlayWindow(vi.fn(), path); overlay.show();
    expect(anchorOf(overlay)).toEqual({ x: -776, y: -20 }); overlay.hide();
  }
});

it('fits vertical menus on every screen edge and preserves the anchor on small and negative-coordinate displays', () => {
  for (const area of [{ x: 0, y: 0, width: 1000, height: 800 }, { x: -360, y: -100, width: 360, height: 480 }]) {
    for (const x of [area.x, area.x + area.width - 64]) for (const y of [area.y, area.y + area.height / 2, area.y + area.height - 64]) {
      const layout = overlayLayout({ x, y }, area, true);
      const { bounds, orb, menu } = layout;
      expect({ x: bounds.x + orb.x, y: bounds.y + orb.y }).toEqual({ x, y });
      expect(bounds.x).toBeGreaterThanOrEqual(area.x); expect(bounds.y).toBeGreaterThanOrEqual(area.y);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height);
      expect(menu!.height).toBeGreaterThan(0);
      expect(menu!.y >= orb.y + 72 || menu!.y + menu!.height + 8 <= orb.y).toBe(true);
    }
  }
});
