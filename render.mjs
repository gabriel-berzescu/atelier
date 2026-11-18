#!/usr/bin/env node
/**
 * Paints a score onto a canvas and writes the picture.
 *
 *   node render.mjs paintings/three-hours [--upto N] [--crop x,y,w,h]... [--half]
 *
 * Writes into the painting's own folder:
 *   look/full.png      the whole canvas
 *   look/view.png      the whole canvas at half size (what I look at between passages)
 *   look/crop1.png …   any --crop rectangles, at full size (or, with --big N, enlarged N times to look closely)
 * and, with --keep, the finished picture beside the score, named after the folder, with a half-size copy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Canvas, develop, paint } from './brush.mjs';
import { readScore } from './score.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && !/^[\d.,]+$/.test(a));
if (!dir) {
  console.error('usage: node render.mjs <painting folder> [--upto N] [--crop x,y,w,h]');
  process.exit(1);
}
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const upto = value('--upto') !== undefined ? Number(value('--upto')) : Infinity;
const crops = args.map((a, i) => (a === '--crop' ? args[i + 1].split(',').map(Number) : null)).filter(Boolean);

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0, o = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
function half(rgba, w, h) {
  const W = w >> 1;
  const H = h >> 1;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = (y * 2 * w + x * 2) * 4;
      const b = a + 4;
      const c = a + w * 4;
      const d = c + 4;
      const o = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) out[o + k] = (rgba[a + k] + rgba[b + k] + rgba[c + k] + rgba[d + k] + 2) >> 2;
      out[o + 3] = 255;
    }
  }
  return { data: out, w: W, h: H };
}
function cut(rgba, w, h, [x, y, cw, ch]) {
  x = Math.max(0, Math.min(w - 1, Math.round(x)));
  y = Math.max(0, Math.min(h - 1, Math.round(y)));
  cw = Math.min(cw, w - x);
  ch = Math.min(ch, h - y);
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let yy = 0; yy < ch; yy++) out.set(rgba.subarray(((y + yy) * w + x) * 4, ((y + yy) * w + x + cw) * 4), yy * cw * 4);
  return { data: out, w: cw, h: ch };
}
function enlarge(img, n) {
  const out = new Uint8ClampedArray(img.w * n * img.h * n * 4);
  for (let y = 0; y < img.h * n; y++) {
    for (let x = 0; x < img.w * n; x++) {
      const i = (Math.floor(y / n) * img.w + Math.floor(x / n)) * 4;
      out.set(img.data.subarray(i, i + 4), (y * img.w * n + x) * 4);
    }
  }
  return { data: out, w: img.w * n, h: img.h * n };
}

const started = Date.now();
const score = readScore(readFileSync(join(dir, 'score.txt'), 'utf8'));
const cv = new Canvas(score.width, score.height);
let laid = 0;
for (const op of score.ops) {
  if (op.type === 'ground') cv.ground(op.c);
  else if (op.type === 'mask') cv.protect(op.poly, op.outside);
  else if (op.type === 'unmask') cv.unprotect();
  else if (op.type === 'weave') cv.weave = op.v;
  else if (op.type === 'gloss') cv.gloss = op.v;
  else if (op.type === 'stroke') {
    if (op.n >= upto) break;
    paint(cv, op);
    laid++;
  }
}
const rgba = new Uint8ClampedArray(cv.w * cv.h * 4);
develop(cv, rgba);
mkdirSync(join(dir, 'look'), { recursive: true });
writeFileSync(join(dir, 'look', 'full.png'), png(rgba, cv.w, cv.h));
if (args.includes('--keep')) writeFileSync(join(dir, `${basename(resolve(dir))}.png`), png(rgba, cv.w, cv.h));
const small = half(rgba, cv.w, cv.h);
writeFileSync(join(dir, 'look', 'view.png'), png(small.data, small.w, small.h));
if (args.includes('--keep')) writeFileSync(join(dir, `${basename(resolve(dir))}-small.png`), png(small.data, small.w, small.h));
crops.forEach((c, i) => {
  const big = Number(value('--big') || 1);
  const piece = big > 1 ? enlarge(cut(rgba, cv.w, cv.h, c), big) : cut(rgba, cv.w, cv.h, c);
  writeFileSync(join(dir, 'look', `crop${i + 1}.png`), png(piece.data, piece.w, piece.h));
});
console.log(`${laid} strokes of ${score.strokes}, ${cv.w}x${cv.h}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
