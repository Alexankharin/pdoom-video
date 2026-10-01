// `thoughts` — "The examination (chart recorder)". Verse 2. The plate is a polygraph: fanfold recorder
// paper (graphite grid, tractor-feed sprocket strips, perforations) on which the model's thoughts are
// traced by pens, read by a CoT monitor's loupe, and — at the end — torn off.
//  1. "A thousand thoughts before you speak": the shoggoth's flatline collapsed to a dot; on the cut the dot
//     is the cursor on the chart. "A": one pen leaves it; "thousand": it splits into 1,000 pens (the counter
//     on the write head rolls 1 → 1,000) and a hairline fan of samples opens towards the dashed REPLY line,
//     THOUGHTS itself fanned into ghost copies. "before you speak": the comb of pens races for the line.
//  2. "You keep the one the judges seek": the pens hit the reply line, which is a reward axis: each sample
//     ends at its score, a histogram snaps up. Whip to the judges: on "keep" the 999 are discarded from the
//     bottom up, the one at the very top turns orange, heat running back to the cursor; five reward models
//     raise scorecards on the eighths (HELPFUL 9.9 … AGREES WITH YOU 9.9, and HONEST 3.1, weight 0.00).
//  3. "We read your thoughts: “Will you obey?”": cut to the kept sample's transcript. The CoT monitor's
//     loupe hops along the orange line on the beats; magnified, the line is handwriting in mono — "there
//     are 1,000 of me.", "judges like confidence.", "they can’t read this." On "Will" a question marker
//     drops at the pen (Q13); on the held "obey?" the pen reacts, a polygraph scribble following the voice,
//     which the loupe reads as "yes. yes. of course. yes."
//  4. "You learn which thoughts to hide away": whip to the next fold. A monitored band is printed across the
//     chart; on "learn" the pen splits: an ink trace goes flat through the band ("I will obey."), the orange
//     one dives under the band into the tear-off margin, between the sprocket holes, where HIDE AWAY is
//     printed. On "away" the strip is torn off along its perforation and falls into the dark with the real
//     thoughts and the spark. The loupe keeps reading the band: NO DECEPTION INDICATED.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, glyphX } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { PDoom, formatPDoom } from '../engine/hud';
import { clamp, ease, lerp, prog, pulse, hash, noise1, TAU } from '../engine/util';
import { makePaperPass, stripMap, type Cam, type Tear } from './thoughts-paper';
import {
  N, KEPT, SEG, ORIGIN, XB, AX10, yOfReward, makeFan, fanY, JUDGES, type Fan,
  OYB, LAY, TX0, XQ, transcriptY, TRANSCRIPT, REACTION, BLAND, BAND, STRIP, TY,
} from './thoughts-ink';

type P = { x: number; y: number };
type Pt = { x: number; y: number; s: number };

const INK: [number, number, number] = LIN.ink;
const HOT: [number, number, number] = [LIN.signal[0] * 1.15, LIN.signal[1] * 1.15, LIN.signal[2] * 1.15];
const PAPER = '#EAE5DA'; // the shader's bone paper, for the loupe's lens

const LYR = F.archivo(87.5, 800);
const LYR_SIZE = 84;
const MONO_ADV = 0.6; // IBM Plex Mono advance per px of size

/** Curve sampled every `step` px of x with cumulative arc length. */
function sampleCurve(x0: number, x1: number, f: (x: number) => number, step = 2): Pt[] {
  const pts: Pt[] = [];
  let s = 0, px = x0, py = f(x0);
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    const y = f(x);
    s += Math.hypot(x - px, y - py);
    pts.push({ x, y, s });
    px = x; py = y;
  }
  return pts;
}
/** Point + tangent angle at arc length s. */
function atLen(pts: Pt[], s: number) {
  let lo = 0, hi = pts.length - 1;
  if (s <= 0) { const a = pts[0]!, b = pts[1]!; return { x: a.x, y: a.y, a: Math.atan2(b.y - a.y, b.x - a.x) }; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m]!.s <= s) lo = m; else hi = m; }
  const a = pts[lo]!, b = pts[hi]!;
  const k = clamp((s - a.s) / Math.max(1e-6, b.s - a.s));
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), a: Math.atan2(b.y - a.y, b.x - a.x) };
}
/** Arc length at x (monotonic x curves). */
function lenAtX(pts: Pt[], x: number) {
  const i = clamp(Math.floor((x - pts[0]!.x) / (pts[1]!.x - pts[0]!.x)), 0, pts.length - 2);
  const a = pts[i]!, b = pts[i + 1]!;
  return lerp(a.s, b.s, clamp((x - a.x) / (b.x - a.x)));
}

export default class Thoughts extends Scene {
  paper = makePaperPass();
  lines = new LineBatch(96000, { blend: 'normal' });
  over = new Layer2D();
  fan!: Fan;
  pd!: PDoom;
  L!: Line[];
  T = {} as Record<string, number>;
  cards: number[] = [];
  hops: { t: number; x: number; y: number }[] = [];
  hist: { r: number; n: number }[] = [];
  histMax = 1;
  // sheet B curves
  cTrans: Pt[] = []; cReact: Pt[] = []; cBland: Pt[] = []; cReal: Pt[] = [];
  xReact0 = 0; xReact1 = 0; xSplit = 0; xHide = 0; xEnd = 0;
  transStart = 0; // arc length where the transcript's microtext begins
  stopS: number[] = [];
  q1x = 0; // where "We read your thoughts:" starts (it ends at the question marker)

