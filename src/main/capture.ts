import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { initialCapture, recognizeBackpack, validateCaptureOptions, type CaptureState, type CaptureMetrics, type OcrLine } from '../shared/capture';
import type { GameSnapshot } from '../shared/game';
import { rollRanges } from '../shared/rolls';

type WorkerResult = Partial<CaptureMetrics> & { ready?: boolean; fatal?: string; error?: string; reason?: string; kind?: 'idle' | 'unchanged' | 'recognized' | 'error'; lines?: OcrLine[] };
export class OcrWorker {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: { resolve: (value: WorkerResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  private ready?: Promise<WorkerResult>;
  constructor(private path: string) {}
  private waiting(timeout = 20000) {
    return new Promise<WorkerResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.stop(); }, timeout);
      this.pending = { resolve, reject, timer };
    });
  }
  private complete(value: WorkerResult) {
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); if (value.fatal) pending.reject(new Error('Windows 中文识别组件不可用，请安装简体中文 OCR 语言功能')); else pending.resolve(value); }
  }
  async request(command: object): Promise<WorkerResult> {
    if (!this.child) {
      this.ready = this.waiting();
      const child = spawn(join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.path], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '';
      child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 512000) { this.stop(); return; }
        let end: number;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try { this.complete(JSON.parse(line)); } catch { this.stop(); }
        }
      });
      child.stderr.resume();
      child.stdin.on('error', () => this.stop());
      child.on('error', () => this.stop());
      child.on('exit', () => { if (this.child === child) this.stop(); });
    }
    await this.ready;
    if (!this.child || this.pending) throw new Error('文字识别进程未就绪');
    const response = this.waiting();
    this.child.stdin.write(JSON.stringify(command) + '\n');
    return response;
  }
  stop() {
    const child = this.child; this.child = undefined;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('采集已停止或识别超时，请重新开始')); this.pending = undefined; }
    child?.kill();
  }
}

