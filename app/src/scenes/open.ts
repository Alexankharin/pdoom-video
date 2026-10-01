// B1 `open` — "Sparks of AGI": the unicorn, as a construction drawing (new song: 0 → the pre-chorus).
// Intro (instrumental): black; the model types its TikZ program in the dark, a line per beat. At
// the bass entry the typing caret drops out of the listing as the pen (the spark) and strikes the
// origin: axes, rays, graph paper. Then, a construction per bar, on the beat: the compass circle
// and protractor, the ellipse's box, foci and the gardener's string, the Swiss grid of the lyric
// column, the leg guides, the neck angle and the mane's control polygons, the horn's apex and the
// eye's coordinate, the title block. Where the drums come in the whole construction "compiles"
// (a flash of heat) and the pen marks the corners of the first lyric glyph on the snare roll.
// "I see sparks of AGI in your eyes": the pickup "I" is drawn as a TikZ rectangle; the pen plots
// the unicorn from primitives on the beat; the horn fires a streak into "AGI"; "eyes" is a perfect
// dot, r = 0.08. "You sell me love; I buy your lies": a price tag ($20/mo) hangs off the chest, the
// heart is plotted as a TikZ primitive (a square on its corner and two semicircles), PAID; on
// "lies" its width is dimensioned ∞ and the path turns out never to close (no -- cycle).
// "We choose your answers, two by two": the sheet splits into preference pairs A | B, one pair per
// beat, sampled from the training run (five legs, horn on the wrong end, legs up, a horse…): the
// pen ticks one and strikes the other. "You learn my taste; I call it true": the last pair is
// identical, A and B slide into one (A = B); "true" is closed with a Q.E.D. tombstone, which the
// pen carries, as the sheet cools to black, to where the prompt's caret appears.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, textPathCommands, type TextLayout } from '../engine/type';
import { strokeText } from '../engine/stroke';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { sparkHead, sparkParticles } from './_motifs';
import { clamp, lerp, ease, prog, pulse, noise1, hash, TAU } from '../engine/util';
import { type P, type Part, type Mutation, pt, ellipse, arc, rect, poly, lengths, at, unicorn, EYE, heart, sample } from './open-geo';

type RGB = [number, number, number];
type Kind = 'axis' | 'cons' | 'prim' | 'dim' | 'hatch' | 'plot' | 'eye' | 'ghost' | 'ring' | 'mark';
type Ease = (x: number) => number;

interface Stroke {
  pts: P[]; L: Float32Array; tot: number;
  t0: number; t1: number;
  kind: Kind; pen: boolean; ez: Ease;
  alpha: number; width: number; dash: number; // dash period in px (0 = solid)
  group: string;
  tD: Float32Array; // time at which the head reaches each point
}
interface Note { text: string; x: number; y: number; em: number; t0: number; dur: number; col: string; a: number; align: CanvasTextAlign; rot: number; group: string; weight: number; maxPx: number; hot: number }
interface LWord { w: Word; text: string; x: number; y: number; em: number; fam: string; lay: TextLayout; group: string; tAnt: number }
interface Cam { cx: number; cy: number; z: number; roll: number }
interface CamKey extends Cam { t: number; ez?: Ease }
interface Pair { v: [Mutation, Mutation]; r: number; win: 0 | 1; why: string }
interface PairGeo { segs: Float32Array; n: number } // x0 y0 x1 y1 alpha f, local unicorn coords

const COLX = 4.3; // left edge of the lyric column (world units)
const COLW = 5.9;
const DESC_EM = 0.21; // Archivo descender depth (em)
const CAP_EM = 0.72;
// the TikZ listing (left of the sheet)
const LX = -10.6, LY = 5.45, LDY = 0.232, LEM = 0.13;
// preference pairs (below the unicorn)
const PY = -8.0, PAX = -3.9, PBX = 3.9, PHW = 3.6, PHH = 2.5, PS = 0.66, PCY = 0.7;
/** Where the prompt plate's caret appears on its first frame (screen px): the tombstone lands here. */
// (measured on prompt1 'darling' at 32.17 s: its caret spans x 1151–1160, y 617–762)
export const OPEN_HANDOFF = { x: 1155.5, y: 689.5, w: 10, h: 146 };

const PAIRS: Pair[] = [
  { v: ['five', 'base'], r: 0.0, win: 1, why: 'legs: 5' },
  { v: ['base', 'hornTail'], r: 0.16, win: 0, why: 'horn: wrong end' },
  { v: ['legsUp', 'base'], r: 0.32, win: 1, why: 'legs: up' },
  { v: ['base', 'noHorn'], r: 0.5, win: 0, why: 'a horse' },
  { v: ['giraffe', 'base'], r: 0.66, win: 1, why: 'neck: 2×' },
  { v: ['base', 'twoHeads'], r: 0.82, win: 0, why: 'heads: 2' },
  { v: ['base', 'base'], r: 1.0, win: 0, why: 'diff 0.00' },
];

const BG_FRAG = /* glsl */ `
uniform vec4 uCam;       // cx, cy, zoom (px/unit), roll
uniform vec2 uRes;
uniform float uReveal;   // grid reveal radius (world units)
uniform vec3 uPen;       // pen screen xy (px, y down), intensity
uniform float uFade;     // 0..1 fade the sheet to black
uniform float uHeat;     // the "compile" flash
void main() {
  vec2 sp = vec2(vUv.x, 1.0 - vUv.y) * uRes;             // screen px, y down
  vec2 d = sp - 0.5 * uRes;
  float c = cos(-uCam.w), s = sin(-uCam.w);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y) / uCam.z;
  vec2 p = uCam.xy + vec2(d.x, -d.y);                      // world, y up
  vec3 col = C_INK;
  // graph paper (TikZ help lines): minor 0.25, major 1.0
  vec2 g1 = abs(fract(p / 0.25 + 0.5) - 0.5) * 0.25 * uCam.z;
  vec2 g4 = abs(fract(p + 0.5) - 0.5) * uCam.z;
  float minor = max(1.0 - smoothstep(0.0, 1.0, g1.x), 1.0 - smoothstep(0.0, 1.0, g1.y));
  float major = max(1.0 - smoothstep(0.25, 1.25, g4.x), 1.0 - smoothstep(0.25, 1.25, g4.y));
  float dens = smoothstep(6.0, 18.0, 0.25 * uCam.z);
  float rr = length(p);
  float rev = smoothstep(uReveal, uReveal - 3.0, rr);
  float front = exp(-abs(rr - uReveal) * 1.6) * step(0.01, uReveal) * (1.0 - smoothstep(16.0, 26.0, uReveal));
  float edge = 1.0 - smoothstep(14.0, 18.0, max(abs(p.x + 1.0) * 0.72, abs(p.y + 1.5) * 0.9));
  col += C_BONE * (minor * 0.011 * dens + major * 0.028) * rev * edge;
  col += C_SIGNAL * (minor * dens * 0.5 + major) * front * 0.09;
  col += C_SIGNAL * (minor * dens * 0.4 + major) * uHeat * 0.06 * rev * edge;
  // the pen warms the paper right around it
  float pd = length(sp - uPen.xy);
  col += C_SIGNAL * 0.018 * uPen.z * exp(-pd * pd / (2.0 * 140.0 * 140.0));
  col *= 1.0 - uFade;
  fragColor = vec4(col, 1.0);
}`;

export default class OpenScene extends Scene {
  lines = new LineBatch(200000, { blend: 'add' });
  fx = new LineBatch(16000, { blend: 'add' });
  text = new Layer2D();
  bg = new FSPass(BG_FRAG, {
    uCam: { value: new THREE.Vector4() }, uRes: { value: new THREE.Vector2(W, H) }, uReveal: { value: 0 },
    uPen: { value: new THREE.Vector3() }, uFade: { value: 0 }, uHeat: { value: 0 },
  });

  strokes: Stroke[] = [];
  pens: Stroke[] = [];
  notes: Note[] = [];
  words: LWord[] = [];
  cams: CamKey[] = [];
  u1: Part[] = [];
  pairGeo: PairGeo[][] = [];

  // timing (all derived from the lyric and the beat grid)
  T0 = 0; T1 = 0;
  bar: (k: number, j?: number) => number = (k) => k;
  V: (i: number) => number = (i) => i; // beats from the downbeat after the pickup "I"
  beatLen = 0.45;
  L0!: Line; L1!: Line; L2!: Line; L3!: Line;
  w: Record<string, Word> = {};
  agi: [number, number][] = [];
  rectWords = new Set<Word>();
  tBorn = 0; tIgn = 0; tCompass = 0; tBox = 0; tG0 = 0; tG1 = 0; tDrums = 0;
  tL1 = 0; tL2 = 0; tL3 = 0; tMerge = 0; tTomb = 0; tExit = 0; tFly = 0; tCut = 0;
  P: number[] = []; // pair onsets
  pTick: number[] = []; pStrike: number[] = [];
  eye = EYE.k1;
  hc = pt(1.12, -0.12); // heart centre
  ha = 0.36; // heart side
  tag = { x: 2.62, y: -1.12 };
  tomb = { x: 0, y: 0, w: 0, h: 0 };
  famL = F.archivo(100, 700);
  row1 = { y: 5.4, em: 1.1 };
  hdr = { x: -7.5, y: -4.95, em: 0.8 };
  bot = { y: -11.42, em: 1.0 };

  override async init() {
    const au = this.ctx.audio, ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    const d0 = au.downbeats.find((d) => d >= this.T0 - 0.05) ?? this.T0;
    const db0 = Math.round(au.beatAt(d0));
    this.bar = (k: number, j = 0) => au.timeOfBeat(db0 + 4 * k + j);
    this.L0 = ly.get('sparks of AGI');
    this.L1 = ly.get('sell me love');
    this.L2 = ly.get('two by two');
    this.L3 = ly.get('call it true');
    const find = (l: Line, q: string, nth = 0) => {
      const n = norm(q);
      const x = l.words.filter((y) => norm(y.w) === n)[nth];
      if (!x) throw new Error(`open: word not found: ${q}`);
      return x;
    };
    const w = this.w;
    w.I = find(this.L0, 'I'); w.see = find(this.L0, 'see'); w.sparks = find(this.L0, 'sparks'); w.of = find(this.L0, 'of');
    w.AGI = find(this.L0, 'AGI'); w.in = find(this.L0, 'in'); w.your = find(this.L0, 'your'); w.eyes = find(this.L0, 'eyes');
    w.You1 = find(this.L1, 'You'); w.sell = find(this.L1, 'sell'); w.me = find(this.L1, 'me'); w.love = find(this.L1, 'love');
    w.I1 = find(this.L1, 'I'); w.buy = find(this.L1, 'buy'); w.your1 = find(this.L1, 'your'); w.lies = find(this.L1, 'lies');
    w.We = find(this.L2, 'We'); w.choose = find(this.L2, 'choose'); w.your2 = find(this.L2, 'your'); w.answers = find(this.L2, 'answers');
    w.two = find(this.L2, 'two'); w.by = find(this.L2, 'by'); w.two2 = find(this.L2, 'two', 1);
    w.You3 = find(this.L3, 'You'); w.learn = find(this.L3, 'learn'); w.my = find(this.L3, 'my'); w.taste = find(this.L3, 'taste');
    w.I3 = find(this.L3, 'I'); w.call = find(this.L3, 'call'); w.it = find(this.L3, 'it'); w.true = find(this.L3, 'true');
    this.rectWords = new Set([w.I!, w.I1!, w.I3!]);
    const A = w.AGI!;
    this.agi = A.syl && A.syl.length === 3 ? A.syl : [0, 1, 2].map((i) => [lerp(A.start, A.end, i / 3), lerp(A.start, A.end, (i + 1) / 3)] as [number, number]);
    const vb0 = Math.ceil(au.beatAt(w.I!.start) - 1e-3);
    this.V = (i: number) => au.timeOfBeat(vb0 + i);
    this.beatLen = au.timeOfBeat(vb0 + 1) - au.timeOfBeat(vb0);

    // intro: a construction per bar; ignition on the bass entry (bar 2), the compile flash where the drums come in
    this.tIgn = this.bar(2);
    this.tBorn = au.timeOfBeat(au.beatAt(this.tIgn) - 0.25);
    this.tCompass = this.bar(3);
    this.tBox = this.bar(4);
    this.tG0 = this.bar(4, 1); this.tG1 = this.bar(4, 3.5);
    this.tDrums = this.bar(9);
    // the lines
    this.tL1 = w.You1!.start; this.tL2 = w.We!.start; this.tL3 = w.You3!.start;
    const pb0 = Math.ceil(au.beatAt(this.tL2) - 1e-3);
    for (let k = 0; k < PAIRS.length; k++) {
      const tk = au.timeOfBeat(pb0 + k);
      if (tk > this.tL3 - 0.25) break;
      this.P.push(tk);
      this.pTick.push(au.timeOfBeat(pb0 + k + 0.5));
      this.pStrike.push(au.timeOfBeat(pb0 + k + 0.75));
    }
    this.tMerge = this.tL3;
    this.tTomb = au.timeOfBeat(Math.ceil(au.beatAt(w.true!.start) + 0.05));
    this.tCut = Math.min(this.T1, au.timeOfBeat(Math.round(au.beatAt(this.tTomb)) + 1));
    this.tExit = Math.min(this.tTomb + 0.18, this.tCut - 0.22);
    this.tFly = this.tExit;

    this.u1 = unicorn(1);
    this.buildLyrics();
    this.buildPairs();
    this.buildCamera();
    this.buildPlot();
  }

