// Helpers for `pupil` (the self-set examination): handwriting laid out word by word and written as sung,
// the pen that writes it, hand-drawn circles, a pre-rendered rubber stamp, and the paper-grain pass.
import { strokeText, drawStrokeText, type StrokeText, type StrokeFontName } from '../engine/stroke';
import { Lyrics, type Word } from '../engine/lyrics';
import type { AudioData } from '../engine/audio';
import { F, font } from '../engine/type';
import { SCALE } from '../engine/gl';
import { rgba } from '../engine/palette';
import { clamp, lerp, mulberry32, TAU } from '../engine/util';

export interface P2 { x: number; y: number }

/** Beat times in [t0, t1) from the analysed grid (the tempo drifts: never a fixed period). */
export function beatsIn(au: AudioData, t0: number, t1: number): number[] {
  const out: number[] = [];
  for (let i = Math.ceil(au.beatAt(t0) - 1e-6); out.length < 400; i++) {
    const t = au.timeOfBeat(i);
    if (t >= t1) break;
    if (t >= t0 - 1e-6) out.push(t);
  }
  return out;
}

/** One handwritten word: its stroke text and baseline origin (world px). */
export interface HWord { w: Word; st: StrokeText; x: number; y: number; t0: number; t1: number }

/**
 * Lay out words (or free strings with their own write times) in a stroke font, wrapping at maxW.
 * Rows are balanced: the break goes where the two rows are closest in width.
 */
export function layoutHand(items: { w: Word; t0?: number; t1?: number }[], fontName: StrokeFontName, size: number, x0: number, y0: number, maxW: number, lead: number): HWord[] {
  const sts = items.map((it) => strokeText(it.w.w, fontName, size));
  const sp = size * 0.3;
  const total = sts.reduce((a, s) => a + s.width, 0) + sp * (sts.length - 1);
  let brk = sts.length;
  if (total > maxW) {
    let best = Infinity, acc = 0;
    for (let i = 1; i < sts.length; i++) {
      acc += sts[i - 1]!.width + (i > 1 ? sp : 0);
      const rest = total - acc - sp;
      if (acc <= maxW && rest <= maxW * 1.02 && Math.abs(acc - rest) < best) { best = Math.abs(acc - rest); brk = i; }
    }
    if (brk === sts.length) brk = Math.ceil(sts.length / 2);
  }
  const out: HWord[] = [];
  let x = x0, y = y0;
  items.forEach((it, i) => {
    if (i === brk) { x = x0; y += lead; }
    out.push({ w: it.w, st: sts[i]!, x, y, t0: it.t0 ?? it.w.start, t1: it.t1 ?? it.w.end });
    x += sts[i]!.width + sp;
  });
  return out;
}

/** A free string written between t0 and t1 (not a lyric word): wraps it as a pseudo-word. */
export function freeWord(text: string, t0: number, t1: number): { w: Word; t0: number; t1: number } {
  return { w: { w: text, start: t0, end: t1, line: -1, index: 0, gi: -1 }, t0, t1 };
}

function wordP(h: HWord, t: number) {
  if (h.w.gi >= 0 && h.t0 === h.w.start && h.t1 === h.w.end) return Lyrics.wordProgress(h.w, t);
  return clamp((t - h.t0) / Math.max(1e-3, h.t1 - h.t0));
}

/** Write the words (stroke style set by the caller). Returns the pen head of a word in progress, if any. */
export function drawHand(c: CanvasRenderingContext2D, hw: HWord[], t: number): P2 | null {
  let head: P2 | null = null;
  for (const h of hw) {
    const p = wordP(h, t);
    if (p <= 0) continue;
    c.save();
    c.translate(h.x, h.y);
    const r = drawStrokeText(c, h.st, p * h.st.total);
    c.restore();
    if (p < 1 && r) head = { x: h.x + r.x, y: h.y + r.y };
  }
  return head;
}

