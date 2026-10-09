import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const heroPackage = process.env.FUYOU_HERO_VPK;
const runePackage = process.env.FUYOU_RUNE_VPK;
assert(heroPackage && runePackage, 'Set FUYOU_HERO_VPK and FUYOU_RUNE_VPK to the read-only game packages.');
const reference = JSON.parse(await readFile('data/reference.json', 'utf8'));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function packageIndex(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(28);
    await handle.read(header, 0, 28, 0);
    assert.equal(header.readUInt32LE(0), 0x55aa1234, 'Invalid VPK signature');
    const version = header.readUInt32LE(4);
    assert([1, 2].includes(version), 'Unsupported VPK version');
    const start = version === 2 ? 28 : 12;
    const tree = Buffer.alloc(header.readUInt32LE(8));
    assert.equal((await handle.read(tree, 0, tree.length, start)).bytesRead, tree.length);
    const entries = new Map();
    let cursor = 0;
    const string = () => {
      const end = tree.indexOf(0, cursor);
      assert(end >= cursor, 'Invalid VPK directory');
      const value = tree.toString('utf8', cursor, end);
      cursor = end + 1;
      return value;
    };
    for (;;) {
      const extension = string();
      if (!extension) break;
      for (;;) {
        const directory = string();
        if (!directory) break;
        for (;;) {
          const name = string();
          if (!name) break;
          const count = tree.readUInt16LE(cursor + 4);
          const entry = { archive: tree.readUInt16LE(cursor + 6), offset: tree.readUInt32LE(cursor + 8), length: tree.readUInt32LE(cursor + 12) };
          assert.equal(tree.readUInt16LE(cursor + 16), 0xffff);
          cursor += 18;
          entry.preload = tree.subarray(cursor, cursor + count);
          cursor += count;
          entries.set(`${directory === ' ' ? '' : directory + '/'}${name}.${extension}`, entry);
        }
      }
    }
    return {
      async read(asset) {
        const entry = entries.get(asset);
        assert(entry, `Missing game asset: ${asset}`);
        const archivePath = entry.archive === 0x7fff ? file : file.replace(/_dir\.vpk$/i, `_${String(entry.archive).padStart(3, '0')}.vpk`);
        const archive = await open(archivePath, 'r');
        try {
          const bytes = Buffer.alloc(entry.length);
          const offset = entry.offset + (entry.archive === 0x7fff ? start + tree.length : 0);
          assert.equal((await archive.read(bytes, 0, bytes.length, offset)).bytesRead, bytes.length, 'Incomplete VPK asset');
          return Buffer.concat([entry.preload, bytes]);
        } finally { await archive.close(); }
      }
    };
  } finally { await handle.close(); }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const value = Buffer.alloc(bytes.length + 12);
  value.writeUInt32BE(bytes.length, 0);
  value.write(type, 4, 'ascii');
  bytes.copy(value, 8);
  value.writeUInt32BE(crc32(value.subarray(4, -4)), value.length - 4);
  return value;
}
function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
function withOrigin(image, origin) {
  const chunks = [signature];
  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM', 'iCCP', 'sBIT']);
  let ended = false;
  for (let cursor = 8; cursor < image.length;) {
    const size = image.readUInt32BE(cursor), end = cursor + size + 12;
    assert(end <= image.length, 'Truncated PNG chunk');
    const type = image.toString('ascii', cursor + 4, cursor + 8);
    assert.equal(image.readUInt32BE(end - 4), crc32(image.subarray(cursor + 4, end - 4)), 'PNG checksum mismatch');
    if (type === 'IEND') chunks.push(chunk('tEXt', Buffer.from('impeccable:prompt\0' + origin, 'utf8')));
    if (keep.has(type)) chunks.push(image.subarray(cursor, end));
    cursor = end;
    if (type === 'IEND') { ended = true; break; }
  }
  assert(ended, 'PNG end marker is missing');
  return Buffer.concat(chunks);
}

