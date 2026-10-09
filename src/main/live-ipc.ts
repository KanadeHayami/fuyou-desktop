import { app, ipcMain, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { LiveController } from './live';
import { OverlayWindow } from './overlay';

export function setupLive(window: BrowserWindow) {
  const send = (channel: string, value: unknown) => {
    if (!window.isDestroyed()) window.webContents.send(channel, value);
    overlay.send(channel, value);
  };
  const overlay = new OverlayWindow(() => send('overlay:state', overlay.state()), join(app.getPath('userData'), 'overlay.json'));
  const controller = new LiveController(state => send('live:state', state), app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked/out/renderer/capture-worker.ps1') : join(__dirname, '../renderer/capture-worker.ps1'));
  const handle = (channel: string, mutate: boolean, fn: (input?: unknown) => unknown) => ipcMain.handle(channel, (event, input) => {
    if (event.sender !== window.webContents && (mutate || !overlay.owns(event.sender))) throw new Error('Invalid sender');
    return fn(input);
  });
  handle('live:state', false, () => controller.state());
  handle('live:start', true, input => { const state = controller.start(input); overlay.show(); return state; });
  handle('live:stop', true, () => controller.stop());
  handle('live:clear', true, () => controller.clear());
  handle('live:edit', true, input => controller.edit(input));
  handle('overlay:state', false, () => overlay.state());
  handle('overlay:show', true, () => { overlay.show(); return overlay.state(); });
  handle('overlay:hide', false, () => { overlay.hide(); return overlay.state(); });
  ipcMain.on('overlay:toggle', event => { if (overlay.owns(event.sender)) overlay.toggle(); });
  ipcMain.on('overlay:move', (event, dx, dy) => { if (overlay.owns(event.sender)) overlay.move(dx, dy); });
  window.on('closed', () => { controller.stop(); overlay.hide(); });
}
