import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import { pinyin } from 'pinyin-pro';
import { parseDescription, extractKey } from './data-lib.mjs';

const SOURCE = process.env.FUYOU_SOURCE;
const ICONS = process.env.FUYOU_ICONS;
assert(SOURCE && ICONS, 'Set FUYOU_SOURCE and FUYOU_ICONS before rebuilding catalogue data.');
const readJson = async p => JSON.parse((await readFile(p, 'utf8')).replace(/^\uFEFF/, ''));
const manifest = await readJson(join(SOURCE, 'catalog-manifest.json'));
const rows = parse(await readFile(join(SOURCE, 'catalog.csv'), 'utf8'), { columns: true, bom: true });
const lookup = new Map(rows.map(r => [r.id, r]));
const official = await readJson('data/official-heroes.json');
const names = Object.fromEntries(official.result.data.heroes.map(h => [h.name.replace(/^npc_dota_hero_/, ''), h.name_loc]));
const heroes = {}, unknown = new Set();
const items = manifest.map(item => {
  const row = lookup.get(item.id);
  assert(row?.名称, `Missing name: ${item.id}`);
  const desc = parseDescription(row.当前描述_代入内存值);
  const plain = desc.map(s => s.t).join('');
  assert(plain.trim(), `Missing description: ${item.id}`);
  return { id: item.id, name: row.名称, quality: item.quality, scope: item.scope,
    heroes: item.heroTags.map(tag => { const key = tag.replace(/^npc_dota_hero_/, ''); if (!names[key]) unknown.add(key); heroes[key] = names[key] || key; return { key, name: heroes[key] }; }),
    tags: item.customTags, desc, plain, key: extractKey(desc),
    py: pinyin(row.名称, { toneType: 'none', type: 'array' }).join(''),
    pyInitials: pinyin(row.名称, { pattern: 'first', toneType: 'none', type: 'array' }).join('') };
});
const meta = { baseline: '2026-09-29', count: items.length, commonCount: items.filter(i => i.scope === 'common').length, exclusiveCount: items.filter(i => i.scope === 'exclusive').length };
assert.equal(meta.count, 636); assert.equal(meta.commonCount, 267); assert.equal(meta.exclusiveCount, 369);
assert.equal(new Set(items.map(i => i.id)).size, 636);
await Promise.all(items.map(i => access(join(ICONS, `${i.id}.png`))));
await mkdir('resources/icons', { recursive: true });
await Promise.all(items.map(i => copyFile(join(ICONS, `${i.id}.png`), `resources/icons/${i.id}.png`)));
await writeFile('data/fuyou.json', JSON.stringify({ meta, items }, null, 2) + '\n');
await writeFile('data/heroes.json', JSON.stringify(heroes, null, 2) + '\n');
await writeFile('data/unknown-heroes.json', JSON.stringify([...unknown], null, 2) + '\n');
const samples = ['10001', '10018', '10101', '10006', '10116', '100001'].map(id => ({ id, name: lookup.get(id).名称, html: lookup.get(id).当前描述_代入内存值 }));
await writeFile('tests/real-samples.json', JSON.stringify(samples, null, 2) + '\n');
console.log(`PASS: ${meta.count} items, ${meta.commonCount} common, ${meta.exclusiveCount} exclusive, 636 icons; ${Object.keys(heroes).length} heroes, ${unknown.size} unresolved.`);
