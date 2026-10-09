export type MechanismTopic = 'quality' | 'costs' | 'runes' | 'events' | 'basic';
export type ReferenceKind = 'runes' | 'events';
export type Parameter = { key: string; label: string; value: number | null; raw: string; explained: boolean; unit: string };
export type RuneRecord = { id: string; name: string; nameVerified: boolean; py: string; pyInitials: string; pro: boolean; description: string; parameters: Parameter[] };
export type EventRecord = { id: string; name: string; weight: number | null; description: string; parameters: Parameter[] };
export type RunePool = { id: string; name: string; raw: string; source: string; heroIds: string[]; entries: { rune: string; chance: number | null }[] };
export type HeroRecord = { id: string; key: string; name: string; nameVerified: boolean; poolId: string | null; runePool: string | null; weight: number | null; tags: string | null; attrs: string | null; innateBless: string | null; py: string; pyInitials: string };
export function qualityShares(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return [1, 2, 3].map(quality => total > 0 ? (weights[String(quality)] || 0) / total * 100 : null);
}
export function runeJudgement(chance: number | null, times: number, increase: number, max: number) {
  if (chance === null || !Number.isFinite(times) || times < 0) return null;
  return chance * (1 + Math.min(Math.floor(times), max) * increase / 100);
}
export function matchesReference(record: { id: string; name: string; description?: string; py?: string; pyInitials?: string }, query: string) {
  const q = query.trim().toLowerCase();
  return !q || `${record.id} ${record.name} ${record.description || ''} ${record.py || ''} ${record.pyInitials || ''}`.toLowerCase().includes(q);
}
