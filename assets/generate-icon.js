/**
 * Generates the tray icons (assets/tray-icon.ico + tray-icon-warning.ico)
 * with no external tools/dependencies — just plain PNGs-in-ICO built from
 * raw pixels. These are stand-ins; swap in real artwork whenever someone
 * wants to design one (just replace the .ico files, nothing in the code
 * needs to change, as long as the filenames stay the same).
 *
 * Normal: a yellow square with a black checkmark, echoing SKPORT's
 * black/yellow branding and the "signed in" checkmark from the site itself.
 * Warning: an orange square with a black exclamation mark, shown instead
 * whenever something needs the user's attention (setup incomplete, login
 * expired, a claim attempt failed) — see tray.js's needsAttention().
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const YELLOW = [0xf2, 0xe1, 0x33, 255];
const ORANGE = [0xf2, 0x8c, 0x28, 255];
const BLACK = [0x14, 0x14, 0x14, 255];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inCheckmark(x, y) {
  // Two line segments forming a check, in a coordinate space scaled to SIZE.
  const nx = x / SIZE;
  const ny = y / SIZE;
  const seg1 = distToSegment(nx, ny, 0.2, 0.55, 0.42, 0.75);
  const seg2 = distToSegment(nx, ny, 0.42, 0.75, 0.8, 0.28);
  const thickness = 0.09;
  return seg1 < thickness || seg2 < thickness;
}

function inExclamation(x, y) {
  const nx = x / SIZE;
  const ny = y / SIZE;
  const stem = distToSegment(nx, ny, 0.5, 0.16, 0.5, 0.58);
  if (stem < 0.09) return true;
  const dot = Math.hypot(nx - 0.5, ny - 0.76);
  return dot < 0.08;
}

function buildPixels(bgColor, glyphFn) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const color = glyphFn(x, y) ? BLACK : bgColor;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = color[3];
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildPng(bgColor, glyphFn) {
  const pixels = buildPixels(bgColor, glyphFn);
  // Each scanline needs a filter-type byte (0 = none) prefixed.
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const idat = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // 1 image

  const entry = Buffer.alloc(16);
  entry[0] = SIZE; // width (256 wraps to 0, fine at 32)
  entry[1] = SIZE; // height
  entry[2] = 0; // color palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image data size
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([header, entry, pngBuffer]);
}

function writeIcon(fileName, bgColor, glyphFn) {
  const ico = buildIco(buildPng(bgColor, glyphFn));
  const outPath = path.join(__dirname, fileName);
  fs.writeFileSync(outPath, ico);
  console.log(`Wrote ${outPath} (${ico.length} bytes)`);
}

writeIcon('tray-icon.ico', YELLOW, inCheckmark);
writeIcon('tray-icon-warning.ico', ORANGE, inExclamation);
