// Generates placeholder PWA icons (ink background, terracotta rounded-square
// mark) with no image dependencies — a hand-rolled PNG encoder over zlib.
// Run with `node scripts/generate-icons.js` from the client directory.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const INK = [15, 27, 45]; // #0F1B2D
const TERRA = [198, 93, 62]; // #C65D3E

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Signed distance to a rounded square centered at (cx, cy).
function roundedRectDist(x, y, cx, cy, half, r) {
  const qx = Math.abs(x - cx) - (half - r);
  const qy = Math.abs(y - cy) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size, markScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const half = (size * markScale) / 2;
  const radius = half * 0.42;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = roundedRectDist(x + 0.5, y + 0.5, c, c, half, radius);
      const cov = Math.min(Math.max(0.5 - d, 0), 1); // 1px anti-aliased edge
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(INK[0] + (TERRA[0] - INK[0]) * cov);
      rgba[i + 1] = Math.round(INK[1] + (TERRA[1] - INK[1]) * cov);
      rgba[i + 2] = Math.round(INK[2] + (TERRA[2] - INK[2]) * cov);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

writeFileSync(resolve(outDir, 'icon-192.png'), render(192, 0.5));
writeFileSync(resolve(outDir, 'icon-512.png'), render(512, 0.5));
// Maskable: keep the mark inside the center safe zone with extra padding.
writeFileSync(resolve(outDir, 'icon-512-maskable.png'), render(512, 0.4));
console.log('Generated icons in', outDir);
