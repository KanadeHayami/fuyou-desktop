import { expect, it } from 'vitest';
import { layoutBounds } from '../src/shared/window-layout';
it('uses landscape by request and keeps both presets inside scaled or secondary displays', () => {
  const area = { x: -1707, y: 0, width: 1707, height: 920 };
  const wide = layoutBounds('landscape', area);
  expect(wide.width).toBe(1280); expect(wide.height).toBe(800);
  const narrow = layoutBounds('portrait', area, wide);
  expect(narrow.width).toBe(400); expect(narrow.height).toBe(820);
  const edge = layoutBounds('landscape', area, { x: -50, y: 880, width: 400, height: 820 });
  expect(edge.x + edge.width).toBeLessThanOrEqual(0);
  expect(edge.y + edge.height).toBeLessThanOrEqual(920);
  const small = layoutBounds('landscape', { x: 0, y: 0, width: 1000, height: 700 });
  expect(small).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
});
