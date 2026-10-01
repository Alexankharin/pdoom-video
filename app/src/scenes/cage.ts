// `cage` — "The cage (one paperclip, bent)". Chorus 4 tail; drums and bass out: a hush.
// Opens on `paperclips`' last frame, the slot closed to one hot orange line at the horizon. That line
// is the paperclip's wire: it cools, and on "We built the cage to keep you in" it is bent, left to
// right as the words are sung, into a meander of bars (a paperclip is a bent wire; so is this cage),
// shut over the lyric set behind it. The spark, inside, lights the bars from within; "you" stays lit.
// On "in" it drops out of the bottom of the centre slot (a meander's slots are open at alternate
// ends) and writes "You learned to make us call it" in its own hand under the cage; then it whips up,
// strikes out "cage" and writes the correction over it, on the beat of "sin".
// Last frame: "We built the ~~cage~~ sin to keep you in", the spark at the end of "sin".
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { strokeText, type StrokeText } from '../engine/stroke';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, prog, noise1, type V2 } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';

const N = 20; // bars
const S = 86; // bar pitch
const X0 = W / 2 - ((N - 1) * S) / 2;
const Y0 = 540; // the wire, straight (paperclips' horizon line)
const YT = 190, YB = 800; // cage top / bottom (bend apexes)
const WIRE = 14;

type RGB = [number, number, number];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

interface Script { st: StrokeText; x: number; y: number; times: [number, number][] }
interface WordBox { w: Word; row: number; x: number; lay: ReturnType<typeof layout> }

export default class Cage extends Scene {
  bg = new FSPass(/* glsl */ `
    void main() {
      vec2 p = (vUv - 0.5) * vec2(1.777, 1.0);
      fragColor = vec4(C_INK * (0.72 + 0.28 * smoothstep(1.0, 0.1, length(p))), 1.0);
    }`, {});
  text = new Layer2D();
  wireN = new LineBatch(12000, { blend: 'normal' });
  glow = new LineBatch(12000);
  pen = new LineBatch(6000, { blend: 'max' });
  L1!: Line; L2!: Line;
  barT: number[] = [];
  boxes: WordBox[] = [];
  fam = F.archivo(100, 800);
  size = 132;
  rows = [462, 680];
  line2!: Script; // "You learned to make us call it", under the cage
  fix!: Script; // "sin", the correction written over "cage"
  strike!: { xa: number; xb: number; y: number };
  T!: { start: number; end: number; exit0: number; exit1: number; whip0: number; strike0: number; strike1: number; sin: number };

  override init() {
    const { lyrics: ly, start, end } = this.ctx;
    this.L1 = ly.get('We built the cage');
    this.L2 = ly.get('You learned to make us call it sin');
    const L1 = this.L1, L2 = this.L2;
    // bars are bent in as the line is sung, left to right
    const len = L1.text.length;
    for (let i = 0; i < N; i++) {
      const target = ((i + 0.6) / N) * len;
      let tt = L1.start;
      for (let s = L1.start - 0.05; s <= L1.end; s += 0.005) { tt = s; if (Lyrics.lineCharProgress(L1, s) >= target) break; }
      this.barT.push(tt - 0.06);
    }
    // line 1 behind the bars: "We built the cage" / "to keep you in"
    const split = L1.words.findIndex((w) => /^to$/i.test(w.w));
    const rowsW = [L1.words.slice(0, split), L1.words.slice(split)];
    const sp = layout(' ', this.fam, this.size).width;
    rowsW.forEach((ws, r) => {
      const lays = ws.map((w) => layout(w.w, this.fam, this.size, -2));
      const total = lays.reduce((a, l) => a + l.width, 0) + sp * (ws.length - 1);
      let x = W / 2 - total / 2;
      ws.forEach((w, i) => { this.boxes.push({ w, row: r, x, lay: lays[i]! }); x += lays[i]!.width + sp; });
    });
    // line 2, in the spark's hand; its last word is written as the correction over "cage"
    const last = L2.words[L2.words.length - 1]!, itW = L2.words[L2.words.length - 2]!;
    const sinT = last.start;
    const txt = L2.text.slice(0, L2.text.lastIndexOf(last.w)).trimEnd();
    const probe = strokeText(txt, 'hscript', 100);
    const size = Math.min(100, (100 * 1100) / probe.width);
    const st = strokeText(txt, 'hscript', size);
    const times: [number, number][] = [];
    let ci = 0;
    for (const w of L2.words.slice(0, -1)) {
      const at = txt.indexOf(w.w, ci);
      for (; ci < at; ci++) times[ci] = [w.start, w.start];
      const n = w.w.length, d = Math.max(0.05, w.end - w.start);
      // "it" is written quickly: the pen has a correction to make before "sin"
      const dd = w === itW ? Math.min(d, Math.max(0.04, sinT - 0.085 - w.start)) : d * 0.92;
      for (let k = 0; k < n; k++) times[at + k] = [w.start + (dd * k) / n, w.start + (dd * (k + 1)) / n];
      ci = at + n;
    }
    this.line2 = { st, x: W / 2 - st.width / 2, y: 912, times };
    const cage = this.boxes.find((b) => /^cage/i.test(b.w.w))!;
    const fst = strokeText(last.w.replace(/[^A-Za-z]/g, ''), 'hscript', 150);
    const nC = fst.charRange.length;
    // written in the time the cut leaves ("sin" is still being sung over the next plate)
    const t1 = end - 0.018;
    this.fix = {
      st: fst, x: cage.x + cage.lay.width / 2 - fst.width / 2, y: this.rows[0]! - this.size * 0.9,
      times: Array.from({ length: nC }, (_, k) => [sinT + ((t1 - sinT) * k) / nC, sinT + ((t1 - sinT) * (k + 1)) / nC] as [number, number]),
    };
    this.strike = { xa: cage.x - 18, xb: cage.x + cage.lay.width + 18, y: this.rows[cage.row]! - this.size * 0.3 };
    const inW = L1.words[L1.words.length - 1]!;
    const itEnd = times[st.charRange.length - 1]![1];
    this.T = { start, end, exit0: inW.start - 0.02, exit1: L2.start, whip0: itEnd, strike0: itEnd + 0.035, strike1: sinT - 0.004, sin: sinT };
  }