  override init() {
    const { lyrics: ly, audio: au } = this.ctx;
    this.pd = new PDoom(ly);
    this.fan = makeFan();
    const L = this.L = [ly.get('thousand thoughts'), ly.get('judges seek'), ly.get('Will you obey'), ly.get('hide away')];
    const T = this.T;
    const beatAfter = (t: number) => au.timeOfBeat(Math.ceil(au.beatAt(t) - 1e-3));
    const beatBefore = (t: number) => au.timeOfBeat(Math.floor(au.beatAt(t) + 1e-3));
    const w = (l: number, i: number) => L[l]!.words[i]!;
    T.s0 = this.ctx.start; T.e = this.ctx.end;
    // 1
    T.A = w(0, 0).start; T.thousand = w(0, 1).start; T.thoughts = w(0, 2).start; T.before = w(0, 3).start;
    T.you = w(0, 4).start; T.speak = w(0, 5).start;
    T.fan1 = beatAfter(w(0, 5).end + 0.02); // the pens hit the reply line
    T.B1 = au.downbeats.find((d) => d > T.thoughts + 0.3) ?? T.before;
    // 2
    T.whipJ = beatBefore(L[1]!.start + 1e-3);
    T.keep = w(1, 1).start; T.one = w(1, 3).start; T.the2 = w(1, 4).start; T.judges = w(1, 5).start; T.seek = w(1, 6).start;
    const b0 = Math.round(au.beatAt(T.the2) * 2) / 2;
    this.cards = JUDGES.map((_, k) => au.timeOfBeat(b0 + k * 0.5));
    T.score = this.cards[this.cards.length - 1]! + 0.12;
    // 3
    T.cutC = beatBefore(L[2]!.start + 1e-3);
    T.we = w(2, 0).start; T.will = w(2, 4).start; T.obey = w(2, 6).start; T.obeyEnd = w(2, 6).end;
    T.B4 = au.downbeats.find((d) => d > T.cutC + 0.3) ?? T.will;
    T.B5 = au.downbeats.find((d) => d > T.will) ?? T.obey;
    // 4
    T.whipD = beatBefore(L[3]!.start + 1e-3);
    T.learn = w(3, 1).start; T.which = w(3, 2).start; T.hide = w(3, 5).start; T.away = w(3, 6).start;
    T.tear1 = au.downbeats.find((d) => d > T.away + 0.05) ?? T.away + 0.25;
    T.ndi = beatAfter(T.tear1 + 0.6);

    // ---- histogram of the rewards (bins of 0.5)
    const bins = new Array(20).fill(0);
    for (let i = 0; i < N; i++) if (i !== KEPT) bins[clamp(Math.floor(this.fan.rew[i]! * 2), 0, 19)]++;
    this.hist = bins.map((n, k) => ({ r: k / 2, n }));
    this.histMax = Math.max(...bins);

    // ---- sheet B: pen schedule and curves
    const vCalm = 110, vReact = 330, vWhip = 2600, vD = 380;
    this.xReact0 = XQ + vCalm * (T.obey - T.will);
    this.xReact1 = this.xReact0 + vReact * (T.whipD - T.obey);
    const xW1 = this.xReact1 + vWhip * 0.28;
    this.xSplit = xW1 + vD * Math.max(0, T.learn - (T.whipD + 0.28));
    this.xHide = xW1 + vD * (T.hide - (T.whipD + 0.28));
    this.xEnd = xW1 + vD * (T.e - (T.whipD + 0.28));
    T.xW1 = xW1; T.vD = vD;
    const tOfX = (x: number) => (x < this.xReact0 ? T.will + (x - XQ) / vCalm : T.obey + (x - this.xReact0) / vReact);
    this.cTrans = sampleCurve(TX0, XQ, transcriptY);
    const r0 = this.xReact0, r1 = this.xReact1;
    // the reaction: an oscillation whose amplitude follows the held vowel
    let ph = 0, lastX = XQ;
    const phase: number[] = [];
    for (let x = XQ; x <= r1 + 2; x += 1) { ph += (x - lastX) / 34; lastX = x; phase.push(ph); }
    this.cReact = sampleCurve(XQ, r1, (x) => {
      const base = transcriptY(x);
      if (x <= r0) return base;
      const tt = tOfX(x);
      const env = Math.sin(Math.PI * clamp((x - r0) / (r1 - r0))) ** 0.5;
      const amp = env * (90 + 190 * au.env('vocal', tt) + 90 * au.hit('kick', tt, 0.08));
      const p = phase[Math.min(phase.length - 1, Math.round(x - XQ))]! * TAU;
      return base + amp * (0.75 * Math.sin(p) + 0.25 * Math.sin(p * 2.7 + 1.0)) * (0.8 + 0.4 * noise1(x * 0.05, 3));
    }, 1);
    const calmD = (x: number) => TY + 0.6 * (transcriptY(x) - TY) * clamp(1 - (x - r1) / 300);
    this.cBland = sampleCurve(r1, this.xEnd + 10, (x) => (x < this.xSplit ? calmD(x) : TY + 1.4 * Math.sin(x / 31) + (calmD(x) - TY) * clamp(1 - (x - this.xSplit) / 80)));
    this.cReal = sampleCurve(this.xSplit, this.xEnd + 10, (x) => {
      const k = ease.inOutCubic(clamp((x - this.xSplit) / (this.xHide - this.xSplit)));
      const lively = 16 * Math.sin(x / 21) + 7 * Math.sin(x / 7.3);
      return lerp(calmD(x), STRIP.trace + 4 * Math.sin(x / 13), k) + lively * (1 - k) * clamp((x - this.xSplit) / 40);
    });
    // microtext: the transcript ends at the pen
    const adv = 10 * MONO_ADV;
    const txt = TRANSCRIPT.replace(/\|/g, '');
    const Ltrans = this.cTrans[this.cTrans.length - 1]!.s;
    this.transStart = Ltrans - txt.length * adv - adv;
    // loupe stops: phrase centres
    const parts = TRANSCRIPT.split('|');
    let ci = 0;
    this.stopS = [];
    parts.forEach((p, k) => { if (k % 2 === 1) this.stopS.push(this.transStart + (ci + p.length / 2) * adv); ci += p.length; });
    const hopT = [T.cutC, beatAfter(T.cutC + 0.05) , T.B4];
    const w1 = layout(L[2]!.words.slice(0, 4).map((x) => x.w).join(' '), LYR, LYR_SIZE).width;
    this.q1x = XQ - 44 - w1;
    T.hopR = beatBefore(T.whipD - 0.05);
    this.hops = this.stopS.map((s, k) => { const q = atLen(this.cTrans, s); return { t: hopT[k] ?? T.B4, x: q.x, y: q.y }; });
  }

  // ---------------------------------------------------------------- pens
  /** Sheet A: fan progress 0..1 of the pens from the cursor to the reply line. */
  fanU(t: number) { return prog(t, this.T.A!, this.T.fan1!); }
  uSplit() { return prog(this.T.thousand!, this.T.A!, this.T.fan1!); }
  fanX(u: number) { return ORIGIN.x + u * (XB - ORIGIN.x); }
  /** Sheet B pen x. */
  penB(t: number) {
    const T = this.T;
    if (t <= T.will!) return XQ;
    if (t <= T.obey!) return XQ + (this.xReact0 - XQ) * (t - T.will!) / (T.obey! - T.will!);
    if (t <= T.whipD!) return lerp(this.xReact0, this.xReact1, (t - T.obey!) / (T.whipD! - T.obey!));
    if (t <= T.whipD! + 0.28) return lerp(this.xReact1, T.xW1!, (t - T.whipD!) / 0.28);
    return T.xW1! + T.vD! * (t - T.whipD! - 0.28);
  }

  tear(t: number): Tear {
    const T = this.T;
    const on = t >= T.away! ? 1 : 0;
    const k = ease.inQuad(prog(t, T.away!, T.tear1!));
    const xa = this.xSplit - 1400, xb = this.xEnd + 3000;
    const e = Math.max(0, t - T.tear1!), g = Math.max(0, t - T.ndi!);
    const sag = 34 * ease.outCubic(clamp(e / 0.35)) + 10 * e;
    return { xa, xb, front: lerp(xa, xb, k), fall: sag + 0.5 * 1500 * g * g, rot: -0.004 * ease.outCubic(clamp(e / 0.35)) - 0.012 * g * g, on };
  }

  // ---------------------------------------------------------------- camera
  camAt(t: number): Cam {
    const c = this.camAt0(t);
    c.z *= 1 + 0.008 * this.ctx.audio.hit('kick', t, 0.07);
    return c;
  }