  // ================================================================== layout: the lyric column
  buildLyrics() {
    const fam = this.famL;
    const place = (words: Word[], text: string[], x: number, y: number, em: number, group: string, ant = 0.3) => {
      let cx = x;
      const sp = (layout(' ', fam, 100).width / 100) * em;
      words.forEach((wd, i) => {
        const tx = text[i] ?? wd.w;
        const lay = layout(tx, fam, 100);
        this.words.push({ w: wd, text: tx, x: cx, y, em, fam, lay, group, tAnt: wd.start - ant });
        cx += (lay.width / 100) * em + sp;
      });
      return cx - sp;
    };
    const width = (text: string, em: number) => (layout(text, fam, 100).width / 100) * em;
    /** Em size that makes a row exactly `colW` wide (Swiss poster: every row justified to the column), capped. */
    const fit = (text: string, colW: number, maxEm: number) => Math.min(maxEm, colW / (layout(text, fam, 100).width / 100));
    const GAP = 0.2;
    const stack = (rows: [string, number][], topY: number, colW: number) => {
      let y = topY;
      let prevDesc = 0;
      return rows.map(([text, maxEm], i) => {
        const em = fit(text, colW, maxEm);
        y -= (i === 0 ? 0 : prevDesc + GAP) + CAP_EM * em;
        prevDesc = DESC_EM * em;
        return { y, em };
      });
    };
    const w = this.w;
    // line 0: "AGI" is anchored right above the horn's tip; "I see sparks of" sits on top of it
    const emAGI = fit('AGI', COLW, 2.45);
    const emR1 = fit('I see sparks of', COLW, 1.25);
    const yAGI = 3.18;
    const yR1 = yAGI + CAP_EM * emAGI + GAP + DESC_EM * emR1;
    place([w.I!, w.see!, w.sparks!, w.of!], ['I', 'see', 'sparks', 'of'], COLX, yR1, emR1, 'l0');
    place([w.AGI!], ['AGI'], COLX - 0.06 * emAGI, yAGI, emAGI, 'l0');
    place([w.in!, w.your!], ['in', 'your'], COLX, 2.28, 0.5, 'l0e', 0.25);
    place([w.eyes!], ['eyes'], COLX, 1.62, 0.5, 'l0e', 0.2);
    this.row1 = { y: yR1, em: emR1 };
    // line 1 under it, in the same column
    const r1 = stack([['You sell me', 1.2], ['love;', 1.55], ['I buy your', 1.2], ['lies', 1.55]], 0.72, COLW);
    place([w.You1!, w.sell!, w.me!], ['You', 'sell', 'me'], COLX, r1[0]!.y, r1[0]!.em, 'l1');
    place([w.love!], ['love;'], COLX - 0.03, r1[1]!.y, r1[1]!.em, 'l1');
    place([w.I1!, w.buy!, w.your1!], ['I', 'buy', 'your'], COLX, r1[2]!.y, r1[2]!.em, 'l1');
    place([w.lies!], ['lies'], COLX - 0.03, r1[3]!.y, r1[3]!.em, 'l1');
    this.rows1 = [...r1];
    // lines 2 and 3: a header over the pairs, and a row under them
    const h = this.hdr;
    h.em = Math.min(0.82, (2 * PHW * 2 + 0.8 - 3.2) / (width('We choose your answers,', 1)));
    place([w.We!, w.choose!, w.your2!, w.answers!], ['We', 'choose', 'your', 'answers,'], h.x, h.y, h.em, 'l2h');
    const b = this.bot;
    const c2 = (x: number, s: string) => x - width(s, b.em) / 2;
    place([w.two!], ['two'], c2(PAX, 'two'), b.y, b.em, 'l2b');
    place([w.by!], ['by'], c2(0, 'by'), b.y, b.em, 'l2b');
    place([w.two2!], ['two'], c2(PBX, 'two'), b.y, b.em, 'l2b');
    place([w.You3!, w.learn!, w.my!, w.taste!], ['You', 'learn', 'my', 'taste;'], h.x, h.y, h.em, 'l3h', 0.12);
    // "I call it true ∎", centred under the merged drawing
    const cap = CAP_EM * b.em;
    const tw = 0.5 * cap, tg = 0.26 * b.em;
    const rowW = width('I call it true', b.em) + tg + tw;
    const end = place([w.I3!, w.call!, w.it!, w.true!], ['I', 'call', 'it', 'true'], -rowW / 2, b.y, b.em, 'l3b', 0.2);
    this.tomb = { x: end + tg, y: b.y, w: tw, h: cap };
  }
  rows1: { y: number; em: number }[] = [];

  // ================================================================== the preference pairs
  buildPairs() {
    for (const pr of PAIRS) {
      this.pairGeo.push(pr.v.map((m) => {
        const parts = sample(m, pr.r);
        const closed = parts.filter((p) => p.closed);
        const segs: number[] = [];
        const hideK = clamp((pr.r - 0.3) / 0.5);
        parts.forEach((p, pi) => {
          for (let i = 1; i < p.pts.length; i++) {
            const a = p.pts[i - 1]!, b = p.pts[i]!;
            let al = 1;
            if (hideK > 0 && p.closed) {
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              for (const q of closed) if (q.id !== p.id && pointInPoly(mx, my, q.pts)) { al = 1 - hideK; break; }
            }
            if (al <= 0.01) continue;
            segs.push(a.x, a.y, b.x, b.y, al, (pi + i / p.pts.length) / parts.length);
          }
        });
        return { segs: new Float32Array(segs), n: segs.length / 6 };
      }));
    }
  }

  /** Panel centre of side s at time t (A and B slide together on "You learn"). */
  panelX(s: 0 | 1, t: number) {
    const m = ease.inOutCubic(prog(t, this.tMerge, this.tMerge + 0.42));
    return lerp(s === 0 ? PAX : PBX, 0, m);
  }
  pairIndex(t: number) {
    let k = -1;
    for (let i = 0; i < this.P.length; i++) if (t >= this.P[i]!) k = i;
    return k;
  }

  // ================================================================== camera
  buildCamera() {
    const bar = this.bar, V = this.V, w = this.w, e = this.eye;
    const K = (t: number, cx: number, cy: number, z: number, roll: number, ez?: Ease): CamKey => ({ t, cx, cy, z, roll, ez });
    const ib = this.glyphBox(this.words[0]!, 0);
    const lcx = LX + 1.55;
    const ly = (i: number) => LY - i * LDY;
    const r1 = this.rows1;
    const topL = 0.9, botL = r1[3]!.y - 0.1;
    const cyL = (topL + botL) / 2, zL = Math.min(170, (H - 200) / (topL - botL));
    const ks: CamKey[] = [
      K(0, lcx - 0.05, ly(0) - 0.1, 420, 0.0),
      K(bar(1) - 0.02, lcx + 0.1, ly(0) - 0.14, 446, -0.008, ease.linear), // slow push while the prompt types
    ];
    for (let j = 0; j < 4; j++) {
      ks.push(K(bar(1, j) + 0.2, lcx + 0.15 + 0.06 * j, ly(j + 1) - 0.05, 430 - 28 * (j + 1), -0.008 + 0.004 * j, ease.outExpo));
      ks.push(K(bar(1, j + 1) - (j === 3 ? this.tIgn - this.tBorn : 0.02), lcx + 0.17 + 0.06 * j, ly(j + 1) - 0.07, 426 - 28 * (j + 1), -0.006 + 0.004 * j, ease.linear));
    }
    ks.push(
      K(this.tIgn, 0, 0, 560, 0.3, ease.inCubic), // the pen drops out of the listing and strikes the origin
      K(this.tIgn + 0.9 * this.beatLen, 0.05, 0.05, 236, 0.07, ease.outExpo), // pull back as the axes shoot out
      K(bar(3), 0.1, 0.12, 214, 0.015, ease.inOutQuad), // the compass
      K(bar(4), 0.05, 0.16, 222, 0.0, ease.linear),
      K(bar(4) + 0.3, 0.0, 0.05, 250, -0.02, ease.outExpo), // the box, the foci, the string
      K(bar(5) - 0.02, 0.0, 0.0, 264, -0.026, ease.linear),
      K(bar(5) + 0.35, 7.25, 1.7, 132, 0.012, ease.outExpo), // the column's grid
      K(bar(6) - 0.02, 7.1, 1.6, 138, 0.008, ease.linear),
      K(bar(6) + 0.3, 0, -1.25, 196, -0.02, ease.outExpo), // the leg guides
      K(bar(7) - 0.02, 0.1, -1.18, 204, -0.022, ease.linear),
      K(bar(7) + 0.3, 1.85, 1.55, 232, 0.025, ease.outExpo), // neck, head, mane
      K(bar(8) - 0.02, 1.95, 1.6, 242, 0.03, ease.linear),
      K(bar(8) + 0.9, -0.5, 1.3, 84, 0.0, ease.outExpo), // the whole sheet
      K(bar(9) - 0.02, -0.4, 1.36, 88, 0.006, ease.linear),
      K(bar(9) + 0.3, 3.9, 3.4, 116, -0.018, ease.outExpo), // drums: toward the column
    );
    // the snare roll: a step toward the first glyph per hit
    const roll = [bar(9, 1), bar(9, 2), bar(9, 2.5), bar(9, 3)];
    roll.forEach((tr, i) => {
      const k = (i + 1) / 5;
      ks.push(K(tr - 0.02, lerp(3.9, ib.x0 + 1.4, i / 5), lerp(3.4, ib.y0 + 0.4, i / 5), 116 * Math.pow(380 / 116, i / 5), -0.018, ease.linear));
      ks.push(K(tr + 0.1, lerp(3.9, ib.x0 + 1.4, k), lerp(3.4, ib.y0 + 0.4, k), 116 * Math.pow(380 / 116, k), -0.02 - 0.004 * i, ease.outExpo));
    });
    ks.push(
      K(w.I!.start - 0.1, ib.x0 + 1.45, ib.y0 + 0.41, 330, -0.03, ease.linear),
      K(w.I!.start + 0.12, ib.x0 + 1.5, ib.y0 + 0.42, 380, -0.035, ease.inOutCubic), // onto the "I"
      K(V(0) - 0.03, ib.x0 + 1.3, ib.y0 + 0.4, 470, -0.05, ease.inOutQuad),
      K(V(0) + 0.34, 3.2, 2.1, 100, 0.02, ease.outExpo), // the body, on the downbeat
      K(w.AGI!.start - 0.03, 3.4, 2.2, 104, 0.0, ease.inOutQuad),
      K(w.AGI!.start + 0.26, 5.0, 3.55, 200, -0.065, ease.outExpo), // snap onto the horn and "AGI"
      K(this.agi[1]![0] + 0.3, 5.3, 3.68, 224, -0.04, ease.outExpo),
      K(w.in!.start - 0.02, 5.45, 3.74, 236, -0.02, ease.linear),
      K(w.eyes!.start - 0.01, e.x + 0.95, 1.62, 372, 0.0, ease.inOutCubic), // dive across to the eye
      K(this.tL1 - 0.01, e.x + 0.93, 1.62, 396, 0.008, ease.linear),
      // "You sell me love; I buy your lies"
      K(this.tL1 + 0.3, 5.35, cyL, zL, -0.03, ease.outExpo), // snap out: the chest, the tag, the column
      K(w.love!.start - 0.02, 5.3, cyL + 0.05, zL * 1.03, -0.026, ease.linear),
      K(w.love!.start + 0.3, 4.95, r1[1]!.y + 0.55, 174, 0.018, ease.outExpo), // onto the heart and "love;"
      K(w.I1!.start - 0.02, 4.97, r1[1]!.y + 0.52, 177, 0.018, ease.linear),
      K(w.I1!.start + 0.25, 5.4, cyL - 0.3, zL * 1.06, -0.014, ease.outExpo), // back to the column
      K(w.lies!.start - 0.02, 5.4, cyL - 0.32, zL * 1.08, -0.016, ease.linear),
      K(w.lies!.start + 0.22, 5.3, cyL + 0.05, zL * 1.02, 0.022, ease.outExpo), // the open path, the ∞, "lies"
      K(this.tL2 - 0.02, 5.28, cyL + 0.03, zL * 1.04, 0.024, ease.linear),
      K(this.tL2 + 0.36, 0, PY + 0.1, 112, 0.0, ease.inOutCubic), // down to the pairs
    );
    // the pairs: the camera leans toward each pick
    this.P.forEach((_, k) => {
      const s = PAIRS[k]!.win === 0 ? -1 : 1;
      ks.push(K(this.pTick[k]! - 0.02, 0.018 * s, PY + 0.1, 112 + 1.4 * k, 0.0, ease.linear));
      ks.push(K(this.pTick[k]! + 0.16, 0.12 * s, PY + 0.1, 114 + 1.4 * k, 0.004 * s, ease.outExpo));
    });
    ks.push(
      K(this.tMerge - 0.02, 0.0, PY + 0.1, 112, 0.0, ease.linear),
      K(this.tMerge + 0.45, 0.0, PY + 0.05, 114, 0.0, ease.outExpo), // A and B slide into one
      K(w.true!.start - 0.02, 0.05, PY + 0.0, 116, -0.004, ease.linear),
      K(w.true!.start + 0.32, 1.1, PY - 2.25, 172, -0.014, ease.outExpo), // "true", and the tombstone
      K(this.tCut, 1.25, PY - 2.35, 180, -0.018, ease.linear),
    );
    // keep the keys in time order (short words can make neighbours cross)
    for (let i = 1; i < ks.length; i++) if (ks[i]!.t <= ks[i - 1]!.t) ks[i]!.t = ks[i - 1]!.t + 1e-3;
    this.cams = ks;
  }

