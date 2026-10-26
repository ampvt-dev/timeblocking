// Generates the app and tray icons as PNGs (no image libraries needed).
//   assets/icon.png            512px app icon (window / dock)
//   build/icon.png             1024px source for installers (electron-builder
//                              converts it to .icns / .ico)
//   assets/trayTemplate*.png   macOS menu-bar icon (black + alpha, template)
//   assets/tray.png            Windows tray icon
// Run: npm run icons

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Signed distance to a rounded rectangle (unit coordinates).
function roundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// shapes: [{ x, y, w, h, r, color: '#rrggbb', alpha }] in 0..1 units, painted in order.
function render(size, shapes, ss = 4) {
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (const s of shapes) {
        let cover = 0;
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const u = (px + (sx + 0.5) / ss) / size;
            const v = (py + (sy + 0.5) / ss) / size;
            if (roundRect(u, v, s.x, s.y, s.w, s.h, s.r) <= 0) cover++;
          }
        }
        const sa = (cover / (ss * ss)) * (s.alpha ?? 1);
        if (!sa) continue;
        const [cr, cg, cb] = hex(s.color);
        const na = sa + a * (1 - sa);
        r = (cr * sa + r * a * (1 - sa)) / na;
        g = (cg * sa + g * a * (1 - sa)) / na;
        b = (cb * sa + b * a * (1 - sa)) / na;
        a = na;
      }
      const i = (py * size + px) * 4;
      out[i] = Math.round(r); out[i + 1] = Math.round(g); out[i + 2] = Math.round(b); out[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, out);
}

// Three stacked blocks in the schedule's category colors on a navy tile.
const appShapes = [
  { x: 0.06, y: 0.06, w: 0.88, h: 0.88, r: 0.2, color: '#1b2430' },
  { x: 0.2, y: 0.22, w: 0.6, h: 0.14, r: 0.05, color: '#dbe6f4' },
  { x: 0.2, y: 0.42, w: 0.42, h: 0.14, r: 0.05, color: '#f2b774' },
  { x: 0.2, y: 0.62, w: 0.52, h: 0.14, r: 0.05, color: '#a9dccf' },
  { x: 0.67, y: 0.42, w: 0.13, h: 0.14, r: 0.05, color: '#f2b774', alpha: 0.45 },
];
const trayShapes = (color) => [
  { x: 0.1, y: 0.12, w: 0.8, h: 0.2, r: 0.07, color },
  { x: 0.1, y: 0.4, w: 0.55, h: 0.2, r: 0.07, color },
  { x: 0.1, y: 0.68, w: 0.7, h: 0.2, r: 0.07, color },
];

fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), render(1024, appShapes, 2));
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), render(512, appShapes));
fs.writeFileSync(path.join(root, 'assets', 'trayTemplate.png'), render(16, trayShapes('#000000'), 8));
fs.writeFileSync(path.join(root, 'assets', 'trayTemplate@2x.png'), render(32, trayShapes('#000000'), 8));
fs.writeFileSync(path.join(root, 'assets', 'tray.png'), render(32, [
  { x: 0, y: 0, w: 1, h: 1, r: 0.22, color: '#1b2430' },
  { x: 0.16, y: 0.18, w: 0.68, h: 0.17, r: 0.06, color: '#dbe6f4' },
  { x: 0.16, y: 0.42, w: 0.46, h: 0.17, r: 0.06, color: '#f2b774' },
  { x: 0.16, y: 0.66, w: 0.58, h: 0.17, r: 0.06, color: '#a9dccf' },
], 8));
console.log('Icons written to assets/ and build/');