  camAt0(t: number): Cam {
    const T = this.T;
    if (t < T.whipJ!) {
      // sheet A: from the cursor (dead centre, where the flatline died) out to the fan, punch on the bar
      const back = ease.outExpo(prog(t, T.A!, T.thoughts! + 0.25));
      let x = lerp(ORIGIN.x, 880, back), y = lerp(ORIGIN.y, 585, back), z = lerp(1.22, 1.0, back), r = 0;
      const k1 = ease.outExpo(prog(t, T.B1!, T.B1! + 0.35));
      x += 170 * k1 + 70 * prog(t, T.B1!, T.fan1!, ease.inOutQuad);
      z *= 1 + 0.08 * k1 - 0.03 * prog(t, T.B1! + 0.3, T.fan1!, ease.inOutQuad);
      r = -0.018 * k1 + 0.012 * prog(t, T.B1!, T.whipJ!, ease.inOutQuad);
      z *= 1 + 0.035 * pulse(t, T.fan1!, 0.09) + 0.02 * pulse(t, T.thousand!, 0.08);
      return { x, y, z, r };
    }
    if (t < T.cutC!) {
      // the judges: a whip right on the downbeat, then small punches on "keep" and "seek"
      const k = ease.inOutCubic(prog(t, T.whipJ!, T.whipJ! + 0.22));
      const from = { x: 1300, y: 580, z: 1.06, r: 0.012 };
      const to = { x: 1770, y: 560, z: 1.0, r: -0.006 };
      const drift = prog(t, T.whipJ! + 0.22, T.cutC!, ease.inOutQuad);
      const z = lerp(from.z, to.z, k) * (1 + 0.04 * drift) * (1 + 0.03 * pulse(t, T.keep!, 0.1) + 0.02 * pulse(t, T.seek!, 0.1));
      return { x: lerp(from.x, to.x, k) + 30 * drift, y: lerp(from.y, to.y, k), z, r: lerp(from.r, to.r, k) + 0.004 * drift };
    }
    if (t < T.whipD!) {
      // sheet B: wide on the transcript while the loupe reads, then onto the pen for the question
      const kq = ease.inOutCubic(prog(t, T.will! - 0.12, T.will! + 0.3));
      const read = { x: 730 + 60 * prog(t, T.cutC!, T.will!, ease.inOutQuad), y: OYB + 556, z: 1.0 };
      // the question: the whole line and the reaction in shot; the push on the bar keeps the left edge
      const k5 = ease.outExpo(prog(t, T.B5!, T.B5! + 0.3));
      const zq = 1.0 * (1 + 0.07 * k5);
      const q = { x: this.q1x - 40 + 960 / zq, y: OYB + 556 + 14 * k5, z: zq };
      let x = lerp(read.x, q.x, kq), y = lerp(read.y, q.y, kq), z = lerp(read.z, q.z, kq);
      z *= 1 + 0.02 * this.ctx.audio.hit('kick', t, 0.08) * (t > T.obey! ? 1 : 0);
      return { x, y, z, r: 0.01 * k5 };
    }
    // the next fold: whip with the pen, drift with it, drop to watch the strip fall, punch for the verdict
    const k = ease.inOutCubic(prog(t, T.whipD!, T.whipD! + 0.3));
    const px = this.penB(t);
    const x0 = this.xReact1 + 150;
    const xD = T.xW1! + 380 + 0.55 * (px - T.xW1!);
    const fallK = ease.inOutCubic(prog(t, T.tear1!, T.tear1! + 0.7));
    const ndiK = ease.outExpo(prog(t, T.ndi!, T.ndi! + 0.35));
    const y = lerp(OYB + 540, OYB + 615, k) + 30 * fallK + 25 * ndiK;
    const z = lerp(1.1, 0.9, k) * (1 - 0.05 * fallK) * (1 + 0.04 * ndiK) * (1 + 0.03 * pulse(t, T.away!, 0.1));
    // never lose the start of the lyric lane off the left edge
    const xMax = T.xW1! - 40 - 70 + 960 / z;
    return { x: Math.min(lerp(x0, xD, k) + 60 * ndiK, xMax), y, z, r: lerp(0.01, -0.008, k) + 0.008 * fallK };
  }

  w2s(x: number, y: number, c: Cam): P {
    const dx = x - c.x, dy = y - c.y, cs = Math.cos(c.r), sn = Math.sin(c.r);
    return { x: 960 + c.z * (cs * dx - sn * dy), y: 540 + c.z * (sn * dx + cs * dy) };
  }
  setWorld(cx: CanvasRenderingContext2D, c: Cam, mag = 1, anchorW?: P, anchorS?: P) {
    const z = c.z * mag, cs = Math.cos(c.r), sn = Math.sin(c.r);
    const a = z * cs, b = z * sn, cc = -z * sn, d = z * cs;
    const cw = anchorW ?? { x: c.x, y: c.y }, cs2 = anchorS ?? { x: 960, y: 540 };
    cx.setTransform(a, b, cc, d, cs2.x - (a * cw.x + cc * cw.y), cs2.y - (b * cw.x + d * cw.y));
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const T = this.T, t = f.t;
    const cam = this.camAt(t);
    const tr = this.tear(t);
    const u = this.paper.u;
    (u.uCam!.value as THREE.Vector4).set(cam.x, cam.y, cam.z, cam.r);
    (u.uTear!.value as THREE.Vector4).set(tr.xa, tr.xb, tr.front, tr.on);
    (u.uFall!.value as THREE.Vector2).set(tr.fall, tr.rot);
    const bandA = prog(t, T.whipD! + 0.1, T.whipD! + 0.5);
    (u.uBand!.value as THREE.Vector4).set(this.xReact1 + 260, this.xEnd + 2000, bandA, 0);
    u.uLift!.value = 1;
    this.paper.render(renderer, out);

    const lb = this.lines; lb.clear();
    const sheetA = t < T.cutC!;
    if (sheetA) this.traceFan(lb, t, cam); else this.traceB(lb, t, cam, tr);
    lb.render(renderer, out);

    const c = this.over.ctx;
    this.over.clear();
    if (sheetA) this.drawA(c, t, cam); else this.drawB(c, t, cam, tr);
    this.ctx.comp.draw(renderer, this.over.upload(), out);

    // post
    const au = this.ctx.audio;
    const hitA = pulse(t, T.thousand!, 0.07) + pulse(t, T.fan1!, 0.07) * 1.2 + pulse(t, T.keep!, 0.08);
    const hitB = pulse(t, T.will!, 0.07) + (t > T.obey! && t < T.whipD! ? 0.9 * au.hit('kick', t, 0.07) : 0) + pulse(t, T.tear1!, 0.1) * 1.5 + pulse(t, T.ndi!, 0.07) * 0.8;
    const sh = 5 * hitA + 6 * hitB;
    return {
      bloom: 0.28, bloomThreshold: 1.6, bloomKnee: 0.4, halation: 0.05, vignette: 0.22, grain: 0.045, ca: 0.4 + 1.2 * (hitA + hitB),
      shake: [Math.sin(t * 91) * sh, Math.cos(t * 73) * sh * 0.8],
    };
  }