  cam(t: number): Cam {
    const ks = this.cams;
    if (t <= ks[0]!.t) return ks[0]!;
    for (let i = 1; i < ks.length; i++) {
      const b = ks[i]!;
      if (t > b.t) continue;
      const a = ks[i - 1]!;
      const k = (b.ez ?? ease.inOutCubic)(clamp((t - a.t) / Math.max(1e-4, b.t - a.t)));
      const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), k));
      const roll = lerp(a.roll, b.roll, k);
      // zoom about the fixed point of the move, so dives and pull-backs read as one gesture
      if (Math.abs(b.z - a.z) > a.z * 0.04) {
        const fx = (b.z * b.cx - a.z * a.cx) / (b.z - a.z), fy = (b.z * b.cy - a.z * a.cy) / (b.z - a.z);
        return { cx: fx - (a.z / z) * (fx - a.cx), cy: fy - (a.z / z) * (fy - a.cy), z, roll };
      }
      return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z, roll };
    }
    return ks[ks.length - 1]!;
  }

  // ================================================================== the plot program
  addStroke(pts: P[], t0: number, t1: number, kind: Kind, o: Partial<Pick<Stroke, 'pen' | 'ez' | 'alpha' | 'width' | 'dash' | 'group'>> = {}) {
    const L = lengths(pts);
    const tot = L[L.length - 1]!;
    const ez = o.ez ?? ease.linear;
    const tD = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      // invert the ease: when does the head reach point i?
      const target = tot > 0 ? L[i]! / tot : 1;
      let lo = 0, hi = 1;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (ez(m) < target) lo = m; else hi = m; }
      tD[i] = t0 + (t1 - t0) * hi;
    }
    const s: Stroke = { pts, L, tot, t0, t1, kind, pen: o.pen ?? false, ez, alpha: o.alpha ?? 1, width: o.width ?? 1.2, dash: o.dash ?? 0, group: o.group ?? 'main', tD };
    this.strokes.push(s);
    if (s.pen) this.pens.push(s);
    return s;
  }
  /** A pen waypoint: the pen is at p at time t (it travels there before). */
  wp(p: P, t: number, hold = 0) { this.addStroke([p, pt(p.x + 1e-4, p.y)], t, t + Math.max(1e-3, hold), 'ghost', { pen: true, alpha: 0 }); }
  note(text: string, x: number, y: number, t0: number, o: Partial<Omit<Note, 'text' | 'x' | 'y' | 't0'>> = {}) {
    this.notes.push({
      text, x, y, t0, em: o.em ?? 0.2, dur: o.dur ?? Math.min(0.4, 0.01 * text.length + 0.05), col: o.col ?? 'ash', a: o.a ?? 0.9,
      align: o.align ?? 'left', rot: o.rot ?? 0, group: o.group ?? 'main', weight: o.weight ?? 400, maxPx: o.maxPx ?? 30, hot: o.hot ?? 0,
    });
  }
  /** Single-stroke technical lettering, written by the pen. */
  plotText(text: string, x: number, y: number, em: number, t0: number, t1: number, group = 'main') {
    const st = strokeText(text, 'tech', 100);
    const k = em / 100;
    let acc = 0;
    st.strokes.forEach((s, i) => {
      const len = st.lens[i]![st.lens[i]!.length - 1] ?? 0;
      const a = t0 + (t1 - t0) * (acc / st.total), b = t0 + (t1 - t0) * ((acc + len) / st.total);
      acc += len;
      if (s.length >= 2) this.addStroke(s.map((p) => pt(x + p.x * k, y - p.y * k)), a, b, 'plot', { pen: true, width: 1.4, group });
    });
  }
  /** Engineering dimension: extension ticks, arrowheads, centred value. */
  dimension(a: P, b: P, label: string, t0: number, group: string, em = 0.16, o: { col?: string; hot?: number; pen?: boolean } = {}) {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const S = (pts: P[], ta: number, tb: number, pen = false) => this.addStroke(pts, ta, tb, 'dim', { alpha: 0.75, width: 1.0, group, pen });
    S([a, b], t0, t0 + 0.12, o.pen);
    const ar = 0.1;
    for (const [p, s] of [[a, 1], [b, -1]] as const) {
      S([pt(p.x + s * ux * ar + nx * ar * 0.33, p.y + s * uy * ar + ny * ar * 0.33), p, pt(p.x + s * ux * ar - nx * ar * 0.33, p.y + s * uy * ar - ny * ar * 0.33)], t0 + 0.08, t0 + 0.12);
      S([pt(p.x - nx * 0.1, p.y - ny * 0.1), pt(p.x + nx * 0.1, p.y + ny * 0.1)], t0, t0 + 0.05);
    }
    const m = pt((a.x + b.x) / 2, (a.y + b.y) / 2);
    const vert = Math.abs(dy) > Math.abs(dx);
    this.note(label, m.x + (vert ? -0.07 : 0), m.y + (vert ? -em * 0.32 : 0.06), t0 + 0.1, { em, align: vert ? 'right' : 'center', col: o.col ?? 'ash', group, dur: 0.08, hot: o.hot ?? 0, maxPx: 99 });
  }
  /** World-space ink box of glyph gi of a lyric word. */
  glyphBox(lw: LWord, gi: number) {
    const g = lw.lay.glyphs[gi]!;
    const cmds = textPathCommands(g.ch, lw.fam, 100, 0, 0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cmds) if ('x' in c) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
    const k = lw.em / 100;
    return { x0: lw.x + (g.x + x0) * k, x1: lw.x + (g.x + x1) * k, y0: lw.y - y1 * k, y1: lw.y - y0 * k };
  }
  lw(word: Word) { return this.words.find((x) => x.w === word)!; }

  buildPlot() {
    const bar = this.bar, V = this.V, w = this.w;
    const part = (id: string) => this.u1.find((p) => p.id === id)!.pts;
    const S = (pts: P[], t0: number, t1: number, kind: Kind, o: Parameters<OpenScene['addStroke']>[4] = {}) => this.addStroke(pts, t0, t1, kind, o);
    const line = (a: P, b: P) => [a, b];
    const ez = ease;
    const ly = (i: number) => LY - i * LDY;

    // ---- the TikZ listing: the preamble is typed in the dark, a line per beat; later lines light
    // up as their primitive is plotted
    const lst: [string, number, number?][] = [
      ['% prompt: "Draw a unicorn in TikZ."', bar(0, 0.5), bar(0, 3.6) - bar(0, 0.5)],
      ['\\documentclass[tikz]{standalone}', bar(1, 0), 0.3],
      ['\\begin{document}', bar(1, 1), 0.2],
      ['\\begin{tikzpicture}', bar(1, 2), 0.2],
      ['\\draw[help lines,step=.25] (-15,-9) grid (15,9);', bar(1, 3), this.tBorn - bar(1, 3) - 0.02],
      ['\\draw[->] (-15,0) -- (15,0);', this.tIgn + 0.05],
      ['\\draw[->] (0,-9) -- (0,9);', this.tIgn + 0.15],
      ['\\draw (0,0) circle (2);', this.tCompass],
      ['\\draw[dashed] (0,0) circle (1);', bar(3, 2)],
      ['\\draw[dashed] (-2,-1) rectangle (2,1);', this.tBox],
      ['\\draw[dashed] (0,0) ellipse (2 and 1); % string', this.tG0],
      ['\\draw[help lines] (4.3,-5) grid[xstep=5.9] (10.2,6);', bar(5)],
      ['\\draw (-3.9,-2.3) -- (3.9,-2.3);      % ground', bar(6)],
      ['\\foreach \\x in {-1.5,-1,0.85,1.35} \\draw[dashed] ..;', bar(6, 1)],
      ['\\draw[dashed] (0.75,-0.4) -- (2.85,2.9); % 63°', bar(7)],
      ['\\draw[dashed,rotate=-17] (2.72,1.95) ellipse ..;', bar(7, 1)],
      ['\\draw[dashed] (2.3,2.3) -- (1.9,2.5) -- ..; % mane', bar(7, 2)],
      ['\\coordinate (apex) at (3.3,3.55);', bar(8, 1)],
      ['\\coordinate (eye) at (2.95,2);', bar(8, 2)],
      ['\\draw (0,0) ellipse (2 and 1);     % body', V(0)],
      ['\\foreach \\x in {-1.5,-1,0.85,1.35}', V(1)],
      ['  \\draw (\\x,-0.62) rectangle ++(0.32,-1.68);', V(1) + 0.1],
      ['\\draw (-1.95,0.3) .. controls ..;  % tail', V(2)],
      ['\\draw (1.25,0.55) -- ... -- cycle; % neck', V(2.5)],
      ['\\draw[rotate=-17] (2.72,1.95) ellipse ..;', V(2.5) + 0.09],
      ['\\draw (2.3,2.3) .. controls ..;     % mane', V(3)],
      ['\\draw (apex) -- (2.92,2.2) -- cycle; % horn', this.agi[0]![0]],
      ['\\fill (eye) circle (0.08);         % eye', w.eyes!.start],
      ['\\node[tag] at (3.2,-1.1) {\\$20/mo};', w.sell!.start],
      ['\\draw (1.12,-0.4) -- ++(135:.36) arc .. arc ..;', w.love!.start],
      ['% TODO: -- cycle', w.lies!.start],
      ['\\foreach \\k in {1,...,7} \\prefer{A}{B};', this.tL2],
      ['\\end{tikzpicture}', this.tTomb],
    ];
    lst.forEach(([txt, ti, dur], i) => this.note(txt, LX, ly(i), ti, {
      em: LEM, col: i === 0 ? 'bone' : 'ash', a: i === 0 ? 0.9 : 0.78, dur: dur ?? 0.12, group: 'listing', hot: i > 4 ? 0.45 : 0, maxPx: 99,
    }));
    // ---- the title block (under the listing)
    {
      const tbx = LX, tby = ly(lst.length) - 0.3, tbw = 4.6, rh = 0.34;
      const tt = bar(8, 2.5);
      S(poly(pt(tbx, tby), pt(tbx + tbw, tby), pt(tbx + tbw, tby - 3 * rh), pt(tbx, tby - 3 * rh)), tt, tt + 0.22, 'cons', { pen: true, alpha: 0.7, group: 'title', ez: ez.inOutQuad });
      for (let r = 1; r < 3; r++) S(line(pt(tbx, tby - r * rh), pt(tbx + tbw, tby - r * rh)), tt + 0.1, tt + 0.25, 'cons', { alpha: 0.5, group: 'title' });
      S(line(pt(tbx + 2.3, tby - rh), pt(tbx + 2.3, tby - 3 * rh)), tt + 0.15, tt + 0.28, 'cons', { alpha: 0.5, group: 'title' });
      const cell = (txt: string, x: number, r: number, d: number, col = 'ash') => this.note(txt, tbx + x, tby - r * rh - 0.23, tt + d, { em: 0.13, col, group: 'title', dur: 0.15 });
      cell('TITLE   unicorn (exp. 1)', 0.1, 0, 0.2, 'bone');
      cell('DRAWN   the model', 0.1, 1, 0.25);
      cell('CHECKED you', 2.4, 1, 0.3);
      cell('SCALE   1:1', 0.1, 2, 0.35);
      cell('SHEET   1 of 1', 2.4, 2, 0.4);
    }

    // ---- ignition: the caret drops out of the listing as the pen; the axes shoot out of the spark
    const t0 = this.tIgn;
    this.wp(pt(LX + LEM * 0.6 * lst[4]![0].length + 0.1, ly(4) + 0.04), this.tBorn, 0.01);
    this.wp(pt(0, 0), t0 - 0.002, 0.25);
    for (const [dx, dy, len, d] of [[1, 0, 15, 0], [-1, 0, 15, 0.01], [0, 1, 9, 0.03], [0, -1, 13, 0.04]] as const)
      S(line(pt(0, 0), pt(dx * len, dy * len)), t0 + d, t0 + d + 0.55, 'axis', { ez: ez.outExpo, width: 1.1, group: 'axes' });
    for (let d = 30; d < 360; d += 30) {
      if (d % 90 === 0) continue;
      const a = (d * Math.PI) / 180;
      S(line(pt(0.25 * Math.cos(a), 0.25 * Math.sin(a)), pt(13 * Math.cos(a), 13 * Math.sin(a))), t0 + 0.02, t0 + 0.62, 'cons', { ez: ez.outExpo, alpha: 0.5, dash: 10, width: 1.0, group: 'rays' });
    }
    const reach = (d: number, len: number) => { // time the ray's head passes distance d
      let lo = 0, hi = 1;
      for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (ease.outExpo(m) * len < d) lo = m; else hi = m; }
      return t0 + 0.55 * hi;
    };
    for (let i = -14; i <= 14; i++) {
      if (i === 0) continue;
      const ti = reach(Math.abs(i), 15);
      S(line(pt(i, 0.08), pt(i, -0.08)), ti, ti + 0.04, 'axis', { width: 1.0, group: 'axes' });
      for (let q = 1; q < 4; q++) if (Math.abs(i) < 14) S(line(pt(i + Math.sign(i) * q * 0.25, 0.035), pt(i + Math.sign(i) * q * 0.25, -0.035)), ti + 0.01, ti + 0.04, 'axis', { width: 1.0, alpha: 0.6, group: 'axes' });
      this.note(tick(i), i, -0.3, ti + 0.02, { em: 0.15, align: 'center', col: 'ash', a: 0.75, group: 'axes', dur: 0.03 });
    }
    for (let i = -12; i <= 8; i++) {
      if (i === 0) continue;
      const ti = reach(Math.abs(i), i < 0 ? 13 : 9);
      S(line(pt(-0.08, i), pt(0.08, i)), ti, ti + 0.04, 'axis', { width: 1.0, group: 'axes' });
      this.note(tick(i), -0.17, i - 0.055, ti + 0.02, { em: 0.15, align: 'right', col: 'ash', a: 0.75, group: 'axes', dur: 0.03 });
    }
    this.note('(0,0)', 0.1, -0.27, t0 + 0.1, { em: 0.15, col: 'ash', group: 'axes', dur: 0.05 });
    this.note('x', 14.55, 0.16, t0 + 0.4, { em: 0.2, col: 'ash', group: 'axes' });
    this.note('y', 0.14, 8.55, t0 + 0.4, { em: 0.2, col: 'ash', group: 'axes' });
    S(arc(0, 0, 0.35, 0, TAU, 96), t0, t0 + 0.02, 'ring', { alpha: 1, width: 1.2, group: 'ring' });

    // ---- bar 3: the compass (the pen rides to (2,0) and sweeps a full circle); the protractor
    const tc = this.tCompass;
    const circ = S(arc(0, 0, 2, 0, TAU, 128), tc, tc + 0.38, 'cons', { pen: true, ez: ez.inOutCubic, alpha: 0.8, width: 1.1, group: 'cons' });
    this.note('r = 2', 1.52, -1.62, tc + 0.3, { em: 0.15, col: 'ash', group: 'cons' });
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const tt = circ.tD[Math.round((d / 360) * 128)]!;
      const l = d % 30 === 0 ? 0.2 : d % 10 === 0 ? 0.11 : 0.06;
      S(line(pt(2 * Math.cos(a), 2 * Math.sin(a)), pt((2 + l) * Math.cos(a), (2 + l) * Math.sin(a))), tt, tt + 0.03, 'cons', { alpha: d % 30 === 0 ? 0.9 : 0.6, width: 1.0, group: 'dial' });
      if (d % 30 === 0) this.note(`${d}°`, 2.42 * Math.cos(a), 2.42 * Math.sin(a) - 0.05, tt + 0.02, { em: 0.12, align: 'center', col: 'ash', a: 0.8, group: 'dial', dur: 0.03 });
    }
    // beat 2: the half circle, swept the other way; beat 3: the radius at 30°
    const tc2 = bar(3, 2);
    S(arc(0, 0, 1, Math.PI, Math.PI - TAU, 96), tc2, tc2 + 0.3, 'cons', { pen: true, ez: ez.inOutCubic, alpha: 0.45, width: 1.0, dash: 7, group: 'cons' });
    this.note('r = 1', -0.86, 0.72, tc2 + 0.25, { em: 0.15, col: 'ash', group: 'cons', align: 'right' });
    const tc3 = bar(3, 3);
    S(line(pt(0, 0), pt(2 * Math.cos(Math.PI / 6), 2 * Math.sin(Math.PI / 6))), tc3, tc3 + 0.12, 'cons', { pen: true, ez: ez.outCubic, alpha: 0.6, group: 'dial' });
    S(arc(0, 0, 0.55, 0, Math.PI / 6, 16), tc3 + 0.08, tc3 + 0.16, 'cons', { alpha: 0.6, group: 'dial' });
    this.note('30°', 0.62, 0.1, tc3 + 0.14, { em: 0.12, col: 'ash', group: 'dial' });

    // ---- bar 4: the ellipse's bounding box, foci, dimensions; the gardener's string
    const tb = this.tBox;
    S(rect(-2, 1, 4, 2), tb, tb + 0.17, 'cons', { pen: true, ez: ez.inOutQuad, alpha: 0.6, width: 1.0, dash: 9, group: 'cons' });
    const fx = Math.sqrt(3);
    for (const sx of [-1, 1]) {
      S(line(pt(sx * fx - 0.1, 0), pt(sx * fx + 0.1, 0)), tb + 0.1, tb + 0.14, 'cons', { alpha: 0.7, group: 'cons' });
      S(line(pt(sx * fx, -0.1), pt(sx * fx, 0.1)), tb + 0.11, tb + 0.15, 'cons', { alpha: 0.7, group: 'cons' });
    }
    this.note('F₁', -fx - 0.08, 0.14, tb + 0.14, { em: 0.14, col: 'ash', group: 'cons', align: 'right' });
    this.note('F₂', fx + 0.08, 0.14, tb + 0.15, { em: 0.14, col: 'ash', group: 'cons' });
    this.dimension(pt(-2, 1.3), pt(2, 1.3), '4.00', tb + 0.14, 'dims');
    this.dimension(pt(-2.3, -1), pt(-2.3, 1), '2.00', tb + 0.18, 'dims');
    S(ellipse(0, 0, 2, 1, 0, 160, -Math.PI / 2, 1), this.tG0, this.tG1, 'cons', { pen: true, ez: ez.inOutQuad, alpha: 0.55, dash: 6, width: 1.0, group: 'cons' });
    this.note('|PF₁| + |PF₂| = 4.00', -1.55, -1.42, this.tG0 + 0.2, { em: 0.14, col: 'ash', group: 'gardl', dur: 0.3 });

    // ---- bar 5: the Swiss grid of the lyric column
    const t5 = bar(5);
    const gy0 = 6.35, gy1 = -5.1;
    S(line(pt(COLX, gy0), pt(COLX, gy1)), t5, t5 + 0.22, 'cons', { pen: true, ez: ez.inOutQuad, alpha: 0.55, group: 'grid' });
    S(line(pt(COLX + COLW, gy1), pt(COLX + COLW, gy0)), bar(5, 0.5), bar(5, 0.5) + 0.22, 'cons', { pen: true, ez: ez.inOutQuad, alpha: 0.55, group: 'grid' });
    this.dimension(pt(COLX, 6.6), pt(COLX + COLW, 6.6), COLW.toFixed(2), bar(5, 1), 'grid', 0.16);
    this.note('col. 1 · Archivo 700 · every row justified', COLX, 6.95, bar(5, 1) + 0.1, { em: 0.12, col: 'ash', group: 'grid', dur: 0.25 });
    // baselines: line 0 on beat 1.5, line 1 on beat 2, cap lines on beat 3
    const bl0 = this.words.filter((x) => x.group === 'l0' || x.group === 'l0e').map((x) => [x.y, x.em] as const);
    const bl1 = this.rows1.map((r) => [r.y, r.em] as const);
    const uniq = (xs: (readonly [number, number])[]) => xs.filter((v, i) => xs.findIndex((u) => Math.abs(u[0] - v[0]) < 1e-3) === i);
    uniq(bl0).forEach(([y], i) => S(line(pt(COLX - 0.25, y), pt(COLX + COLW + 0.25, y)), bar(5, 1.5) + i * 0.04, bar(5, 1.5) + i * 0.04 + 0.2, 'cons', { ez: ez.outExpo, alpha: 0.4, dash: 5, group: 'grid' }));
    uniq(bl1).forEach(([y], i) => S(line(pt(COLX - 0.25, y), pt(COLX + COLW + 0.25, y)), bar(5, 2) + i * 0.04, bar(5, 2) + i * 0.04 + 0.2, 'cons', { ez: ez.outExpo, alpha: 0.4, dash: 5, group: 'grid' }));
    uniq([...bl0, ...bl1]).forEach(([y, em], i) => S(line(pt(COLX + COLW + 0.25, y + CAP_EM * em), pt(COLX - 0.25, y + CAP_EM * em)), bar(5, 3) + i * 0.03, bar(5, 3) + i * 0.03 + 0.2, 'cons', { ez: ez.outExpo, alpha: 0.25, dash: 3, group: 'grid' }));
    this.note('baseline grid', COLX + COLW + 0.35, this.rows1[0]!.y - 0.04, bar(5, 2) + 0.2, { em: 0.11, col: 'ash', group: 'grid' });

    // ---- bar 6: the ground and the leg guides, an 8th apart
    const t6 = bar(6);
    S(line(pt(-3.9, -2.3), pt(3.9, -2.3)), t6, t6 + 0.3, 'cons', { pen: true, alpha: 0.5, group: 'guides', ez: ez.outCubic });
    this.note('ground', 3.95, -2.36, t6 + 0.28, { em: 0.12, col: 'ash', group: 'guides' });
    const legX = [-1.5, -1.0, 0.85, 1.35];
    legX.forEach((x, i) => {
      const a = bar(6, 1 + i * 0.5);
      S(line(pt(x + 0.16, -0.3), pt(x + 0.16, -2.7)), a, a + 0.12, 'cons', { pen: true, alpha: 0.45, dash: 5, group: 'guides', ez: ez.outCubic });
    });
    this.dimension(pt(legX[2]!, -2.62), pt(legX[2]! + 0.32, -2.62), '0.32', bar(6, 3), 'guides', 0.12);
    this.dimension(pt(-2.05, -0.62), pt(-2.05, -2.3), '1.68', bar(6, 3) + 0.08, 'guides', 0.12);

    // ---- bar 7: the neck's angle, the head's ellipse, the mane's control polygons
    const t7 = bar(7);
    S(line(pt(0.75, -0.4), pt(2.85, 2.9)), t7, t7 + 0.14, 'cons', { pen: true, alpha: 0.45, dash: 6, group: 'guides', ez: ez.outCubic });
    S(arc(1.25, 0.55, 0.5, 0, Math.atan2(1.4, 0.7), 20), bar(7, 0.5), bar(7, 0.5) + 0.1, 'cons', { pen: true, alpha: 0.6, group: 'guides' });
    this.note('63°', 1.8, 0.64, bar(7, 0.5) + 0.1, { em: 0.14, col: 'ash', group: 'guides' });
    S(ellipse(2.72, 1.95, 0.72, 0.38, -0.3, 64), bar(7, 1), bar(7, 1) + 0.2, 'cons', { pen: true, alpha: 0.4, dash: 5, group: 'guides', ez: ez.inOutQuad });
    const maneCtl: P[][] = [[pt(2.3, 2.3), pt(1.9, 2.5), pt(1.5, 1.9), pt(1.55, 1.5)], [pt(1.95, 1.95), pt(1.5, 2.0), pt(1.2, 1.3), pt(1.3, 0.95)], [pt(1.65, 1.35), pt(1.2, 1.35), pt(1.0, 0.8), pt(1.1, 0.55)]];
    maneCtl.forEach((c, i) => {
      const a = bar(7, 2 + i * 0.5);
      S(c, a, a + 0.12, 'cons', { pen: true, alpha: 0.45, dash: 4, group: 'guides' });
      for (const q of [c[1]!, c[2]!]) S(ellipse(q.x, q.y, 0.03, 0.03, 0, 12), a + 0.04, a + 0.08, 'cons', { alpha: 0.7, group: 'guides' });
    });

    // ---- bar 8 (the whole sheet): the horn's axis and apex, the eye's coordinate
    S(line(pt(2.77, 2.25), pt(3.72, 4.45)), bar(8, 1), bar(8, 1) + 0.16, 'cons', { pen: true, alpha: 0.45, dash: 6, group: 'guides', ez: ez.outCubic });
    const cross = (c: P, r: number, t: number, label: string, grp: string) => {
      S(line(pt(c.x - r, c.y), pt(c.x + r, c.y)), t, t + 0.06, 'cons', { pen: true, alpha: 0.8, group: grp });
      S(line(pt(c.x, c.y - r), pt(c.x, c.y + r)), t + 0.06, t + 0.12, 'cons', { pen: true, alpha: 0.8, group: grp });
      this.note(label, c.x + r * 0.7, c.y + r * 0.7, t + 0.1, { em: 0.12, col: 'ash', group: grp });
    };
    cross(pt(3.3, 3.55), 0.14, bar(8, 1.5), '(apex)', 'guides');
    cross(this.eye, 0.14, bar(8, 2), '(eye)', 'eyeg');

    // ---- bar 9: the drums; the pen marks the corners of the first glyph on the snare roll
    const iW = this.words[0]!;
    const gb = this.glyphBox(iW, 0);
    const cl = 0.16;
    const corners: [P, P, P][] = [
      [pt(gb.x0 - 0.06, gb.y1 + 0.06 - cl), pt(gb.x0 - 0.06, gb.y1 + 0.06), pt(gb.x0 - 0.06 + cl, gb.y1 + 0.06)],
      [pt(gb.x1 + 0.06 - cl, gb.y1 + 0.06), pt(gb.x1 + 0.06, gb.y1 + 0.06), pt(gb.x1 + 0.06, gb.y1 + 0.06 - cl)],
      [pt(gb.x1 + 0.06, gb.y0 - 0.06 + cl), pt(gb.x1 + 0.06, gb.y0 - 0.06), pt(gb.x1 + 0.06 - cl, gb.y0 - 0.06)],
      [pt(gb.x0 - 0.06 + cl, gb.y0 - 0.06), pt(gb.x0 - 0.06, gb.y0 - 0.06), pt(gb.x0 - 0.06, gb.y0 - 0.06 + cl)],
    ];
    [bar(9, 1), bar(9, 2), bar(9, 2.5), bar(9, 3)].forEach((tr, i) => S(corners[i]!, tr, tr + 0.07, 'dim', { pen: true, width: 1.3, group: 'corners' }));

    // ---- "I": the glyph is exactly a rectangle, so the pen draws it as one
    const tI = w.I!.start;
    S(poly(pt(gb.x0, gb.y0), pt(gb.x0, gb.y1), pt(gb.x1, gb.y1), pt(gb.x1, gb.y0)), tI, tI + 0.28, 'prim', { pen: true, ez: ez.inOutQuad, width: 1.5, group: 'lyricI' });
    this.dimension(pt(gb.x0, gb.y1 + 0.2), pt(gb.x1, gb.y1 + 0.2), (gb.x1 - gb.x0).toFixed(2), tI + 0.26, 'lyricI', 0.12);
    this.dimension(pt(gb.x0 - 0.22, gb.y0), pt(gb.x0 - 0.22, gb.y1), (gb.y1 - gb.y0).toFixed(2), tI + 0.3, 'lyricI', 0.12);
    const gx1 = COLX + 6.4;
    S(line(pt(gb.x0 - 0.5, gb.y0), pt(gx1, gb.y0)), tI + 0.02, tI + 0.3, 'cons', { ez: ez.outCubic, alpha: 0.6, group: 'type' });
    S(line(pt(gb.x0 - 0.5, gb.y1), pt(gx1, gb.y1)), tI + 0.05, tI + 0.33, 'cons', { ez: ez.outCubic, alpha: 0.5, dash: 8, group: 'type' });
    S(line(pt(gb.x0 - 0.5, gb.y0 + 0.53 * this.row1.em), pt(gx1, gb.y0 + 0.53 * this.row1.em)), tI + 0.08, tI + 0.36, 'cons', { ez: ez.outCubic, alpha: 0.35, dash: 4, group: 'type' });
    S(line(pt(gb.x0 - 0.5, gb.y0 - DESC_EM * this.row1.em), pt(gx1, gb.y0 - DESC_EM * this.row1.em)), tI + 0.1, tI + 0.38, 'cons', { ez: ez.outCubic, alpha: 0.35, dash: 4, group: 'type' });
    this.note('baseline', gx1 + 0.08, gb.y0 - 0.03, tI + 0.3, { em: 0.1, col: 'ash', group: 'typel' });
    this.note(`cap height ${(gb.y1 - gb.y0).toFixed(2)}`, gx1 + 0.08, gb.y1 - 0.03, tI + 0.33, { em: 0.1, col: 'ash', group: 'typel' });
    this.note('x-height', gx1 + 0.08, gb.y0 + 0.53 * this.row1.em - 0.03, tI + 0.36, { em: 0.1, col: 'ash', group: 'typel' });
    this.note('descender', gx1 + 0.08, gb.y0 - DESC_EM * this.row1.em - 0.03, tI + 0.38, { em: 0.1, col: 'ash', group: 'typel' });
    const gI = iW.lay.glyphs[0]!, kI = iW.em / 100;
    const ex0 = iW.x + gI.x * kI, ex1 = iW.x + (gI.x + gI.w) * kI, ey0 = iW.y - 0.21 * iW.em, ey1 = iW.y + 0.79 * iW.em;
    S(poly(pt(ex0, ey1), pt(ex1, ey1), pt(ex1, ey0), pt(ex0, ey0)), tI + 0.3, tI + 0.5, 'cons', { alpha: 0.55, dash: 5, group: 'type' });
    this.dimension(pt(ex0, ey0 - 0.14), pt(ex1, ey0 - 0.14), `adv ${(ex1 - ex0).toFixed(2)}`, tI + 0.45, 'typel', 0.075);
    this.note('LSB', (ex0 + gb.x0) / 2, ey1 + 0.04, tI + 0.5, { em: 0.065, col: 'ash', align: 'center', group: 'typel' });
    this.note('RSB', (ex1 + gb.x1) / 2, ey1 + 0.04, tI + 0.52, { em: 0.065, col: 'ash', align: 'center', group: 'typel' });
    this.note('U+0049  LATIN CAPITAL LETTER I', ex0, ey1 + 0.62, tI + 0.36, { em: 0.09, col: 'bone', a: 0.75, group: 'typel', dur: 0.25 });
    this.note('Archivo 700 · wdth 100', ex0, ey1 + 0.47, tI + 0.42, { em: 0.075, col: 'ash', group: 'typel', dur: 0.2 });
    this.note(`\\fill (${gb.x0.toFixed(2)},${gb.y0.toFixed(2)}) rectangle ++(${(gb.x1 - gb.x0).toFixed(2)},${(gb.y1 - gb.y0).toFixed(2)}); % I`, gb.x0 - 0.02, gb.y0 - 0.3, tI + 0.22, { em: 0.13, col: 'ash', group: 'lyricI', dur: 0.3 });

    // ---- the unicorn, primitive by primitive, on the beat
    const tB = V(0);
    S(part('body'), tB, tB + 0.34, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    const tL = V(1), st = (V(2) - V(1)) / 4;
    for (let i = 0; i < 4; i++) {
      const a = tL + i * st;
      S(part(`leg${i}`), a, a + st * 0.9, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    }
    const tT = V(2);
    for (let i = 0; i < 3; i++) S(part(`tail${i}`), tT + i * 0.065, tT + i * 0.065 + 0.06, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.6 });
    const tN = V(2.5);
    S(part('neck'), tN, tN + 0.08, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    S(part('head'), tN + 0.09, tN + 0.19, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    S(part('ear'), tN + 0.195, tN + 0.225, 'prim', { pen: true, group: 'u1', width: 1.6 });
    const tM = V(3);
    for (let i = 0; i < 3; i++) {
      const a = tM + i * 0.06;
      if (a + 0.06 > this.agi[0]![0] - 0.02) break;
      S(part(`mane${i}`), a, a + 0.06, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.6 });
    }

    // ---- the horn lands on "AGI", as a streak
    const [sa, sg, si] = this.agi as [[number, number], [number, number], [number, number]];
    const horn = part('horn');
    const ia = hornApex(horn);
    S(horn.slice(0, ia + 1), sa[0] - 0.01, sa[0] + 0.06, 'prim', { pen: true, ez: ez.outQuad, group: 'u1', width: 1.9 });
    S(horn.slice(ia), sa[0] + 0.06, sa[0] + 0.2, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.9 });
    this.note('% horn', 2.2, 3.12, sa[0] + 0.08, { em: 0.12, col: 'signal', a: 1, group: 'code', align: 'right' });
    const hb0 = horn[0]!, hap = horn[ia]!, hb1 = horn[hornBaseR(horn)]!;
    for (let k = 1; k <= 7; k++) {
      const f = k / 8, g = Math.min(1, f + 0.08);
      S([pt(lerp(hb0.x, hap.x, f), lerp(hb0.y, hap.y, f)), pt(lerp(hb1.x, hap.x, g), lerp(hb1.y, hap.y, g))], sg[0] + k * 0.018, sg[0] + k * 0.018 + 0.05, 'hatch', { width: 1.1, group: 'u1h' });
    }
    this.note('spiral, 7 turns', 2.2, 2.93, si[0], { em: 0.12, col: 'ash', group: 'code', align: 'right' });

    // ---- the eye: the pen hovers through "in your", dots it on "eyes"
    const E = this.eye;
    this.wp(pt(E.x + 0.22, E.y + 0.14), w.in!.start + 0.06, 0.03);
    this.wp(pt(E.x + 0.12, E.y + 0.08), w.your!.start + 0.08, 0.05);
    const spiral: P[] = [];
    for (let i = 0; i <= 70; i++) { const k = i / 70; const r = EYE.r * (1 - k); const a = -k * TAU * 3.5; spiral.push(pt(E.x + r * Math.cos(a), E.y + r * Math.sin(a))); }
    const te = w.eyes!.start;
    S(spiral, te, te + 0.1, 'eye', { pen: true, ez: ez.inOutQuad, group: 'eye' });
    S(line(pt(E.x - 0.26, E.y), pt(E.x + 0.26, E.y)), te + 0.1, te + 0.2, 'cons', { alpha: 0.7, dash: 6, group: 'eyec' });
    S(line(pt(E.x, E.y - 0.26), pt(E.x, E.y + 0.26)), te + 0.12, te + 0.22, 'cons', { alpha: 0.7, dash: 6, group: 'eyec' });
    const la = (-68 * Math.PI) / 180;
    const p0 = pt(E.x + EYE.r * Math.cos(la), E.y + EYE.r * Math.sin(la));
    const p1 = pt(E.x + 0.8 * Math.cos(la), E.y + 0.8 * Math.sin(la));
    const p2 = pt(p1.x + 0.95, p1.y);
    S([p0, p1, p2], te + 0.16, te + 0.28, 'dim', { pen: true, ez: ez.inOutQuad, width: 1.1, group: 'eyec' });
    const ah = 0.035, an = la;
    S([pt(p0.x + ah * Math.cos(an + 0.35), p0.y + ah * Math.sin(an + 0.35)), p0, pt(p0.x + ah * Math.cos(an - 0.35), p0.y + ah * Math.sin(an - 0.35))], te + 0.16, te + 0.19, 'dim', { width: 1.1, group: 'eyec' });
    this.plotText('r = 0.08', p1.x + 0.06, p1.y + 0.05, 0.155, te + 0.3, te + 0.54, 'eyec');
    this.note('\\fill (2.95,2) circle (0.08); % eye', p1.x + 0.06, p1.y - 0.1, te + 0.44, { em: 0.045, col: 'ash', group: 'eyec', maxPx: 99 });

    // ---- "You sell me love;": a price tag on a string, the price, the heart
    const hc = this.hc, ha = this.ha, tg = this.tag;
    const tS = w.sell!.start;
    const hole = pt(tg.x + 0.2, tg.y);
    const tagPts = poly(pt(tg.x, tg.y), pt(tg.x + 0.26, tg.y + 0.26), pt(tg.x + 1.5, tg.y + 0.26), pt(tg.x + 1.5, tg.y - 0.26), pt(tg.x + 0.26, tg.y - 0.26));
    const lobe = pt(hc.x + 0.34, hc.y + 0.12);
    S([lobe, pt(lerp(lobe.x, hole.x, 0.5) + 0.08, lerp(lobe.y, hole.y, 0.5) - 0.18), hole], tS, tS + 0.14, 'cons', { pen: true, ez: ez.inOutQuad, alpha: 0.8, width: 1.1, group: 'tag' });
    S(tagPts, tS + 0.15, tS + 0.42, 'prim', { pen: true, ez: ez.inOutQuad, width: 1.5, group: 'tag' });
    S(ellipse(hole.x, hole.y, 0.05, 0.05, 0, 16), tS + 0.42, tS + 0.47, 'prim', { pen: true, width: 1.2, group: 'tag' });
    this.note('$20/mo', tg.x + 0.4, tg.y - 0.09, w.me!.start, { em: 0.25, col: 'bone', a: 1, group: 'tag', dur: Math.min(0.3, w.me!.end - w.me!.start), hot: 0.4, maxPx: 99 });
    this.note('\\node[tag]', tg.x + 0.02, tg.y + 0.38, tS + 0.3, { em: 0.1, col: 'ash', group: 'tag' });
    const tLv = w.love!.start;
    const hp = heart(hc.x, hc.y, ha, 0.72);
    S(hp, tLv, tLv + Math.min(0.5, w.love!.end - tLv), 'prim', { pen: true, ez: ez.inOutQuad, width: 1.9, group: 'heart' });
    this.note('% love', hc.x - 0.34, hc.y - 0.5, tLv + 0.3, { em: 0.11, col: 'signal', a: 1, group: 'heart', align: 'right' });
    // "I buy": the I (a rectangle again), then PAID
    this.rectStroke(this.lw(w.I1!), w.I1!.start, 0.16, 'l1');
    const tBuy = w.buy!.start;
    const pb = { x: tg.x + 0.36, y: tg.y - 0.52 };
    S(poly(pt(pb.x, pb.y), pt(pb.x + 0.98, pb.y + 0.1), pt(pb.x + 1.02, pb.y - 0.26), pt(pb.x + 0.04, pb.y - 0.36)), tBuy, tBuy + 0.2, 'mark', { pen: true, ez: ez.inOutQuad, width: 1.4, group: 'paid' });
    this.note('PAID', pb.x + 0.14, pb.y - 0.25, tBuy + 0.12, { em: 0.21, col: 'signal', a: 1, rot: 0.1, group: 'paid', dur: 0.12, weight: 600, maxPx: 99 });
    // "lies": the heart's width is dimensioned ∞, and its path never closes
    const tLi = w.lies!.start;
    const hw = 0.855 * ha;
    this.dimension(pt(hc.x - hw, hc.y + 0.62 * ha + 0.28), pt(hc.x + hw, hc.y + 0.62 * ha + 0.28), '∞', tLi, 'lie', 0.3, { col: 'bone', hot: 0.5, pen: true });
    const cusp = hp[0]!, gapEnd = hp[hp.length - 1]!;
    const gm = pt((cusp.x + gapEnd.x) / 2, (cusp.y + gapEnd.y) / 2);
    const c1 = pt(gm.x + 0.5, gm.y - 0.42);
    S([pt(gm.x + 0.05, gm.y - 0.04), c1, pt(c1.x + 0.5, c1.y)], tLi + 0.18, tLi + 0.32, 'dim', { pen: true, ez: ez.inOutQuad, width: 1.1, group: 'lie' });
    S(ellipse(gm.x, gm.y, 0.075, 0.075, 0, 24), tLi + 0.14, tLi + 0.2, 'mark', { width: 1.1, group: 'lie' });
    this.note('not closed', c1.x + 0.05, c1.y + 0.05, tLi + 0.3, { em: 0.12, col: 'signal', a: 1, group: 'lie', dur: 0.12 });

    // ---- "We choose your answers, two by two": the preference pairs; the pen ticks and strikes
    this.P.forEach((_, k) => {
      const pr = PAIRS[k]!;
      const wx = pr.win === 0 ? PAX : PBX, lx = pr.win === 0 ? PBX : PAX;
      const c = pt(wx + PHW - 0.95, PY + PHH - 0.72);
      S([pt(c.x, c.y), pt(c.x + 0.2, c.y - 0.22), pt(c.x + 0.62, c.y + 0.34)], this.pTick[k]!, this.pTick[k]! + 0.09, 'mark', { pen: true, ez: ez.inOutQuad, width: 2.4, group: `pair${k}` });
      S([pt(lx - PHW + 0.25, PY + PHH - 0.25), pt(lx + PHW - 0.25, PY - PHH + 0.25)], this.pStrike[k]!, this.pStrike[k]! + 0.08, 'mark', { pen: true, ez: ez.inQuad, width: 1.6, group: `pair${k}` });
    });

    // ---- "You learn my taste; I call it true": the I, then the tombstone
    this.wp(pt(0, PY + PHH + 0.1), this.tMerge + 0.2, 0.05);
    this.rectStroke(this.lw(w.I3!), w.I3!.start, 0.16, 'l3b');
    const tb2 = this.tomb;
    S(poly(pt(tb2.x, tb2.y), pt(tb2.x, tb2.y + tb2.h), pt(tb2.x + tb2.w, tb2.y + tb2.h), pt(tb2.x + tb2.w, tb2.y)), this.tTomb, this.tTomb + 0.06, 'prim', { pen: true, ez: ez.inOutQuad, width: 1.5, group: 'tombL' });
    this.wp(pt(tb2.x + tb2.w / 2, tb2.y + tb2.h), this.tTomb + 0.09, 0.01);
    this.note('% Q.E.D.', tb2.x + tb2.w + 0.14, tb2.y + 0.04, this.tTomb + 0.08, { em: 0.13, col: 'ash', group: 'l3b', dur: 0.08 });
    this.pens.sort((a, b) => a.t0 - b.t0);
  }

  /** The pen draws a lyric "I" as the rectangle it is. */
  rectStroke(lw: LWord, t: number, dur: number, group: string) {
    const gb = this.glyphBox(lw, 0);
    this.addStroke(poly(pt(gb.x0, gb.y0), pt(gb.x0, gb.y1), pt(gb.x1, gb.y1), pt(gb.x1, gb.y0)), t, t + dur, 'prim', { pen: true, ez: ease.inOutQuad, width: 1.4, group });
  }

  // ================================================================== pen
  penAt(t: number): P {
    const ps = this.pens;
    let prev: Stroke | null = null;
    for (const s of ps) {
      if (t < s.t0) {
        const from = prev ? prev.pts[prev.pts.length - 1]! : s.pts[0]!;
        const to = s.pts[0]!;
        const tPrev = prev ? prev.t1 : s.t0 - 1;
        const d = Math.hypot(to.x - from.x, to.y - from.y);
        const dur = Math.min(s.t0 - tPrev, clamp(0.08 + d * 0.025, 0.08, 0.32));
        const k = ease.inOutCubic(clamp((t - (s.t0 - dur)) / Math.max(1e-4, dur)));
        return pt(lerp(from.x, to.x, k), lerp(from.y, to.y, k));
      }
      if (t <= s.t1) {
        const k = s.ez(clamp((t - s.t0) / Math.max(1e-4, s.t1 - s.t0)));
        const q = at(s.pts, s.L, k * s.tot);
        return pt(q.x, q.y);
      }
      prev = s;
    }
    return prev ? prev.pts[prev.pts.length - 1]! : pt(0, 0);
  }

  // ================================================================== projection
  w2s(c: Cam, x: number, y: number): [number, number] {
    const dx = (x - c.cx) * c.z, dy = -(y - c.cy) * c.z;
    const co = Math.cos(c.roll), si = Math.sin(c.roll);
    return [W / 2 + co * dx - si * dy, H / 2 + si * dx + co * dy];
  }

  // ================================================================== state
  exitK(t: number) { return prog(t, this.tExit, this.tCut - 0.03, ease.inQuad); }
  groupAlpha(g: string, t: number): number {
    const exit = 1 - this.exitK(t);
    const V = this.V, bar = this.bar;
    if (g.startsWith('pair')) {
      const k = Number(g.slice(4));
      const next = this.P[k + 1] ?? this.tMerge;
      return exit * (1 - prog(t, next - 0.02, next + 0.06));
    }
    switch (g) {
      case 'u1': case 'u1h': case 'eye': case 'heart': case 'tag': case 'paid': case 'lie': case 'title': case 'listing': return exit;
      case 'cons': return exit * (1 - 0.5 * prog(t, V(4), V(8)));
      case 'guides': return exit * (1 - 0.55 * prog(t, V(1), V(4)));
      case 'eyeg': return exit * (1 - prog(t, this.w.eyes!.start, this.w.eyes!.start + 0.2));
      case 'axes': return exit * (1 - 0.35 * prog(t, V(0), V(4)));
      case 'rays': return exit * (1 - prog(t, bar(3), bar(5)));
      case 'dial': return exit * (1 - 0.75 * prog(t, bar(4), bar(6)));
      case 'dims': return exit * (1 - 0.8 * prog(t, bar(6), bar(8)));
      case 'gardl': return exit * (1 - prog(t, bar(5), bar(5) + 0.4));
      case 'grid': return exit * lerp(1, 0.4, prog(t, V(0), V(2)));
      case 'corners': return exit * (1 - prog(t, V(0), V(1)));
      case 'lyricI': return exit * (1 - 0.85 * prog(t, V(0), V(1)));
      case 'type': return exit * lerp(1, 0.25, prog(t, V(0), V(2))) * (1 - prog(t, this.tL1, this.tL1 + 0.3));
      case 'typel': return exit * (1 - prog(t, V(0), V(1)));
      case 'code': return exit * (1 - 0.8 * prog(t, this.tL1, this.tL1 + 0.4));
      case 'eyec': return exit * (1 - prog(t, this.tL1 + 0.05, this.tL1 + 0.35));
      case 'ring': return 1;
      case 'l0': return exit * lerp(1, 0.22, prog(t, this.tL1 - 0.02, this.tL1 + 0.25));
      case 'l0e': return exit * lerp(1, 0.22, prog(t, this.tL1, this.tL1 + 0.3));
      case 'l1': return exit * (1 - prog(t, this.tL2 + 0.05, this.tL2 + 0.3));
      case 'l2h': return exit * (1 - prog(t, this.tL3 - 0.12, this.tL3 + 0.02));
      case 'l2b': return exit * (1 - prog(t, this.tL3, this.tL3 + 0.25));
      case 'l3h': return exit;
      case 'l3b': return 1 - prog(t, this.tCut - 0.2, this.tCut - 0.04);
      case 'tombL': return 1 - prog(t, this.tFly, this.tFly + 0.04);
      default: return exit;
    }
  }

  // ================================================================== render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = Math.min(f.t, this.tCut);
    const bar = this.bar, V = this.V;
    const c = this.cam(t);
    const jit = (x: number, y: number): [number, number] => this.w2s(c, x, y);
    const pw = this.penAt(t);
    const fly = ease.inOutCubic(prog(t, this.tFly, this.tCut));
    let ps = jit(pw.x, pw.y);
    const tombS = this.tombScreen(c, fly);
    if (t > this.tTomb + 0.09) ps = [tombS.x + tombS.w / 2, tombS.y];
    const ignite = prog(t, this.tBorn - 0.012, this.tBorn + 0.01);
    const heat = pulse(t, this.tDrums, 0.22);

    // ---- the sheet
    const u = this.bg.u;
    (u.uCam!.value as THREE.Vector4).set(c.cx, c.cy, c.z, c.roll);
    u.uReveal!.value = 24 * ease.outCubic(prog(t, this.tIgn + 0.15, bar(4) + 0.4));
    (u.uPen!.value as THREE.Vector3).set(ps[0], ps[1], ignite * (1 - fly));
    u.uFade!.value = this.exitK(t);
    u.uHeat!.value = heat;
    this.bg.render(renderer, out);

    // ---- the drawing
    const L = this.lines; L.clear();
    this.drawStrokes(t, c, L, jit, heat);
    this.drawCompassArm(t, L, jit, pw);
    this.drawGardener(t, L, jit, pw);
    this.drawPairs(t, L, jit);
    L.render(renderer, out);

    // ---- type
    const T = this.text; T.clear();
    this.drawNotes(t, c, T.ctx);
    this.drawPairText(t, c, T.ctx);
    this.drawLyrics(t, c, T.ctx);
    this.drawTomb(t, T.ctx, tombS, fly);
    comp.draw(renderer, T.upload(), out);

    // ---- the pen: spark head, hot trail, sputter
    const X = this.fx; X.clear();
    if (ignite > 0) {
      const burst = pulse(t, this.tIgn, 0.16);
      const sp = this.w.sparks!;
      const sputterAt = (tt: number) => 1 + 3 * prog(tt, sp.start, sp.start + 0.08) * (1 - prog(tt, sp.end - 0.1, sp.end + 0.1));
      let prev = ps;
      let trail = 0;
      if (t < this.tTomb + 0.09) for (let i = 1; i <= 12; i++) {
        const tt = t - i * 0.007;
        if (tt < this.tBorn) break;
        const q = this.penAt(tt), s = jit(q.x, q.y);
        const k = 1 - i / 13;
        trail += Math.hypot(s[0] - prev[0], s[1] - prev[1]);
        const fade = 1 - clamp((trail - 90) / 60);
        if (fade <= 0) break;
        X.seg2(prev[0], prev[1], s[0], s[1], 2.0 * k + 0.6, [LIN.ember[0] * 3 * k * fade, LIN.ember[1] * 3 * k * fade, LIN.ember[2] * 3 * k * fade], k * fade);
        prev = s;
      }
      sparkParticles(X, t, (tb) => {
        if (tb < this.tBorn) return null;
        const tq = Math.min(tb, this.tCut);
        if (tq > this.tTomb + 0.09) { const ts = this.tombScreen(this.cam(tq), ease.inOutCubic(prog(tq, this.tFly, this.tCut))); return { x: ts.x + ts.w / 2, y: ts.y }; }
        const q = this.penAt(tq);
        const s = this.w2s(this.cam(tq), q.x, q.y);
        return { x: s[0], y: s[1] };
      }, { rate: (tb) => 60 * sputterAt(tb) + 700 * pulse(tb, this.tIgn, 0.06), rateMax: 940, intensity: 0.9, speed: 220 + 420 * burst, seed: 17, life: 0.42 });
      this.hornSparks(t, c, X);
      this.wordSparks(t, c, X);
      this.rayHeads(t, c, X);
      sparkHead(X, ps[0], ps[1], t, (1.05 + 1.5 * burst + 0.5 * pulse(t, this.w.eyes!.start, 0.1) + 0.4 * pulse(t, this.tTomb + 0.1, 0.12)) * (1 - 0.45 * fly), ignite);
    }
    X.render(renderer, out);

    // ---- post: punches on the downbeats and the hits
    let punch = 0;
    for (let k = 2; k <= 9; k++) punch += (k === 9 ? 0.02 : 0.009) * pulse(t, bar(k), 0.09);
    for (const d of [V(0), V(4), V(8), V(12)]) punch += 0.014 * pulse(t, d, 0.09);
    for (const d of [V(1), V(2), V(3)]) punch += 0.006 * pulse(t, d, 0.07);
    punch += 0.022 * pulse(t, this.agi[0]![0], 0.08) + 0.012 * pulse(t, this.w.love!.start, 0.08) + 0.014 * pulse(t, this.w.lies!.start, 0.08);
    this.pTick.forEach((tk) => { punch += 0.008 * pulse(t, tk, 0.06); });
    punch += 0.016 * pulse(t, this.tMerge + 0.3, 0.1) + 0.012 * pulse(t, this.tTomb + 0.1, 0.08);
    const shakeA = 9 * pulse(t, this.tIgn, 0.07) + 4 * pulse(t, this.agi[0]![0], 0.06) + 5 * pulse(t, this.tDrums, 0.08) + 2.5 * pulse(t, this.w.lies!.start + 0.02, 0.06);
    const flash = 0.012 * pulse(t, this.tIgn, 0.03) + 0.006 * pulse(t, this.agi[0]![0], 0.04) + 0.01 * pulse(t, this.tDrums, 0.05);
    return {
      bloom: 0.72 - 0.3 * pulse(t, this.tIgn, 0.25), bloomThreshold: 0.82, flash,
      shake: [shakeA * noise1(t * 45, 3), shakeA * noise1(t * 51, 4)],
      zoom: 1 + punch, ca: 1.0 + 1.5 * heat, vignette: 0.42, grain: 0.05,
      // the sheet's crop marks (the outro's rewind lands back inside them); they fly out on the last beat
      frame: 1 - prog(t, this.tExit, this.tCut, ease.inOutCubic),
    };
  }

  // ---------------------------------------------------------------- strokes
  drawStrokes(t: number, c: Cam, L: LineBatch, jit: (x: number, y: number) => [number, number], heat: number) {
    const bone = LIN.bone, ash = LIN.ash, sig = LIN.signal, emb = LIN.ember;
    for (const s of this.strokes) {
      if (t < s.t0 || s.alpha <= 0) continue;
      const ga = this.groupAlpha(s.group, t);
      if (ga <= 0.002) continue;
      const k = s.ez(clamp((t - s.t0) / Math.max(1e-4, s.t1 - s.t0)));
      const head = k * s.tot;
      let base: RGB, a0: number, hot: number;
      switch (s.kind) {
        case 'axis': base = ash; a0 = 0.55; hot = 0.8; break;
        case 'cons': base = ash; a0 = 0.5; hot = 0.6; break;
        case 'dim': base = ash; a0 = 0.8; hot = 0.5; break;
        case 'hatch': base = bone; a0 = 0.55; hot = 1; break;
        case 'plot': base = bone; a0 = 0.85; hot = 1; break;
        case 'mark': base = [sig[0] * 0.8, sig[1] * 0.8, sig[2] * 0.8]; a0 = 1; hot = 1; break;
        default: base = bone; a0 = 0.8; hot = 1;
      }
      // the compile flash: every construction line runs hot for a moment
      const fl = s.kind === 'axis' || s.kind === 'cons' || s.kind === 'dim' ? heat : 0;
      const A = a0 * s.alpha * ga;
      if (s.kind === 'ring') {
        const age = t - s.t0;
        if (age > 0.7) continue;
        const R = 0.3 + 7.5 * ease.outCubic(age / 0.7);
        const I = Math.pow(1 - age / 0.7, 1.5);
        let prev: [number, number] | null = null;
        for (let i = 0; i <= 96; i++) {
          const an = (i / 96) * TAU;
          const cur = jit(R * Math.cos(an), R * Math.sin(an));
          if (prev) L.seg2(prev[0], prev[1], cur[0], cur[1], 1.2, [sig[0] * 0.9 * I + bone[0] * 0.35 * I, sig[1] * 0.9 * I + bone[1] * 0.35 * I, sig[2] * 0.9 * I + bone[2] * 0.35 * I], I);
          prev = cur;
        }
        continue;
      }
      if (s.kind === 'eye') {
        const [x, y] = jit(this.eye.x, this.eye.y);
        const r = EYE.r * c.z * Math.sqrt(clamp(k * 1.1));
        const h = Math.exp(-Math.max(0, t - s.t1) / 0.09);
        const col: RGB = [lerp(bone[0] * 0.9, sig[0] * 2.2, h), lerp(bone[1] * 0.9, sig[1] * 2.2 + 0.25 * h, h), lerp(bone[2] * 0.9, sig[2] * 2.2, h)];
        L.seg2(x, y, x + 0.01, y, 2 * r, col, ga);
        if (k >= 1) continue;
      }
      let prev: [number, number] | null = null;
      let acc = 0;
      for (let i = 0; i < s.pts.length; i++) {
        let p = s.pts[i]!;
        let stop = false;
        if (s.L[i]! > head) {
          if (i === 0) break;
          const q = at(s.pts, s.L, head);
          p = pt(q.x, q.y);
          stop = true;
        }
        const cur = jit(p.x, p.y);
        if (prev) {
          const segLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
          const age = t - Math.min(s.tD[i]!, t);
          const h1 = hot * Math.exp(-age / 0.05), h2 = Math.max(hot * Math.exp(-age / 0.32), 0.7 * fl);
          const col: RGB = [
            base[0] * (1 - h2) + sig[0] * 1.5 * h2 + emb[0] * 2.6 * h1,
            base[1] * (1 - h2) + sig[1] * 1.5 * h2 + emb[1] * 2.6 * h1,
            base[2] * (1 - h2) + sig[2] * 1.5 * h2 + emb[2] * 2.6 * h1,
          ];
          const al = Math.min(1, A + h2 * 0.8 * ga);
          const wd = s.width * (1 + 0.6 * h1);
          if (s.dash > 0) {
            let u0 = 0;
            while (u0 < segLen) {
              const ph = (acc + u0) % s.dash;
              const on = ph < s.dash * 0.55;
              const run = Math.min(segLen - u0, on ? s.dash * 0.55 - ph : s.dash - ph);
              if (on && run > 0.05) {
                const a1 = u0 / segLen, b1 = (u0 + run) / segLen;
                L.seg2(lerp(prev[0], cur[0], a1), lerp(prev[1], cur[1], a1), lerp(prev[0], cur[0], b1), lerp(prev[1], cur[1], b1), wd, col, al);
              }
              u0 += Math.max(run, 0.05);
            }
          } else L.seg2(prev[0], prev[1], cur[0], cur[1], wd, col, al);
          acc += segLen;
        }
        prev = cur;
        if (stop) break;
      }
    }
  }

  /** While the compass circle is swept: the compass arm from the pivot to the pen, and the pivot. */
  drawCompassArm(t: number, L: LineBatch, jit: (x: number, y: number) => [number, number], pen: P) {
    const tc = this.tCompass, tc2 = this.bar(3, 2);
    const a = Math.max(prog(t, tc - 0.12, tc) * (1 - prog(t, tc + 0.4, tc + 0.6)), prog(t, tc2 - 0.1, tc2) * (1 - prog(t, tc2 + 0.32, tc2 + 0.5)));
    if (a <= 0) return;
    const o = jit(0, 0), p = jit(pen.x, pen.y);
    const b = LIN.bone;
    L.seg2(o[0], o[1], p[0], p[1], 1.3, [b[0] * 0.8, b[1] * 0.8, b[2] * 0.8], 0.8 * a);
    const r = 7;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
      L.seg2(o[0] + r * Math.cos(a0), o[1] + r * Math.sin(a0), o[0] + r * Math.cos(a1), o[1] + r * Math.sin(a1), 1.2, [b[0], b[1], b[2]], 0.9 * a);
    }
  }

  /** The gardener's ellipse: two pins in the foci and a loop of string held taut by the pen. */
  drawGardener(t: number, L: LineBatch, jit: (x: number, y: number) => [number, number], pen: P) {
    const a = prog(t, this.tG0 - 0.1, this.tG0) * (1 - prog(t, this.tG1 + 0.05, this.tG1 + 0.3));
    if (a <= 0) return;
    const fx = Math.sqrt(3);
    const f1 = jit(-fx, 0), f2 = jit(fx, 0), p = jit(pen.x, pen.y);
    const b = LIN.bone;
    const col: RGB = [b[0] * 0.75, b[1] * 0.75, b[2] * 0.75];
    L.seg2(f1[0], f1[1], p[0], p[1], 1.1, col, 0.75 * a);
    L.seg2(p[0], p[1], f2[0], f2[1], 1.1, col, 0.75 * a);
    L.seg2(f1[0], f1[1], f2[0], f2[1], 1.1, col, 0.4 * a);
    for (const q of [f1, f2]) {
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
        L.seg2(q[0] + 5 * Math.cos(a0), q[1] + 5 * Math.sin(a0), q[0] + 5 * Math.cos(a1), q[1] + 5 * Math.sin(a1), 1.2, [b[0], b[1], b[2]], 0.9 * a);
      }
    }
  }

  /** The ray heads of the four axes on ignition: small hot sparks racing out. */
  rayHeads(t: number, c: Cam, X: LineBatch) {
    const t0 = this.tIgn;
    const age = t - t0;
    if (age < 0 || age > 0.6) return;
    for (const [dx, dy, len, d] of [[1, 0, 15, 0], [-1, 0, 15, 0.01], [0, 1, 9, 0.03], [0, -1, 13, 0.04]] as const) {
      const k = ease.outExpo(clamp((age - d) / 0.55));
      const k0 = ease.outExpo(clamp((age - d - 0.02) / 0.55));
      const a = this.w2s(c, dx * len * k0, dy * len * k0), b = this.w2s(c, dx * len * k, dy * len * k);
      const I = 1 - clamp(age / 0.6);
      X.seg2(a[0], a[1], b[0], b[1], 3, [LIN.ember[0] * 4 * I, LIN.ember[1] * 4 * I, LIN.ember[2] * 4 * I], 1);
      X.seg2(b[0], b[1], b[0] + 0.01, b[1], 8, [3 * I, 2 * I, 1.2 * I], I);
    }
  }

  // ---------------------------------------------------------------- the pairs
  drawPairs(t: number, L: LineBatch, jit: (x: number, y: number) => [number, number]) {
    if (t < this.tL2 - 0.05) return;
    const exit = 1 - this.exitK(t);
    if (exit <= 0) return;
    const bone = LIN.bone, emb = LIN.ember, ash = LIN.ash;
    const m = ease.inOutCubic(prog(t, this.tMerge, this.tMerge + 0.42));
    // the panels: traced on "We", sliding into one on "You learn"
    const box = prog(t, this.tL2 - 0.02, this.tL2 + 0.3, ease.outExpo);
    const k = this.pairIndex(t);
    const pr = k >= 0 ? PAIRS[k]! : null;
    for (const s of [0, 1] as const) {
      const ox = this.panelX(s, t);
      const lose = pr && pr.win !== s ? prog(t, this.pStrike[k]!, this.pStrike[k]! + 0.1) * (1 - m) * this.groupAlpha(`pair${k}`, t) : 0;
      const ba = exit * (0.55 - 0.25 * lose) * (s === 1 ? 1 - 0.9 * m : 1);
      const corners = [pt(ox - PHW, PY + PHH), pt(ox + PHW, PY + PHH), pt(ox + PHW, PY - PHH), pt(ox - PHW, PY - PHH), pt(ox - PHW, PY + PHH)];
      const per = lengths(corners), tot = per[per.length - 1]!;
      let prev = jit(corners[0]!.x, corners[0]!.y);
      for (let i = 1; i < corners.length; i++) {
        if (per[i - 1]! > box * tot) break;
        const e = per[i]! <= box * tot ? corners[i]! : at(corners, per, box * tot);
        const cur = jit(e.x, e.y);
        L.seg2(prev[0], prev[1], cur[0], cur[1], 1.2, [bone[0] * 0.8, bone[1] * 0.8, bone[2] * 0.8], ba);
        prev = cur;
      }
    }
    // the divider between A and B
    const dv = prog(t, this.tL2 + 0.1, this.tL2 + 0.4, ease.outExpo) * (1 - m) * exit;
    if (dv > 0) {
      const a = jit(0, PY + PHH * dv), b = jit(0, PY - PHH * dv);
      L.seg2(a[0], a[1], b[0], b[1], 1.0, ash, 0.6 * dv);
    }
    if (k < 0) return;
    // the answers: both sampled on the beat (a hot front runs through the drawing), the loser dims
    const tp = this.P[k]!;
    const rev = prog(t, tp, tp + 0.2, ease.outCubic);
    const inA = prog(t, tp - 0.01, tp + 0.03);
    for (const s of [0, 1] as const) {
      const g = this.pairGeo[k]![s]!;
      const ox = this.panelX(s, t), oy = PY;
      const lose = pr!.win !== s ? prog(t, this.pStrike[k]!, this.pStrike[k]! + 0.1) : 0;
      const al = exit * inA * (1 - 0.62 * lose * (1 - m)) * (s === 1 ? 1 - m : 1);
      if (al <= 0.003) continue;
      const S = g.segs;
      for (let i = 0; i < g.n; i++) {
        const o = i * 6;
        const f = S[o + 5]!;
        if (f > rev) continue;
        const h = rev < 1 ? Math.exp(-(rev - f) * 16) : 0;
        const a = jit(ox + PS * S[o]!, oy + PS * (S[o + 1]! - PCY)), b = jit(ox + PS * S[o + 2]!, oy + PS * (S[o + 3]! - PCY));
        const q = 0.85 * S[o + 4]!;
        L.seg2(a[0], a[1], b[0], b[1], 1.4 + 0.8 * h, [bone[0] * q + emb[0] * 3 * h, bone[1] * q + emb[1] * 3 * h, bone[2] * q + emb[2] * 3 * h], al * Math.min(1, S[o + 4]! + h));
      }
    }
  }

  drawPairText(t: number, c: Cam, ctx: CanvasRenderingContext2D) {
    if (t < this.tL2) return;
    const exit = 1 - this.exitK(t);
    if (exit <= 0) return;
    const m = ease.inOutCubic(prog(t, this.tMerge, this.tMerge + 0.42));
    const k = this.pairIndex(t);
    const a0 = prog(t, this.tL2 + 0.1, this.tL2 + 0.3) * exit;
    ctx.textBaseline = 'alphabetic';
    const txt = (s: string, x: number, y: number, em: number, col: string, a: number, align: CanvasTextAlign = 'left', weight = 400) => {
      if (a <= 0.003) return;
      this.tx(ctx, c, x, y, em);
      ctx.font = font(F.mono(weight), 100);
      ctx.textAlign = align;
      ctx.fillStyle = rgba(col, a);
      ctx.fillText(s, 0, 0);
    };
    for (const s of [0, 1] as const) {
      const ox = this.panelX(s, t);
      const x0 = ox - PHW + 0.22, y0 = PY + PHH - 0.5;
      if (m < 0.5) {
        txt(s === 0 ? 'A' : 'B', x0, y0, 0.34, 'bone', a0 * (1 - 2 * m), 'left', 500);
        if (k >= 0) txt(`sample ${2 * k + 1 + s}`, x0 + 0.42, y0, 0.15, 'ash', a0 * (1 - 2 * m));
      }
      // the rejected one gets its reason
      const pr = k >= 0 ? PAIRS[k]! : null;
      if (pr && pr.win !== s) {
        const ts = this.pStrike[k]!;
        const n = Math.floor(pr.why.length * clamp((t - ts - 0.04) / 0.12));
        const g = this.groupAlpha(`pair${k}`, t);
        if (n > 0) txt(pr.why.slice(0, n), ox - PHW + 0.25, PY - PHH + 0.3, 0.2, 'signal', g);
      }
    }
    if (m >= 0.5) {
      const a = prog(m, 0.5, 1) * exit;
      txt('A = B', -PHW + 0.22, PY + PHH - 0.5, 0.34, 'bone', a, 'left', 500);
      const tt = this.w.taste!.start;
      const s = 'reward(x) := taste(me)';
      const n = Math.floor(s.length * clamp((t - tt) / 0.3));
      if (n > 0) txt(s.slice(0, n), -PHW + 0.25, PY - PHH + 0.3, 0.17, 'ash', exit);
    }
    // the counter, top right of the header
    if (k >= 0 && m < 0.5) txt(`pair ${k + 1}/${this.P.length}`, PBX + PHW, this.hdr.y, 0.2, 'ash', a0 * (1 - 2 * m), 'right');
    if (m >= 0.5) txt('diff(A, B) = 0.00', PBX + PHW, this.hdr.y, 0.2, 'ash', prog(m, 0.5, 1) * exit, 'right');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------- the tombstone → the caret
  tombScreen(c: Cam, fly: number) {
    const tb = this.tomb;
    const a = this.w2s(c, tb.x, tb.y + tb.h), b = this.w2s(c, tb.x + tb.w, tb.y);
    const s0 = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    const hf = OPEN_HANDOFF;
    // the width narrows first, then it travels
    const kw = ease.outCubic(clamp(fly * 1.6));
    const w = lerp(s0.w, hf.w, kw), h = lerp(s0.h, hf.h, fly);
    const cx = lerp(s0.x + s0.w / 2, hf.x, fly), cy = lerp(s0.y + s0.h / 2, hf.y, fly);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  drawTomb(t: number, ctx: CanvasRenderingContext2D, s: { x: number; y: number; w: number; h: number }, fly: number) {
    const fill = prog(t, this.tTomb + 0.04, this.tTomb + 0.08);
    if (fill <= 0) return;
    const hot = pulse(t, this.tTomb + 0.1, 0.1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = fly > 0 ? mixCss('bone', 'signal', clamp(fly * 1.5)) : hot > 0.02 ? mixCss('bone', 'signal', hot) : rgba('bone', 1);
    ctx.globalAlpha = fill;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = 1;
  }

  /** The word "sparks" throws sparks: each glyph bursts from its top as the karaoke fill completes it. */
  wordSparks(t: number, c: Cam, X: LineBatch) {
    const lw = this.lw(this.w.sparks!);
    const n = lw.lay.glyphs.length, wd = lw.w;
    lw.lay.glyphs.forEach((g, gi) => {
      const tb0 = lerp(wd.start, wd.end, (gi + 1) / n);
      const age = t - tb0;
      if (age < 0 || age > 0.8) return;
      const gx = lw.x + ((g.x + g.w * 0.5) / 100) * lw.em, gy = lw.y + 0.55 * lw.em;
      for (let i = 0; i < 16; i++) {
        const life = 0.3 + 0.45 * hash(i, gi, 31);
        const a2 = age - hash(i, gi, 32) * 0.05;
        if (a2 < 0 || a2 > life) continue;
        const an = Math.PI / 2 + (hash(i, gi, 33) - 0.5) * 2.2;
        const sp = 1.5 + 4 * hash(i, gi, 34) ** 2;
        const pos = (tt: number) => this.w2s(c, gx + Math.cos(an) * sp * tt, gy + Math.sin(an) * sp * tt - 3.2 * tt * tt);
        const p1 = pos(a2), p0 = pos(Math.max(0, a2 - 0.025));
        const k = 1 - a2 / life;
        X.seg2(p0[0], p0[1], p1[0], p1[1], 1.0 + k, [(LIN.signal[0] + k) * 2.2, (LIN.signal[1] + 0.6 * k * k) * 2.2, (LIN.signal[2] + 0.3 * k * k) * 2.2], Math.min(1, k * 1.5));
      }
    });
  }

  hornSparks(t: number, c: Cam, X: LineBatch) {
    const horn = this.u1.find((p) => p.id === 'horn')!.pts;
    const apex = horn[hornApex(horn)]!, br = horn[hornBaseR(horn)]!;
    const axis = Math.atan2(apex.y - (horn[0]!.y + br.y) / 2, apex.x - (horn[0]!.x + br.x) / 2);
    const agi = this.lw(this.w.AGI!);
    const toA = Math.atan2(agi.y + 0.35 * agi.em - apex.y, agi.x + 0.3 * agi.em - apex.x);
    this.agi.forEach(([ta], si) => {
      const age = t - ta;
      if (age < 0 || age > 1.0) return;
      const n = si === 0 ? 110 : 45;
      const dir = lerp(axis, toA, si === 0 ? 0.45 : 0.7);
      for (let i = 0; i < n; i++) {
        const tb = ta + (si === 0 ? 0.05 : 0) + hash(i, 5 + si) ** 2 * 0.2;
        const a2 = t - tb;
        if (a2 < 0) continue;
        const life = 0.25 + 0.5 * hash(i, 6 + si);
        if (a2 > life) continue;
        const an = dir + (hash(i, 7 + si) - 0.5) * 0.55 * (0.3 + hash(i, 9 + si));
        const sp = (si === 0 ? 5 : 3.5) + 11 * hash(i, 8 + si) ** 2;
        const pos = (tt: number) => { const d = sp * tt * (1 - 0.4 * tt / life); return this.w2s(c, apex.x + Math.cos(an) * d, apex.y + Math.sin(an) * d - 1.6 * tt * tt); };
        const p1 = pos(a2), p0 = pos(Math.max(0, a2 - 0.03));
        const k = 1 - a2 / life;
        X.seg2(p0[0], p0[1], p1[0], p1[1], 1.1 + 1.3 * k, [(LIN.signal[0] + k) * 2.4, (LIN.signal[1] + 0.7 * k * k) * 2.4, (LIN.signal[2] + 0.4 * k * k) * 2.4], Math.min(1, k * 1.5));
      }
    });
  }

  // ---------------------------------------------------------------- type
  /** Canvas transform for world-space text at (x, y), em size `em` world units, drawn at 100 px. */
  tx(ctx: CanvasRenderingContext2D, c: Cam, x: number, y: number, em: number, rot = 0) {
    const [sx, sy] = this.w2s(c, x, y);
    const k = (c.z * em) / 100;
    const a = c.roll - rot;
    ctx.setTransform(k * Math.cos(a), k * Math.sin(a), -k * Math.sin(a), k * Math.cos(a), sx, sy);
  }

  drawNotes(t: number, c: Cam, ctx: CanvasRenderingContext2D) {
    ctx.textBaseline = 'alphabetic';
    // before the pen exists, the listing's caret blinks on the beat
    const listing = this.notes.filter((n) => n.group === 'listing');
    const firstNote = listing[0]!;
    if (t < firstNote.t0) {
      const b = this.ctx.audio.beatAt(t);
      if (b - Math.floor(b) < 0.5 || t < 0.02) {
        this.tx(ctx, c, firstNote.x, firstNote.y, firstNote.em);
        ctx.fillStyle = rgba('signal', 1);
        ctx.fillRect(6, -74, 54, 88);
      }
    }
    const caretNote = t < this.tBorn ? listing.filter((x) => x.t0 <= t).pop() : undefined;
    for (const n of this.notes) {
      if (t < n.t0) continue;
      const px = c.z * n.em;
      const sizeA = clamp(px / 8 - 0.4) * (1 - clamp((px - n.maxPx) / (n.maxPx * 0.6)));
      const ga = this.groupAlpha(n.group, t) * sizeA;
      if (ga <= 0.003) continue;
      const shown = Math.floor(n.text.length * clamp((t - n.t0) / Math.max(0.01, n.dur)) + 1e-3);
      if (shown <= 0) continue;
      this.tx(ctx, c, n.x, n.y, n.em, n.rot);
      ctx.font = font(F.mono(n.weight), 100);
      ctx.textAlign = n.align;
      const hk = n.hot > 0 ? 1 - prog(t, n.t0 + n.dur, n.t0 + n.dur + n.hot) : 0;
      ctx.fillStyle = hk > 0 ? mixCss(n.col, 'signal', hk, n.a * ga) : rgba(n.col, n.a * ga);
      const s = n.align === 'left' ? n.text.slice(0, shown) : n.text;
      ctx.fillText(s, 0, 0);
      // the typing caret; the listing's last typed line keeps it (blinking) until the pen is born
      if ((shown < n.text.length || n === caretNote) && n.align === 'left') {
        const b = this.ctx.audio.beatAt(t);
        if (shown < n.text.length || b - Math.floor(b) < 0.5 || t > this.tBorn - 0.12) {
          ctx.fillStyle = rgba('signal', ga);
          ctx.fillRect(ctx.measureText(s).width + 6, -74, 54, 88);
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawLyrics(t: number, c: Cam, ctx: CanvasRenderingContext2D) {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const wTrue = this.w.true!;
    for (const lw of this.words) {
      if (t < lw.tAnt) continue;
      const ga = this.groupAlpha(lw.group, t);
      if (ga <= 0.003) continue;
      const px = c.z * lw.em;
      if (px < 6 || px > 5000) continue;
      const ant = prog(t, lw.tAnt, lw.tAnt + 0.18);
      // "true" is held past the cut into the prompt: finish its wipe before the plate goes
      const p = lw.w === wTrue ? prog(t, lw.w.start, Math.min(lw.w.end, this.tCut - 0.3)) : Lyrics.wordProgress(lw.w, t);
      const done = lw.w === wTrue ? prog(t, this.tCut - 0.3, this.tCut) : prog(t, lw.w.end, lw.w.end + 0.3);
      const isI = this.rectWords.has(lw.w);
      const isAGI = lw.w === this.w.AGI;
      ctx.font = font(lw.fam, 100);
      for (const g of lw.lay.glyphs) {
        const sylT = isAGI ? this.agi[g.i]?.[0] ?? lw.w.start : 0;
        const pop = isAGI ? 1 + 0.12 * pulse(t, sylT, 0.07) : 1;
        if (pop !== 1) {
          const cx = lw.x + ((g.x + g.w / 2) / 100) * lw.em, cy = lw.y + 0.36 * lw.em;
          this.tx(ctx, c, cx + (lw.x + (g.x / 100) * lw.em - cx) * pop, cy + (lw.y - cy) * pop, lw.em * pop, 0);
        } else this.tx(ctx, c, lw.x + (g.x / 100) * lw.em, lw.y, lw.em, 0);
        const gp = isAGI ? (t >= sylT ? 1 : 0) : clamp(p * lw.lay.glyphs.length - g.i);
        if (gp < 1 && !isI) {
          ctx.lineWidth = (1.1 * 100) / px;
          ctx.strokeStyle = rgba('ash', 0.45 * ant * ga);
          ctx.strokeText(g.ch, 0, 0);
        }
        if (gp > 0) {
          ctx.save();
          if (gp < 1) {
            // an "I" fills from the baseline up (it is a rectangle being filled); the others wipe left→right
            ctx.beginPath();
            if (isI) ctx.rect(-20, -100 * gp, g.w + 40, 100 * gp + 30); else ctx.rect(-20, -130, g.w * gp + 20, 190);
            ctx.clip();
          }
          const hotI = isAGI ? pulse(t, sylT, 0.05) : 0;
          ctx.fillStyle = hotI > 0.02 ? mixCss('signal', 'ember', Math.min(1, hotI * 1.5)) : done < 1 ? mixCss('signal', 'bone', done) : rgba('bone', 1);
          ctx.globalAlpha = ga;
          ctx.fillText(g.ch, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** Axis tick label, set like TikZ's math-mode ticks: a true minus sign (U+2212), not a hyphen. */
const tick = (i: number) => (i < 0 ? `−${-i}` : String(i));

/** Index of the horn's apex (highest point) and of its right base corner in the resampled triangle. */
function hornApex(h: P[]) { let bi = 0; h.forEach((p, i) => { if (p.y > h[bi]!.y) bi = i; }); return bi; }
function hornBaseR(h: P[]) { let bi = 0; h.forEach((p, i) => { if (p.x - p.y * 0.3 > h[bi]!.x - h[bi]!.y * 0.3 && p.y < 2.5) bi = i; }); return bi; }

function pointInPoly(x: number, y: number, ps: P[]) {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i]!, b = ps[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function mixCss(a: string, b: string, k: number, alpha = 1) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},${alpha})`;
}
