import { describe, it, expect } from 'vitest';
import { screenshotPlayers, validateEntry, validPlayerId } from '../src/shared/roster';
describe('private roster', () => {
  it('keeps identifiers exact without numeric precision loss or nickname matching', () => {
    expect(validateEntry({ id: '76561198000000001', name: ' Test ', kind: 'black', note: ' note ' }).id).toBe('76561198000000001');
    expect(validPlayerId('0012345')).toBe(true);
    for (const id of ['123', '12e3456', '12345x', '123456789012345678', 123456]) expect(validPlayerId(id)).toBe(false);
    expect(() => validateEntry({ id: '123456', name: '', kind: 'red', note: '' })).toThrow();
    expect(() => validateEntry({ id: '123456', name: 'Test', kind: 'red', note: 'x'.repeat(1001) })).toThrow();
  });
  it('pairs separate number lines with nearby names and deduplicates numbers', () => {
    expect(screenshotPlayers([
      { text: 'Test A', x: .1, y: .2 }, { text: 'Test B', x: .6, y: .2 },
      { text: '123 456', x: .1, y: .3 }, { text: '654321', x: .6, y: .3 },
      { text: '123456', x: .1, y: .4 }, { text: '已准备', x: .6, y: .4 },
    ])).toEqual([{ id: '123456', name: 'Test A' }, { id: '654321', name: 'Test B' }]);
    expect(screenshotPlayers([{ text: 'Test 123456', x: 0, y: 0 }])).toEqual([]);
  });
});
