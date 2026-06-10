// Generates the favicon + PWA icons from the Best Western wordmark
// (src/assets/bw-logo.png): the logo composited, centered, onto a solid white
// square. Dependency-free — a small PNG decoder/encoder over zlib.
// Run with `node scripts/generate-icons.js` from the client directory.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = resolve(here, '..', 'src', 'assets', 'bw-logo.png');
const iconsDir = resolve(here, '..', 'public', 'icons');
const publicDir = resolve(here, '..', 'public');
mkdirSync(iconsDir, { recursive: true });

// ── PNG decode (8-bit, non-interlaced, color type 2/6) ──
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  let pos = 8;
  let width, height, bitDepth, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const flat = Buffer.alloc(stride * height);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= channels ? flat[y * stride + x - channels] : 0;
      const b = y > 0 ? flat[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? flat[(y - 1) * stride + x - channels] : 0;
      let out;
      if (filter === 1) out = v + a;
      else if (filter === 2) out = v + b;
      else if (filter === 3) out = v + ((a + b) >> 1);
      else if (filter === 4) out = v + paeth(a, b, c);
      else out = v;
      flat[y * stride + x] = out & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (channels === 4) {
      rgba[i * 4] = flat[i * 4];
      rgba[i * 4 + 1] = flat[i * 4 + 1];
      rgba[i * 4 + 2] = flat[i * 4 + 2];
      rgba[i * 4 + 3] = flat[i * 4 + 3];
    } else {
      rgba[i * 4] = flat[i * 3];
      rgba[i * 4 + 1] = flat[i * 3 + 1];
      rgba[i * 4 + 2] = flat[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  }
  return { width, height, rgba };
}

// Area-average downscale (premultiplied alpha) for clean edges.
function resample(src, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const sxR = src.width / dstW;
  const syR = src.height / dstH;
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * syR);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((y + 1) * syR)));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * sxR);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((x + 1) * sxR)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const af = src.rgba[i + 3] / 255;
          r += src.rgba[i] * af;
          g += src.rgba[i + 1] * af;
          b += src.rgba[i + 2] * af;
          a += src.rgba[i + 3];
          n++;
        }
      }
      const i = (y * dstW + x) * 4;
      const af = a / n / 255;
      dst[i] = af > 0 ? Math.round(r / n / af) : 0;
      dst[i + 1] = af > 0 ? Math.round(g / n / af) : 0;
      dst[i + 2] = af > 0 ? Math.round(b / n / af) : 0;
      dst[i + 3] = Math.round(a / n);
    }
  }
  return { width: dstW, height: dstH, rgba: dst };
}

// ── PNG encode ──
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

// Composite the logo, scaled to `logoFrac` of the width, centered on an opaque
// white square of `size`.
function makeIcon(src, size, logoFrac) {
  const out = Buffer.alloc(size * size * 4, 0xff); // solid white, opaque
  const drawW = Math.round(size * logoFrac);
  const drawH = Math.round((drawW * src.height) / src.width);
  const logo = resample(src, drawW, drawH);
  const offX = Math.round((size - drawW) / 2);
  const offY = Math.round((size - drawH) / 2);
  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const s = (y * drawW + x) * 4;
      const af = logo.rgba[s + 3] / 255;
      if (af === 0) continue;
      const i = ((offY + y) * size + (offX + x)) * 4;
      out[i] = Math.round(logo.rgba[s] * af + 255 * (1 - af));
      out[i + 1] = Math.round(logo.rgba[s + 1] * af + 255 * (1 - af));
      out[i + 2] = Math.round(logo.rgba[s + 2] * af + 255 * (1 - af));
      out[i + 3] = 255;
    }
  }
  return encodePng(size, out);
}

const src = decodePng(readFileSync(srcPath));
writeFileSync(resolve(iconsDir, 'icon-192.png'), makeIcon(src, 192, 0.86));
writeFileSync(resolve(iconsDir, 'icon-512.png'), makeIcon(src, 512, 0.86));
// Maskable: logo well inside the center safe zone.
writeFileSync(resolve(iconsDir, 'icon-512-maskable.png'), makeIcon(src, 512, 0.6));
writeFileSync(resolve(publicDir, 'favicon.png'), makeIcon(src, 96, 0.92));
console.log('Generated BW icons + favicon from', srcPath);
