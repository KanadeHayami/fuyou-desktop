import type { OcrLine } from './capture';
export type RosterEntry = { id: string; name: string; kind: 'red' | 'black'; note: string; image: string; updated: number };
export type RosterScan = { image: string; candidates: { id: string; name: string }[]; text: string; warning: string };
export const validPlayerId = (id: unknown): id is string => typeof id === 'string' && /^\d{5,17}$/.test(id);
export function validateEntry(value: unknown): RosterEntry {
  const row = value as RosterEntry;
  if (!row || !validPlayerId(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100 || !['red', 'black'].includes(row.kind) || typeof row.note !== 'string' || row.note.length > 1000) throw new Error('请核对号码、昵称和备注（最多 1000 字）');
  return { id: row.id, name: row.name.trim(), kind: row.kind, note: row.note.trim(), image: '', updated: Date.now() };
}
export function screenshotPlayers(lines: OcrLine[]) {
  const results: { id: string; name: string }[] = [];
  for (const line of lines) {
    const id = line.text.replace(/\s/g, '');
    if (!validPlayerId(id) || results.some(r => r.id === id)) continue;
    const above = lines.filter(l => l.y < line.y && line.y - l.y < .25 && Math.abs(l.x - line.x) < .18 && !/^\d[\d\s]*$/.test(l.text) && !/^(已准备|未准备|准备|匹配中)$/.test(l.text.trim())).sort((a, b) => b.y - a.y)[0];
    results.push({ id, name: above?.text.trim() || '' });
  }
  return results.slice(0, 20);
}
