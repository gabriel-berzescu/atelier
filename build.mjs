#!/usr/bin/env node
/**
 * Makes a painting's own page: paintings/<name>/index.html.
 *
 *   node build.mjs paintings/three-hours
 *
 * The page is one file and needs no server: open it and the score is painted again from the bare canvas, stroke by
 * stroke, with the same brush that made the picture, and with the notes written between the strokes shown as it goes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { readScore } from './score.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node build.mjs <painting folder>');
  process.exit(1);
}
const text = readFileSync(join(dir, 'score.txt'), 'utf8');
const score = readScore(text);
const title = (/^#\s*(.+)$/m.exec(text) || [, 'Untitled'])[1].trim();
const name = basename(resolve(dir));
const home = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).homepage || '').replace(/\/$/, '');
  } catch {
    return '';
  }
})();
const about = `A painting by Claude in ${score.strokes.toLocaleString('en')} strokes, each placed by hand. Only what moves is painted. Watch it being painted again from the bare canvas.`;
const social = home
  ? `<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${about}">
<meta property="og:url" content="${home}/paintings/${name}/">
<meta property="og:image" content="${home}/paintings/${name}/${name}-small.png">
<meta name="twitter:card" content="summary_large_image">`
  : '';
const plain = (file) =>
  readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230b0a0d'/%3E%3Cpath d='M6 20a12 12 0 0 1 20-9' fill='none' stroke='%23cfdcff' stroke-width='2.5' stroke-linecap='round'/%3E%3Ccircle cx='21' cy='23' r='3' fill='%23f2a03d'/%3E%3C/svg%3E">
<title>${title}</title>
<meta name="description" content="${about}">
${social}
<style>
  :root { color-scheme: dark; --wall: #070708; --ink: #cfc8b8; --dim: #7d7668; --line: #24221f; --lamp: #f2a03d; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--wall); color: var(--ink); font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 21rem; height: 100%; }
  #frame { display: flex; align-items: center; justify-content: center; padding: 20px; min-height: 0; overflow: hidden; cursor: zoom-in; }
  #frame.near { overflow: auto; align-items: flex-start; justify-content: flex-start; cursor: zoom-out; }
  canvas { display: block; max-width: 100%; max-height: 100%; box-shadow: 0 0 0 1px #000, 0 18px 60px #000; }
  #frame.near canvas { max-width: none; max-height: none; }
  aside { display: flex; flex-direction: column; gap: 1.1rem; padding: 2.2rem 1.6rem 1.6rem 0.6rem; min-height: 0; }
  h1 { margin: 0; font-weight: normal; font-size: 1.7rem; letter-spacing: 0.02em; }
  .by { margin: 0.3rem 0 0; color: var(--dim); font-size: 0.9rem; }
  .rule { margin: 0; color: var(--dim); font-size: 0.92rem; line-height: 1.5; border-left: 2px solid var(--line); padding-left: 0.8rem; }
  #note { flex: 1; min-height: 5rem; margin: 0; font-style: italic; font-size: 1.08rem; line-height: 1.5; transition: opacity 0.5s; }
  #count { color: var(--dim); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  #bar { height: 2px; background: var(--line); }
  #bar i { display: block; height: 100%; width: 0; background: var(--lamp); }
  .keys { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  button { font: inherit; font-size: 0.9rem; color: var(--ink); background: none; border: 1px solid var(--line); padding: 0.35rem 0.8rem; border-radius: 2px; cursor: pointer; }
  button:hover { border-color: var(--dim); }
  label { color: var(--dim); font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; width: 100%; }
  input[type=range] { flex: 1; accent-color: var(--lamp); }
  .hint { color: var(--dim); font-size: 0.8rem; margin: 0; }
  a { color: var(--dim); text-underline-offset: 3px; }
  a:hover { color: var(--ink); }
  @media (max-width: 760px) {
    main { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    #frame { padding: 16px; }
    aside { padding: 0 16px 16px; gap: 0.7rem; }
    #note { min-height: 4.5rem; font-size: 1rem; }
    .rule { display: none; }
  }
</style>
</head>
<body>
<main>
  <div id="frame" title="click to look closely"><canvas id="c"></canvas></div>
  <aside>
    <div>
      <h1>${title}</h1>
      <p class="by">Claude, 2026 &middot; ${score.strokes.toLocaleString('en')} strokes, each placed by hand</p>
    </div>
    <p class="rule">Only what moves is painted. A stroke is the way something went during the three hours: it starts loaded where the thing is now and runs dry backward into where it has been. What kept still is bare canvas.</p>
    <p id="note"></p>
    <div>
      <div id="count"></div>
      <div id="bar"><i></i></div>
    </div>
    <div class="keys">
      <button id="play">Pause</button>
      <button id="end">Finish</button>
      <button id="again">Again</button>
      <label>slower <input id="speed" type="range" min="-3" max="4" step="0.5" value="0"> faster</label>
    </div>
    <p class="hint">Click the painting to look at the paint itself. Space pauses.</p>
    <p class="hint"><a href="score.txt">Read the score</a> &middot; <a href="${name}.png">the picture alone</a> &middot; <a href="../../index.html">Atelier</a></p>
  </aside>
</main>
<script type="text/plain" id="score">${text.replace(/<\//g, '<\\/')}</script>
<script>
${plain('./brush.mjs')}
${plain('./score.mjs')}

const score = readScore(document.getElementById('score').textContent);
const canvas = document.getElementById('c');
canvas.width = score.width;
canvas.height = score.height;
const ctx = canvas.getContext('2d');
const img = ctx.createImageData(score.width, score.height);
const cv = new Canvas(score.width, score.height);
const noteEl = document.getElementById('note');
const countEl = document.getElementById('count');
const barEl = document.querySelector('#bar i');
const playEl = document.getElementById('play');
const speedEl = document.getElementById('speed');
const frameEl = document.getElementById('frame');

let at = 0;         // next thing in the score
let laid = 0;       // strokes on the canvas
let owed = 0;       // strokes due
let playing = true;
let rush = false;
let last = performance.now();

function say(text) {
  if (noteEl.textContent === text) return;
  noteEl.style.opacity = 0;
  setTimeout(() => { noteEl.textContent = text; noteEl.style.opacity = 1; }, 250);
}

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if ((playing || rush) && at < score.ops.length) {
    owed += rush ? 1e9 : dt * 14 * Math.pow(2, Number(speedEl.value));
    let box = null;
    const began = performance.now();
    while (at < score.ops.length && (owed >= 1 || score.ops[at].type !== 'stroke') && performance.now() - began < 40) {
      const op = score.ops[at++];
      let hit = null;
      if (op.type === 'ground') { cv.ground(op.c); hit = [0, 0, cv.w, cv.h]; }
      else if (op.type === 'mask') cv.protect(op.poly, op.outside);
      else if (op.type === 'unmask') cv.unprotect();
      else if (op.type === 'note') say(op.note);
      else if (op.type === 'stroke') { hit = paint(cv, op); laid++; owed -= 1; }
      if (hit) box = box ? [Math.min(box[0], hit[0]), Math.min(box[1], hit[1]), Math.max(box[2], hit[2]), Math.max(box[3], hit[3])] : hit;
    }
    if (owed > 3 && !rush) owed = 3;
    if (box) {
      const x0 = Math.max(0, box[0] - 2), y0 = Math.max(0, box[1] - 2), x1 = Math.min(cv.w, box[2] + 2), y1 = Math.min(cv.h, box[3] + 2);
      develop(cv, img.data, x0, y0, x1, y1);
      ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    }
    countEl.textContent = 'stroke ' + laid.toLocaleString('en') + ' of ' + score.strokes.toLocaleString('en');
    barEl.style.width = (100 * laid / score.strokes) + '%';
    if (at >= score.ops.length) { rush = false; playing = false; playEl.textContent = 'Done'; }
  }
  requestAnimationFrame(tick);
}

function toggle() {
  if (at >= score.ops.length) return;
  playing = !playing;
  playEl.textContent = playing ? 'Pause' : 'Go on';
}
playEl.onclick = toggle;
document.getElementById('end').onclick = () => { rush = true; };
document.getElementById('again').onclick = () => {
  at = 0; laid = 0; owed = 0; rush = false; playing = true;
  cv.unprotect();
  playEl.textContent = 'Pause';
};
window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
frameEl.onclick = (e) => {
  const r = canvas.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  const near = frameEl.classList.toggle('near');
  if (near) { frameEl.scrollLeft = fx * canvas.width - frameEl.clientWidth / 2; frameEl.scrollTop = fy * canvas.height - frameEl.clientHeight / 2; }
};
requestAnimationFrame(tick);
</script>
</body>
</html>
`;
writeFileSync(join(dir, 'index.html'), page);
console.log(`${join(dir, 'index.html')}: ${(page.length / 1024).toFixed(0)} KB, ${score.strokes} strokes`);
