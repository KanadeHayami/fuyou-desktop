import type { OcrLine } from './capture';

export const LIVE_STALE_MS = 15000;
export const liveFields = {
  damage: { label: '伤害增强', unit: '%' },
  taken: { label: '承受伤害', unit: '%' },
  spell: { label: '技能增强', unit: '%' },
  overflow: { label: '当前溢出攻速', unit: '点' },
  nextAttack: { label: '下次追加攻击所需攻速', unit: '点' }
} as const;
export type LiveField = keyof typeof liveFields;
export type LiveMode = 'auto' | 'total' | 'component' | 'ignore';
export type LiveValue = { key: LiveField; value: number; role: 'total' | 'unknown' | 'info' };
export type TooltipReading = { key: string; title: string; values: LiveValue[]; raw: string[] };
export type LiveRecord = TooltipReading & { mode: LiveMode; firstSeen: number; lastSeen: number; updates: number };
export type LiveState = {
  session: number; active: boolean; intervalMs: number; hudOnly: boolean;
  status: 'paused' | 'starting' | 'watching' | 'background' | 'error';
  message: string; records: LiveRecord[]; checks: number; recognitions: number;
};
export const initialLive = (): LiveState => ({ session: 0, active: false, intervalMs: 1000, hudOnly: true, status: 'paused', message: '开启后，将鼠标停在自己英雄的 buff 图标上。', records: [], checks: 0, recognitions: 0 });
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '').replace(/[−–]/g, '-');
export const buffKey = (title: string) => compact(title).toLowerCase();
export function liveOptions(input: unknown) {
  const value = input as { intervalMs?: unknown; hudOnly?: unknown } | null;
  if (!value || ![1000, 2000].includes(value.intervalMs as number) || typeof value.hudOnly !== 'boolean') throw new Error('请选择 1 秒或 2 秒，以及有效的识别范围');
  return { intervalMs: value.intervalMs as number, hudOnly: value.hudOnly };
}

// Only read explicit, standalone labels. Descriptions, ranges, trigger conditions
// and unlabelled icon numbers must never become hero attributes.
function readValue(raw: string): LiveValue | undefined {
  const text = compact(raw).replace(/。$/, '');
  const info = text.match(/^(当前溢出攻速|下次追加攻击所需攻速)[:：]([+-]?\d+(?:\.\d+)?)(?:点)?$/);
  if (info) return { key: info[1] === '当前溢出攻速' ? 'overflow' : 'nextAttack', value: Number(info[2]), role: 'info' };
  const match = text.match(/^(当前总|当前|总)?(伤害增强|伤害增幅|伤害输出|承受伤害增减|承受伤害|承伤增减|技能增强|技能增幅)(?:[:：]|(?=[+-]))([+-]?\d+(?:\.\d+)?)%$/);
  if (!match) return;
  const key = /^(伤害)/.test(match[2]) ? 'damage' : /^(承)/.test(match[2]) ? 'taken' : 'spell';
  return { key, value: Number(match[3]), role: match[1] ? 'total' : 'unknown' };
}

export function readTooltip(lines: OcrLine[]): TooltipReading | undefined {
  if (!Array.isArray(lines) || lines.length > 400) return;
  const valid = lines.filter(l => l && typeof l.text === 'string' && l.text.length <= 500 && Number.isFinite(l.x) && Number.isFinite(l.y) && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1).sort((a, b) => a.y - b.y);
  const markers = valid.filter(l => /^(不可驱散|可驱散|无法驱散|不能驱散)$/.test(compact(l.text)));
  const readings: TooltipReading[] = [];
  for (const marker of markers) {
    const above = valid.filter(l => l.y < marker.y && marker.y - l.y < .16 && Math.abs(l.x - marker.x) < .045);
    const title = above.at(-1);
    if (!title || !/\p{Script=Han}/u.test(title.text) || compact(title.text).length < 2 || compact(title.text).length > 48 || /[:：%\d]/.test(title.text)) continue;
    const body = valid.filter(l => l.y > marker.y && l.y - marker.y < .65 && Math.abs(l.x - marker.x) < .055);
    const values = new Map<LiveField, LiveValue>();
    let conflict = false;
    for (const line of body) {
      const value = readValue(line.text);
      if (!value) continue;
      if (!Number.isFinite(value.value) || Math.abs(value.value) > 1000000) { conflict = true; break; }
      const old = values.get(value.key);
      if (old && (old.value !== value.value || old.role !== value.role)) { conflict = true; break; }
      values.set(value.key, value);
    }
    if (!conflict && values.size) readings.push({ key: buffKey(title.text), title: compact(title.text), values: [...values.values()].sort((a, b) => a.key.localeCompare(b.key)), raw: [title.text, marker.text, ...body.map(l => l.text)].slice(0, 30) });
  }
  // Multiple tooltips in one frame are ambiguous; do not choose one heuristically.
  return readings.length === 1 ? readings[0] : undefined;
}

export function readingSignature(reading: TooltipReading) {
  return JSON.stringify([reading.key, reading.values]);
}
export function upsertReading(records: LiveRecord[], reading: TooltipReading, now: number): LiveRecord[] {
  const old = records.find(r => r.key === reading.key);
  const next: LiveRecord = { ...reading, mode: old?.mode ?? 'auto', firstSeen: old?.firstSeen ?? now, lastSeen: now, updates: (old?.updates ?? 0) + (old && readingSignature(old) === readingSignature(reading) ? 0 : 1) };
  return old ? records.map(r => r.key === next.key ? next : r) : [...records, next].slice(-80);
}
export function liveSummary(state: LiveState, now = Date.now()) {
  return (['damage', 'taken', 'spell'] as const).map(key => {
    const candidates = state.records.flatMap(record => record.values.filter(v => v.key === key && record.mode !== 'ignore').map(value => ({ record, value, role: record.mode === 'auto' ? value.role : record.mode })));
    const totals = candidates.filter(c => c.role === 'total');
    const parts = candidates.filter(c => c.role === 'component');
    const used = totals.length ? totals : parts;
    const conflict = new Set(totals.map(c => c.value.value)).size > 1;
    return {
      key, ...liveFields[key], kind: conflict ? 'conflict' as const : totals.length ? 'total' as const : parts.length ? 'partial' as const : 'missing' as const,
      value: conflict || !used.length ? undefined : totals.length ? totals[0].value.value : Number(parts.reduce((n, c) => n + c.value.value, 0).toFixed(4)),
      count: used.length, pending: candidates.filter(c => c.role === 'unknown').length,
      stale: !state.active || state.status !== 'watching' || used.some(c => now - c.record.lastSeen > LIVE_STALE_MS),
      seenAt: used.length ? Math.min(...used.map(c => c.record.lastSeen)) : undefined
    };
  });
}
