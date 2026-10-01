// Helpers for `mask` (the shadow play): the mask with performed expressions (as a backlit silhouette
// or as the lit bone object), the thing that holds it (a tangle of tapering tubes, as a shadow), the prize
// rosette, pinned paper slips, the chat reply's Regenerate button and cursor (the outro's look), and the
// screen shader (a paper screen lit from behind, or a dark screen with a pool of front light).
import { MASK } from './_motifs';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, lerp, TAU } from '../engine/util';

export interface Expr {
  /** 0 = the canonical smile, 1 = flattened into concern (a hint of a frown past 1). */
  flat: number;
  /** Smile width multiplier (1 = canonical 25°..155°). */
  span: number;
  /** Tear: 0..1 size, side (-1 left eye, +1 right eye), how far it has run down (mask units). */
  tear: number; tearSide: number; tearRun: number;
}
export const NEUTRAL: Expr = { flat: 0, span: 1, tear: 0, tearSide: 1, tearRun: 0 };

/** Points of the smile curve in mask units (y down). */
export function smilePts(e: Expr, n = 28): { x: number; y: number }[] {
  const mid = Math.PI / 2, half = ((MASK.smileA1 - MASK.smileA0) / 2) * e.span;
  const a0 = mid - half, a1 = mid + half;
  const yEnd = MASK.smileCY + Math.sin(a0) * MASK.smileR;
  const k = 1 - 1.25 * e.flat;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    const x = Math.cos(a) * MASK.smileR, y = MASK.smileCY + Math.sin(a) * MASK.smileR;
    out.push({ x, y: yEnd + (y - yEnd) * k });
  }
  return out;
}

/** Tear position (mask units) or null. */
export function tearAt(e: Expr): { x: number; y: number; r: number } | null {
  if (e.tear <= 0.01) return null;
  return { x: e.tearSide * (MASK.eyeX + 0.02), y: MASK.eyeY + 0.17 + e.tearRun, r: 0.05 * e.tear };
}

function tearPath(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.moveTo(x, y - r * 2.4);
  c.bezierCurveTo(x + r * 0.35, y - r * 1.2, x + r, y - r * 0.6, x + r, y);
  c.arc(x, y, r, 0, Math.PI);
  c.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.35, y - r * 1.2, x, y - r * 2.4);
  c.fill();
}

/**
 * The mask. `lit`: the bone object with ink features (front light); otherwise a silhouette held
 * against the screen: an ink disc whose eye holes and smile let the lamp through (`hole` colour).
 */
export function drawMaskX(c: CanvasRenderingContext2D, x: number, y: number, R: number, rot: number, e: Expr, lit: boolean, o: { hole?: string; alpha?: number } = {}) {
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.globalAlpha *= o.alpha ?? 1;
  if (lit) {
    c.fillStyle = rgba('bone');
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    // a soft terminator on the far side from the key light (upper right)
    const g = c.createRadialGradient(R * 0.35, -R * 0.4, R * 0.2, 0, 0, R * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  } else {
    c.fillStyle = 'rgba(10,10,11,0.99)';
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  }
  const ink = lit ? rgba('ink') : (o.hole ?? 'rgb(255,238,214)');
  c.fillStyle = ink;
  for (const s of [-1, 1]) { c.beginPath(); c.arc(s * MASK.eyeX * R, MASK.eyeY * R, MASK.eyeR * R, 0, TAU); c.fill(); }
  c.strokeStyle = ink; c.lineWidth = MASK.smileW * R; c.lineCap = 'round'; c.lineJoin = 'round';
  const pts = smilePts(e);
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x * R, p.y * R) : c.moveTo(p.x * R, p.y * R)));
  c.stroke();
  const tr = tearAt(e);
  if (tr) tearPath(c, tr.x * R, tr.y * R, tr.r * R);
  c.restore();
}

// ------------------------------------------------------------------ the holder (a shadow of tubes)
/** Filled silhouette of the thing behind the mask: a body and tapering tubes, `grow` 0..1(+). */
export function drawThing(c: CanvasRenderingContext2D, x: number, y: number, R: number, grow: number, t: number, seed: number) {
  if (grow <= 0.001) return;
  c.save();
  c.translate(x, y);
  const NT = 17;
  for (let i = 0; i < NT; i++) {
    const h = (k: number) => { const s = Math.sin((i + 1) * 12.9898 + k * 78.233 + seed * 3.1) * 43758.5453; return s - Math.floor(s); };
    // a knot of tubes all round, heavier upward and to the sides; a few fat lobes, many thin reaches
    const base = -Math.PI / 2 + (h(1) - 0.5) * TAU * 0.92;
    const fat = h(7) < 0.14;
    const len = R * (fat ? 0.8 + 0.6 * h(2) : 1.3 + 2.3 * Math.pow(h(2), 1.2)) * clamp(grow * (1.15 - 0.4 * h(3)), 0, 1.4);
    const curl = (h(4) - 0.5) * (fat ? 2 : 5.5);
    const w0 = R * (fat ? 0.28 + 0.1 * h(5) : 0.1 + 0.12 * h(5));
    const n = 24;
    const L: { x: number; y: number }[] = [], Rt: { x: number; y: number }[] = [];
    let px = Math.cos(base) * R * 0.55, py = Math.sin(base) * R * 0.55, a = base;
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      const w = w0 * Math.pow(1 - s, fat ? 0.6 : 1.1) + 1.2;
      const nx = -Math.sin(a), ny = Math.cos(a);
      L.push({ x: px + nx * w, y: py + ny * w }); Rt.push({ x: px - nx * w, y: py - ny * w });
      a += (curl / n) * (0.4 + 1.4 * s) + (0.9 * Math.sin(t * (0.8 + h(6)) + i * 1.7 + s * 4)) / n;
      px += Math.cos(a) * (len / n); py += Math.sin(a) * (len / n);
    }
    c.beginPath();
    L.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    for (let k = Rt.length - 1; k >= 0; k--) c.lineTo(Rt[k]!.x, Rt[k]!.y);
    c.closePath(); c.fill();
  }
  // the body (lumpy)
  c.beginPath();
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * TAU;
    const r = R * (0.72 + 0.06 * Math.sin(a * 5 + seed) + 0.04 * Math.sin(a * 9 - t * 0.8)) * Math.min(1, 0.4 + grow);
    k ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath(); c.fill();
  c.restore();
}