  // ---------------------------------------------------------------- the wire
  amp(i: number, t: number) {
    return prog(t, this.barT[i]!, this.barT[i]! + 0.36, (x) => ease.outBack(x, 1.3));
  }
  /** Centreline of the bent wire, and whether each point lies on a bar (vertical run). */
  wire(t: number): { p: V2[]; bar: boolean[] } {
    const a = Array.from({ length: N }, (_, i) => this.amp(i, t));
    const top = a.map((k) => Y0 - k * (Y0 - YT)), bot = a.map((k) => Y0 + k * (YB - Y0));
    const p: V2[] = [], bar: boolean[] = [];
    const push = (x: number, y: number, b: boolean) => { p.push({ x, y }); bar.push(b); };
    for (let i = 0; i < N; i++) {
      const x = X0 + i * S;
      const down = i % 2 === 0;
      const upper = down ? (i > 0 ? Math.min(top[i - 1]!, top[i]!) : top[i]!) : (i < N - 1 ? Math.min(top[i]!, top[i + 1]!) : top[i]!);
      const lower = down ? (i < N - 1 ? Math.max(bot[i]!, bot[i + 1]!) : bot[i]!) : Math.max(bot[i - 1]!, bot[i]!);
      const y0 = down ? upper : lower, y1 = down ? lower : upper;
      const nSeg = 6;
      for (let k = 0; k <= nSeg; k++) push(x, lerp(y0, y1, k / nSeg), true);
      if (i < N - 1) {
        // bend to the next bar: a half ellipse, flattening to the straight wire when unbent
        const kk = clamp(((a[i]! + a[i + 1]!) / 2) * 4);
        const ry = (S / 2) * kk;
        const dir = down ? 1 : -1;
        for (let k = 1; k < 12; k++) {
          const th = Math.PI - (k / 12) * Math.PI;
          push(x + S / 2 + Math.cos(th) * (S / 2), y1 + dir * Math.sin(th) * ry, false);
        }
      }
    }
    return { p, bar };
  }

