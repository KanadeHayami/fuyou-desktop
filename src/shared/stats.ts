import type { CaptureState } from './capture';
import { estimatedDescription } from './rolls';
export type StatKey = 'damage' | 'taken' | 'range' | 'speed' | 'speedPercent' | 'spell' | 'attack' | 'baseAttack' | 'totalAttack' | 'health' | 'healthPercent';
export const statLabels: Record<StatKey, string> = { damage: '伤害输出加成', taken: '承受伤害增减', range: '额外攻击距离', speed: '额外攻击速度', speedPercent: '攻击速度百分比', spell: '技能增强', attack: '额外攻击力', baseAttack: '基础攻击力加成', totalAttack: '总攻击力加成', health: '额外生命值', healthPercent: '生命值百分比' };
// Only unconditional, explicit catalog effects. Conditional stacks are excluded.
const rules: Record<StatKey, { ids: string[]; pattern: RegExp; unit: string }> = {
  damage: { ids: ['10023','10027','10042','10046','10068','10205','10004a','10027a','10052a','10097a'], pattern: /伤害输出\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' },
  taken: { ids: ['10040a','10027a','10104'], pattern: /承受伤害\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' },
  attack: { ids: ['10099','10099a','10042b'], pattern: /攻击力\s*([+-])\s*(\d+(?:\.\d+)?)(?![\d.%])/, unit: '点' },
  baseAttack: { ids: ['10044','10048','10110','10048a','10044a','10050a','10045a'], pattern: /基础攻击力\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' },
  totalAttack: { ids: ['10008','10165','10046b'], pattern: /总攻击力\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' },
  health: { ids: ['10042','10046','10108','10111','10046a','10046b','10046c','10046d','10046e','10046f','10042a','10042b','10042c','10042d','10042e'], pattern: /生命值\s*([+-])\s*(\d+(?:\.\d+)?)(?![\d.%])/, unit: '点' },
  healthPercent: { ids: ['10098','10104','10098a','10027','10027a','10005a','10069a'], pattern: /生命值\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' },
  range: { ids: ['10004','10005','10040','10041','10050','10051','10051a','10050a','10004a','10005a','10040a','10041a'], pattern: /攻击距离\s*([+-])\s*(\d+(?:\.\d+)?)/, unit: '码' },
  speed: { ids: ['10008','10074','10165','10189','10042e','10044a'], pattern: /攻击速度\s*([+-])\s*(\d+(?:\.\d+)?)(?![\d.%])/, unit: '点' },
  speedPercent: { ids: ['10045','10049','10164','10095a','10049a','10069a','10045a','10046e'], pattern: /攻击速度\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' },
  spell: { ids: ['10012','10043','10047','10109','10048a','10039a','10046c','10047a','10042c','10043a','10099a','10096a'], pattern: /技能增强\s*([+-])\s*(\d+(?:\.\d+)?)%/, unit: '%' }
};
export function blessingStats(state: CaptureState, catalog: { id: string; name: string; plain: string }[]) {
  const ids = [...new Set(state.rows.flatMap(r => r.id ? [r.id] : []))];
  const used = new Set<string>();
  const stats = (Object.keys(rules) as StatKey[]).map(key => {
    const rule = rules[key];
    const contributions: { name: string; value: number; source: string }[] = [];
    for (const id of ids) {
      const item = catalog.find(i => i.id === id);
      if (!item || !rule.ids.includes(id)) continue;
      const match = estimatedDescription(item.plain, state.values[id]).match(rule.pattern);
      if (!match) continue;
      const value = Number(match[2]) * (match[1] === '-' ? -1 : 1);
      contributions.push({ name: item.name, value, source: Object.keys(state.values[id] || {}).length ? '含玩家输入' : item.plain.includes('~') ? '中位数估算/图鉴固定值' : '图鉴固定值' });
      used.add(id);
    }
    if (key === 'speed' && ids.includes('10006') && state.movement !== undefined) {
      contributions.push({ name: '攻速鞋', value: state.movement * .09, source: '玩家输入移速 × 9%' }); used.add('10006');
    }
    return { key, label: statLabels[key], unit: rule.unit, value: contributions.length ? Number(contributions.reduce((sum, c) => sum + c.value, 0).toFixed(2)) : undefined, contributions };
  });
  return { stats, uncovered: ids.filter(id => !used.has(id)), fixedRange: ids.includes('10001'), needsMovement: ids.includes('10006') && state.movement === undefined };
}
