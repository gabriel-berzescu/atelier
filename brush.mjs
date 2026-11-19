/**
 * The brush, the canvas, and the light on the paint.
 *
 * Nothing here decides where a stroke goes. A stroke arrives with its path, its width, its colour and how much paint
 * it carries; this file only works out what a bristle brush would leave behind:
 *
 *   - the brush is a row of hairs, and each hair carries a different amount of paint, so a stroke that is running out
 *     breaks up into streaks before it stops;
 *   - the canvas has a tooth, and a starved hair touches only the high threads;
 *   - a hair that crosses wet paint picks some of it up;
 *   - paint has thickness, and at the end the whole surface is lit from the upper left, so ridges show.
 *
 * No imports: the same file runs under node (to make the picture) and in a browser (to replay it).
 */

const TAU = Math.PI * 2;

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    /** thickness of paint */
    this.t = new Float32Array(n);
    /** the weave: 0 in the hollows between threads, 1 on top of them */
    this.tooth = new Float32Array(n);
    /** 1 where the canvas is covered (frisket): paint does not reach it */
    this.mask = new Uint8Array(n);
    /** 1 where the canvas is to stay bare to the end: lifting the masks does not uncover it */
    this.held = new Uint8Array(n);
    /** how strongly the weave shows where the canvas is bare or thinly painted */
    this.weave = 0.22;
    /** how much thick paint shines where the light catches it */
    this.gloss = 1;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        const weave = 0.2 * Math.cos((x * TAU) / 3.7) * Math.cos((y * TAU) / 3.7);
        const v = 0.5 + weave + 0.5 * (vnoise(x / 2.1, y / 2.1) - 0.5) + 0.25 * (vnoise(x / 9 + 40, y / 9 + 40) - 0.5);
        this.tooth[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }
  }

  /** Tone the whole canvas. */
  ground(c) {
    this.r.fill(c[0]);
    this.g.fill(c[1]);
    this.b.fill(c[2]);
    this.t.fill(0);
  }

  /** Cover a polygon (or, with `outside`, everything but the polygon) so that paint cannot reach it. */
  protect(poly, outside = false) {
    const { w, h } = this;
    const inside = outside ? new Uint8Array(w * h) : this.mask;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of poly) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(h - 1, Math.ceil(y1));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        if (a[1] <= yc !== b[1] <= yc) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k]));
        const xb = Math.min(w, Math.round(xs[k + 1]));
        for (let x = xa; x < xb; x++) inside[y * w + x] = 1;
      }
    }
    if (outside) for (let i = 0; i < w * h; i++) if (!inside[i]) this.mask[i] = 1;
  }

  /** Keep a polygon bare for the whole painting. */
  reserve(poly) {
    const masks = this.mask;
    this.mask = this.held;
    this.protect(poly, false);
    this.mask = masks;
  }

  unprotect() {
    this.mask.fill(0);
  }
}

