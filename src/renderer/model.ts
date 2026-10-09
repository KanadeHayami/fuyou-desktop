export type Segment = { t: string; k: 'text' | 'num' | 'note' | 'key' | 'warn' | 'br' };
export type Item = { id: string; name: string; quality: number; scope: string; heroes: { key: string; name: string }[]; tags: string[]; desc: Segment[]; plain: string; key: { label: string; value: string } | null; py: string; pyInitials: string };
export type Filters = { query: string; quality: number; scope: string; tag: string; hero: string; favorites: boolean; sort: string };
export const defaults: Filters = { query: '', quality: 0, scope: '', tag: '', hero: '', favorites: false, sort: 'quality' };
export const tags: Record<string, string> = { range: '仅限远程', melee: '仅限近战', uni_team: '队伍唯一', uni_glb: '全局唯一', b_trg: '触发类', rnd: '随机类', only_draw_on_level: '仅抽取获得', str: '仅限力量', agi: '仅限敏捷', int: '仅限智力', '1r': '前排', '2w': '核心', '3c': '先手', '4f': '法师' };
export const qualityName = (q: number) => ['', '蓝色', '紫色', '橙色'][q];
export const scopeName = (s: string) => s === 'common' ? '通用' : '专属';
export function filterItems(items: Item[], filters: Filters, favorites: string[]) {
  const q = filters.query.trim().toLowerCase();
  const rank = (i: Item) => [i.name, i.py, i.pyInitials].some(v => v.toLowerCase().includes(q)) ? 0 : 1;
  return items.filter(i => (!filters.quality || i.quality === filters.quality) && (!filters.scope || i.scope === filters.scope) && (!filters.tag || i.tags.includes(filters.tag)) && (!filters.hero || i.heroes.some(h => h.key === filters.hero)) && (!filters.favorites || favorites.includes(i.id)) && (!q || rank(i) === 0 || [i.plain, ...i.heroes.map(h => h.name)].some(v => v.toLowerCase().includes(q))))
    .sort((a, b) => (q ? rank(a) - rank(b) : 0) || (filters.sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : b.quality - a.quality || a.id.localeCompare(b.id, 'en', { numeric: true })));
}
export const copyText = (i: Item) => `${i.name}（${qualityName(i.quality)}·${scopeName(i.scope)}）\n${i.plain}`;
export function readStored<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
export function saveStored(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be disabled in browser previews. */ } }
