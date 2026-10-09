import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveController } from '../src/main/live';
import { buffKey, initialLive, liveOptions, liveSummary, readTooltip, upsertReading, type LiveState } from '../src/shared/live';
import type { OcrLine } from '../src/shared/capture';

// Actual Windows OCR output from the user-provided 2135 x 605 partial screenshot.
const supplied: OcrLine[] = [
  { y: .2992, text: '替 身 攻 击', x: .6726 },
  { y: .3636, text: '不 可 驱 散', x: .6726 },
  { y: .4562, text: '当 前 溢 出 攻 速 ： 1284', x: .6731 },
  { y: .5174, text: '下 次 追 加 攻 击 所 需 攻 速 ： 1800', x: .6726 },
  { y: .4678, text: '邪 影 芳 灵', x: .1152 },
  { y: .6446, text: '700', x: .1794 },
  { y: .7074, text: '52 ％ 0', x: .1766 }
];
// Synthetic protocol cases below are isolated tests, never live game observations.
const tooltip = (title = '测试效果', body = ['当前伤害增强：+20%']): OcrLine[] => [
  { text: title, x: .2, y: .1 }, { text: '不可驱散', x: .2, y: .16 },
  ...body.map((text, i) => ({ text, x: .2, y: .26 + i * .06 }))
];
const stateWith = (title: string, body: string[], time = 1000): LiveState => ({ ...initialLive(), active: true, status: 'watching', records: upsertReading([], readTooltip(tooltip(title, body))!, time) });
const options = { intervalMs: 1000, hudOnly: true };
afterEach(() => vi.useRealTimers());

describe('visible buff tooltip readings', () => {
  it('reads the supplied screenshot and keeps the attack threshold separate', () => {
    const reading = readTooltip(supplied)!;
    expect(reading.title).toBe('替身攻击');
    expect(reading.values).toContainEqual({ key: 'overflow', value: 1284, role: 'info' });
    expect(reading.values).toContainEqual({ key: 'nextAttack', value: 1800, role: 'info' });
    expect(reading.values).toHaveLength(2);
    expect(liveSummary({ ...initialLive(), records: upsertReading([], reading, 0) }, 0).every(s => s.value === undefined)).toBe(true);
  });
  it('requires a unique complete tooltip and rejects conditions, ranges and unrelated text', () => {
    expect(readTooltip(tooltip().slice(2))).toBeUndefined();
    expect(readTooltip([...tooltip(), ...tooltip('另一个效果').map(l => ({ ...l, x: .7 }))])).toBeUndefined();
    expect(readTooltip(tooltip('测试效果', ['伤害增强：10~20%', '下一次技能增强：1800%', '命中时伤害增强+30%', '最大层数：20', '伤害增强：20', '伤害增强：20% 时触发']))).toBeUndefined();
    expect(readTooltip(tooltip('测试效果', ['当前伤害增强：20%', '当前伤害增强：30%']))).toBeUndefined();
  });
  it('preserves signed values, zero, decimals and distinguishes ambiguous contributions', () => {
    const reading = readTooltip(tooltip('测试效果', ['当 前 伤 害 增 强 ： ＋１２．５％', '当前承受伤害：−20%', '技能增强：0%']))!;
    expect(reading.values).toContainEqual({ key: 'damage', value: 12.5, role: 'total' });
    expect(reading.values).toContainEqual({ key: 'taken', value: -20, role: 'total' });
    expect(reading.values).toContainEqual({ key: 'spell', value: 0, role: 'unknown' });
    expect(readTooltip(tooltip('测试效果', ['当前伤害增强：9999999%']))).toBeUndefined();
  });
  it('updates one title regardless of position, replacing values rather than accumulating', () => {
    const first = readTooltip(tooltip())!;
    let records = upsertReading([], first, 1000);
    records = upsertReading(records, readTooltip(tooltip('测 试 效 果', ['当前伤害增强：25%']).map(l => ({ ...l, x: .7 })))!, 2000);
    records = upsertReading(records, readTooltip(tooltip('测试效果', ['当前伤害增强：25%']))!, 3000);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ firstSeen: 1000, lastSeen: 3000, updates: 2 });
    expect(records[0].values[0].value).toBe(25);
    expect(buffKey('测试效果（SP）')).not.toBe(buffKey('测试效果'));
  });
  it('does not mix total and component readings; conflicts and stale data stay explicit', () => {
    const state = stateWith('总属性', ['当前伤害增强：40%']);
    state.records = upsertReading(state.records, readTooltip(tooltip('单项加成', ['伤害增强：10%']))!, 1000);
    state.records[1].mode = 'component';
    expect(liveSummary(state, 1000)[0]).toMatchObject({ value: 40, kind: 'total', count: 1, stale: false });
    state.records = upsertReading(state.records, readTooltip(tooltip('另一总值', ['当前伤害增强：50%']))!, 1000);
    expect(liveSummary(state, 1000)[0]).toMatchObject({ value: undefined, kind: 'conflict' });
    state.records[2].mode = 'ignore';
    expect(liveSummary(state, 17000)[0].stale).toBe(true);
    state.records[0].mode = 'ignore';
    expect(liveSummary(state, 1000)[0]).toMatchObject({ value: 10, kind: 'partial' });
    state.records[1].mode = 'auto';
    expect(liveSummary(state, 1000)[0]).toMatchObject({ value: undefined, pending: 1 });
  });
  it('replaces missing fields and rejects invalid capture options', () => {
    const state = stateWith('总属性', ['当前伤害增强：40%', '当前技能增强：20%']);
    state.records = upsertReading(state.records, readTooltip(tooltip('总属性', ['当前伤害增强：40%']))!, 2000);
    expect(liveSummary(state, 2000)[2].value).toBeUndefined();
    expect(() => liveOptions({ intervalMs: 1, hudOnly: true })).toThrow();
    expect(() => liveOptions({ intervalMs: 1000, hudOnly: 'true' })).toThrow();
  });
});

