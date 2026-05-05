import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDir = join(root, 'build');
const width = 256;
const height = 256;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function inRoundedRect(x, y, left, top, rectWidth, rectHeight, radius) {
  const right = left + rectWidth - 1;
  const bottom = top + rectHeight - 1;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function setPixel(data, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const offset = (y * width + x) * 4;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
}

function drawRoundedRect(data, left, top, rectWidth, rectHeight, radius, color) {
  const startX = Math.floor(left);
  const startY = Math.floor(top);
  const endX = Math.ceil(left + rectWidth);
  const endY = Math.ceil(top + rectHeight);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      if (inRoundedRect(x, y, left, top, rectWidth, rectHeight, radius)) {
        setPixel(data, x, y, color);
      }
    }
  }
}

function drawLine(data, x1, y1, x2, y2, size, color) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    drawRoundedRect(data, x - size / 2, y - size / 2, size, size, size / 2, color);
  }
}

function createPng() {
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      setPixel(pixels, x, y, [mix(0, 42, t), mix(109, 157, t), mix(119, 143, t), 255]);
    }
  }

  drawRoundedRect(pixels, 48, 38, 148, 178, 20, [255, 253, 248, 255]);
  drawRoundedRect(pixels, 65, 58, 114, 13, 6, [217, 209, 191, 255]);
  drawRoundedRect(pixels, 66, 88, 102, 10, 5, [137, 185, 181, 255]);
  drawRoundedRect(pixels, 66, 114, 86, 10, 5, [244, 162, 97, 255]);
  drawRoundedRect(pixels, 66, 140, 99, 10, 5, [209, 73, 91, 255]);
  drawRoundedRect(pixels, 66, 166, 68, 10, 5, [42, 157, 143, 255]);
  drawLine(pixels, 150, 176, 211, 115, 17, [31, 42, 42, 255]);
  drawLine(pixels, 145, 181, 206, 120, 9, [244, 162, 97, 255]);
  drawRoundedRect(pixels, 136, 174, 18, 18, 7, [255, 253, 248, 255]);

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (width * 4 + 1)] = 0;
    pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function createIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

mkdirSync(buildDir, { recursive: true });
const png = createPng();
writeFileSync(join(buildDir, 'icon.png'), png);
writeFileSync(join(buildDir, 'icon.ico'), createIco(png));
