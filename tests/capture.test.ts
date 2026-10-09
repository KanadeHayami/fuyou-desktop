import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureController } from '../src/main/capture';
import { DEFAULT_REGION, recognizeBackpack, validateCaptureOptions } from '../src/shared/capture';
import data from '../data/fuyou.json';

// Actual Windows OCR text/positions from the user's supplied backpack screenshot.
const lines = [
  { text: '福 佑 碎 片 背 包', x: .2934, y: .0317 },
  { text: '哈 基 米', x: .3941, y: .0847 },
  { text: 'x29', x: .8559, y: .1243 },
  { text: '攻 击 力 提 升', x: .3924, y: .1761 },
  { text: '替 身 攻 击', x: .3924, y: .2675 },
  { text: '放 血', x: .3924, y: .3589 },
  { text: '电 锤 思 维', x: .3958, y: .4503 },
  { text: '方 战 术 目 镜 已 启 “ ·', x: .3108, y: .543 },
  { text: '所 有 玩 家 福 佑 品 质 相 同', x: .2743, y: .8263 },
  { text: '每 次 重 铸 福 佑 数 值 至 少 提 升 10 ％', x: .1667, y: .8726 }
];
const options = { intervalMs: 2000, region: DEFAULT_REGION };
afterEach(() => vi.useRealTimers());
describe('backpack recognition', () => {
  it('matches complete real names and leaves truncated names unconfirmed', () => {
    const result = recognizeBackpack(lines, data.items);
    expect(result.visible).toBe(true);
    expect(result.rows.map(r => r.id)).toEqual(['10093', '10044', '10164', '10162', '10010', undefined]);
    expect(result.rows[5].candidates).toContain('10004');
    expect(result.rows[5].candidates).toContain('10004a');
    expect(result.rows).toHaveLength(6);
  });
  it('requires a backpack title and does not interpret reroll cost or descriptions as choices', () => {
    expect(recognizeBackpack(lines.slice(1), data.items)).toEqual({ visible: false, rows: [] });
    expect(recognizeBackpack([lines[0], { text: '重铸', x: .4, y: .1 }, { text: 'x29', x: .5, y: .2 }], data.items).rows).toEqual([]);
  });
  it('rejects unsafe regions and unsupported intervals', () => {
    expect(validateCaptureOptions(options)).toEqual(options);
    for (const bad of [null, {}, { ...options, intervalMs: 1 }, { ...options, region: { ...DEFAULT_REGION, x: NaN } }, { ...options, region: { ...DEFAULT_REGION, width: .3 } }]) expect(() => validateCaptureOptions(bad)).toThrow();
  });
});
describe('capture lifecycle', () => {
  it('keeps one request in flight, discards late results after pause and releases its worker', async () => {
    vi.useFakeTimers();
    let resolve!: (result: { kind: 'recognized'; lines: typeof lines }) => void;
    const request = vi.fn(() => new Promise<{ kind: 'recognized'; lines: typeof lines }>(r => { resolve = r; }));
    const stop = vi.fn();
    const controller = new CaptureController(() => {}, '', data.items, () => ({ request, stop }));
    controller.start(options);
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(1);
    controller.stop(); resolve({ kind: 'recognized', lines });
    await vi.advanceTimersByTimeAsync(10000);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(controller.state().rows).toEqual([]);
    expect(controller.state().active).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retains stale rows when closed and clears on a new game even when matchid is zero', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce({ kind: 'recognized', lines }).mockResolvedValue({ kind: 'recognized', lines: [] });
    const controller = new CaptureController(() => {}, '', data.items, () => ({ request, stop: () => {} }));
    controller.start(options); await vi.advanceTimersByTimeAsync(0);
    expect(controller.state().rows).toHaveLength(6);
    const game = { status: 'connected' as const, message: '', gameTime: 100, matchId: '0' };
    controller.observeGame(game);
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.state().status).toBe('hidden'); expect(controller.state().rows).toHaveLength(6);
    controller.observeGame({ ...game, gameTime: 0 });
    expect(controller.state().rows).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(request.mock.calls.at(-1)?.[0]).toMatchObject({ force: true });
    controller.stop();
  });
  it('does not allow pre-reset in-flight results to repopulate a new session', async () => {
    vi.useFakeTimers();
    let resolve!: (result: { kind: 'recognized'; lines: typeof lines }) => void;
    const request = vi.fn(() => new Promise<{ kind: 'recognized'; lines: typeof lines }>(r => { resolve = r; }));
    const controller = new CaptureController(() => {}, '', data.items, () => ({ request, stop: () => {} }));
    controller.start(options); controller.clear(); resolve({ kind: 'recognized', lines });
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.state().rows).toEqual([]);
    controller.stop();
  });
});