/** Where the pen is: on the stroke being written, else gliding from the last word's end to the next start. */
export function penAt(hw: HWord[], t: number): P2 | null {
  if (!hw.length) return null;
  const endOf = (h: HWord): P2 => { const s = h.st.strokes[h.st.strokes.length - 1]; const q = s?.[s.length - 1] ?? { x: h.st.width, y: 0 }; return { x: h.x + q.x, y: h.y + q.y }; };
  const startOf = (h: HWord): P2 => { const q = h.st.strokes[0]?.[0] ?? { x: 0, y: 0 }; return { x: h.x + q.x, y: h.y + q.y }; };
  if (t < hw[0]!.t0) return startOf(hw[0]!);
  for (let i = 0; i < hw.length; i++) {
    const h = hw[i]!;
    const p = wordP(h, t);
    if (p > 0 && p < 1) {
      let len = p * h.st.total, pos: P2 = startOf(h);
      for (let k = 0; k < h.st.strokes.length; k++) {
        const s0 = h.st.startLen[k]!, L = h.st.lens[k]!, pts = h.st.strokes[k]!;
        if (s0 > len) break;
        const rem = len - s0;
        let j = 1;
        while (j < pts.length && L[j]! <= rem) j++;
        const a = pts[Math.min(j - 1, pts.length - 1)]!, b = pts[Math.min(j, pts.length - 1)]!;
        const u = j < pts.length ? (rem - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!) : 1;
        pos = { x: h.x + lerp(a.x, b.x, u), y: h.y + lerp(a.y, b.y, u) };
      }
      return pos;
    }
    const nx = hw[i + 1];
    if (p >= 1 && (!nx || t < nx.t0)) {
      const e = endOf(h);
      if (!nx) return e;
      const s = startOf(nx);
      const u = clamp((t - h.t1) / Math.max(0.05, nx.t0 - h.t1));
      const k = u * u * (3 - 2 * u);
      return { x: lerp(e.x, s.x, k), y: lerp(e.y, s.y, k) - Math.sin(k * Math.PI) * h.st.size * 0.25 };
    }
  }
  return endOf(hw[hw.length - 1]!);
}

/** A writing instrument whose tip is at (x, y): pencil (graphite) or the twin's red pen. */
export function drawPen(c: CanvasRenderingContext2D, x: number, y: number, s: number, kind: 'pencil' | 'red', dark: boolean, alpha = 1) {
  if (alpha <= 0.01) return;
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y); c.rotate(-1.02); c.scale(s, s);
  // soft contact shadow
  c.fillStyle = dark ? 'rgba(0,0,0,0.22)' : 'rgba(10,10,11,0.12)';
  c.beginPath(); c.moveTo(4, 10); c.lineTo(44, 3); c.lineTo(330, 2); c.lineTo(330, 26); c.lineTo(44, 21); c.closePath(); c.fill();
  const body = kind === 'pencil' ? (dark ? rgba('ash') : rgba('ink2')) : rgba('ink');
  const cone = kind === 'pencil' ? (dark ? rgba('bone', 0.8) : rgba('ash')) : rgba('graphite');
  // tip cone
  c.fillStyle = cone;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(40, -9); c.lineTo(40, 9); c.closePath(); c.fill();
  c.fillStyle = kind === 'pencil' ? (dark ? rgba('bone') : rgba('ink')) : rgba('signal');
  c.beginPath(); c.moveTo(0, 0); c.lineTo(12, -2.8); c.lineTo(12, 2.8); c.closePath(); c.fill();
  // body with a highlight facet
  c.fillStyle = body;
  c.fillRect(40, -9, 280, 18);
  c.fillStyle = dark ? rgba('bone', 0.35) : rgba('bone', 0.14);
  c.fillRect(40, -9, 280, 4);
  if (kind === 'red') { c.fillStyle = rgba('signal'); c.fillRect(250, -9.5, 26, 19); }
  else { c.fillStyle = dark ? rgba('bone', 0.5) : rgba('graphite'); c.fillRect(300, -9.5, 20, 19); }
  c.restore();
}

