/**
 * Reads a painting as it is written down: one line per stroke, in the order the strokes were laid.
 *
 *   canvas 1600 2000            size in pixels
 *   ground #0d1420              tone the whole canvas
 *   pal amber #f2a03d           name a colour
 *   brush star w=4 o=0.95 ...   name a way of holding the brush
 *   use star c=amber            take up a named brush (and change anything about it)
 *   set w=6 c=#ffffff           change what is in the hand
 *   pole 760 640 17.9           pin a string at x y; 17.9 pixels to a degree of sky
 *   sweep 45                    how many degrees the sky turns in the picture
 *   horizon 1500                where still water would mirror the sky
 *   mask x,y x,y x,y ...        cover a shape so paint cannot reach it
 *   only x,y x,y x,y ...        cover everything except a shape
 *   unmask                      lift all covers
 *   ## words                    a note about what comes next (kept, and shown when the painting is replayed)
 *   # words                     a remark for whoever reads the file (ignored)
 *
 * and the strokes themselves:
 *
 *   s x,y x,y x,y ...           freehand: a curve through these points (x,y,p gives pressure at a point)
 *   a cx,cy r a0 a1             with a string pinned at cx,cy: an arc of radius r from angle a0 to a1
 *   * rho H                     a star's trail: rho degrees from the pole, now at hour angle H, drawn back into the past
 *   ~ rho H                     the same trail as still water mirrors it
 *
 * Any stroke line may end with key=value pairs that hold for that stroke only.
 *
 * Keys: c colour, c2 second colour on the same brush, w width, o opacity, f fade (the paint lasts f times the length
 * of the stroke; 0 = it never runs out), reach (the same, in pixels), k pick-up of wet paint, body thickness,
 * hair density of hairs, soft size of each hair's mark, ta tb taper at the start and the end (fraction of the length),
 * p pressure, vary difference between hairs, wob wobble of the hand in pixels, sw sweep for one star.
 */
import { hashStr } from './brush.mjs';

const DEFAULTS = { c: [1, 1, 1], c2: null, w: 8, o: 1, f: 0, reach: 0, k: 0.15, body: 1, hair: 1, soft: 1, ta: 0.06, tb: 0.1, p: 1, vary: 0.08, wob: 0.7, sw: 0 };

function hex(s) {
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function readScore(text) {
  const ops = [];
  const pal = {};
  const brushes = {};
  const seen = new Map();
  let state = { ...DEFAULTS };
  let pole = { x: 0, y: 0, k: 1 };
  let sweep = 45;
  let horizon = 0;
  let note = '';
  let size = [800, 600];
  let strokes = 0;
  const lines = text.split(/\r?\n/);

  const colour = (v, where) => {
    const c = hex(v) || pal[v];
    if (!c) throw new Error(`line ${where}: no such colour "${v}"`);
    return c;
  };
  const apply = (target, pairs, where) => {
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq < 0) throw new Error(`line ${where}: expected key=value, found "${pair}"`);
      const key = pair.slice(0, eq);
      const val = pair.slice(eq + 1);
      if (!(key in DEFAULTS)) throw new Error(`line ${where}: no such key "${key}"`);
      if (key === 'c') target.c = colour(val, where);
      else if (key === 'c2') target.c2 = val === 'none' ? null : colour(val, where);
      else {
        const n = Number(val);
        if (!Number.isFinite(n)) throw new Error(`line ${where}: "${pair}" is not a number`);
        target[key] = n;
      }
    }
  };
  const point = (tok, where) => {
    const v = tok.split(',').map(Number);
    if (v.length < 2 || v.some((n) => !Number.isFinite(n))) throw new Error(`line ${where}: bad point "${tok}"`);
    return v;
  };

  lines.forEach((raw, idx) => {
    const where = idx + 1;
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('##')) {
      note = line.slice(2).trim();
      ops.push({ type: 'note', note, line: where });
      return;
    }
    if (line.startsWith('#')) return;
    const tok = line.split(/\s+/);
    const head = tok[0];
    const rest = tok.slice(1);
    const plain = rest.filter((t) => !t.includes('='));
    const pairs = rest.filter((t) => t.includes('='));
    const stroke = (shape) => {
      const st = { ...state };
      apply(st, pairs, where);
      const count = seen.get(line) || 0;
      seen.set(line, count + 1);
      ops.push({ type: 'stroke', ...st, ...shape, seed: (hashStr(line) + count * 7919) | 0, note, line: where, n: strokes++ });
    };
    switch (head) {
      case 'canvas':
        size = [Number(rest[0]), Number(rest[1])];
        break;
      case 'ground':
        ops.push({ type: 'ground', c: colour(rest[0], where), line: where });
        break;
      case 'pal':
        pal[rest[0]] = colour(rest[1], where);
        break;
      case 'brush': {
        const b = { ...DEFAULTS };
        apply(b, rest.slice(1), where);
        brushes[rest[0]] = b;
        break;
      }
      case 'use': {
        if (!brushes[plain[0]]) throw new Error(`line ${where}: no such brush "${plain[0]}"`);
        const keep = state.c;
        state = { ...brushes[plain[0]] };
        if (!rest.slice(1).some((t) => t.startsWith('c=')) && brushes[plain[0]].c === DEFAULTS.c) state.c = keep;
        apply(state, pairs, where);
        break;
      }
      case 'set':
        apply(state, pairs, where);
        break;
      case 'pole':
        pole = { x: Number(rest[0]), y: Number(rest[1]), k: Number(rest[2]) };
        break;
      case 'sweep':
        sweep = Number(rest[0]);
        break;
      case 'horizon':
        horizon = Number(rest[0]);
        break;
      case 'mask':
      case 'only':
        ops.push({ type: 'mask', outside: head === 'only', poly: rest.map((t) => point(t, where)), line: where });
        break;
      case 'unmask':
        ops.push({ type: 'unmask', line: where });
        break;
      case 's':
        if (plain.length < 2) throw new Error(`line ${where}: a stroke needs two points`);
        stroke({ pts: plain.map((t) => point(t, where)) });
        break;
      case 'a': {
        const [cx, cy] = point(plain[0], where);
        stroke({ arc: { cx, cy, r: Number(plain[1]), a0: Number(plain[2]), a1: Number(plain[3]), flip: 1 }, wobDefault: true });
        break;
      }
      case '*':
      case '~': {
        const rho = Number(plain[0]);
        const H = Number(plain[1]);
        if (!Number.isFinite(rho) || !Number.isFinite(H)) throw new Error(`line ${where}: a star needs "rho H"`);
        const st = { ...state };
        apply(st, pairs, where);
        const sw = st.sw || sweep;
        const mirrored = head === '~';
        const count = seen.get(line) || 0;
        seen.set(line, count + 1);
        ops.push({
          type: 'stroke',
          ...st,
          arc: { cx: pole.x, cy: mirrored ? 2 * horizon - pole.y : pole.y, r: rho * pole.k, a0: H, a1: H - sw, flip: mirrored ? -1 : 1 },
          seed: (hashStr(line) + count * 7919) | 0,
          note,
          line: where,
          n: strokes++,
        });
        break;
      }
      default:
        throw new Error(`line ${where}: I do not know "${head}"`);
    }
  });
  return { width: size[0], height: size[1], ops, strokes };
}