/** The path of a stroke, as points an even step apart, with the pressure at each. */
function trace(st, ds) {
  let dense;
  if (st.arc) {
    const { cx, cy, r, a0, a1, flip } = st.arc;
    const len = (Math.abs(a1 - a0) * Math.PI * r) / 180;
    const m = Math.max(2, Math.ceil(len / 1.5));
    dense = [];
    for (let i = 0; i <= m; i++) {
      const a = ((a0 + ((a1 - a0) * i) / m) * Math.PI) / 180;
      dense.push([cx - r * Math.sin(a), cy - flip * r * Math.cos(a), 1]);
    }
  } else if (st.pts.length === 2) {
    dense = st.pts.map((p) => [p[0], p[1], p[2] ?? 1]);
  } else {
    // a smooth curve through the given points (Catmull-Rom)
    const P = st.pts.map((p) => [p[0], p[1], p[2] ?? 1]);
    dense = [];
    for (let i = 0; i + 1 < P.length; i++) {
      const p0 = P[Math.max(0, i - 1)];
      const p1 = P[i];
      const p2 = P[i + 1];
      const p3 = P[Math.min(P.length - 1, i + 2)];
      const m = Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
      for (let k = i === 0 ? 0 : 1; k <= m; k++) {
        const t = k / m;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
      }
    }
  }
  let len = 0;
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    len += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    cum.push(len);
  }
  const n = Math.max(2, Math.floor(len / ds) + 1);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const p = new Float32Array(n);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const s = Math.min(len, j * ds);
    while (k + 2 < dense.length && cum[k + 1] < s) k++;
    const span = cum[k + 1] - cum[k];
    const u = span > 0 ? (s - cum[k]) / span : 0;
    x[j] = dense[k][0] + (dense[k + 1][0] - dense[k][0]) * u;
    y[j] = dense[k][1] + (dense[k + 1][1] - dense[k][1]) * u;
    p[j] = dense[k][2] + (dense[k + 1][2] - dense[k][2]) * u;
  }
  // the brush has some spring in it: it never tracks the intended line exactly
  if (st.wob > 0 && n > 2) {
    const so = (st.seed % 1000) * 7.31;
    const amp = st.wob * Math.min(1, len / 60);
    const ox = new Float32Array(n);
    const oy = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const a = Math.max(0, j - 1);
      const b = Math.min(n - 1, j + 1);
      let tx = x[b] - x[a];
      let ty = y[b] - y[a];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const o = amp * ((vnoise((j * ds) / 38 + so, so * 0.37) - 0.5) * 2 + (vnoise((j * ds) / 11 + so * 1.7, 5.1) - 0.5) * 0.5);
      ox[j] = -ty * o;
      oy[j] = tx * o;
    }
    for (let j = 0; j < n; j++) {
      x[j] += ox[j];
      y[j] += oy[j];
    }
  }
  return { x, y, p, n, len };
}

const ramp = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/**
 * Lay one stroke. Returns the rectangle it touched, [x0, y0, x1, y1], or null.
 *
 * st: { pts | arc, c, c2, w, o, f, reach, k, body, hair, soft, ta, tb, p, vary, wob, even, seed }
 */
