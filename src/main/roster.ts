import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron';
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OcrWorker } from './capture';
import { screenshotPlayers, validateEntry, type RosterEntry, type RosterScan } from '../shared/roster';
export function setupRoster(window: BrowserWindow) {
  const file = join(app.getPath('userData'), 'teammate-roster.json');
  let rows: RosterEntry[] = [];
  let storageError = false;
  try {
    if (existsSync(file)) {
      if (statSync(file).size > 150_000_000) throw new Error('Oversize storage');
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(saved) || saved.length > 500) throw new Error('Invalid storage');
      rows = saved.map(value => ({ ...validateEntry(value), image: typeof value.image === 'string' && /^data:image\/jpeg;base64,/.test(value.image) && value.image.length < 250000 ? value.image : '', updated: typeof value.updated === 'number' ? value.updated : 0 }));
    }
  } catch { storageError = true; }
  let scan: RosterScan | undefined, busy = false, worker: OcrWorker | undefined;
  const persist = (next: RosterEntry[]) => {
    if (storageError) throw new Error('名单文件损坏，已保留原文件；请先备份并修复 teammate-roster.json');
    writeFileSync(file + '.tmp', JSON.stringify(next)); renameSync(file + '.tmp', file); rows = next;
  };
  window.on('closed', () => worker?.stop());
  const handle = (channel: string, fn: (value?: unknown) => unknown) => ipcMain.handle(channel, (event, value) => {
    if (event.sender !== window.webContents) throw new Error('Invalid sender');
    return fn(value);
  });
  handle('roster:list', () => { if (storageError) throw new Error('名单文件损坏，原文件已保留'); return rows; });
  handle('roster:save', input => {
    const row = validateEntry(input);
    if (rows.length >= 500 && !rows.some(r => r.id === row.id)) throw new Error('最多保存 500 条');
    const old = rows.find(r => r.id === row.id);
    row.image = (input as { attachScreenshot?: boolean }).attachScreenshot ? scan?.image || old?.image || '' : old?.image || '';
    persist([...rows.filter(r => r.id !== row.id), row]); return rows;
  });
  handle('roster:remove', id => { if (typeof id !== 'string') throw new Error('无效号码'); persist(rows.filter(r => r.id !== id)); return rows; });
  handle('roster:import', async () => {
    if (busy) throw new Error('正在识别，请稍候');
    busy = true;
    try {
      const selected = await dialog.showOpenDialog(window, { title: '导入玩家卡片或匹配截图', properties: ['openFile'], filters: [{ name: '截图', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }] });
      if (selected.canceled) return null;
      const path = selected.filePaths[0];
      if (statSync(path).size > 15_000_000) throw new Error('截图请小于 15 MB');
      const image = nativeImage.createFromPath(path);
      if (image.isEmpty()) throw new Error('无法读取截图');
      const size = image.getSize();
      if (size.width * size.height > 40000000) throw new Error('截图尺寸过大，请裁剪玩家区域');
      const factor = Math.min(1, 640 / Math.max(size.width, size.height));
      const preview = image.resize({ width: Math.max(1, Math.round(size.width * factor)), height: Math.max(1, Math.round(size.height * factor)) }).toJPEG(65);
      if (preview.length > 180000) throw new Error('截图内容过大，请裁剪玩家区域');
      scan = { image: 'data:image/jpeg;base64,' + preview.toString('base64'), candidates: [], text: '', warning: '' };
      worker = new OcrWorker(app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked/out/renderer/roster-ocr.ps1') : join(__dirname, '../renderer/roster-ocr.ps1'));
      try {
        const result = await worker.request({ op: 'file', path });
        if (result.kind !== 'recognized' || !Array.isArray(result.lines)) throw new Error('截图识别失败，请手动填写号码与昵称');
        scan.candidates = screenshotPlayers(result.lines);
        scan.text = result.lines.map(l => l.text).join('\n');
        if (!scan.candidates.length) scan.warning = '未识别到独立号码行，请核对截图并手动填写。';
      } catch (error) { scan.warning = error instanceof Error ? error.message : '识别失败，可手动填写'; }
      return scan;
    } finally { worker?.stop(); worker = undefined; busy = false; }
  });
}
