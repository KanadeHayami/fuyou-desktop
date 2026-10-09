export type WindowLayout = 'landscape' | 'portrait';
type Bounds = { x: number; y: number; width: number; height: number };
export function layoutBounds(layout: WindowLayout, area: Bounds, previous?: Bounds): Bounds {
  const width = Math.min(layout === 'portrait' ? 400 : 1280, area.width);
  const height = Math.min(layout === 'portrait' ? 820 : 800, area.height);
  const centerX = previous ? previous.x + previous.width / 2 : area.x + area.width / 2;
  const centerY = previous ? previous.y + previous.height / 2 : area.y + area.height / 2;
  return { width, height, x: Math.round(Math.max(area.x, Math.min(centerX - width / 2, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(centerY - height / 2, area.y + area.height - height))) };
}