export function paint(cv, st) {
  const W = cv.w;
  const H = cv.h;
  const soft = Math.max(0.5, st.soft);
  const baseRad = 1.05 * soft;
  const ds = Math.max(0.6, baseRad * 0.55);
  const path = trace(st, ds);
  if (path.len <= 0) return null;
  const rand = rng(st.seed);
  const nb = Math.max(1, Math.round((st.w / (1.5 * Math.max(1, soft * 0.75))) * st.hair));

  const pad = st.w * 0.8 + baseRad * 2 + 4;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let j = 0; j < path.n; j++) {
    if (path.x[j] < x0) x0 = path.x[j];
    if (path.x[j] > x1) x1 = path.x[j];
    if (path.y[j] < y0) y0 = path.y[j];
    if (path.y[j] > y1) y1 = path.y[j];
  }
  x0 = Math.max(0, Math.floor(x0 - pad));
  y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(W, Math.ceil(x1 + pad));
  y1 = Math.min(H, Math.ceil(y1 + pad));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return null;
  const A = new Float32Array(bw * bh);
  const SW = new Float32Array(bw * bh);
  const SR = new Float32Array(bw * bh);
  const SG = new Float32Array(bw * bh);
  const SB = new Float32Array(bw * bh);
  const HT = new Float32Array(bw * bh);

  // the hairs
  const reachBase = st.reach > 0 ? st.reach : st.f > 0 ? st.f * path.len : 0;
  const off = new Float32Array(nb);
  const lag = new Float32Array(nb);
  const reach = new Float32Array(nb);
  const thick = new Float32Array(nb);
  const rad = new Float32Array(nb);
  const cr = new Float32Array(nb);
  const cg = new Float32Array(nb);
  const cb = new Float32Array(nb);
  const amt = new Float32Array(nb);
  const drift = (st.seed % 977) * 0.713;
  const mixAt = rand() * 100;
  for (let i = 0; i < nb; i++) {
    const u = nb === 1 ? 0 : i / (nb - 1) - 0.5;
    off[i] = (u + ((rand() - 0.5) * 0.7) / nb) * st.w;
    lag[i] = (rand() - 0.5) * Math.min(st.w * 0.3, 14);
    reach[i] = reachBase * (0.5 + 0.65 * rand());
    thick[i] = 0.4 + 0.6 * rand();
    thick[i] += (1 - thick[i]) * (st.even || 0) * 0.75;
    rad[i] = baseRad * (0.8 + 0.45 * rand());
    amt[i] = 0.68 + 0.32 * rand();
    amt[i] += (1 - amt[i]) * (st.even || 0);
    let m = 0;
    if (st.c2) m = ramp(vnoise(i / Math.max(2, nb / 5) + mixAt, 3.3) * 1.6 - 0.3);
    const light = 1 + st.vary * (rand() - 0.5) * 2;
    const c2 = st.c2 || st.c;
    cr[i] = Math.min(1, (st.c[0] + (c2[0] - st.c[0]) * m) * light * (1 + st.vary * (rand() - 0.5) * 0.5));
    cg[i] = Math.min(1, (st.c[1] + (c2[1] - st.c[1]) * m) * light * (1 + st.vary * (rand() - 0.5) * 0.5));
    cb[i] = Math.min(1, (st.c[2] + (c2[2] - st.c[2]) * m) * light * (1 + st.vary * (rand() - 0.5) * 0.5));
  }

  const taLen = st.ta * path.len;
  const tbLen = st.tb * path.len;
  for (let j = 0; j < path.n; j++) {
    const ja = Math.max(0, j - 1);
    const jb = Math.min(path.n - 1, j + 1);
    let tx = path.x[jb] - path.x[ja];
    let ty = path.y[jb] - path.y[ja];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const s = j * ds;
    let env = 1;
    if (taLen > 0) env *= ramp(s / taLen);
    if (tbLen > 0) env *= ramp((path.len - s) / tbLen);
    const press = st.p * path.p[j] * env;
    if (press <= 0.01) continue;
    const pc = press > 1 ? 1 : press;
    const spread = Math.min(1.2, 0.18 + 0.82 * press);
    for (let i = 0; i < nb; i++) {
      const rem = reach[i] > 0 ? 1 - s / reach[i] : 1;
      if (rem <= 0) continue;
      const wet = rem * 2 > 1 ? 1 : rem * 2;
      const wander = nb > 1 ? (vnoise(s / 26 + i * 13.7, drift) - 0.5) * 1.7 * soft : 0;
      const across = off[i] * spread + wander;
      const qx = path.x[j] - ty * across + tx * lag[i];
      const qy = path.y[j] + tx * across + ty * lag[i];
      // crossing wet paint, a hair picks some of it up
      if (st.k > 0) {
        const ix = qx | 0;
        const iy = qy | 0;
        if (ix >= 0 && iy >= 0 && ix < W && iy < H) {
          const ci = iy * W + ix;
          const tt = cv.t[ci];
          if (tt > 0.03) {
            const rate = Math.min(0.5, ((st.k * ds) / 30) * Math.min(1, tt / 0.3));
            cr[i] += (cv.r[ci] - cr[i]) * rate;
            cg[i] += (cv.g[ci] - cg[i]) * rate;
            cb[i] += (cv.b[ci] - cb[i]) * rate;
          }
        }
      }
      const a0 = st.o * pc * amt[i] * (0.25 + 0.75 * wet);
      const thr = (1 - wet) * 0.8 + (1 - pc) * 0.25;
      const th = thick[i] * st.body * (0.35 + 0.65 * wet) * pc;
      const R = rad[i];
      const inner = R * 0.5;
      const xa = Math.max(x0, Math.floor(qx - R));
      const xb = Math.min(x1 - 1, Math.ceil(qx + R));
      const ya = Math.max(y0, Math.floor(qy - R));
      const yb = Math.min(y1 - 1, Math.ceil(qy + R));
      for (let yy = ya; yy <= yb; yy++) {
        for (let xx = xa; xx <= xb; xx++) {
          const d = Math.hypot(xx + 0.5 - qx, yy + 0.5 - qy);
          if (d >= R + 0.5) continue;
          let a = d <= inner ? a0 : a0 * (1 - (d - inner) / (R + 0.5 - inner));
          if (thr > 0) a *= ramp((cv.tooth[yy * W + xx] - thr + 0.12) / 0.24);
          if (a < 0.004) continue;
          const bi = (yy - y0) * bw + (xx - x0);
          if (a > A[bi]) A[bi] = a;
          SW[bi] += a;
          SR[bi] += a * cr[i];
          SG[bi] += a * cg[i];
          SB[bi] += a * cb[i];
          const hh = (a / (st.o * amt[i])) * th;
          if (hh > HT[bi]) HT[bi] = hh;
        }
      }
    }
  }

  for (let yy = 0; yy < bh; yy++) {
    for (let xx = 0; xx < bw; xx++) {
      const bi = yy * bw + xx;
      const a = A[bi];
      if (a <= 0) continue;
      const ci = (yy + y0) * W + xx + x0;
      if (cv.mask[ci] || cv.held[ci]) continue;
      const w = SW[bi];
      cv.r[ci] += (SR[bi] / w - cv.r[ci]) * a;
      cv.g[ci] += (SG[bi] / w - cv.g[ci]) * a;
      cv.b[ci] += (SB[bi] / w - cv.b[ci]) * a;
      cv.t[ci] = cv.t[ci] * (1 - 0.55 * a) + HT[bi];
    }
  }
  return [x0, y0, x1, y1];
}

