export type OverlayPoint = { x: number; y: number };
export type OverlayRect = OverlayPoint & { width: number; height: number };
export type OverlayLayout = { bounds: OverlayRect; orb: OverlayPoint; menu?: OverlayRect; direction: 'down' | 'up' };
export type OverlayState = { visible: boolean; expanded: boolean; layout?: OverlayLayout };
export const ORB_SIZE = 64;

const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(value, max)));
export function clampOverlayAnchor(anchor: OverlayPoint, area: OverlayRect): OverlayPoint {
  return { x: clamp(anchor.x, area.x, area.x + area.width - ORB_SIZE), y: clamp(anchor.y, area.y, area.y + area.height - ORB_SIZE) };
}

// The anchor belongs to the circle, never to the resizable popup window.
export function overlayLayout(anchor: OverlayPoint, area: OverlayRect, expanded: boolean): OverlayLayout {
  const point = clampOverlayAnchor(anchor, area);
  if (!expanded) return { bounds: { ...point, width: ORB_SIZE, height: ORB_SIZE }, orb: { x: 0, y: 0 }, direction: 'down' };
  const below = Math.max(0, area.y + area.height - point.y - ORB_SIZE - 8);
  const above = Math.max(0, point.y - area.y - 8);
  const direction = below >= 460 || below >= above ? 'down' : 'up';
  const width = Math.min(268, area.width), height = Math.min(460, direction === 'down' ? below : above);
  const menuX = clamp(point.x, area.x, area.x + area.width - width);
  const menuY = direction === 'down' ? point.y + ORB_SIZE + 8 : point.y - height - 8;
  const x = Math.min(point.x, menuX), y = Math.min(point.y, menuY);
  return {
    bounds: { x, y, width: Math.max(point.x + ORB_SIZE, menuX + width) - x, height: Math.max(point.y + ORB_SIZE, menuY + height) - y },
    orb: { x: point.x - x, y: point.y - y },
    menu: { x: menuX - x, y: menuY - y, width, height }, direction
  };
}
