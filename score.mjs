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
 *   shape roof x,y x,y x,y ...  name a shape, to cover with later: "mask @roof", "only @roof"
 *   grid wall 282 95 TL TR BR BL   rule a grid on a four-cornered surface seen at an angle: 282 units across,
 *                               95 down, corners given clockwise from the top left
 *   weave 0.5                   how strongly the weave of the bare canvas shows (0.22 unless said)
 *   gloss 0.4                   how much thick paint shines (1 unless said)
 *   rule words                  the rule of the painting, in a sentence or two (shown on its page)
 *   ## words                    a note about what comes next (kept, and shown when the painting is replayed);
 *                               lines of ## one after another make one note
 *   # words                     a remark for whoever reads the file (ignored)
 *
 * and the strokes themselves:
 *
 *   s x,y x,y x,y ...           freehand: a curve through these points (x,y,p gives pressure at a point)
 *   a cx,cy r a0 a1             with a string pinned at cx,cy: an arc of radius r from angle a0 to a1
 *   g wall u,v u,v ...          freehand, but with the points read off a ruled grid
 *   * rho H                     a star's trail: rho degrees from the pole, now at hour angle H, drawn back into the past
 *   ~ rho H                     the same trail as still water mirrors it
 *
 * Any stroke line may end with key=value pairs that hold for that stroke only.
 *
 * Keys: c colour, c2 second colour on the same brush, w width, o opacity, f fade (the paint lasts f times the length
 * of the stroke; 0 = it never runs out), reach (the same, in pixels), k pick-up of wet paint, body thickness,
 * hair density of hairs, soft size of each hair's mark, ta tb taper at the start and the end (fraction of the length),
 * p pressure, vary difference between hairs, wob wobble of the hand in pixels, sw sweep for one star,
 * even how evenly the hairs are loaded (0 = each its own amount, 1 = all full, like a knife).
 */
import { hashStr } from './brush.mjs';

const DEFAULTS = { c: [1, 1, 1], c2: null, w: 8, o: 1, f: 0, reach: 0, k: 0.15, body: 1, hair: 1, soft: 1, ta: 0.06, tb: 0.1, p: 1, vary: 0.08, wob: 0.7, sw: 0, even: 0 };

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
  let rule = '';
  const shapes = {};
  const grids = {};
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
      const words = line.slice(2).trim();
      const last = ops[ops.length - 1];
      if (last && last.type === 'note' && last.end === where - 1) {
        note = `${note} ${words}`;
        last.note = note;
        last.end = where;
      } else {
        note = words;
        ops.push({ type: 'note', note, line: where, end: where });
      }
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
        if (rest.length === 1 && rest[0].startsWith('@')) {
          if (!shapes[rest[0].slice(1)]) throw new Error(`line ${where}: no such shape "${rest[0]}"`);
          ops.push({ type: 'mask', outside: head === 'only', poly: shapes[rest[0].slice(1)], line: where });
        } else ops.push({ type: 'mask', outside: head === 'only', poly: rest.map((t) => point(t, where)), line: where });
        break;
      case 'shape':
        shapes[rest[0]] = rest.slice(1).map((t) => point(t, where));
        break;
      case 'grid': {
        const c = rest.slice(3, 7).map((t) => point(t, where));
        if (c.length !== 4) throw new Error(`line ${where}: a grid needs a width, a height and four corners`);
        grids[rest[0]] = { w: Number(rest[1]), h: Number(rest[2]), c };
        break;
      }
      case 'g': {
        const gr = grids[plain[0]];
        if (!gr) throw new Error(`line ${where}: no such grid "${plain[0]}"`);
        if (plain.length < 3) throw new Error(`line ${where}: a stroke needs two points`);
        const [tl, tr, br, bl] = gr.c;
        stroke({
          pts: plain.slice(1).map((t) => {
            const [u, v, p] = point(t, where);
            const a = u / gr.w;
            const b = v / gr.h;
            const tx = tl[0] + (tr[0] - tl[0]) * a;
            const ty = tl[1] + (tr[1] - tl[1]) * a;
            const bx = bl[0] + (br[0] - bl[0]) * a;
            const by = bl[1] + (br[1] - bl[1]) * a;
            const q = [tx + (bx - tx) * b, ty + (by - ty) * b];
            if (p !== undefined) q.push(p);
            return q;
          }),
        });
        break;
      }
      case 'gloss':
        ops.push({ type: 'gloss', v: Number(rest[0]), line: where });
        break;
      case 'weave':
        ops.push({ type: 'weave', v: Number(rest[0]), line: where });
        break;
      case 'rule':
        rule = rest.join(' ');
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
  return { width: size[0], height: size[1], ops, strokes, rule };
}
