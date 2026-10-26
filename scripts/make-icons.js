// Renders the app and tray icons from the brand SVG masters in assets/brand.
//   build/icon.png            1024px macOS icon (Apple grid: 824px tile, transparent margin)
//   build/icon-win.png        512px full-bleed tile for the Windows .ico
//   assets/icon.png           512px macOS dock icon (dev builds)
//   assets/icon-win.png       256px window icon on Windows/Linux
//   assets/trayTemplate*.png  macOS menu-bar icon: monochrome symbol (template image)
//   assets/tray.png           Windows tray icon: the orange app tile
// Run: npm run icons

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = (name) => fs.readFileSync(path.join(root, 'assets', 'brand', `blockwise-${name}.svg`), 'utf8');
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');

// The B symbol's outline (190×200 units, from the brand kit).
const symbolPath = /<path[^>]*\bd="([^"]+)"/.exec(brand('symbol-charcoal'))[1];

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

// App tile (512 units) placed at `inset` inside a canvas of `canvas` units.
function tile(canvas, inset) {
  const scale = (canvas - inset * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}"><g transform="translate(${inset} ${inset}) scale(${scale})">${inner(brand('app-icon-orange'))}</g></svg>`;
}

// Monochrome symbol centered in a square with a little padding.
function symbol(color) {
  const pad = 14;
  const side = 200 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-(side - 190) / 2} ${-pad} ${side} ${side}"><path fill="${color}" fill-rule="evenodd" d="${symbolPath}"/></svg>`;
}

const write = (rel, buf) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), buf);
};

const macIcon = tile(1024, 100);
write('build/icon.png', png(macIcon, 1024));
write('build/icon-win.png', png(tile(512, 0), 512));
write('assets/icon.png', png(macIcon, 512));
write('assets/icon-win.png', png(tile(512, 0), 256));
write('assets/trayTemplate.png', png(symbol('#000000'), 18));
write('assets/trayTemplate@2x.png', png(symbol('#000000'), 36));
write('assets/tray.png', png(tile(512, 0), 32));
console.log('Icons written to assets/ and build/');
