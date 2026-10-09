import { describe, expect, it } from 'vitest';
import reference from '../data/reference.json';
import { matchesReference, qualityShares, runeJudgement } from '../src/shared/reference';

describe('reference data boundaries', () => {
  it('uses game names instead of literal translations of internal rune identifiers', () => {
    expect(reference.runes).toHaveLength(36);
    expect(reference.runes.every(rune => rune.nameVerified && /[\u4e00-\u9fff]/.test(rune.name))).toBe(true);
    expect(reference.runes.find(rune => rune.id === 'rune_assassin')?.name).toBe('射手');
    expect(reference.runes.find(rune => rune.id === 'rune_assassin_pro')?.name).toBe('神射手');
    expect(reference.runes.find(rune => rune.id === 'rune_magic_tank_pro')?.name).toBe('圣骑士');
    expect(reference.runes.find(rune => rune.id === 'rune_furion_full')?.name).toBe('大自然的守护者');
    expect(reference.pools.every(pool => pool.entries.every(entry => reference.runes.some(rune => rune.id === entry.rune)))).toBe(true);
  });
  it('excludes private project paths and input file names from distributed reference data', () => {
    expect(Object.keys(reference.meta).sort()).toEqual(['blessDate', 'configurationDate', 'logicDate']);
    expect(JSON.stringify(reference)).not.toMatch(/(?:[a-z]:[\\/]|(?:reports|tmp)[\\/]|原始资料索引|查看来源|解密|对象解析)/i);
  });
  it('keeps missing event weights distinct from explicitly disabled client weights', () => {
    expect(reference.events.filter(event => event.weight === null).map(event => event.id)).toEqual(['1012', '1015']);
    expect(reference.events.find(event => event.id === '1005')?.weight).toBe(0);
    expect(reference.events.find(event => event.id === '1001')?.weight).toBe(100);
  });
  it('retains collected records separately from the raw configuration', () => {
    expect(Object.values(reference.bless).filter(record => record.collected)).toHaveLength(636);
    expect(Object.values(reference.bless).filter(record => !record.collected)).toHaveLength(46);
    expect(reference.bless['10203'].collected).toBe(true);
  });
  it('maps the hero table exactly and preserves the three additional exclusive pools', () => {
    expect(new Set(reference.pools.map(pool => pool.raw)).size).toBe(69);
    expect(reference.pools.filter(pool => pool.source === 'pool-snapshot')).toHaveLength(66);
    expect(reference.pools.filter(pool => pool.source === 'hero-table')).toHaveLength(3);
    expect(reference.heroes).toHaveLength(125);
    expect(reference.heroes.filter(hero => hero.poolId)).toHaveLength(113);
    expect(reference.heroes.filter(hero => hero.runePool === '')).toHaveLength(12);
    for (const hero of reference.heroes.filter(hero => hero.poolId)) {
      const pool = reference.pools.find(pool => pool.id === hero.poolId)!;
      expect(pool.raw).toBe(hero.runePool);
      expect(pool.heroIds).toContain(hero.id);
    }
    const bounty = reference.heroes.find(hero => hero.id === 'bounty_hunter')!;
    expect(reference.pools.find(pool => pool.id === bounty.poolId)?.entries).toEqual([{ rune: 'rune_bounty_hunter', chance: 110 }]);
    expect(reference.heroes.find(hero => hero.id === 'wisp')?.weight).toBe(0);
    expect(JSON.stringify(reference)).not.toContain('ADMIN_STEAM_IDS');
  });
});
describe('mechanics interpretation', () => {
  it('normalizes the 85-point rows and preserves the zero first-draw blue weight', () => {
    const shares = qualityShares({ '1': 15, '2': 40, '3': 30 });
    expect(shares.map(value => value?.toFixed(1))).toEqual(['17.6', '47.1', '35.3']);
    expect(qualityShares({ '1': 0, '2': 60, '3': 40 })).toEqual([0, 60, 40]);
    expect(qualityShares({ '1': 0, '2': 0, '3': 0 })).toEqual([null, null, null]);
  });
  it('caps reroll growth without turning a zero or missing chance into a positive one', () => {
    expect(runeJudgement(10, 0, 30, 20)).toBe(10);
    expect(runeJudgement(10, 5, 30, 20)).toBe(25);
    expect(runeJudgement(10, 25, 30, 20)).toBe(70);
    expect(runeJudgement(0, 20, 30, 20)).toBe(0);
    expect(runeJudgement(null, 20, 30, 20)).toBeNull();
    expect(runeJudgement(10, -1, 30, 20)).toBeNull();
  });
  it('searches by effects and by the original game identifier', () => {
    const wizard = reference.runes.find(rune => rune.id === 'rune_wizard')!;
    expect(matchesReference(wizard, '技能增强')).toBe(true);
    expect(matchesReference(wizard, 'RUNE_WIZARD')).toBe(true);
    expect(matchesReference(wizard, '不存在的效果')).toBe(false);
    const archmage = reference.runes.find(rune => rune.id === 'rune_wizard_pro')!;
    for (const query of ['大法师', 'dafashi', 'DFS', 'RUNE_WIZARD_PRO']) expect(matchesReference(archmage, query)).toBe(true);
  });
  it('labels reused rune parameters by effect and preserves signed values', () => {
    const wizard = reference.runes.find(rune => rune.id === 'rune_wizard_pro')!;
    const archer = reference.runes.find(rune => rune.id === 'rune_magic_archer_pro')!;
    expect(wizard.parameters.find(parameter => parameter.key === 'pct')).toMatchObject({ label: '冷却时间减少', value: 8, unit: '%' });
    expect(archer.parameters.find(parameter => parameter.key === 'pct')).toMatchObject({ label: '攻击速度加成', value: 40, unit: '%' });
    expect(wizard.parameters.find(parameter => parameter.key === 'smI')).toMatchObject({ label: '生命值调整', value: -8, raw: '-8', unit: '%' });
    expect(reference.runes.find(rune => rune.id === 'rune_furion_full')?.parameters.find(parameter => parameter.key === 'hp_pct'))
      .toMatchObject({ label: '树人继承先知生命值', value: 30, unit: '%' });
  });
});
