import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import { pinyin } from 'pinyin-pro';

const source = process.env.FUYOU_REFERENCE_SOURCE;
const baseline = process.env.FUYOU_SOURCE;
const localizationSource = process.env.FUYOU_LOCALIZATION_SOURCE;
assert(source && baseline && localizationSource, 'Set FUYOU_REFERENCE_SOURCE, FUYOU_SOURCE and FUYOU_LOCALIZATION_SOURCE before rebuilding reference data.');
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const master = await readJson(join(source, 'reference.dataset.json'));
const rawBless = await readJson(join(baseline, 'raw-blessings.json'));
const catalog = await readJson('data/fuyou.json');
const official = await readJson('data/official-heroes.json');
const heroNames = Object.fromEntries(official.result.data.heroes.map(hero => [hero.name.replace(/^npc_dota_hero_/, ''), hero.name_loc]));
const localization = new Map(parse(await readFile(localizationSource, 'utf8'), { columns: true, bom: true }).map(row => [row.key, row.value]));
const rows = parse(await readFile(join(baseline, 'catalog.csv'), 'utf8'), { columns: true, bom: true });
const names = new Map(rows.map(row => [row.id, row.名称]));
const visible = new Set(catalog.items.map(item => item.id));
const numeric = value => {
  if (value === undefined || value === null) return null;
  assert(String(value).trim() !== '', 'An empty value is not zero');
  const number = Number(value);
  assert(Number.isFinite(number), `Invalid numeric value: ${value}`);
  return number;
};
const parameterLabels = {
  hp_per_str: '每点力量提供生命值', hp_per_int_str: '每点智力或力量提供生命值', hp_per_agi_str: '每点敏捷或力量提供生命值',
  batk_per_agi: '每点敏捷提供基础攻击力', batk_per_str_agi: '每点力量或敏捷提供基础攻击力', batk_per_int_agi: '每点智力或敏捷提供基础攻击力',
  amp_per_int: '每点智力提供技能增强', amp_per_str: '每点力量提供技能增强', amp_per_str_int: '每点力量或智力提供技能增强', amp_per_agi_int: '每点敏捷或智力提供技能增强',
};
const runeParameterLabels = {
  ...Object.fromEntries(Object.entries(parameterLabels).map(([key, label]) => [key, [label, key.startsWith('amp_per_') ? '%' : '']])),
  hp_pct: ['生命值加成', '%'], csshI: ['承受伤害增加', '%'], smI: ['生命值调整', '%'],
  ward_atkp_per_amp: ['每 1% 技能增强提供蛇守卫攻击力加成', '%'], gold_bonus_pct: ['忍术和追踪术金钱奖励增加', '%'],
  wolf_atk_pct: ['召狼继承攻击速度和攻击力', '%'], wolf_hp_pct: ['召狼继承生命值', '%'],
  move_speed_baseline: ['移速转化基准', ''], move_speed_per_as: ['每点转化攻速所需移速', ''], atk_speed_cap: ['移速转化攻速上限', ''],
  golem_hp_inherit_pct: ['地狱火继承术士生命值', '%'], dmg_hp_pct: ['烈焰之拳与永久献祭的生命值伤害系数', '%'],
  heal_dmg_hp: ['暗言术每秒治疗或伤害的生命值比例', '%'], explosion_delay: ['树人自爆延迟', ' 秒'],
  explosion_radius: ['树人自爆范围', ' 码'], explosion: ['每级树人自爆魔法伤害', ''],
  atk_pct: ['自然之怒附加攻击力伤害', '%'], building_damage_penalty_pct: ['对建筑伤害降低', '%'],
  hps_pct: ['虚灵报复的当前生命值伤害比例', '%'], stun: ['虚灵报复眩晕时间', ' 秒'], stun_mid: ['午夜凋零首次命中眩晕时间', ' 秒'],
  jnfw: ['每 1% 技能增强提供技能范围', ''], jnzq: ['每个灵魂提供技能增强', '%'], soul: ['触发恐惧消耗灵魂', ' 个'], fear: ['恐惧时间', ' 秒'],
  temporary_tree_duration: ['临时树木持续时间', ' 秒'], magic_damage: ['每级普攻附加魔法伤害', ''], gjjl: ['每点额外攻击速度提供攻击距离', ''],
};
const runeParameterOverrides = {
  rune_warrior_pro: { pct: ['生命值与总攻击力加成', '%'] },
  rune_magic_tank_pro: { pct: ['生命值与伤害输出加成', '%'] },
  rune_assassin_pro: { pct: ['总攻击力加成', '%'] },
  rune_ranger_pro: { pct: ['生命值与总攻击力加成', '%'] },
  rune_spellblade_pro: { pct: ['伤害输出加成', '%'] },
  rune_wizard_pro: { pct: ['冷却时间减少', '%'] },
  rune_magic_warrior_pro: { pct: ['生命值与伤害输出加成', '%'] },
  rune_magic_archer_pro: { pct: ['攻击速度加成', '%'] },
  rune_universal_pro: { pct: ['伤害输出加成', '%'] },
  rune_furion_full: { hp_pct: ['树人继承先知生命值', '%'] },
};
const plainText = text => text.replace(/<[^>]*>/g, '').trim();
function runeDescription(id, text) {
  let result = text.split('实现要点：')[0]
    .replace(/（SetSummonAmp[^）]*）/g, '')
    .replace('（AbilityAmp 加算 golem_hp）', '')
    .replace('（先计入英雄技能增强后覆写技能 KV，每秒重算）', '（受技能增强影响）')
    .replace('（监听 apply_damage / apply_heal 追加，不改技能 KV）', '')
    .replace('Ignore 与转化数值均在双端直接计算，无需 Transmitter。', '')
    .replace(/最终攻击距离加成经 CustomTransmitterData[\s\S]*$/, '')
    .replace('（含超上限攻速，对齐替身攻击 Custom_GetTotalAttackSpeed）', '（包含超过攻速上限的部分）');
  if (id === 'rune_techies') result = result.replace('每1点攻击速度增加', '每1点额外攻击速度增加');
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function explanation(path, className, values) {
  let text;
  try { text = await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  const block = text.match(new RegExp(`((?:^---?[^\\r\\n]*\\r?\\n)+)(?=____exports\\.${escape(className)}\\s*=)`, 'm'))?.[1];
  if (!block) return '';
  let template = block.replace(/^---?\s?/gm, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
  template = template.replace(/生命值-\{smI\}/g, '生命值{smI}').replace(/减少lq/g, '减少');
  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{${key}}`, String(value));
    template = template.replace(new RegExp(`\\b${escape(key)}\\b`, 'g'), String(value));
  }
  return template.replace(/\{([^}]+)\}/g, '【$1待核实】');
}
const runes = [];
for (const [id, values] of Object.entries(master.rune.special_values_online_36)) {
  const name = plainText(localization.get(`DOTA_Tooltip_sl_modifier_${id}`) || '');
  assert(/[\u4e00-\u9fff]/.test(name), `Missing Chinese rune name: ${id}`);
  const selectionName = plainText((localization.get(`${id}_desc`) || '').split(/<br\s*\/?>/i)[0]);
  assert.equal(name, selectionName, `Rune title and selection name disagree: ${id}`);
  const description = runeDescription(id, await explanation(join(source, `rune-scripts/sl_modifier_${id}.lua`), `sl_modifier_${id}`, values));
  const labels = { ...runeParameterLabels, ...runeParameterOverrides[id] };
  // Preserve the archived record and mappings with the user-confirmed removal label.
  runes.push({ id, name: id === 'rune_snapfire' ? `${name}（已移除）` : name, nameVerified: true, pro: id.endsWith('_pro'), description,
    py: pinyin(name, { toneType: 'none', type: 'array' }).join(''), pyInitials: pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join(''),
    parameters: Object.entries(values).map(([key, raw]) => ({ key, label: labels[key]?.[0] || key, value: numeric(raw), raw: String(raw), explained: !!labels[key], unit: labels[key]?.[1] || '' })) });
}
const pools = master.rune.pools.map((pool, index) => {
  return { id: `pool-${index + 1}`, name: `候选池 ${String(index + 1).padStart(2, '0')}`, raw: pool.raw, source: 'pool-snapshot', heroIds: [],
    entries: pool.entries.map(entry => ({ rune: entry.rune, chance: numeric(entry.chance) })) };
});
const heroes = Object.entries(master.hero.table).map(([key, raw]) => {
  const id = key.replace(/^npc_dota_hero_/, ''), name = heroNames[id] || id;
  const runePool = typeof raw.rune_pool === 'string' ? raw.rune_pool : null;
  let pool = pools.find(record => record.raw === runePool);
  if (runePool && !pool) {
    const number = pools.length + 1;
    pool = { id: `pool-${number}`, name: `候选池 ${String(number).padStart(2, '0')}`, raw: runePool, source: 'hero-table', heroIds: [],
      entries: runePool.split('#').map(entry => { const [rune, chance] = entry.split('|'); assert(rune && chance !== undefined); return { rune, chance: numeric(chance) }; }) };
    pools.push(pool);
  }
  if (pool) pool.heroIds.push(id);
  return { id, key, name, nameVerified: !!heroNames[id], poolId: pool?.id || null, runePool, weight: numeric(raw.weight),
    tags: typeof raw.custom_tags === 'string' ? raw.custom_tags : null, attrs: typeof raw.attrs === 'string' ? raw.attrs : null,
    innateBless: typeof raw.innate_bless === 'string' ? raw.innate_bless : null,
    py: pinyin(name, { toneType: 'none', type: 'array' }).join(''), pyInitials: pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('') };
}).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
for (const [id, mapped] of Object.entries(master.hero.runepool_map)) {
  assert.equal(heroes.find(hero => hero.id === id)?.runePool, mapped.rune_pool, `Hero mapping mismatch: ${id}`);
}
const events = [];
for (const [id, event] of Object.entries(master.random_events.weights)) {
  events.push({ id, name: `事件 ${id}`, weight: numeric(event.weight),
    description: await explanation(join(source, `event-scripts/rnd_event_${id}.lua`), `rnd_event_${id}`, event.special_values || {}),
    parameters: Object.entries(event.special_values || {}).map(([key, raw]) => ({ key, label: key, value: numeric(raw), raw: String(raw), explained: false, unit: '' })) });
}
const bless = Object.fromEntries(Object.entries(rawBless).map(([id, row]) => [id, { id, name: names.get(id) || id, collected: visible.has(id), weight: numeric(row.weight), quality: row.quality ?? null,
  raw: Object.fromEntries(Object.entries(row).filter(([key]) => ['weight', 'quality', 'basic', 'recraft', 'hero_tags', 'custom_tags', 'hero_weight'].includes(key))) }]));
const basicKeys = ['MID_START_GOLD', 'MID_BONUS_GOLD', 'MID_BONUS_XP', 'MID_BONUS_INTERVAL', 'MID_HERO_ATTR_BONUS_TICK', 'MID_HERO_ATTR_BONUS_HP', 'MID_HERO_ATTR_BONUS_MP', 'MID_CREEP_HP_PCT_PER_MIN', 'MID_TREE_REGROW_TIME'];
const costs = Object.entries(master.costs).map(([key, value]) => ({ key, goodsId: value.goodsId, counts: Object.entries(value.costCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([attempt, amount]) => ({ attempt: Number(attempt), amount: numeric(amount) })) }));
const result = {
  meta: { configurationDate: '2026-10-01', blessDate: '2026-09-29', logicDate: '2026-09-12' },
  runes, pools, heroes, events, bless, costs,
  mechanics: { bless: master.bless, runeIncrease: master.rune.chance_increase_on_reroll_RUNE_CHANCE_INCREASE_ON_REROLL, runeMaxTimes: master.rune.chance_increase_max_times_RUNE_CHANCE_INCREASE_MAX_TIMES,
    eventCounts: master.random_events.count_config_RANDOM_EVENT_CONFIG, basic: Object.fromEntries(basicKeys.map(key => [key, master.other_game_basic[key]])) },
};
assert.equal(runes.length, 36); assert.equal(pools.length, 69); assert.equal(events.length, 21);
assert.equal(heroes.length, 125); assert.equal(heroes.filter(hero => hero.poolId).length, 113);
assert.equal(heroes.filter(hero => hero.runePool === '').length, 12);
assert.equal(pools.filter(pool => pool.source === 'hero-table').length, 3);
assert.deepEqual(heroes.filter(hero => hero.runePool === '').map(hero => hero.id).sort(), [...master.hero.without_rune_pool].sort());
assert(pools.every(pool => pool.entries.every(entry => runes.some(rune => rune.id === entry.rune))), 'A pool references an unknown rune');
assert.equal(Object.values(bless).filter(record => !record.collected).length, 46);
assert.equal(catalog.items.length, 636);
assert.equal(new Set(runes.map(record => record.id)).size, 36);
assert.equal(new Set(pools.map(record => record.raw)).size, 69);
assert.deepEqual(events.filter(record => record.weight === null).map(record => record.id), ['1012', '1015']);
await writeFile('data/reference.json', JSON.stringify(result, null, 2) + '\n');
console.log(`PASS: ${runes.length} runes (${runes.filter(r => r.description).length} script references), ${pools.length} pools (66 snapshot + 3 hero-table), ${heroes.length} heroes (113 configured / 12 unconfigured / ${heroes.filter(hero => !hero.nameVerified).length} untranslated), ${events.length} events (${events.filter(e => e.description).length} script references), 682 blessing weights, 46 uncollected.`);
