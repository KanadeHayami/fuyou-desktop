export type RollRange = { index: number; raw: string; min: number; max: number; midpoint: number; context: string };
export function rollRanges(plain: string): RollRange[] {
  return [...plain.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*[~～]\s*(-?\d+(?:\.\d+)?)\s*\]/g)].flatMap(match => {
    const first = Number(match[1]), second = Number(match[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return [];
    const min = Math.min(first, second), max = Math.max(first, second);
    return [{ index: match.index, raw: match[0], min, max, midpoint: Number((min / 2 + max / 2).toFixed(6)), context: plain.slice(Math.max(0, match.index - 22), match.index + match[0].length + 12) }];
  });
}
export function estimatedDescription(plain: string, values: Record<string, number> = {}) {
  let result = plain;
  for (const range of rollRanges(plain).reverse()) {
    const value = values[String(range.index)] ?? range.midpoint;
    result = result.slice(0, range.index) + String(value) + result.slice(range.index + range.raw.length);
  }
  return result;
}
