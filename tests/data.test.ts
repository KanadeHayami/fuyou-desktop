import { describe, it, expect } from 'vitest';
import { parseDescription, extractKey } from '../scripts/data-lib.mjs';
import samples from './real-samples.json';
import data from '../data/fuyou.json';
import heroes from '../data/heroes.json';
import { filterItems, defaults, copyText, type Item } from '../src/renderer/model';
const items = data.items as Item[];
describe('real source data', () => {
  it('has complete counts, icons validated by build, and localized heroes', () => {
    expect(data.meta).toEqual({ baseline: '2026-09-29', count: 636, commonCount: 267, exclusiveCount: 369 });
    expect(Object.keys(heroes)).toHaveLength(118);
    expect(items.every(i => i.name && i.plain && i.py && i.pyInitials)).toBe(true);
  });
  const expected = [
    ['10001', '攻击距离固定为', '200–400'], ['10018', '10层时获得', '12–24%'],
    ['10101', '技能增强', '+2.8–5.6%'], ['10006', '获得', '10–20'],
    ['10116', '造成', '15–30×等级'], ['100001', '伤害', '+15–30']
  ];
  it.each(expected)('extracts source sample %s', (id, label, value) => {
    const sample = samples.find(s => s.id === id)!;
    expect(extractKey(parseDescription(sample.html))).toEqual({ label, value });
    expect(items.find(i => i.id === id)?.name).toBe(sample.name);
  });
  it('preserves source tags even when both range and melee apply', () => {
    expect(items.find(i => i.id === '10006')?.tags).toEqual(['range', 'melee']);
    expect(items.find(i => i.id === '10006')?.quality).toBe(3);
  });
});
describe('description tokenizer', () => {
  it('handles breaks, nested tags, whitespace, entities and adjacent segments', () => {
    expect(parseDescription("  <b>效果</b><br/><font color='#83d18a'> 12<b>~24</b></font><font color='#83d18a'>%</font><font color='#8e8e8e'>（ <i>注释</i> ）</font>  ")).toEqual([
      { t: '效果', k: 'text' }, { t: '\n', k: 'br' }, { t: ' 12~24%', k: 'num' }, { t: '（ 注释 ）', k: 'note' }
    ]);
    expect(parseDescription("<font color='#FF6B6B'>警告<font color='#ffea47'>关键词</font>恢复</font>&amp;")[2]).toEqual({ t: '恢复', k: 'warn' });
  });
  it('merges units without truncating labels and has a null fallback', () => {
    expect(extractKey(parseDescription("这是一个超过十个字的完整关键标签 + <font color='#83d18a'>5</font> 秒"))).toEqual({ label: '这是一个超过十个字的完整关键标签', value: '5秒' });
    expect(extractKey(parseDescription('没有数值'))).toBeNull();
  });
});
describe('search, sorting and filters', () => {
  it.each(['铁剑', 'tjzbd', 'TIEJIANZAIBIDE'])('matches %s', query => {
    expect(filterItems(items, { ...defaults, query }, [])[0].id).toBe('10001');
  });
  it('matches localized hero names and descriptions', () => {
    expect(filterItems(items, { ...defaults, query: '亚巴顿' }, []).some(i => i.id === '100001')).toBe(true);
    expect(filterItems(items, { ...defaults, query: '最大生命值护盾' }, []).some(i => i.id === '10018')).toBe(true);
  });
  it('combines quality, scope, tag and favorites', () => {
    expect(filterItems(items, { ...defaults, quality: 3, scope: 'common', tag: 'range', favorites: true }, ['10001', '10018']).map(i => i.id)).toEqual(['10001']);
    expect(filterItems(items, { ...defaults, scope: 'exclusive', hero: 'abaddon' }, []).every(i => i.heroes.some(h => h.key === 'abaddon'))).toBe(true);
    expect(filterItems(items, { ...defaults, quality: 1, scope: 'common', tag: 'range', favorites: true }, ['10001'])).toHaveLength(0);
  });
  it('ranks names before descriptions across qualities', () => {
    const a = items.find(i => i.id === '100001')!;
    const b = { ...items[0], name: '别的条目', py: '', pyInitials: '', plain: a.name };
    expect(filterItems([b, a], { ...defaults, query: a.name }, [])[0].id).toBe(a.id);
  });
  it('copies complete raw plain text and metadata', () => {
    expect(copyText(items[0])).toBe(`铁剑在必得（橙色·通用）\n${items[0].plain}`);
    expect(copyText(items[0])).toContain('[200~400]');
  });
});