/** Hand-drawn (wobbly, overshooting) ellipse, drawn up to progress p. */
export function handEllipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, p: number, seed: number, turns = 1.12) {
  if (p <= 0) return;
  const n = 72, span = TAU * turns;
  const a0 = -2.2 + seed * 0.7;
  c.beginPath();
  for (let i = 0; i <= n * p; i++) {
    const u = i / n, a = a0 + span * u;
    const g = (turns - 1) / 0.12;
    const wob = 1 + 0.035 * Math.sin(a * 3 + seed * 5) + 0.05 * u * g;
    const px = x + Math.cos(a) * rx * wob, py = y + Math.sin(a) * ry * wob - 6 * u * g;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.stroke();
}

/** A rubber stamp rendered once (with ink voids) to an offscreen canvas; draw it centred. */
export function makeStamp(lines: [string, number][], w: number, h: number, seed = 3): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * SCALE * 1.5); cv.height = Math.round(h * SCALE * 1.5);
  const c = cv.getContext('2d')!;
  c.scale(SCALE * 1.5, SCALE * 1.5);
  c.strokeStyle = rgba('signal'); c.fillStyle = rgba('signal');
  c.lineWidth = 9;
  const r = 18;
  c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, r); c.stroke();
  c.lineWidth = 3;
  c.beginPath(); c.roundRect(20, 20, w - 40, h - 40, r * 0.6); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  let y = 0;
  const tot = lines.reduce((a, [, s]) => a + s * 0.86, 0) + (lines.length - 1) * 14;
  y = h / 2 - tot / 2;
  for (const [s, size] of lines) {
    y += size * 0.86;
    c.font = font(size > 40 ? F.archivo(100, 900) : F.mono(600), size);
    c.letterSpacing = size > 40 ? '4px' : '3px';
    c.fillText(s, w / 2, y);
    y += 14;
  }
  // ink voids and mottling
  const rnd = mulberry32(seed);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) {
    const px = rnd() * w, py = rnd() * h, rr = rnd() ** 3 * 5 + 0.4;
    c.globalAlpha = 0.3 + rnd() * 0.7;
    c.beginPath(); c.arc(px, py, rr, 0, TAU); c.fill();
  }
  c.globalAlpha = 0.22;
  for (let i = 0; i < 40; i++) { c.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 120, 1 + rnd() * 2); }
  return cv;
}

// ------------------------------------------------------------------ paper grain (multiply pass)
export const FRAG_GRAIN = /* glsl */ `
uniform vec3 camA; uniform vec3 camB; uniform float amp; uniform float vig;
float fibres(vec2 p, float cs) {
  float acc = 0.0;
  vec2 cell = floor(p / cs);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 h = hash22(c);
    vec2 o = (c + h) * cs;
    float a = hash12(c + 7.1) * TAU;
    float L = cs * (0.3 + 1.1 * hash12(c + 3.3));
    vec2 d = vec2(cos(a), sin(a));
    float dist = sdSegment(p, o - d * L * 0.5, o + d * L * 0.5);
    acc += (hash12(c + 9.9) - 0.5) * (1.0 - smoothstep(0.25, 1.2, dist));
  }
  return acc;
}
void main() {
  vec2 sp = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  vec2 pp = vec2(dot(camA, vec3(sp, 1.0)), dot(camB, vec3(sp, 1.0)));
  float cloud = fbm(pp * 0.0021, 4);
  float fib = fibres(pp, 22.0) + 0.6 * fibres(pp * 1.7 + 31.0, 22.0);
  float speck = step(0.99965, hash12(floor(pp * 0.5)));
  float g = 1.0 + amp * (0.03 * cloud + 0.05 * fib - 0.3 * speck);
  vec2 dc = vUv - 0.5;
  g *= 1.0 - vig * pow(length(dc * vec2(1.0, 0.85)) * 1.5, 2.6);
  g *= 0.975 + 0.035 * (1.0 - vUv.y * 0.6 - vUv.x * 0.4);
  fragColor = vec4(vec3(g), 1.0);
}`;