// The client stores these portraits as raw PNG or single-mip BGRA8888/DXT5 textures.
// Unsupported formats fail instead of substituting a different hero image.
function textureImage(bytes) {
  assert.equal(bytes.readUInt16LE(4), 12, 'Unsupported resource version');
  let block = 8 + bytes.readUInt32LE(8);
  for (let i = 0; i < bytes.readUInt32LE(12); i++, block += 12) {
    if (bytes.toString('ascii', block, block + 4) !== 'DATA') continue;
    const offset = block + 4 + bytes.readUInt32LE(block + 4), size = bytes.readUInt32LE(block + 8);
    const width = bytes.readUInt16LE(offset + 20), height = bytes.readUInt16LE(offset + 22);
    const format = bytes[offset + 26];
    assert.equal(bytes[offset + 27], 1, 'Multi-mip textures require a dedicated converter');
    const data = bytes.subarray(offset + size);
    if (format === 16 || format === 18) {
      assert(data.subarray(0, 8).equals(signature), 'PNG texture is corrupt');
      return data;
    }
    const rgba = Buffer.alloc(width * height * 4);
    if (format === 28) {
      assert(data.length >= rgba.length, 'Incomplete BGRA texture');
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = data[i + 2]; rgba[i + 1] = data[i + 1]; rgba[i + 2] = data[i]; rgba[i + 3] = data[i + 3];
      }
    } else if (format === 2) {
      const columns = Math.ceil(width / 4), rows = Math.ceil(height / 4);
      assert(data.length >= columns * rows * 16, 'Incomplete DXT5 texture');
      const rgb565 = value => {
        const red = value >> 11, green = value >> 5 & 63, blue = value & 31;
        return [red << 3 | red >> 2, green << 2 | green >> 4, blue << 3 | blue >> 2];
      };
      for (let by = 0; by < rows; by++) for (let bx = 0; bx < columns; bx++) {
        const start = (by * columns + bx) * 16;
        const alpha = [data[start], data[start + 1]];
        if (alpha[0] > alpha[1]) for (let k = 1; k <= 6; k++) alpha.push(Math.floor(((7 - k) * alpha[0] + k * alpha[1]) / 7));
        else { for (let k = 1; k <= 4; k++) alpha.push(Math.floor(((5 - k) * alpha[0] + k * alpha[1]) / 5)); alpha.push(0, 255); }
        let alphaBits = 0n;
        for (let k = 0; k < 6; k++) alphaBits |= BigInt(data[start + 2 + k]) << BigInt(k * 8);
        const colors = [rgb565(data.readUInt16LE(start + 8)), rgb565(data.readUInt16LE(start + 10))];
        colors.push(colors[0].map((value, k) => Math.floor((2 * value + colors[1][k]) / 3)), colors[0].map((value, k) => Math.floor((value + 2 * colors[1][k]) / 3)));
        const colorBits = data.readUInt32LE(start + 12);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x, py = by * 4 + y;
          if (px >= width || py >= height) continue;
          const pixel = y * 4 + x, dest = (py * width + px) * 4;
          const color = colors[colorBits >>> (pixel * 2) & 3];
          rgba.set(color, dest); rgba[dest + 3] = alpha[Number(alphaBits >> BigInt(pixel * 3) & 7n)];
        }
      }
    } else throw new Error(`Unsupported client texture format: ${format}`);
    return png(width, height, rgba);
  }
  throw new Error('Texture DATA block is missing');
}

const heroIndex = await packageIndex(heroPackage), runeIndex = await packageIndex(runePackage);
let bytes = 0;
async function save(destination, image, origin) {
  assert(image.subarray(0, 8).equals(signature));
  image = withOrigin(image, origin);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, image);
  bytes += image.length;
}
for (const rune of reference.runes) await save(join('resources/runes', rune.id + '.png'), await runeIndex.read(`resource/flash3/images/spellicons/buff/${rune.id}.png`), `Origin: Fuyou custom game original rune artwork, ${rune.id}; Steam Workshop item 2841152696.`);
for (const hero of reference.heroes) {
  for (const [folder, source] of [['icons', 'icons'], ['portraits', 'selection']]) {
    await save(join('resources/heroes', folder, hero.id + '.png'), textureImage(await heroIndex.read(`panorama/images/heroes/${source}/${hero.key}_png.vtex_c`)), `Origin: Valve Dota 2 client original hero ${folder === 'icons' ? 'icon' : 'selection portrait'}, ${hero.key}.`);
  }
}
console.log(`PASS: ${reference.runes.length} game rune icons; ${reference.heroes.length} official hero icons and portraits; ${bytes} bytes; read-only package inputs.`);