describe('serial capture and observation lifetime', () => {
  it('requires two consistent observations, reuses unchanged frames and never duplicates a buff', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce({ kind: 'recognized', lines: tooltip() }).mockResolvedValue({ kind: 'unchanged' });
    const controller = new LiveController(() => {}, '', () => ({ request, stop: vi.fn() }));
    controller.start(options); await vi.advanceTimersByTimeAsync(0);
    expect(controller.state().records).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.state().records).toHaveLength(1);
    const first = controller.state().records[0].lastSeen;
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.state().records).toHaveLength(1);
    expect(controller.state().records[0].lastSeen).toBeGreaterThan(first);
    expect(controller.state().records[0].updates).toBe(1);
    controller.stop();
    expect(liveSummary(controller.state())[0].stale).toBe(true);
  });
  it('interrupts stability on pointer motion or background and preserves only historical values', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce({ kind: 'recognized', lines: tooltip() }).mockResolvedValueOnce({ kind: 'idle', reason: 'pointer-moving' }).mockResolvedValue({ kind: 'recognized', lines: tooltip() });
    const controller = new LiveController(() => {}, '', () => ({ request, stop: vi.fn() }));
    controller.start(options); await vi.advanceTimersByTimeAsync(2000);
    expect(controller.state().records).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.state().records).toHaveLength(1);
    request.mockResolvedValue({ kind: 'idle', reason: 'not-foreground' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.state().status).toBe('background');
    expect(liveSummary(controller.state())[0].stale).toBe(true);
    controller.stop();
  });
  it('never queues OCR and discards in-flight results after a clear or stop', async () => {
    vi.useFakeTimers();
    let resolve!: (value: { kind: 'recognized'; lines: OcrLine[] }) => void;
    const request = vi.fn(() => new Promise<{ kind: 'recognized'; lines: OcrLine[] }>(r => { resolve = r; })), stop = vi.fn();
    const controller = new LiveController(() => {}, '', () => ({ request, stop }));
    controller.start(options); await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(1);
    controller.clear(); resolve({ kind: 'recognized', lines: tooltip() }); await vi.advanceTimersByTimeAsync(0);
    expect(controller.state().records).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2);
    controller.stop(); resolve({ kind: 'recognized', lines: tooltip() }); await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(controller.state().records).toHaveLength(0);
  });
  it('retains confirmed roles across updates and rejects edits from old sessions', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue({ kind: 'recognized', lines: tooltip() });
    const controller = new LiveController(() => {}, '', () => ({ request, stop: vi.fn() }));
    controller.start(options); await vi.advanceTimersByTimeAsync(1000);
    controller.edit({ session: 0, key: '测试效果', mode: 'ignore' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.state().records[0].mode).toBe('ignore');
    controller.clear();
    expect(() => controller.edit({ session: 0, key: '测试效果', mode: 'total' })).toThrow();
    controller.stop();
  });
});
