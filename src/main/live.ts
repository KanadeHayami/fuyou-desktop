import { OcrWorker } from './capture';
import { initialLive, liveOptions, readTooltip, readingSignature, upsertReading, type LiveMode, type LiveState, type TooltipReading } from '../shared/live';

export class LiveController {
  private snapshot = initialLive();
  private worker?: Pick<OcrWorker, 'request' | 'stop'>;
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private revision = 0;
  private candidate?: { signature: string; count: number; reading: TooltipReading };
  private lastReading?: TooltipReading;
  constructor(private publish: (state: LiveState) => void, private workerPath: string, private createWorker = (path: string): Pick<OcrWorker, 'request' | 'stop'> => new OcrWorker(path)) {}
  state() { return this.snapshot; }
  private update(patch: Partial<LiveState>) { this.snapshot = { ...this.snapshot, ...patch }; this.publish(this.snapshot); }
  private resetCandidate() { this.candidate = undefined; this.lastReading = undefined; }
  start(input: unknown) {
    const options = liveOptions(input);
    this.stop();
    this.worker = this.createWorker(this.workerPath);
    this.update({ ...options, active: true, status: 'starting', message: '正在准备识别；请选中自己的英雄，并悬停 buff 约 2–3 秒。' });
    void this.tick(this.epoch);
    return this.snapshot;
  }
  stop() {
    this.epoch++; clearTimeout(this.timer); this.worker?.stop(); this.worker = undefined; this.resetCandidate();
    this.update({ active: false, status: 'paused', message: '已暂停，以下为上次读数。' });
    return this.snapshot;
  }
  clear() {
    this.revision++; this.resetCandidate();
    this.update({ session: this.snapshot.session + 1, records: [], message: '本局记录已清空，请重新悬停自己的 buff。' });
    return this.snapshot;
  }
  edit(input: unknown) {
    const value = input as { session?: unknown; key?: unknown; mode?: unknown; remove?: unknown } | null;
    if (!value || value.session !== this.snapshot.session || typeof value.key !== 'string' || !this.snapshot.records.some(r => r.key === value.key)) throw new Error('记录已变化，请重试');
    if (value.remove !== true && !['auto', 'total', 'component', 'ignore'].includes(value.mode as string)) throw new Error('请选择有效的数值用途');
    this.revision++; this.resetCandidate();
    this.update({ records: value.remove === true ? this.snapshot.records.filter(r => r.key !== value.key) : this.snapshot.records.map(r => r.key === value.key ? { ...r, mode: value.mode as LiveMode } : r) });
    return this.snapshot;
  }
  private async tick(epoch: number) {
    const revision = this.revision;
    try {
      const result = await this.worker!.request({ op: 'hover', hudOnly: this.snapshot.hudOnly, force: !this.lastReading });
      if (epoch !== this.epoch) return;
      if (revision !== this.revision) return;
      if (result.kind === 'error') throw new Error('识别失败，请使用无边框窗口模式，暂停后重试。');
      if (result.kind === 'idle') {
        this.resetCandidate();
        this.update({ checks: this.snapshot.checks + 1, status: result.reason === 'not-foreground' || result.reason === 'focus-changed' ? 'background' : 'watching', message: result.reason === 'not-foreground' || result.reason === 'focus-changed' ? '游戏不在前台，采集已等待；显示上次读数。' : '等待鼠标停稳并显示完整 buff 说明。' });
      } else if (result.kind === 'recognized' || result.kind === 'unchanged') {
        const reading = result.kind === 'unchanged' ? this.lastReading : readTooltip(result.lines ?? []);
        this.lastReading = reading;
        let records = this.snapshot.records;
        let message = '请悬停 buff；支持带“可驱散／不可驱散”标题及明确数值行的说明框。';
        if (reading) {
          const signature = readingSignature(reading);
          this.candidate = this.candidate?.signature === signature ? { ...this.candidate, count: this.candidate.count + 1 } : { signature, count: 1, reading };
          if (this.candidate.count >= 2) {
            records = upsertReading(records, reading, Date.now());
            message = `已更新「${reading.title}」，再次悬停会覆盖同名记录。`;
          } else message = `正在核对「${reading.title}」，请继续悬停。`;
        } else this.candidate = undefined;
        this.update({ status: 'watching', records, message, checks: this.snapshot.checks + 1, recognitions: this.snapshot.recognitions + (result.kind === 'recognized' ? 1 : 0) });
      } else throw new Error('识别组件返回无效结果，请重新开启。');
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.worker?.stop(); this.worker = undefined; this.resetCandidate();
      this.update({ active: false, status: 'error', message: error instanceof Error ? error.message : '采集失败，请重试。' });
    } finally {
      // Delay after completion: slow recognition never builds a queue or busy loop.
      if (epoch === this.epoch && this.snapshot.active) this.timer = setTimeout(() => void this.tick(epoch), this.snapshot.intervalMs);
    }
  }
}
