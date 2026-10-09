import { initialCapture, type CaptureState } from './capture';
import { rollRanges } from './rolls';
export type Simulation = { ids: string[]; values: Record<string, Record<string, number>>; movement?: number };
export const emptySimulation = (): Simulation => ({ ids: [], values: {} });
export function restoreSimulation(input: unknown, catalog: { id: string; plain: string }[]): Simulation {
  const result = emptySimulation();
  if (!input || typeof input !== 'object') return result;
  const raw = input as Partial<Simulation>;
  if (!Array.isArray(raw.ids)) return result;
  result.ids = [...new Set(raw.ids.filter(id => typeof id === 'string' && catalog.some(i => i.id === id)))];
  if (typeof raw.movement === 'number' && Number.isFinite(raw.movement) && raw.movement >= 0) result.movement = raw.movement;
  for (const id of result.ids) {
    const values: Record<string, number> = {};
    for (const range of rollRanges(catalog.find(i => i.id === id)!.plain)) {
      const value = raw.values?.[id]?.[String(range.index)];
      if (typeof value === 'number' && Number.isFinite(value)) values[String(range.index)] = Math.max(range.min, Math.min(range.max, value));
    }
    result.values[id] = values;
  }
  return result;
}
export function simulationSnapshot(value: Simulation): CaptureState {
  return { ...initialCapture(), values: value.values, movement: value.movement, rows: value.ids.map(id => ({ id, raw: id, candidates: [id], confirmed: true })) };
}
