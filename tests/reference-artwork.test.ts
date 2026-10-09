import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import reference from '../data/reference.json';

const groups = [
  { folder: 'resources/runes', ids: reference.runes.map(rune => rune.id), count: 36 },
  { folder: 'resources/heroes/icons', ids: reference.heroes.map(hero => hero.id), count: 125 },
  { folder: 'resources/heroes/portraits', ids: reference.heroes.map(hero => hero.id), count: 125 }
];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunks(file: string) {
  const bytes = readFileSync(file), result: { type: string; data: Buffer }[] = [];
  expect(bytes.subarray(0, 8), file).toEqual(signature);
  let cursor = 8;
  while (cursor < bytes.length) {
    const length = bytes.readUInt32BE(cursor), end = cursor + length + 12;
    expect(end, file).toBeLessThanOrEqual(bytes.length);
    const type = bytes.toString('ascii', cursor + 4, cursor + 8);
    expect(bytes.readUInt32BE(end - 4), `${file}: ${type}`).toBe(crc32(bytes.subarray(cursor + 4, end - 4)));
    result.push({ type, data: bytes.subarray(cursor + 8, end - 4) });
    cursor = end;
  }
  expect(result[0].type, file).toBe('IHDR');
  expect(result.at(-1)?.type, file).toBe('IEND');
  expect(result.some(chunk => chunk.type === 'IDAT'), file).toBe(true);
  return result;
}

describe('bundled game artwork', () => {
  it('includes exactly one local icon and portrait for every reference identifier', () => {
    for (const group of groups) {
      expect(group.ids).toHaveLength(group.count);
      expect(readdirSync(group.folder).sort()).toEqual(group.ids.map(id => id + '.png').sort());
    }
    expect(readdirSync('resources/runes')).toContain('rune_snapfire.png');
  });
  it('ships complete PNGs with usable dimensions and valid checksums', () => {
    for (const { folder, ids } of groups) for (const id of ids) {
      const file = join(folder, id + '.png'), header = chunks(file)[0].data;
      expect(header.readUInt32BE(0), file).toBeGreaterThanOrEqual(31);
      expect(header.readUInt32BE(4), file).toBeGreaterThanOrEqual(31);
      expect(header.readUInt32BE(0), file).toBeLessThanOrEqual(512);
      expect(header.readUInt32BE(4), file).toBeLessThanOrEqual(512);
    }
  });
  it('retains public game origins without creator metadata, private paths or dates', () => {
    for (const { folder, ids } of groups) for (const id of ids) {
      const file = join(folder, id + '.png');
      const metadata = chunks(file).filter(chunk => ['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(chunk.type));
      expect(metadata, file).toHaveLength(1);
      const text = metadata[0].data.toString('utf8');
      expect(text, file).toContain('impeccable:prompt\0Origin:');
      expect(text, file).toContain(id);
      expect(text, file).not.toMatch(/(?:[a-z]:[\\/]|\b(?:users|reports|tmp)[\\/]|\b20\d{2}-\d{2}-\d{2}\b|photoshop|xmp)/i);
    }
  });
});