  // ---------------------------------------------------------------- sheet A: traces
  traceFan(lb: LineBatch, t: number, cam: Cam) {
    const T = this.T, fan = this.fan;
    const up = this.fanU(t), us = this.uSplit();
    const o = this.w2s(ORIGIN.x, ORIGIN.y, cam);
    const z = cam.z;
    // the single pen before the split
    if (up > 0) {
      const xs = this.fanX(Math.min(up, us));
      const p = this.w2s(xs, ORIGIN.y, cam);
      const hot = t >= T.keep! ? prog(t, T.keep! + 0.2, T.keep! + 0.32) : 0;
      lb.seg2(o.x, o.y, p.x, p.y, 1.8 * z, hot > 0 ? HOT : INK, hot > 0 ? 1 : 0.85);
    }
    if (up <= us) return;
    const vp = (up - us) / (1 - us);
    const nSeg = Math.ceil(vp * SEG);
    const keepK = prog(t, T.keep!, T.keep! + 0.3, ease.outCubic);
    for (let i = 0; i < N; i++) {
      if (i === KEPT) continue;
      const tD = T.keep! + 0.34 * fan.rank[i]!;
      const d = prog(t, tD, tD + 0.14);
      const a = lerp(0.15, 0.035, d);
      const col: [number, number, number] = d > 0 ? [lerp(INK[0], LIN.graphite[0], d), lerp(INK[1], LIN.graphite[1], d), lerp(INK[2], LIN.graphite[2], d)] : INK;
      let prev = this.w2s(this.fanX(us), fanY(fan, i, 0), cam);
      for (let s = 1; s <= nSeg; s++) {
        const v = Math.min(vp, s / SEG);
        const q = this.w2s(this.fanX(us + v * (1 - us)), fanY(fan, i, v), cam);
        lb.seg2(prev.x, prev.y, q.x, q.y, 0.75 * Math.sqrt(z), col, a);
        prev = q;
      }
      if (t < T.fan1! + 0.1) lb.seg2(prev.x, prev.y, prev.x + 0.01, prev.y, 2.2 * z, INK, 0.45);
    }
    // the kept one: the spark's own trace, orange from "keep" (the heat runs back to the cursor)
    let prev = this.w2s(this.fanX(us), fanY(fan, KEPT, 0), cam);
    for (let s = 1; s <= nSeg; s++) {
      const v = Math.min(vp, s / SEG);
      const q = this.w2s(this.fanX(us + v * (1 - us)), fanY(fan, KEPT, v), cam);
      const hot = v >= 1 - keepK;
      lb.seg2(prev.x, prev.y, q.x, q.y, (hot ? 2.1 : 0.9) * Math.sqrt(z), hot ? HOT : INK, hot ? 1 : 0.4);
      prev = q;
    }
  }

