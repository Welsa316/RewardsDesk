// Generates every app icon and the favicon: a neutral rounded square with a
// "P". Deliberately carries no hotel logo or chain mark — those are not ours to
// display, and nothing guest-facing should identify the chain. One set serves
// both the installable parking page and the staff app.
// Run with `node scripts/generate-icons.js` from the client directory.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, '..', 'public', 'icons');
const publicDir = resolve(here, '..', 'public');
mkdirSync(iconsDir, { recursive: true });

const BG = [15, 27, 45]; // #0F1B2D — matches theme_color
const FG = [255, 255, 255];

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Coordinates below are fractions of the icon box, so one description renders
// at every size. `pad` shrinks the artwork for maskable icons, whose outer
// ~20% can be cropped to any shape by the launcher.
function inGlyph(u, v, pad) {
  const s = 1 - pad * 2;
  const x = (u - pad) / s;
  const y = (v - pad) / s;
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;

  const top = 0.16;
  const bot = 0.84;
  const left = 0.3;
  const stemW = 0.115;
  if (x >= left && x <= left + stemW && y >= top && y <= bot) return true; // stem

  const rOut = (bot - top) * 0.29;
  const cy = top + rOut; // bowl centre — aligns the bowl's top with the stem's
  const rIn = rOut - stemW;
  const dx = x - (left + stemW);
  const dy = (y - cy) * 1.0;
  const d = Math.hypot(dx, dy);
  return dx >= 0 && d <= rOut && d >= rIn; // right half of the annulus
}

function roundedSquare(u, v, r) {
  const dx = Math.max(r - u, 0, u - (1 - r));
  const dy = Math.max(r - v, 0, v - (1 - r));
  return Math.hypot(dx, dy) <= r;
}

function makeIcon(size, { pad = 0, radius = 0.22, square = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4; // supersample for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const inBox = square || roundedSquare(u, v, radius);
          if (!inBox) continue;
          bg++;
          if (inGlyph(u, v, pad)) fg++;
        }
      }
      const total = SS * SS;
      const alpha = bg / total;
      const glyph = bg ? fg / bg : 0;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BG[c] * (1 - glyph) + FG[c] * glyph);
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, rgba);
}

writeFileSync(resolve(publicDir, 'favicon.png'), makeIcon(96, { pad: 0.12 }));
writeFileSync(resolve(iconsDir, 'parking-192.png'), makeIcon(192, { pad: 0.14 }));
writeFileSync(resolve(iconsDir, 'parking-512.png'), makeIcon(512, { pad: 0.14 }));
// Maskable: full-bleed square, artwork inside the safe zone.
writeFileSync(resolve(iconsDir, 'parking-512-maskable.png'), makeIcon(512, { pad: 0.26, square: true }));
console.log('wrote favicon.png + parking-192/512/512-maskable.png');
