import { expect, it } from 'vitest';
import { restoreSimulation, simulationSnapshot } from '../src/shared/simulator';
import { rollRanges } from '../src/shared/rolls';
import { blessingStats } from '../src/shared/stats';
import data from '../data/fuyou.json';
it('restores only known unique IDs and finite values on valid fields', () => {
  const index = rollRanges(data.items.find(i => i.id === '10027')!.plain)[0].index;
  const restored = restoreSimulation({ ids: ['missing','10027','10027',12], movement: -2, values: { '10027': { [index]: 50, bad: 99 } } }, data.items);
  expect(restored).toEqual({ ids: ['10027'], values: { '10027': { [index]: 40 } } });
  expect(blessingStats(simulationSnapshot(restored), data.items).stats.find(s => s.key === 'damage')?.value).toBe(40);
  expect(restoreSimulation({ ids: ['10027'], values: { '10027': { [index]: Infinity } } }, data.items).values['10027']).toEqual({});
  for (const invalid of [null, 'bad', { ids: 2 }]) expect(restoreSimulation(invalid, data.items).ids).toEqual([]);
});
it('uses the midpoint of real descending ranges without inventing a formula', () => {
  const item = data.items.find(i => i.id === '10093')!;
  expect(rollRanges(item.plain)[0]).toMatchObject({ min: 11, max: 22, midpoint: 16.5 });
  const index = rollRanges(item.plain)[0].index;
  expect(restoreSimulation({ ids: [item.id], values: { [item.id]: { [index]: -100 } } }, data.items).values[item.id][index]).toBe(11);
  const state = simulationSnapshot({ ids: [item.id], values: {} });
  expect(blessingStats(state, data.items).uncovered).toContain(item.id);
});