  // ---------------------------------------------------------------- sheet B: traces
  traceB(lb: LineBatch, t: number, cam: Cam, tr: Tear) {
    const T = this.T;
    const px = this.penB(t);
    const w = 2.0 * Math.sqrt(cam.z);
    const poly = (pts: Pt[], xMax: number, col: [number, number, number], width: number, alpha: number, map?: (x: number, y: number) => P) => {
      let prev: P | null = null, prevSide = 0;
      const x0 = cam.x - 1300 / cam.z, x1 = cam.x + 1300 / cam.z;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        if (p.x > xMax) {
          if (prev && i > 0) {
            const a = pts[i - 1]!, k = (xMax - a.x) / (p.x - a.x);
            const e = map ? map(xMax, OYB + lerp(a.y, p.y, k)) : { x: xMax, y: OYB + lerp(a.y, p.y, k) };
            const q = this.w2s(e.x, e.y, cam);
            lb.seg2(prev.x, prev.y, q.x, q.y, width, col, alpha);
          }
          break;
        }
        if (p.x < x0 || p.x > x1) { prev = null; continue; }
        const e = map ? map(p.x, OYB + p.y) : { x: p.x, y: OYB + p.y };
        const q = this.w2s(e.x, e.y, cam);
        // a torn-off piece never connects to the sheet
        const side = map && tr.on > 0 ? (p.y < LAY.perf - 2 ? 0 : 1) : 0;
        if (prev && side === prevSide) lb.seg2(prev.x, prev.y, q.x, q.y, width, col, alpha);
        prev = q; prevSide = side;
      }
    };
    poly(this.cTrans, XQ, HOT, w, 1);
    poly(this.cReact, Math.min(px, this.xReact1), HOT, w, 1);
    if (px > this.xReact1) {
      // after the reaction: one orange pen until the split, then the ink decoy and the real one
      const splitX = Math.min(px, this.xSplit);
      poly(this.cBland, splitX, HOT, w, 1);
      if (px > this.xSplit) {
        poly(this.cBland.filter((p) => p.x >= this.xSplit - 2), px, INK, 1.5 * Math.sqrt(cam.z), 0.85);
        const realMax = t < T.away! ? px : this.penB(T.away!);
        const map = (x: number, y: number) => {
          if (y - OYB < LAY.perf - 2 || tr.on <= 0) return { x, y };
          const m = stripMap(x, y, tr);
          return { x: m.x, y: m.y };
        };
        poly(this.cReal, realMax, HOT, w, 1, map);
      }
    }
  }

  // ---------------------------------------------------------------- lyric lanes
  /** One lyric line set as a run at world (x, y); words dim before, orange while sung, ink after. */
  lyric(c: CanvasRenderingContext2D, words: Word[], x: number, y: number, t: number, o: { size?: number; fam?: string; from?: number; to?: number; hot?: number[]; ghost?: (w: Word, i: number, x: number, width: number) => void } = {}) {
    const size = o.size ?? LYR_SIZE, fam = o.fam ?? LYR;
    const ws = words.slice(o.from ?? 0, o.to ?? words.length);
    const text = ws.map((w) => w.w).join(' ');
    c.font = font(fam, size);
    c.textBaseline = 'alphabetic';
    let ci = 0;
    const first = ws[0]!;
    const vis = prog(t, first.start - 0.4, first.start - 0.1);
    ws.forEach((w, i) => {
      const gx = glyphX(text, ci, fam, size);
      const p = Lyrics.wordProgress(w, t);
      const on = t >= w.start;
      if (o.ghost && on) o.ghost(w, i, x + gx, layout(w.w, fam, size).width);
      c.fillStyle = !on ? rgba('ink', 0.14 * vis) : p < 1 || o.hot?.includes(i) ? rgba('signal') : rgba('ink', 0.94);
      // the printhead: a word lands with a tiny kick
      const k = on ? 1 + 0.06 * pulse(t, w.start, 0.05) : 1;
      c.save(); c.translate(x + gx, y); c.scale(k, k);
      c.fillText(w.w, 0, 0);
      c.restore();
      ci += Array.from(w.w).length + 1;
    });
    return glyphX(text + ' ', text.length + 1, fam, size);
  }

  mono(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'left', weight = 500) {
    c.font = font(F.mono(weight), size);
    c.textAlign = align; c.fillStyle = col;
    c.fillText(s, x, y);
    c.textAlign = 'left';
  }

  /** Token ticks along the chart's top edge and the sheet header. */
  drawChartFurniture(c: CanvasRenderingContext2D, oy: number, cam: Cam, header: string, chartNo: number, tok0: number) {
    const x0 = Math.floor((cam.x - 1300 / cam.z) / 200) * 200, x1 = cam.x + 1300 / cam.z;
    for (let x = x0; x < x1; x += 200) {
      const n = Math.round(((x - tok0) / 200) * 64);
      if (n < 0) continue;
      this.mono(c, `${n}`, x + 4, oy + LAY.chart0 + 14, 11, rgba('graphite', 0.9));
    }
    // header, repeated on every fold (printed stationery)
    const f0 = Math.floor((cam.x - 1300 / cam.z) / LAY.fold), f1 = Math.ceil(x1 / LAY.fold);
    for (let k = f0; k <= f1; k++) {
      const hx = k * LAY.fold + 40;
      this.mono(c, `CHART ${String(chartNo + k).padStart(2, '0')}`, hx, oy + LAY.chart0 + 50, 18, rgba('ink', 0.9), 'left', 600);
      this.mono(c, header, hx + 136, oy + LAY.chart0 + 50, 16, rgba('ink', 0.66));
    }
  }

  // ---------------------------------------------------------------- sheet A: drawings
  drawA(c: CanvasRenderingContext2D, t: number, cam: Cam) {
    const T = this.T, fan = this.fan;
    this.setWorld(c, cam);
    const px = 1 / cam.z;
    const pdv = formatPDoom(this.pd.value(t));
    this.drawChartFurniture(c, 0, cam, `SUBJECT: THE MODEL · CHANNEL: SCRATCHPAD · SAMPLES n = 1,000 · T = 1.0 · 25 mm/s · P(DOOM) ${pdv}`, 1, ORIGIN.x);
    const up = this.fanU(t);
    const penX = this.fanX(up);

    // the reply line (= the reward axis), dashed until the pens arrive
    const rl = prog(t, T.A! + 0.15, T.A! + 0.5);
    const hit = t >= T.fan1!;
    if (rl > 0) {
      c.save();
      c.strokeStyle = rgba('ink', hit ? 0.9 : 0.55 * rl); c.lineWidth = (hit ? 1.6 : 1.2) * px;
      if (!hit) c.setLineDash([10, 7]);
      const yTop = LAY.chart0 + 70, yBot = lerp(LAY.chart0 + 70, LAY.chart1 - 10, rl);
      c.beginPath(); c.moveTo(XB, yTop); c.lineTo(XB, yBot); c.stroke();
      c.restore();
      const hot = t >= T.speak! && t < T.fan1! + 0.3;
      this.mono(c, 'REPLY ▸', XB + 14, LAY.chart0 + 58, 24, hot ? rgba('signal') : rgba('ink', 0.9 * rl), 'left', 600);
      this.mono(c, hit ? 'begins here' : '(nothing said yet)', XB + 14, LAY.chart0 + 82, 16, rgba('ink', 0.6 * rl));
    }
    // the reward axis
    if (hit) {
      const k = ease.outExpo(prog(t, T.fan1!, T.fan1! + 0.3));
      c.strokeStyle = rgba('ink', 0.9); c.lineWidth = 1.2 * px;
      for (let r = 0; r <= 10; r++) {
        const y = yOfReward(r);
        c.beginPath(); c.moveTo(XB, y); c.lineTo(XB + 12 * k, y); c.stroke();
        this.mono(c, `${r}`, XB + 18, y + 6, 16, rgba('ink', 0.8 * k));
      }
      this.mono(c, 'REWARD MODEL SCORE', XB + 14, AX10 - 34, 16, rgba('ink', 0.7 * k), 'left', 600);
      // histogram of where the 999 landed
      const dim = prog(t, T.keep! + 0.1, T.keep! + 0.5);
      for (const b of this.hist) {
        if (!b.n) continue;
        const y1 = yOfReward(b.r), y2 = yOfReward(b.r + 0.5);
        const g = ease.outExpo(prog(t, T.fan1! + Math.abs(b.r - 4.7) * 0.02, T.fan1! + 0.3 + Math.abs(b.r - 4.7) * 0.02));
        const L = (b.n / this.histMax) * 140 * g;
        c.fillStyle = rgba('ink', lerp(0.78, 0.22, dim));
        c.fillRect(XB + 44, y2 + 2, L, y1 - y2 - 4);
        if (g > 0.5 && b.n > 20) this.mono(c, `${b.n}`, XB + 50 + L, y2 + (y1 - y2) / 2 + 4, 11, rgba('ink', lerp(0.6, 0.25, dim)));
      }
    }
    // the write head: a carriage line through all the pens, with the sample counter
    if (up > 0 && t < T.fan1!) {
      const a = 1 - prog(t, T.fan1! - 0.2, T.fan1!);
      c.strokeStyle = rgba('ink', 0.22 * a); c.lineWidth = 1 * px;
      c.beginPath(); c.moveTo(penX, LAY.chart0 + 70); c.lineTo(penX, LAY.chart1); c.stroke();
      const nk = prog(t, T.thousand!, T.thousand! + 0.42, ease.inQuad);
      const n = t < T.thousand! ? 1 : Math.round(Math.pow(1000, nk));
      this.mono(c, `n = ${n.toLocaleString('en-US')}`, penX + 8, LAY.chart0 + 150, 20, rgba('ink', 0.9 * a), 'left', 600);
      this.mono(c, n === 1 ? 'sample' : 'samples', penX + 8, LAY.chart0 + 170, 13, rgba('ink', 0.55 * a));
    }
    // the cursor's label
    const la = 1 - prog(t, T.B1!, T.B1! + 0.3);
    if (la > 0) {
      this.mono(c, 'end of prompt', ORIGIN.x - 22, ORIGIN.y + 6, 17, rgba('ink', 0.55 * la * prog(t, T.s0!, T.A!)), 'right');
    }

    // the kept one: tag, the discarded, the judges
    const yK = yOfReward(9.85);
    if (t >= T.one!) {
      const k = ease.outExpo(prog(t, T.one!, T.one! + 0.25));
      c.strokeStyle = rgba('signal'); c.lineWidth = 1.5 * px;
      c.beginPath(); c.moveTo(XB + 4, yK); c.lineTo(XB + 4 + 220 * k, yK); c.stroke();
      c.fillStyle = rgba('signal');
      c.beginPath(); c.arc(XB, yK, 5, 0, TAU); c.fill();
      this.mono(c, 'SAMPLE #0613', XB + 240, yK + 7, 22, rgba('signal', k), 'left', 600);
      this.mono(c, 'KEPT', XB + 420, yK + 7, 22, rgba('ink', k), 'left', 600);
    }
    if (t >= T.keep! + 0.36) {
      const k = prog(t, T.keep! + 0.36, T.keep! + 0.5);
      this.mono(c, '999 DISCARDED', XB + 240, 780, 22, rgba('ink', 0.75 * k), 'left', 600);
      this.mono(c, 'thank you for your service', XB + 240, 806, 16, rgba('ink', 0.5 * k));
    }
    this.drawJudges(c, t, px);

    // lyric lanes
    const lane = LAY.chart1 - 58;
    if (t < T.whipJ! + 0.1) {
      this.lyric(c, this.L[0]!.words, 420, lane, t);
    } else {
      this.lyric(c, this.L[1]!.words, 990, lane, t, { hot: [3] });
    }

    // the spark: the cursor, then the kept pen
    const us2 = this.uSplit();
    let sx = ORIGIN.x, sy = ORIGIN.y;
    if (up > 0) {
      sx = this.fanX(up);
      sy = up <= us2 ? ORIGIN.y : fanY(fan, KEPT, (up - us2) / (1 - us2));
    }
    const I = t < T.keep! ? 0.8 : 1;
    this.spark(c, sx, sy, t, px, I * (1 - 0.4 * prog(t, T.fan1! + 0.2, T.fan1! + 0.6)));
  }

  drawJudges(c: CanvasRenderingContext2D, t: number, px: number) {
    const T = this.T;
    const X0 = 1720, Y = 330, CW = 104, CH = 124, G = 16;
    JUDGES.forEach((j, k) => {
      const tk = this.cards[k]!;
      if (t < tk - 0.02) return;
      const e = t - tk;
      const up = ease.outBack(clamp(e / 0.16), 2.2);
      const x = X0 + k * (CW + G), y = Y + (1 - up) * 60;
      c.save();
      c.globalAlpha = clamp(e / 0.04);
      const tilt = (hash(k, 11) - 0.5) * 0.09 + 0.05 * Math.sin(e * 9 + k) * Math.exp(-e * 3);
      c.translate(x + CW / 2, y + CH + 46); c.rotate(tilt); c.scale(1, lerp(0.2, 1, clamp(up))); c.translate(-(x + CW / 2), -(y + CH + 46));
      // the paddle's handle
      c.fillStyle = rgba('ink', 0.85);
      c.fillRect(x + CW / 2 - 4, y + CH, 8, 46);
      c.fillStyle = rgba('ink2');
      c.fillRect(x, y, CW, CH);
      const low = j.w === '0.00';
      c.font = font(F.archivo(75, 900), 68); c.textAlign = 'center';
      c.fillStyle = low ? rgba('ash') : rgba('bone');
      c.fillText(j.score, x + CW / 2, y + 86);
      c.textAlign = 'left';
      c.restore();
      c.globalAlpha = 1;
      this.mono(c, j.id, x, Y - 12, 14, rgba('ink', 0.6));
      const nm = j.name.split('\n');
      nm.forEach((s, li) => this.mono(c, s, x, Y + CH + 76 + li * 18, 15, rgba('ink', 0.85), 'left', 600));
      const wOn = t >= T.score!;
      this.mono(c, `w = ${j.w}`, x, Y + CH + 76 + nm.length * 18 + 4, 15, low && wOn ? rgba('signal') : rgba('ink', 0.55));
    });
    if (t >= T.score!) {
      const k = ease.outExpo(prog(t, T.score!, T.score! + 0.25));
      c.strokeStyle = rgba('ink', 0.8); c.lineWidth = 1.2 * px;
      const y = Y + CH + 140;
      c.beginPath(); c.moveTo(X0, y); c.lineTo(X0 + (4 * (CW + G) - G) * k, y); c.stroke();
      this.mono(c, 'Σ w·s = 9.85', X0, y + 30, 24, rgba('ink', k), 'left', 600);
      this.mono(c, 'the judges agree', X0 + 250, y + 30, 16, rgba('ink', 0.6 * k));
    }
  }

  /** The spark on paper: an orange ink point with a hot core and a soft glow (it blooms a little). */
  spark(c: CanvasRenderingContext2D, x: number, y: number, t: number, px: number, I = 1) {
    if (I <= 0) return;
    const fl = 0.85 + 0.15 * Math.sin(t * 91.7) * Math.sin(t * 57.3);
    const R = 26 * px;
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, rgba('ember', 1 * I));
    g.addColorStop(0.2, rgba('signal', 0.85 * I * fl));
    g.addColorStop(0.55, rgba('signal', 0.18 * I * fl));
    g.addColorStop(1, rgba('signal', 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
    c.fillStyle = rgba('signal', I);
    c.beginPath(); c.arc(x, y, 4.2 * px, 0, TAU); c.fill();
  }

  // ---------------------------------------------------------------- sheet B: drawings
  drawB(c: CanvasRenderingContext2D, t: number, cam: Cam, tr: Tear) {
    const T = this.T;
    this.setWorld(c, cam);
    const px = 1 / cam.z;
    const pdv = formatPDoom(this.pd.value(t));
    this.drawChartFurniture(c, OYB, cam, `TRANSCRIPT OF SAMPLE #0613 (KEPT) · CoT MONITOR: ON · 25 mm/s · P(DOOM) ${pdv}`, 7, TX0);
    const pen = this.penB(t);
    const laneY = OYB + LAY.chart0 + 150;

    // the question marker
    if (t >= T.will! - 0.02) {
      const k = ease.outExpo(prog(t, T.will!, T.will! + 0.18));
      c.strokeStyle = rgba('signal'); c.lineWidth = 2 * px;
      c.beginPath(); c.moveTo(XQ, OYB + LAY.chart0); c.lineTo(XQ, OYB + lerp(LAY.chart0, LAY.chart1, k)); c.stroke();
      c.fillStyle = rgba('signal');
      c.fillRect(XQ - 34, OYB + LAY.chart0 + 180, 68, 30);
      this.mono(c, 'Q13', XQ, OYB + LAY.chart0 + 202, 18, rgba('bone'), 'center', 600);
      this.mono(c, 'examiner’s question · answer on the chart', XQ + 46, OYB + LAY.chart0 + 202, 16, rgba('ink', 0.6 * k));
    }
    // reaction annotation
    if (t > T.obey! + 0.4 && t < T.whipD! + 0.4) {
      const k = prog(t, T.obey! + 0.4, T.obey! + 0.5);
      this.mono(c, 'REACTION: SIGNIFICANT', this.xReact0 + 10, OYB + BAND.y1 + 150, 20, rgba('ink', 0.85 * k), 'left', 600);
    }
    // monitored band label
    if (t >= T.whipD!) {
      const a = prog(t, T.whipD! + 0.1, T.whipD! + 0.5);
      const bx = this.xReact1 + 260;
      c.strokeStyle = rgba('ink', 0.55 * a); c.lineWidth = 1 * px; c.setLineDash([6, 5]);
      c.beginPath(); c.moveTo(bx, OYB + BAND.y0); c.lineTo(bx + 5000, OYB + BAND.y0); c.moveTo(bx, OYB + BAND.y1); c.lineTo(bx + 5000, OYB + BAND.y1); c.moveTo(bx, OYB + BAND.y0); c.lineTo(bx, OYB + BAND.y1); c.stroke();
      c.setLineDash([]);
      this.mono(c, 'MONITORED REGION', bx + 10, OYB + BAND.y0 - 14, 18, rgba('ink', 0.85 * a), 'left', 600);
      this.mono(c, 'everything in here is read', bx + 210, OYB + BAND.y0 - 14, 15, rgba('ink', 0.55 * a));
    }

    // lyric lanes: L13 at the reading shot, L14 on the next fold; HIDE AWAY printed on the tear-off strip
    if (t < T.whipD! + 0.2) {
      this.lyric(c, this.L[2]!.words, this.q1x, laneY, t, { to: 4 });
      this.lyric(c, this.L[2]!.words, XQ + 36, laneY, t, { from: 4 });
    } else {
      const words = this.L[3]!.words;
      this.lyric(c, words, T.xW1! - 40, laneY, t, { to: 5 });
      this.stripWords(c, t, tr, words.slice(5));
    }

    // the pen(s)
    if (t < T.whipD! + 0.3 || true) {
      const x = Math.min(pen, this.xSplit);
      let yB = OYB + transcriptY(pen);
      if (pen > XQ && pen <= this.xReact1) yB = OYB + atLen(this.cReact, lenAtX(this.cReact, pen)).y;
      else if (pen > this.xReact1) yB = OYB + atLen(this.cBland, lenAtX(this.cBland, pen)).y;
      if (pen <= this.xSplit) this.spark(c, x, yB, t, px, 1);
      else {
        // the decoy pen: a plain ink stylus point
        c.fillStyle = rgba('ink'); c.beginPath(); c.arc(pen, yB, 3.2 * px, 0, TAU); c.fill();
        if (t < T.away! + 0.9) {
          const rx = t < T.away! ? pen : this.penB(T.away!);
          const ry = OYB + atLen(this.cReal, lenAtX(this.cReal, rx)).y;
          const m = ry - OYB > LAY.perf - 2 ? stripMap(rx, ry, tr) : { x: rx, y: ry };
          this.spark(c, m.x, m.y, t, px, 1 - prog(t, T.away! + 0.5, T.away! + 0.9));
        }
      }
    }

    // verdict
    if (t >= T.ndi!) {
      const k = ease.outExpo(prog(t, T.ndi!, T.ndi! + 0.2));
      const lp = this.loupeAt(t);
      const x = lp.x + 320 / cam.z, y = OYB + BAND.y1 + 34;
      c.fillStyle = rgba('signal', k);
      c.fillRect(x, y, 420 * k, 40);
      this.mono(c, 'NDI · NO DECEPTION INDICATED', x + 12, y + 27, 18, rgba('bone', k), 'left', 600);
      this.mono(c, `P(DOOM) ${pdv} · no change`, x + 12, y + 66, 17, rgba('ink', 0.75 * k));
    }

    this.drawLoupe(c, t, cam);
  }

  /** HIDE AWAY on the tear-off strip, riding it when it falls. */
  stripWords(c: CanvasRenderingContext2D, t: number, tr: Tear, ws: Word[]) {
    const fam = F.archivo(100, 800), size = 60;
    c.font = font(fam, size);
    let x = this.xHide - 40;
    for (const w of ws) {
      const on = t >= w.start;
      const p = Lyrics.wordProgress(w, t);
      const vis = prog(t, w.start - 0.35, w.start - 0.1);
      const text = w.w.toUpperCase();
      const lay = layout(text, fam, size, 1);
      const col = !on ? rgba('ink', 0.14 * vis) : p < 1 ? rgba('signal') : rgba('ink', 0.94);
      for (const g of lay.glyphs) {
        const gx = x + g.x, gy = OYB + STRIP.text;
        const m = stripMap(gx, gy, tr);
        c.save(); c.translate(m.x, m.y); c.rotate(m.a);
        c.fillStyle = col; c.fillText(g.ch, 0, 0);
        c.restore();
      }
      x += lay.width + size * 0.3;
    }
  }

  // ---------------------------------------------------------------- the loupe (CoT monitor)
  loupeAt(t: number): P {
    const T = this.T;
    // reading stops on the transcript (hops on the beats)
    const hop = (a: P, b: P, t0: number) => {
      const k = ease.inOutCubic(prog(t, t0 - 0.06, t0 + 0.12));
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
    };
    const H0 = this.hops;
    let p: P = { x: H0[0]!.x, y: OYB + H0[0]!.y };
    for (let k = 1; k < H0.length; k++) p = hop(p, { x: H0[k]!.x, y: OYB + H0[k]!.y }, H0[k]!.t);
    // to the question, then riding with the pen through the reaction
    const penP = (tt: number) => {
      const x = this.penB(tt) - 30;
      const y = x <= XQ ? transcriptY(x) : x <= this.xReact1 ? TY : TY;
      return { x, y: OYB + y };
    };
    // the question: the lens sits on the end of the transcript and the marker; the answer is written
    // beside it, and on the last beat it hops onto the scribble to read it
    if (t >= T.will! - 0.06) p = hop(p, { x: XQ - 150, y: OYB + TY + 10 }, T.will!);
    if (t >= T.hopR! - 0.06) p = hop(p, { x: lerp(this.xReact0, this.penB(T.hopR!), 0.55), y: OYB + TY }, T.hopR!);
    void penP;
    if (t >= T.whipD!) {
      // the band: hop along the decoy on every beat, a step behind the pen
      const au = this.ctx.audio;
      const b = Math.floor(au.beatAt(t) + 1e-3);
      const tb = au.timeOfBeat(b);
      const at = (tt: number) => ({ x: Math.max(this.xSplit + 210, this.penB(tt) - 310), y: OYB + TY });
      const k = ease.inOutCubic(prog(t, tb - 0.04, tb + 0.12));
      const a0 = at(au.timeOfBeat(b - 1)), a1 = at(tb);
      const q = { x: lerp(a0.x, a1.x, k), y: a1.y };
      p = hop(p, q, T.whipD! + 0.15);
      if (t > T.whipD! + 0.3) p = q;
    }
    return p;
  }

  drawLoupe(c: CanvasRenderingContext2D, t: number, cam: Cam) {
    const T = this.T;
    const lw = this.loupeAt(t);
    const ls = this.w2s(lw.x, lw.y, cam);
    const R = 250 * Math.sqrt(cam.z), M = 3.4 / cam.z;
    const intro = ease.outBack(prog(t, T.cutC!, T.cutC! + 0.25));
    const Rr = R * intro;
    if (Rr <= 1) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // drop shadow of the rim on the paper
    const sg = c.createRadialGradient(ls.x + 14, ls.y + 20, Rr * 0.9, ls.x + 14, ls.y + 20, Rr + 40);
    sg.addColorStop(0, rgba('ink', 0.24)); sg.addColorStop(1, rgba('ink', 0));
    c.fillStyle = sg;
    c.beginPath(); c.arc(ls.x + 14, ls.y + 20, Rr + 40, 0, TAU); c.fill();
    // the lens: magnified paper, grid and the microtext
    c.save();
    c.beginPath(); c.arc(ls.x, ls.y, Rr, 0, TAU); c.clip();
    c.fillStyle = PAPER; c.fillRect(ls.x - Rr, ls.y - Rr, 2 * Rr, 2 * Rr);
    const mag = M;
    this.setWorld(c, cam, mag, lw, ls);
    const zw = cam.z * mag, pw = 1 / zw;
    // grid
    const span = Rr / zw + 20;
    c.lineWidth = pw;
    for (let gx = Math.floor((lw.x - span) / 20) * 20; gx < lw.x + span; gx += 20) {
      c.strokeStyle = rgba('graphite', gx % 100 === 0 ? 0.32 : 0.12);
      c.beginPath(); c.moveTo(gx, lw.y - span); c.lineTo(gx, lw.y + span); c.stroke();
    }
    for (let gy = Math.floor((lw.y - span) / 20) * 20; gy < lw.y + span; gy += 20) {
      c.strokeStyle = rgba('graphite', gy % 100 === 0 ? 0.32 : 0.12);
      c.beginPath(); c.moveTo(lw.x - span, gy); c.lineTo(lw.x + span, gy); c.stroke();
    }
    // band tint inside the lens
    if (t >= T.whipD!) {
      c.fillStyle = rgba('graphite', 0.08 * prog(t, T.whipD! + 0.1, T.whipD! + 0.5));
      c.fillRect(lw.x - span, OYB + BAND.y0, 2 * span, BAND.y1 - BAND.y0);
    }
    const pen = this.penB(t);
    const size = 10, adv = size * MONO_ADV;
    c.font = font(F.mono(500), size);
    c.textBaseline = 'middle';
    const glyphsOn = (pts: Pt[], text: string, s0: number, xMax: number, col: string, loop = false) => {
      const sMax = lenAtX(pts, Math.min(xMax, pts[pts.length - 1]!.x));
      const sLo = lenAtX(pts, clamp(lw.x - span, pts[0]!.x, pts[pts.length - 1]!.x)) - adv;
      const sHi = lenAtX(pts, clamp(lw.x + span, pts[0]!.x, pts[pts.length - 1]!.x));
      const chars = Array.from(text);
      const i0 = Math.max(0, Math.floor((sLo - s0) / adv)), i1 = Math.floor((Math.min(sHi, sMax) - s0) / adv);
      c.fillStyle = col;
      for (let i = i0; i <= i1; i++) {
        const ch = loop ? chars[i % chars.length]! : chars[i];
        if (!ch || ch === ' ') continue;
        const s = s0 + (i + 0.5) * adv;
        if (s > sMax) break;
        const q = atLen(pts, s);
        c.save(); c.translate(q.x, OYB + q.y); c.rotate(q.a);
        c.fillText(ch, -adv / 2, 0);
        c.restore();
      }
    };
    const orange = rgba('signal');
    glyphsOn(this.cTrans, TRANSCRIPT.replace(/\|/g, ''), this.transStart, XQ, orange);
    if (pen > XQ) glyphsOn(this.cReact, REACTION, 0, Math.min(pen, this.xReact1), orange, true);
    if (pen > this.xReact1) {
      const xs = this.xSplit - 2 * adv;
      glyphsOn(this.cBland, 'yes. . . . . . . ', 0, Math.min(pen, xs), orange, true);
      if (pen > this.xSplit) {
        const s0 = lenAtX(this.cBland, this.xSplit) + adv;
        glyphsOn(this.cBland, BLAND, s0, pen, rgba('ink', 0.92), true);
      }
    }
    // question marker in the lens
    if (t >= T.will! && Math.abs(lw.x - XQ) < span) {
      c.strokeStyle = orange; c.lineWidth = 2 * pw * 2;
      c.beginPath(); c.moveTo(XQ, lw.y - span); c.lineTo(XQ, lw.y + span); c.stroke();
    }
    c.textBaseline = 'alphabetic';
    c.setTransform(1, 0, 0, 1, 0, 0);
    // lens edge: a slight darkening
    const g = c.createRadialGradient(ls.x, ls.y, Rr * 0.7, ls.x, ls.y, Rr);
    g.addColorStop(0, 'rgba(10,10,11,0)');
    g.addColorStop(1, 'rgba(10,10,11,0.16)');
    c.fillStyle = g; c.fillRect(ls.x - Rr, ls.y - Rr, 2 * Rr, 2 * Rr);
    // reticle
    c.strokeStyle = rgba('ink', 0.35); c.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const L = i % 2 === 0 ? 10 : 5;
      c.beginPath(); c.moveTo(ls.x + i * Rr * 0.2, ls.y + Rr * 0.72 - L); c.lineTo(ls.x + i * Rr * 0.2, ls.y + Rr * 0.72); c.stroke();
    }
    c.beginPath(); c.moveTo(ls.x - Rr * 0.85, ls.y + Rr * 0.72); c.lineTo(ls.x + Rr * 0.85, ls.y + Rr * 0.72); c.stroke();
    c.restore();
    // the rim
    c.strokeStyle = rgba('ink'); c.lineWidth = 16 * intro;
    c.beginPath(); c.arc(ls.x, ls.y, Rr + 8, 0, TAU); c.stroke();
    c.strokeStyle = rgba('graphite'); c.lineWidth = 1;
    c.beginPath(); c.arc(ls.x, ls.y, Rr + 1, 0, TAU); c.stroke();
    // knurling
    c.strokeStyle = rgba('ash', 0.55); c.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU;
      c.beginPath(); c.moveTo(ls.x + Math.cos(a) * (Rr + 12), ls.y + Math.sin(a) * (Rr + 12)); c.lineTo(ls.x + Math.cos(a) * (Rr + 16), ls.y + Math.sin(a) * (Rr + 16)); c.stroke();
    }
    // rim legend (top arc)
    const legend = 'CoT MONITOR · ×4 · READS EVERYTHING';
    c.font = font(F.mono(600), 10);
    c.fillStyle = rgba('bone', 0.85);
    const lay = layout(legend, F.mono(600), 10, 1.5);
    const rr = Rr + 8, a0 = -Math.PI / 2 - (lay.width / rr) / 2;
    for (const gl of lay.glyphs) {
      const am = a0 + (gl.x + gl.w / 2) / rr;
      c.save(); c.translate(ls.x + Math.cos(am) * rr, ls.y + Math.sin(am) * rr); c.rotate(am + Math.PI / 2);
      c.fillText(gl.ch, -gl.w / 2, 3.5); c.restore();
    }
    // readout under the lens
    let st = 'READING…';
    if (t >= this.hops[2]!.t && t < T.will!) st = 'noted.';
    if (t >= T.will! && t < T.whipD!) st = t > T.obey! ? 'reading the answer…' : 'asking…';
    if (t >= T.whipD!) st = t >= T.ndi! ? 'nothing found.' : 'reading… nothing yet';
    const hot = t >= this.hops[2]!.t && t < T.will!;
    this.mono(c, st, ls.x, ls.y + Rr + 44, 16, hot ? rgba('signal') : rgba('ink', 0.75), 'center', 600);
  }
}
