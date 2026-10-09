import { describe, it, expect, vi, afterEach } from 'vitest';
import { rollRanges, estimatedDescription } from '../src/shared/rolls';
import { CaptureController } from '../src/main/capture';
import { DEFAULT_REGION } from '../src/shared/capture';
import data from '../data/fuyou.json';
afterEach(() => vi.useRealTimers());
describe('session roll estimates', () => {
  it('uses real ranges, preserves fixed effects, and distinguishes zero from missing input', () => {
    const shoes = data.items.find(i => i.id === '10006')!;
    const ranges = rollRanges(shoes.plain);
    expect(ranges.map(r => r.midpoint)).toEqual([15]);
    expect(estimatedDescription(shoes.plain)).toContain('9%×移动速度');
    expect(estimatedDescription(shoes.plain)).toContain('获得 15 移动速度');
    expect(estimatedDescription(shoes.plain, { [ranges[0].index]: 0 })).toContain('获得 0 移动速度');
    expect(rollRanges('甲 [-3~-1]，乙 [0.7~1.4]，未知 [x~y]，反向 [4~2]').map(r => r.midpoint)).toEqual([-2, 1.05, 3]);
    expect(rollRanges('固定 9%，未知效果')).toEqual([]);
  });
  it('keeps overrides across captures and pause, rejects stale session writes, resets on a new game', async () => {
    vi.useFakeTimers();
    const lines = [{ text: '福佑碎片背包', x: .3, y: .03 }, { text: '攻速鞋', x: .4, y: .1 }];
    const controller = new CaptureController(() => {}, '', data.items, () => ({ request: async () => ({ kind: 'recognized', lines }), stop: () => {} }));
    controller.start({ intervalMs: 5000, region: DEFAULT_REGION });
    await vi.advanceTimersByTimeAsync(0);
    const index = rollRanges(data.items.find(i => i.id === '10006')!.plain)[0].index;
    controller.setValue(0, '10006', index, 24);
    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.state().values['10006'][index]).toBe(24);
    expect(() => controller.setValue(0, '10006', index, Infinity)).toThrow();
    expect(() => controller.setValue(0, '10006', -1, 2)).toThrow();
    controller.stop(); expect(controller.state().values['10006'][index]).toBe(24);
    controller.setValue(0, '10006', index, null);
    expect(controller.state().values['10006'][index]).toBeUndefined();
    controller.setValue(0, '10006', index, 0);
    controller.clear(); expect(controller.state().values).toEqual({});
    expect(() => controller.setValue(0, '10006', index, 10)).toThrow();
  });
});