export class CaptureController {
  private snapshot = initialCapture();
  private worker?: Pick<OcrWorker, 'request' | 'stop'>;
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private revision = 0;
  private forceNext = true;
  private lastGame?: GameSnapshot;
  constructor(private publish: (state: CaptureState) => void, private workerPath: string, private catalog: { id: string; name: string; plain?: string }[], private createWorker = (path: string): Pick<OcrWorker, 'request' | 'stop'> => new OcrWorker(path)) {}
  state() { return this.snapshot; }
  private update(patch: Partial<CaptureState>) { this.snapshot = { ...this.snapshot, ...patch }; this.publish(this.snapshot); }
  start(input: unknown) {
    const options = validateCaptureOptions(input);
    this.stop();
    this.worker = this.createWorker(this.workerPath);
    this.forceNext = true;
    this.update({ ...options, active: true, status: 'starting', message: '正在启动中文识别，请切回游戏并打开福佑碎片背包' });
    void this.tick(this.epoch);
    return this.snapshot;
  }
  stop() {
    this.epoch++; clearTimeout(this.timer); this.worker?.stop(); this.worker = undefined;
    this.update({ active: false, status: 'paused', message: '采集已暂停；以下保留上次可见清单', metrics: undefined });
    return this.snapshot;
  }
  clear() { this.revision++; this.forceNext = true; this.update({ movement: undefined, session: this.snapshot.session + 1, values: {}, rows: [], observedAt: undefined, recognizedAt: undefined, message: '已清空记录与本局输入；请打开当前局的福佑背包' }); return this.snapshot; }
  setMovement(session: unknown, value: unknown) {
    if (session !== this.snapshot.session || (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))) throw new Error('移速无效或对局已变化');
    this.update({ movement: value === null ? undefined : value as number }); return this.snapshot;
  }
  setValue(session: unknown, id: unknown, index: unknown, value: unknown) {
    if (session !== this.snapshot.session || typeof id !== 'string' || !Number.isInteger(index) || !this.snapshot.rows.some(r => r.id === id)) throw new Error('福佑记录已变化，请重试');
    const item = this.catalog.find(i => i.id === id);
    if (!rollRanges(item?.plain || '').some(r => r.index === index)) throw new Error('无效数值字段');
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('请输入有效数字');
    const values = { ...this.snapshot.values[id] };
    if (value === null) delete values[String(index)]; else values[String(index)] = value as number;
    this.update({ values: { ...this.snapshot.values, [id]: values } });
    return this.snapshot;
  }
  confirm(index: unknown, id: unknown) {
    if (!Number.isInteger(index) || typeof id !== 'string') return this.snapshot;
    const row = this.snapshot.rows[index as number];
    if (!row || !row.candidates.includes(id)) return this.snapshot;
    this.update({ rows: this.snapshot.rows.map((r, n) => n === index ? { ...r, id, confirmed: true } : r) });
    return this.snapshot;
  }
  observeGame(game: GameSnapshot) {
    const old = this.lastGame;
    if (game.status !== 'connected') { if (old) { this.clear(); this.lastGame = undefined; } return; }
    if (old && ((game.hero && old.hero && game.hero.name !== old.hero.name) || (game.map && old.map && game.map !== old.map) || (game.matchId && old.matchId && game.matchId !== old.matchId) || (game.gameTime !== undefined && old.gameTime !== undefined && game.gameTime < old.gameTime - 30) || (game.phase !== old.phase && ['DOTA_GAMERULES_STATE_HERO_SELECTION', 'DOTA_GAMERULES_STATE_PRE_GAME', 'DOTA_GAMERULES_STATE_POST_GAME'].includes(game.phase || '')))) this.clear();
    this.lastGame = game;
  }
  private async tick(epoch: number) {
    const began = performance.now();
    const revision = this.revision;
    try {
      const value = await this.worker!.request({ op: 'capture', region: this.snapshot.region, force: this.forceNext });
      if (epoch !== this.epoch) return;
      if (revision !== this.revision) { this.timer = setTimeout(() => void this.tick(epoch), this.snapshot.intervalMs); return; }
      if (value.kind === 'error') throw new Error('画面识别失败，请使用无边框窗口模式，检查区域大小后重试');
      if (value.kind === 'idle') { this.update({ status: 'background', message: '游戏不在前台或已最小化，当前不截图；以下为上次记录', checks: this.snapshot.checks + 1 }); }
      else {
        const metrics = value as CaptureMetrics;
        const common = { metrics, checks: this.snapshot.checks + 1 };
        if (value.kind === 'unchanged') {
          this.update({ ...common, unchanged: this.snapshot.unchanged + 1, ...(this.snapshot.status === 'running' ? { observedAt: Date.now(), message: '背包画面未变，已跳过文字识别' } : {}) });
        } else if (value.kind === 'recognized' && Array.isArray(value.lines)) {
          this.forceNext = false;
          const found = recognizeBackpack(value.lines, this.catalog);
          found.rows = found.rows.map(row => {
            const previous = this.snapshot.rows.find(r => r.raw === row.raw && r.confirmed && r.id && row.candidates.includes(r.id));
            return previous ? { ...row, id: previous.id, confirmed: true } : row;
          });
          const now = Date.now();
          this.update({ ...common, recognitions: this.snapshot.recognitions + 1, ...(found.visible ? { status: 'running', message: '已读取当前可见背包；隐藏或滚动区域不视为已采集', rows: found.rows, observedAt: now, recognizedAt: now } : { status: 'hidden', message: '未识别到福佑碎片背包标题；请展开背包，以下为上次记录' }) });
        } else throw new Error('识别组件返回了无效结果，请重新开始');
      }
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.worker?.stop(); this.worker = undefined;
      this.update({ active: false, status: 'error', message: error instanceof Error ? error.message : '采集失败，请重试' });
    }
    // One request at a time. Slow OCR postpones the next capture instead of queuing work.
    if (epoch === this.epoch && this.snapshot.active) this.timer = setTimeout(() => void this.tick(epoch), Math.max(50, this.snapshot.intervalMs - (performance.now() - began)));
  }
}