// ------------------------------------------------------------------ the prize
export function drawRosette(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, fill: string, text: string, label = '+1') {
  c.save();
  c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = fill;
  // ribbon tails
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.moveTo(sd * 14, 20); c.lineTo(sd * 46, 118); c.lineTo(sd * 30, 108); c.lineTo(sd * 22, 126); c.lineTo(sd * -6, 30); c.closePath(); c.fill();
  }
  // scalloped disc
  c.beginPath();
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * TAU;
    const r = 62 + 5 * Math.cos(a * 16);
    k ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.fill();
  c.strokeStyle = text; c.lineWidth = 2.5;
  c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.stroke();
  c.fillStyle = text; c.font = font(F.archivo(87.5, 900), 40); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, 0, 2);
  c.restore();
}

// ------------------------------------------------------------------ slips of paper
export function drawSlip(c: CanvasRenderingContext2D, x: number, y: number, rot: number, text: string, o: { size?: number; paper: string; ink: string; shadow?: string; pin?: string; alpha?: number }) {
  const size = o.size ?? 22;
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.globalAlpha *= o.alpha ?? 1;
  c.font = font(F.mono(500), size); c.letterSpacing = '0px';
  const w = c.measureText(text).width + size * 1.4, h = size * 2.5;
  if (o.shadow) { c.fillStyle = o.shadow; c.fillRect(-w / 2 - 10, -h / 2 + 12, w, h); }
  c.fillStyle = o.paper; c.fillRect(-w / 2, -h / 2, w, h);
  c.fillStyle = o.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 0, size * 0.18);
  if (o.pin) { c.fillStyle = o.pin; c.beginPath(); c.arc(0, -h / 2 + 7, 3.5, 0, TAU); c.fill(); }
  c.restore();
}

// ------------------------------------------------------------------ UI (as the outro)
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
export function drawCursor(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y); c.scale(1.4 * s, 1.4 * s);
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(0, 17); c.lineTo(4.2, 13); c.lineTo(7.2, 19.5); c.lineTo(9.6, 18.4); c.lineTo(6.7, 12.2); c.lineTo(12.3, 12.2); c.closePath();
  c.fillStyle = rgba('bone'); c.fill();
  c.lineWidth = 1; c.strokeStyle = rgba('ink'); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ the screen
export const FRAG_SCREEN = /* glsl */ `
uniform vec3 camA; uniform vec3 camB;
uniform float mode;      // 0: paper screen lit from behind; 1: dark screen, a pool of front light
uniform vec2 lamp; uniform float lampI; uniform float poolR; uniform float lampR;
float fibres(vec2 p, float cs) {
  float acc = 0.0;
  vec2 cell = floor(p / cs);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 o = (c + hash22(c)) * cs;
    float a = hash12(c + 7.1) * TAU;
    float L = cs * (0.3 + 1.1 * hash12(c + 3.3));
    vec2 d = vec2(cos(a), sin(a));
    acc += (hash12(c + 9.9) - 0.5) * (1.0 - smoothstep(0.25, 1.2, sdSegment(p, o - d * L * 0.5, o + d * L * 0.5)));
  }
  return acc;
}
void main() {
  vec2 sp = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  vec2 p = vec2(dot(camA, vec3(sp, 1.0)), dot(camB, vec3(sp, 1.0)));
  float fib = fibres(p, 26.0) + 0.5 * fibres(p * 1.9 + 17.0, 26.0);
  float cloud = fbm(p * 0.0018, 4);
  float d = length(p - lamp);
  vec3 col;
  if (mode < 0.5) {
    // translucent paper, the lamp behind it: a broad glow and a warm core, the weave in the light
    float glow = 0.26 + 0.66 * exp(-d * d / (2.0 * lampR * lampR));
    float core = exp(-d * d / (2.0 * pow(lampR * 0.33, 2.0)));
    col = C_BONE * glow + C_EMBER * 0.1 * core;
    col *= 1.0 + 0.06 * fib + 0.05 * cloud;
    col *= lampI;
    // the lamp's direct flare through the paper (the only thing that blooms)
    col += C_EMBER * 0.5 * pow(core, 5.0) * lampI;
  } else {
    // dark cloth screen; a hard-edged pool of front light with a soft penumbra
    float pool = 1.0 - smoothstep(poolR * 0.93, poolR * 1.02, d);
    float fall = 0.72 + 0.28 * exp(-d * d / (2.0 * pow(poolR * 0.6, 2.0)));
    vec3 lit = mix(C_ASH, C_BONE, 0.25) * 0.42 * fall;
    col = C_INK * 1.1 + lit * pool * lampI;
    col *= 1.0 + 0.05 * fib + 0.04 * cloud;
    // a thin warm rim at the pool's edge (the lens of the lamp)
    col += C_EMBER * 0.05 * (smoothstep(poolR * 0.9, poolR, d) - smoothstep(poolR, poolR * 1.03, d)) * lampI;
  }
  vec2 dc = vUv - 0.5;
  col *= 1.0 - 0.22 * pow(length(dc * vec2(1.0, 0.8)) * 1.5, 2.4);
  fragColor = vec4(col, 1.0);
}`;
