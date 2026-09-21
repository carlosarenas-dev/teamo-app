// Genera los iconos de la PWA sin dependencias: rasteriza un corazon y codifica PNG
// a mano con el zlib que ya trae Node. iOS exige PNG para el apple-touch-icon.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "None"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Corazon implicito: (x^2+y^2-1)^3 - x^2*y^3 <= 0 */
const insideHeart = (x, y) => {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
};

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 3; // supersampling para que el borde no quede dentado

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let coverage = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = ((px + (sx + 0.5) / samples) / size) * 2 - 1;
          const v = ((py + (sy + 0.5) / samples) / size) * 2 - 1;
          if (insideHeart(u / 0.70, -v / 0.70 + 0.16)) coverage++;
        }
      }
      coverage /= samples * samples;

      // Fondo degradado en diagonal, azul -> rojo (los dos unicos acentos de la app).
      const t = (px / size + py / size) / 2;
      const bg = [
        Math.round(91 + (239 - 91) * t),
        Math.round(141 + (91 - 141) * t),
        Math.round(239 + (91 - 239) * t),
      ];
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(bg[0] + (255 - bg[0]) * coverage);
      rgba[i + 1] = Math.round(bg[1] + (255 - bg[1]) * coverage);
      rgba[i + 2] = Math.round(bg[2] + (255 - bg[2]) * coverage);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
for (const size of [180, 192, 512]) {
  const file = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(file, render(size));
  console.log(`icon-${size}.png`);
}