// the light that falls on the finished surface: from the upper left, a little in front
const LX = -0.4;
const LY = -0.5;
const LZ = 0.768;
const HL = Math.hypot(LX, LY, LZ + 1);
const HX = LX / HL;
const HY = LY / HL;
const HZ = (LZ + 1) / HL;
const FLAT = Math.pow(HZ, 40);

/** Turn paint into a picture: colour, shaded by the relief of the paint and of the weave. Writes RGBA bytes. */
export function develop(cv, out, x0 = 0, y0 = 0, x1 = cv.w, y1 = cv.h, relief = 1) {
  const W = cv.w;
  const H = cv.h;
  const t = cv.t;
  const tooth = cv.tooth;
  const weave = cv.weave;
  const hgt = (i) => t[i] * 1.5 + (tooth[i] * weave) / (1 + t[i] * 5);
  for (let y = y0; y < y1; y++) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y < H - 1 ? y + 1 : y;
    for (let x = x0; x < x1; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < W - 1 ? x + 1 : x;
      const i = y * W + x;
      const gx = (hgt(ym * W + xp) + 2 * hgt(y * W + xp) + hgt(yp * W + xp) - hgt(ym * W + xm) - 2 * hgt(y * W + xm) - hgt(yp * W + xm)) / 8;
      const gy = (hgt(yp * W + xm) + 2 * hgt(yp * W + x) + hgt(yp * W + xp) - hgt(ym * W + xm) - 2 * hgt(ym * W + x) - hgt(ym * W + xp)) / 8;
      let nx = -gx * relief;
      let ny = -gy * relief;
      const nl = Math.hypot(nx, ny, 1);
      nx /= nl;
      ny /= nl;
      const nz = 1 / nl;
      const diff = (nx * LX + ny * LY + nz * LZ) / LZ;
      let shade = 0.55 + 0.45 * diff;
      if (shade < 0.4) shade = 0.4;
      const sd = nx * HX + ny * HY + nz * HZ;
      const spec = sd > 0 ? Math.max(0, Math.pow(sd, 40) - FLAT) * 0.55 * cv.gloss * Math.min(1, t[i] * 1.5) : 0;
      const o = (y * W + x) * 4;
      out[o] = (cv.r[i] * shade + spec) * 255 + 0.5;
      out[o + 1] = (cv.g[i] * shade + spec) * 255 + 0.5;
      out[o + 2] = (cv.b[i] * shade + spec) * 255 + 0.5;
      out[o + 3] = 255;
    }
  }
}