  /** The spark: inside the cage, out of the centre slot's open end, the pen of line 2, the strike, the fix. */
  spark(t: number): V2 {
    const T = this.T, S2 = this.strike;
    const inside: V2 = { x: W / 2 + noise1(t * 0.9, 4) * 16, y: lerp(Y0, 571, prog(t, T.start, T.start + 0.8, ease.inOutCubic)) + noise1(t * 1.1, 8) * 8 };
    if (t < T.exit0) return inside;
    if (t < T.exit1) {
      const pen = this.penHead(this.line2, T.exit1 + 0.001) ?? { x: this.line2.x, y: this.line2.y };
      const k = prog(t, T.exit0, T.exit1, ease.inOutCubic);
      // down through the slot between the two centre bars, out of its open bottom, round to the pen
      const P0 = inside, C1 = { x: W / 2, y: YB + 150 }, C2 = { x: pen.x - 60, y: pen.y + 80 };
      const u = 1 - k;
      return {
        x: u * u * u * P0.x + 3 * u * u * k * C1.x + 3 * u * k * k * C2.x + k * k * k * pen.x,
        y: u * u * u * P0.y + 3 * u * u * k * C1.y + 3 * u * k * k * C2.y + k * k * k * pen.y,
      };
    }
    if (t < T.whip0) return this.penHead(this.line2, t)!;
    if (t < T.strike0) {
      // whip up from the end of "it" to the far end of "cage"
      const a = this.penHead(this.line2, T.whip0)!, k = prog(t, T.whip0, T.strike0, ease.inOutCubic);
      return { x: lerp(a.x, S2.xb, k), y: lerp(a.y, S2.y - 10, k) - Math.sin(Math.PI * k) * 60 };
    }
    if (t < T.strike1) {
      const k = prog(t, T.strike0, T.strike1, ease.inOutQuad);
      return { x: lerp(S2.xb, S2.xa, k), y: lerp(S2.y - 10, S2.y + 6, k) };
    }
    if (t < T.sin) return { x: S2.xa, y: S2.y + 6 };
    return this.penHead(this.fix, t) ?? { x: S2.xa, y: S2.y };
  }
  written(sc: Script, t: number) {
    const st = sc.st;
    let len = 0;
    for (let i = 0; i < st.charRange.length; i++) {
      const [a, b] = st.charRange[i]!;
      const [t0, t1] = sc.times[i] ?? [Infinity, Infinity];
      if (t >= t1) len = b;
      else if (t > t0) { len = a + (b - a) * ((t - t0) / Math.max(1e-3, t1 - t0)); break; }
      else break;
    }
    return len;
  }
  penHead(sc: Script, t: number): V2 | null {
    const st = sc.st, len = Math.max(0.01, this.written(sc, t));
    let head: V2 | null = null;
    for (let i = 0; i < st.strokes.length; i++) {
      const s0 = st.startLen[i]!;
      if (s0 >= len) break;
      const pts = st.strokes[i]!, L = st.lens[i]!;
      const remain = len - s0;
      let j = 1;
      while (j < pts.length && L[j]! <= remain) j++;
      if (j < pts.length) {
        const a = pts[j - 1]!, b = pts[j]!, u = (remain - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!);
        head = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      } else head = pts[pts.length - 1]!;
    }
    return head ? { x: sc.x + head.x, y: sc.y + head.y } : null;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, T = this.T;
    this.bg.render(renderer, out);
    this.drawLine1(t);
    comp.draw(renderer, this.text.upload(), out);

    const sk = this.spark(t);
    const N2 = this.wireN, G = this.glow, P = this.pen;
    N2.clear(); G.clear(); P.clear();
    const { p, bar } = this.wire(t);
    const heat = 1 - prog(t, T.start, T.start + 0.5, ease.outQuad);
    const bone = LIN.bone, ink2 = LIN.ink2;
    const nrm: V2[] = p.map((_, i) => {
      const a = p[Math.max(0, i - 1)]!, b = p[Math.min(p.length - 1, i + 1)]!;
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: -dy / l, y: dx / l };
    });
    const off = (i: number, o: number): V2 => ({ x: p[i]!.x + nrm[i]!.x * o, y: p[i]!.y + nrm[i]!.y * o });
    const lamp = (q: V2) => Math.exp(-((q.x - sk.x) ** 2 + (q.y - sk.y) ** 2) / (2 * 260 * 260));
    // leads: the rest of the straight line, off both ends, cooling away
    const leadK = 1 - prog(t, T.start + 0.05, T.start + 0.55, ease.inOutQuad);
    if (leadK > 0) {
      for (const [xa, ya, xb, yb] of [[-20, Y0, p[0]!.x, p[0]!.y], [p[p.length - 1]!.x, p[p.length - 1]!.y, W + 20, Y0]] as const) {
        G.seg2(xa, ya, xb, yb, 1.4 + 2.2 * leadK, mul(LIN.signal, 3 * leadK), 1);
      }
    }
    // dark core first (hides the type behind), then the engraved hairlines along the wire
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!, b = p[i]!;
      N2.seg2(a.x, a.y, b.x, b.y, WIRE, mul(ink2, 0.9), 1);
    }
    const lines: [number, number][] = [[-4.8, 1.0], [-2.4, 0.7], [0.1, 0.42], [2.6, 0.22], [4.8, 0.1]];
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!, b = p[i]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.01) continue;
      const lm = lamp(a);
      for (const [o, al] of lines) {
        const qa = off(i - 1, o), qb = off(i, o);
        N2.seg2(qa.x, qa.y, qb.x, qb.y, 1.1, mul(bone, (0.62 + 0.45 * lm) * al), 1);
      }
      // the rim toward the spark, orange
      if (bar[i] && bar[i - 1]) {
        const side = Math.sign(sk.x - a.x) || 1;
        G.seg2(a.x + side * 6.4, a.y, b.x + side * 6.4, b.y, 1.2, mul(LIN.signal, 0.2 + 2.2 * lm), 1);
      }
      if (heat > 0) G.seg2(a.x, a.y, b.x, b.y, 2 + 3 * heat, mul(LIN.signal, 3 * heat * heat), 1);
    }
    N2.render(renderer, out);

    // line 2, written by the spark; the strike through "cage"; the correction
    this.drawScript(this.line2, t, false);
    const S2 = this.strike;
    const k = prog(t, T.strike0, T.strike1, ease.inOutQuad);
    if (k > 0) P.seg2(S2.xb, S2.y - 10, lerp(S2.xb, S2.xa, k), lerp(S2.y - 10, S2.y + 6, k), 4.2, mul(LIN.signal, 1.9), 1);
    this.drawScript(this.fix, t, true);
    P.render(renderer, out);
    // a hairline behind the spark on its fast moves
    for (let i = 1; i <= 14; i++) {
      const a = this.spark(t - (i - 1) * 0.008), b = this.spark(t - i * 0.008);
      G.seg2(a.x, a.y, b.x, b.y, 1.3, mul(LIN.signal, 1.4 * (1 - i / 15)), 1);
    }
    sparkParticles(G, t, (tb) => this.spark(tb), { rate: 55, speed: 120, intensity: 0.6, seed: 31, life: 0.4 });
    sparkHead(G, sk.x, sk.y, t, 0.85, 1);
    G.render(renderer, out);
    return { bloom: 0.55, vignette: 0.5, grain: 0.06, zoom: lerp(1, 1.035, ease.inOutQuad(f.p)) };
  }

  private drawLine1(t: number) {
    const L = this.text, c = L.ctx;
    L.clear();
    const T = this.T;
    c.textBaseline = 'alphabetic';
    c.font = font(this.fam, this.size);
    c.letterSpacing = '-2px';
    const aIn = prog(t, this.L1.start - 0.4, this.L1.start - 0.2);
    for (const b of this.boxes) {
      const y = this.rows[b.row]!;
      const p = Lyrics.wordProgress(b.w, t);
      const isYou = /^you/i.test(b.w.w), isCage = /^cage/i.test(b.w.w);
      c.globalAlpha = aIn;
      c.fillStyle = rgba('bone', 0.16);
      c.fillText(b.w.w, b.x, y);
      if (p > 0) {
        c.save();
        c.beginPath();
        c.rect(b.x - 4, y - this.size, (b.lay.width + 8) * p, this.size * 1.5);
        c.clip();
        const struck = isCage ? prog(t, T.strike0, T.strike1) : 0;
        c.fillStyle = p < 1 || isYou ? rgba('signal') : rgba('bone', lerp(0.86, 0.3, struck));
        c.fillText(b.w.w, b.x, y);
        c.restore();
      }
    }
    c.globalAlpha = 1;
    c.letterSpacing = '0px';
  }

  /** A script written so far, the pen's last few px still hot; `hotWord` stays signal. */
  private drawScript(sc: Script, t: number, hotWord: boolean) {
    const st = sc.st, P = this.pen;
    const len = this.written(sc, t);
    if (len <= 0) return;
    const bone = LIN.bone, hot: RGB = [2.4, 0.9, 0.35];
    for (let i = 0; i < st.strokes.length; i++) {
      const s0 = st.startLen[i]!;
      if (s0 >= len) break;
      const pts = st.strokes[i]!, Ls = st.lens[i]!;
      for (let j = 1; j < pts.length; j++) {
        const sa = s0 + Ls[j - 1]!;
        if (sa >= len) break;
        const sb = Math.min(s0 + Ls[j]!, len);
        const a = pts[j - 1]!, b0 = pts[j]!;
        const u = (sb - sa) / Math.max(1e-6, s0 + Ls[j]! - sa);
        const b = { x: a.x + (b0.x - a.x) * u, y: a.y + (b0.y - a.y) * u };
        const h = Math.exp(-(len - sb) / 70);
        const col = hotWord ? mix3(mul(LIN.signal, 1.7), hot, h) : mix3(mul(bone, 0.86), hot, h);
        P.seg2(sc.x + a.x, sc.y + a.y, sc.x + b.x, sc.y + b.y, hotWord ? 4.4 : 2.5, col, 1);
      }
    }
  }
}
