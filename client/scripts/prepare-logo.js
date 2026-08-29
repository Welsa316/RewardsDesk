// Prepares a brand logo export for use in the app header.
//
// Design tools export a horizontal lockup centred on a big square canvas with
// an opaque white background. Used as-is that renders the mark at a fraction of
// its box height and paints a white rectangle over the warm page background.
// This trims the canvas to the artwork and turns the white matte transparent.
//
//   node scripts/prepare-logo.js [source.png] [out.png]
//
// Defaults to public/logo-original.png -> public/logo.png. Dependency-free.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '..', 'public');
const OUT = process.argv[3] || resolve(pub, 'logo.png');
let SRC = process.argv[2] || resolve(pub, 'logo-original.png');

// First run: the untouched export is still at logo.png. Keep a copy so this is
// repeatable and the original is never lost.
if (!existsSync(SRC) && existsSync(resolve(pub, 'logo.png'))) {
  copyFileSync(resolve(pub, 'logo.png'), resolve(pub, 'logo-original.png'));
  SRC = resolve(pub, 'logo-original.png');
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  let pos = 8, idat = [], width, height, colorType;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error(`Unsupported PNG colour type ${colorType}`);
  const stride = width * ch;
  const out = Buffer.alloc(stride * height);
  let i = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[i++];
    const line = Buffer.from(raw.subarray(i, i + stride)); i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) line[x] = (line[x] + paeth(a, b, c)) & 255;
    }
    line.copy(out, y * stride); prev = line;
  }
  return { width, height, ch, px: out };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const { width, height, ch, px } = decodePng(readFileSync(SRC));
const at = (x, y) => {
  const o = (y * width + x) * ch;
  return ch >= 3 ? [px[o], px[o + 1], px[o + 2]] : [px[o], px[o], px[o]];
};

// Trim to the artwork.
const INK_THRESHOLD = 720; // r+g+b below this counts as artwork, not matte
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = at(x, y);
    if (r + g + b < INK_THRESHOLD) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error('Logo appears to be blank.');

// A little breathing room so the mark is not flush to the edge.
const pad = Math.round((maxY - minY + 1) * 0.06);
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
const w = maxX - minX + 1, h = maxY - minY + 1;

// The brand colour is the one the fill is actually painted in — the MOST
// COMMON ink pixel, not the darkest. The darkest pixel is usually a single
// antialiasing artifact, and using it tints the whole mark too dark.
const tally = new Map();
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    const [r, g, b] = at(x, y);
    if (r + g + b > 450) continue; // matte or soft edge, not solid fill
    const key = `${r >> 2},${g >> 2},${b >> 2}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
}
if (!tally.size) throw new Error('No solid ink found in the logo.');
const [topKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
const detected = topKey.split(',').map((v) => Math.min(255, (Number(v) << 2) + 2));

// The exported logo's maroon and the printed sign's maroon are close but not
// identical, and two near-identical maroons next to each other read as a
// mistake rather than a palette. Snap the mark to the app's brand token —
// which was itself sampled from the sign — so screen, print and UI all match.
// Pass a hex as the third argument to override.
const forced = process.argv[4] || '#680018';
const brand = forced.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
console.log(`  detected in file: #${detected.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}  ->  snapped to ${forced.toUpperCase()}`);

// Alpha from how far the pixel is from white, so the white matte disappears
// and edges keep their softness.
const rgba = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const [r, g, b] = at(minX + x, minY + y);
    const alpha = 255 - Math.min(255, Math.min(r, Math.min(g, b)));
    const o = (y * w + x) * 4;
    rgba[o] = brand[0]; rgba[o + 1] = brand[1]; rgba[o + 2] = brand[2]; rgba[o + 3] = alpha;
  }
}

writeFileSync(OUT, encodePng(w, h, rgba));
const hex = '#' + brand.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
console.log(`  ${width}x${height} -> ${w}x${h}   brand colour ${hex}   transparent background`);
