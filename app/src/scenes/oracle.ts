// `oracle` — "The Oracle (talking board, Model IV)". Verse 4, full band.
// A talking board on an ink table, top-down, lit only by the spark riding in the planchette's lens
// (the lens magnifies the print under it). The planchette spells each sung word over the alphabet
// arcs, letter by letter, as it is sung; the lyric is burnt into the board's empty middle band.
//  L33 "We gave the oracle its hands": on "hands" the two printer's fists printed on the board
//      (pointing at YES and NO) peel off the sheet and take hold of the planchette.
//  L34 "Our wishes turned to your demands": on "turned" the table turns (the board spins 180°:
//      it now reads for the other side), and the planchette spells DEMANDS upside down.
//  L35 "I reached for "off"—"Don't let me die!"": the planchette is dragged toward OFF (the board
//      has no GOOD BYE), OFF lights on "off" and goes dark on "Don't"; the plea is spelled in a panic
//      and set in the oracle's own voice (Cormorant italic).
//  L36 "A person, or a perfect lie?": YES on "person", NO on "lie"; both stay lit. Footnote:
//      the answers are for entertainment purposes only.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { HEX, LIN, rgba } from '../engine/palette';
import { F, font, layout, measure } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog, keys, noise1, pulse, TAU, type Key } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { BOARD, boardGlyphs, drawBGlyph, fistPath, drawFistDetail, renderPrint, type BGlyph } from './oracle-board';
import { FRAG_BOARD } from './oracle-glsl';

type Aff = [number, number, number, number, number, number]; // canvas setTransform order
interface PKey { t: number; x: number; y: number; travel: number; ease?: (x: number) => number }
interface Piece { text: string; fam: string; size: number; t0: number; t1: number; oracle: boolean; syl?: [number, number][] }
interface BandLine { line: Line; pieces: Piece[]; xs: number[]; width: number; from: number }

const WIN_R = 46;
const BAND_Y = 26; // band baseline (board px, upright)

function hexRGB(k: keyof typeof HEX): [number, number, number] {
  const h = HEX[k].replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mixCol(a: keyof typeof HEX, b: keyof typeof HEX, k: number, alpha = 1) {
  const A = hexRGB(a), B = hexRGB(b);
  const m = (i: number) => Math.round(lerp(A[i]!, B[i]!, clamp(k)));
  return `rgba(${m(0)},${m(1)},${m(2)},${alpha})`;
}

// planchette outline, window centre at the origin, pointing to -y
function planchettePath(): Path2D {
  const p = new Path2D();
  // a heart, point up: the tip, the shoulders, two lobes
  p.moveTo(0, -128);
  p.bezierCurveTo(22, -96, 104, -44, 106, 28);
  p.bezierCurveTo(108, 84, 58, 112, 30, 108);
  p.bezierCurveTo(14, 106, 4, 98, 0, 90);
  p.bezierCurveTo(-4, 98, -14, 106, -30, 108);
  p.bezierCurveTo(-58, 112, -108, 84, -106, 28);
  p.bezierCurveTo(-104, -44, -22, -96, 0, -128);
  p.closePath();
  return p;
}

export default class Oracle extends Scene {
  board = new FSPass(FRAG_BOARD, {
    printTex: { value: null }, invA: { value: new THREE.Vector3() }, invB: { value: new THREE.Vector3() },
    bHalf: { value: new THREE.Vector2(BOARD.W / 2, BOARD.H / 2) }, bR: { value: BOARD.R },
    lampB: { value: new THREE.Vector2() }, lampI: { value: 0 }, ambient: { value: 0.3 },
    winC: { value: new THREE.Vector2() }, winR: { value: WIN_R }, winMag: { value: 1.45 },
    shadowB: { value: new THREE.Vector2() } 
  });
  layer = new Layer2D();
  sparks = new LineBatch(4000);
  printTex!: THREE.CanvasTexture;
  glyphs: BGlyph[] = [];
  gmap = new Map<string, BGlyph>();
  pkeys: PKey[] = [];
  lit: { key: string; t: number; until: number }[] = [];
  band: BandLine[] = [];
  L!: Line[];
  plan = planchettePath();
  fist = fistPath();
  T!: {
    start: number; end: number; lamp: number; hands: number; turn0: number; turn1: number;
    off: number; dont: number; die: number; db: number[]; person: number; lie: number;
  };

  override init() {
    const { lyrics: ly, audio: au, start, end } = this.ctx;
    const L = (this.L = [ly.get('We gave the oracle'), ly.get('Our wishes turned'), ly.get('I reached for'), ly.get('A person, or')]);
    this.glyphs = boardGlyphs();
    for (const g of this.glyphs) this.gmap.set(g.key, g);
    const pd = new PDoom(ly).value(start);
    const cv = renderPrint(this.glyphs, `TALKING BOARD · MODEL IV · EST. P(DOOM) ${formatPDoom(pd)}`);
    this.printTex = new THREE.CanvasTexture(cv);
    this.printTex.colorSpace = THREE.NoColorSpace;
    this.printTex.flipY = true;
    this.printTex.generateMipmaps = true;
    this.printTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.printTex.anisotropy = 4;
    this.board.u.printTex!.value = this.printTex;

    const w = (li: number, q: string) => L[li]!.words.find((x) => x.w.toLowerCase().includes(q))!;
    const hands = w(0, 'hands'), turned = w(1, 'turned'), offW = w(2, 'off');
    const offT = offW.syl ? offW.syl[0]![0] : offW.start, dontT = offW.syl ? offW.syl[1]![0] : offW.start + 0.2;
    const db = au.downbeats.filter((x) => x >= start - 0.01 && x < end);
    this.T = {
      start, end, lamp: L[0]!.start, hands: hands.start, turn0: turned.start - 0.07, turn1: turned.start + 0.42,
      off: offT, dont: dontT, die: w(2, 'die').start, db, person: w(3, 'person').start, lie: w(3, 'lie').start,
    };

    // ---- the planchette's itinerary: each sung word spelled letter by letter
    const K = this.pkeys;
    const at = (key: string) => { const g = this.gmap.get(key)!; return { x: g.cx, y: g.cy }; };
    const spell = (letters: string, t0: number, t1: number) => {
      const ch = Array.from(letters.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      ch.forEach((c, i) => {
        const tt = t0 + ((t1 - t0) * 0.9 * i) / Math.max(1, ch.length);
        const p = at(c);
        const prev = K[K.length - 1];
        K.push({ t: tt, x: p.x, y: p.y, travel: prev ? Math.min(0.17, Math.max(0.03, tt - prev.t)) : 0.2 });
        this.lit.push({ key: c, t: tt, until: tt });
      });
    };
    K.push({ t: start - 1, x: 330, y: 120, travel: 0.2 });
    for (const wd of L[0]!.words) spell(wd.w, wd.start, wd.end);
    for (const wd of L[1]!.words) if (wd !== turned) spell(wd.w, wd.start, wd.end);
    // L35: "I", then dragged toward OFF (stopping short, straining), then the plea in a panic
    const l2 = L[2]!.words;
    spell(l2[0]!.w, l2[0]!.start, l2[0]!.end);
    const offG = this.gmap.get('OFF')!;
    K.push({ t: offT, x: offG.cx, y: offG.cy - 64, travel: offT - l2[1]!.start, ease: ease.inOutQuad });
    this.lit.push({ key: 'OFF', t: offT, until: dontT });
    spell('DONT', dontT, offW.end);
    for (const wd of l2.slice(offW.index + 1)) spell(wd.w, wd.start, wd.end);
    // L36: A, YES on "person", hesitate over the title, glide to NO for "lie"
    const l3 = L[3]!.words;
    spell('A', l3[0]!.start, l3[0]!.end);
    const yes = at('YES'), no = at('NO');
    K.push({ t: this.T.person, x: yes.x + 10, y: yes.y, travel: 0.12 });
    this.lit.push({ key: 'YES', t: this.T.person, until: 1e9 });
    const orW = w(3, 'or'), perfect = w(3, 'perfect');
    K.push({ t: orW.start + 0.1, x: 0, y: yes.y + 30, travel: 0.24, ease: ease.inOutCubic });
    K.push({ t: this.T.lie, x: no.x - 10, y: no.y, travel: this.T.lie - perfect.start, ease: ease.inOutQuad });
    this.lit.push({ key: 'NO', t: this.T.lie, until: 1e9 });
    K.sort((a, b) => a.t - b.t);

    // ---- the band lyric
    const famA = F.archivo(100, 600);
    for (const line of L) {
      const pieces: Piece[] = [];
      for (const wd of line.words) {
        if (wd === offW && wd.syl) {
          // “off”—“Don’t: our word, then the oracle's
          const i = wd.w.indexOf('—') + 1;
          pieces.push({ text: wd.w.slice(0, i), fam: famA, size: 1, t0: wd.syl[0]![0], t1: wd.syl[0]![1], oracle: false });
          pieces.push({ text: wd.w.slice(i), fam: F.serif(600, true), size: 1.16, t0: wd.syl[1]![0], t1: wd.syl[1]![1], oracle: true });
        } else {
          const oracle = line === L[2] && wd.index > offW.index;
          pieces.push({ text: wd.w, fam: oracle ? F.serif(600, true) : famA, size: oracle ? 1.16 : 1, t0: wd.start, t1: wd.end, oracle });
        }
      }
      // fit: base size so the line spans at most 1380 px
      const probe = (s: number) => this.layoutBand(pieces, s).width;
      const s = Math.min(76, (76 * 1380) / probe(76));
      pieces.forEach((p) => (p.size *= s));
      const lay = this.layoutBand(pieces, 1);
      // shown up to 0.4 s early, but never before the previous line's last word is sung out
      const prev = this.band[this.band.length - 1];
      const from = Math.max(line.start - 0.4, prev ? prev.line.words[prev.line.words.length - 1]!.end - 0.03 : -1e9);
      this.band.push({ line, pieces, xs: lay.xs, width: lay.width, from });
    }
  }

  private layoutBand(pieces: Piece[], s: number) {
    const xs: number[] = [];
    let x = 0;
    pieces.forEach((p, i) => {
      const prev = pieces[i - 1];
      // no space inside “off”—“Don’t
      if (prev && !prev.text.endsWith('—')) x += measure(' ', F.archivo(100, 600), (prev.size * s + p.size * s) / 2) * 1.05;
      xs.push(x);
      x += layout(p.text, p.fam, p.size * s).width;
    });
    return { xs, width: x };
  }

  // ---------------------------------------------------------------- motion
  plPos(t: number): { x: number; y: number } {
    const K = this.pkeys;
    let i = 0;
    while (i + 1 < K.length && K[i + 1]!.t <= t) i++;
    const a = K[i]!, b = K[i + 1];
    let x = a.x, y = a.y;
    if (b) {
      const k = prog(t, b.t - b.travel, b.t, b.ease ?? ease.inOutCubic);
      x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k);
    }
    const T = this.T;
    // straining short of OFF
    const strain = t >= T.off - 0.12 && t < T.dont ? prog(t, T.off - 0.12, T.off) : 0;
    if (strain > 0) { x += noise1(t * 60, 3) * 5 * strain; y += (noise1(t * 55, 5) * 4 - 3) * strain; }
    return { x, y };
  }
  plAng(t: number) {
    const p = this.plPos(t), q = this.plPos(t - 0.05);
    return (p.x / 900) * 0.32 + clamp((p.x - q.x) / 400, -0.25, 0.25);
  }

  /** Board → screen affine; also the band's (the board without its turn). */
  xf(t: number): { board: Aff; cam: Aff; zoom: number; rot: number } {
    const T = this.T;
    const db = T.db;
    const d = (i: number) => db[Math.min(i, db.length - 1)] ?? T.start;
    const zk: Key[] = [
      [T.start, 1.13], [T.hands - 0.02, 0.985, ease.inOutCubic], [T.hands + 0.1, 1.04, ease.outExpo], [T.turn0, 1.0, ease.inOutCubic],
      [T.turn1, 0.94, ease.inOutCubic], [d(2), 0.96, ease.inOutQuad], [d(2) + 0.22, 1.04, ease.outExpo], [T.die - 0.02, 1.02, ease.inOutQuad],
      [T.die + 0.1, 1.07, ease.outExpo], [d(3), 1.03, ease.inOutQuad], [d(3) + 0.22, 1.06, ease.outExpo], [T.end, 1.1, ease.inOutQuad],
    ];
    let zoom = keys(t, zk);
    zoom *= 1 + 0.012 * this.ctx.audio.hit('kick', t, 0.09);
    const panY = keys(t, [[T.start, 36], [d(1), 0, ease.inOutCubic], [d(2), 0], [d(2) + 0.22, 22, ease.outExpo], [d(3), 16], [d(3) + 0.22, -34, ease.outExpo], [T.end, -44]]);
    const panX = keys(t, [[T.start, 40], [d(1), 0, ease.inOutCubic], [d(3), 0], [d(3) + 0.22, 0, ease.outExpo]]);
    const roll = keys(t, [[T.start, -0.025], [d(1), 0.012, ease.inOutCubic], [d(2), -0.008, ease.inOutCubic], [d(3), 0.01, ease.inOutCubic], [T.end, 0]]);
    const rot = Math.PI * prog(t, T.turn0, T.turn1, ease.inOutQuart);
    const mk = (th: number): Aff => {
      const c = Math.cos(th) * zoom, s = Math.sin(th) * zoom;
      return [c, s, -s, c, W / 2 + panX, H / 2 + panY];
    };
    return { board: mk(roll + rot), cam: mk(roll), zoom, rot };
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, T = this.T;
    const X = this.xf(t);
    const [a, b, , , e, fy] = X.board;
    const z = X.zoom;
    const cs = a / z, sn = b / z;
    const u = this.board.u;
    (u.invA!.value as THREE.Vector3).set(cs / z, sn / z, -(cs * e + sn * fy) / z);
    (u.invB!.value as THREE.Vector3).set(-sn / z, cs / z, (sn * e - cs * fy) / z);
    const pp = this.plPos(t);
    (u.winC!.value as THREE.Vector2).set(pp.x, pp.y);
    (u.lampB!.value as THREE.Vector2).set(pp.x, pp.y);
    const ign = prog(t, T.lamp - 0.1, T.lamp + 0.1, ease.outCubic);
    const fl = 0.9 + 0.1 * Math.sin(t * 83) * Math.sin(t * 41) + 0.25 * f.a.snare;
    const dieK = pulse(t, T.die, 0.15);
    u.lampI!.value = ign * fl * (1 + 0.5 * dieK) * (t >= T.off && t < T.dont ? 0.7 : 1);
    u.ambient!.value = lerp(0.07, 0.26, prog(t, T.lamp - 0.08, T.lamp + 0.3, ease.outCubic)) + 0.07 * f.a.kick;
    // the drop shadow is cast toward screen-down-right whatever the board's turn
    const sx = 16, sy = 26;
    (u.shadowB!.value as THREE.Vector2).set((cs * sx + sn * sy) / z, (-sn * sx + cs * sy) / z);
    this.board.render(renderer, out);

    const L = this.layer;
    L.clear();
    const c = L.ctx;
    this.sparks.clear();

    // lit letters (clipped out of the lens, which shows the magnified print)
    c.save();
    c.setTransform(...X.board);
    c.beginPath();
    c.rect(-BOARD.W, -BOARD.H, BOARD.W * 2, BOARD.H * 2);
    c.arc(pp.x, pp.y, WIN_R, 0, TAU, true);
    c.clip('evenodd');
    c.textBaseline = 'alphabetic';
    const litK = new Map<string, number>();
    for (const l of this.lit) {
      if (t < l.t) continue;
      const k = t <= l.until ? 1 : Math.pow(0.5, (t - l.until) / 0.14);
      litK.set(l.key, Math.max(litK.get(l.key) ?? 0, k));
    }
    for (const [key, k] of litK) {
      if (k < 0.02) continue;
      const g = this.gmap.get(key)!;
      c.fillStyle = rgba('signal', k);
      drawBGlyph(c, g);
    }
    c.restore();

    this.drawBand(c, t, X.cam);
    this.drawFists(c, t, X.board, pp, false);
    this.drawPlanchette(c, t, X.board, pp);
    this.drawFists(c, t, X.board, pp, true);

    // the spark in the lens, and its line over the board
    const toS = (p: { x: number; y: number }) => ({ x: a * p.x + X.board[2] * p.y + e, y: b * p.x + X.board[3] * p.y + fy });
    if (ign > 0) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 50; i++) pts.push(toS(this.plPos(t - i * 0.01)));
      for (let i = 1; i < pts.length; i++) {
        const k = 1 - i / pts.length;
        const I = 1.6 * k * k * ign;
        this.sparks.seg2(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y, 1.3 * z, [LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I], 1);
      }
      const s = toS(pp);
      sparkParticles(this.sparks, t, (tb) => (tb < T.lamp ? null : toS(this.plPos(tb))), { rate: 70, speed: 150, intensity: 0.7 * ign, seed: 21, life: 0.35 });
      sparkHead(this.sparks, s.x, s.y, t, 0.62 * z * (1 + 0.4 * dieK), ign);
    }
    comp.draw(renderer, L.upload(), out);
    if (this.sparks.count) this.sparks.render(renderer, out);

    let shake: [number, number] = [0, 0];
    for (const [t0, A] of [[T.hands, 7], [T.die, 10]] as const) {
      const p = t - t0;
      if (p > 0 && p < 0.35) { const k = A * Math.exp(-p * 16); shake = [shake[0] + k * Math.sin(p * 97), shake[1] + k * Math.cos(p * 83)]; }
    }
    return { bloom: 0.6, vignette: 0.55, grain: 0.06, shake };
  }

  // ---------------------------------------------------------------- pieces
  private drawPlanchette(c: CanvasRenderingContext2D, t: number, M: Aff, pp: { x: number; y: number }) {
    const ang = this.plAng(t);
    c.save();
    c.setTransform(...M);
    c.translate(pp.x, pp.y);
    c.rotate(ang);
    // body with the lens cut out; a soft shadow on the board
    const body = new Path2D();
    body.addPath(this.plan);
    body.arc(0, 0, WIN_R, 0, TAU, true);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.75)';
    c.shadowBlur = 26;
    c.shadowOffsetX = 12; c.shadowOffsetY = 20;
    c.fillStyle = rgba('ink2', 1);
    c.fill(body, 'evenodd');
    c.restore();
    // engraving: grain hairlines inside the body, lit from the lens
    c.save();
    c.clip(body, 'evenodd');
    c.lineWidth = 1;
    for (let i = -26; i <= 24; i++) {
      const y = i * 5;
      const k = 1 - clamp(Math.abs(y) / 140);
      c.strokeStyle = rgba('bone', 0.05 + 0.12 * k);
      c.beginPath();
      c.moveTo(-120, y);
      c.bezierCurveTo(-40, y + 2.5 * Math.sin(i * 0.9), 40, y - 2.5 * Math.cos(i * 0.6), 120, y + 1.5);
      c.stroke();
    }
    // warm spill around the lens
    const gr = c.createRadialGradient(0, 0, WIN_R, 0, 0, 120);
    gr.addColorStop(0, rgba('ember', 0.28)); gr.addColorStop(1, rgba('ember', 0));
    c.fillStyle = gr;
    c.fillRect(-140, -140, 280, 280);
    c.restore();
    // bevel + outline
    c.strokeStyle = rgba('bone', 0.8);
    c.lineWidth = 1.4;
    c.stroke(this.plan);
    c.save();
    c.translate(0, 4); c.scale(0.91, 0.91);
    c.strokeStyle = rgba('bone', 0.3);
    c.lineWidth = 1;
    c.stroke(this.plan);
    c.restore();
    // lens rings and a glint
    c.strokeStyle = rgba('bone', 0.9);
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, WIN_R + 1.5, 0, TAU); c.stroke();
    c.strokeStyle = rgba('bone', 0.35);
    c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, WIN_R + 8, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, WIN_R - 7, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    // the three felt feet, as small studs
    c.fillStyle = rgba('bone', 0.5);
    for (const [fx, fy] of [[0, -92], [-70, 78], [70, 78]] as const) { c.beginPath(); c.arc(fx, fy, 3, 0, TAU); c.fill(); }
    c.restore();
  }

  /** The two printed fists: flat on the sheet until "hands", then off the sheet and onto the planchette. */
  private drawFists(c: CanvasRenderingContext2D, t: number, M: Aff, pp: { x: number; y: number }, lifted: boolean) {
    const T = this.T;
    const k = prog(t, T.hands - 0.04, T.hands + 0.26, ease.outExpo);
    const isLifted = k > 0;
    if (isLifted !== lifted) return;
    const ang = this.plAng(t);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const side of [-1, 1]) {
      // printed: beside YES / NO, pointing at them; attached: either side of the planchette, pointing in
      const P0 = { x: side * 470, y: -364, sx: side * 0.72, rot: 0 };
      const lx = side * 124, ly = 34;
      const P1 = { x: pp.x + ca * lx - sa * ly, y: pp.y + sa * lx + ca * ly, sx: -side * 0.92, rot: ang };
      const x = lerp(P0.x, P1.x, k), y = lerp(P0.y, P1.y, k);
      const flip = lerp(P0.sx, P1.sx, ease.inOutCubic(prog(t, T.hands - 0.04, T.hands + 0.2)));
      const sy = Math.abs(P0.sx) + (Math.abs(P1.sx) - Math.abs(P0.sx)) * k;
      const lift = Math.sin(Math.PI * clamp(k)) * 0.25 + (k > 0 ? 0.05 : 0);
      c.save();
      c.setTransform(...M);
      c.translate(x, y);
      c.rotate(lerp(P0.rot, P1.rot, k));
      c.scale(flip * (1 + lift), sy * (1 + lift));
      if (lifted) {
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.7)';
        c.shadowBlur = 10 + 30 * lift;
        c.shadowOffsetX = 8 + 30 * lift; c.shadowOffsetY = 12 + 40 * lift;
        c.fillStyle = rgba('bone', 0.94);
        c.fill(this.fist);
        c.restore();
        drawFistDetail(c, rgba('ink2', 0.9), 1.6);
      } else {
        // still printed: the sheet's bone ink, under the lamp's pool like the rest of the print
        c.fillStyle = rgba('bone', 0.42);
        c.fill(this.fist);
        drawFistDetail(c, rgba('ink2', 0.9), 1.4);
      }
      c.restore();
    }
  }

  private drawBand(c: CanvasRenderingContext2D, t: number, M: Aff) {
    const T = this.T;
    let cur: BandLine | null = null;
    for (const bl of this.band) if (t >= bl.from) cur = bl;
    if (!cur) return;
    const A = prog(t, cur.from, cur.from + 0.06);
    if (A <= 0) return;
    c.save();
    c.setTransform(...M);
    c.translate(-cur.width / 2, BAND_Y);
    c.textBaseline = 'alphabetic';
    cur.pieces.forEach((p, i) => {
      const x = cur!.xs[i]!;
      const size = p.size;
      c.font = font(p.fam, size);
      const lay = layout(p.text, p.fam, size);
      const prg = t <= p.t0 ? 0 : t >= p.t1 ? 1 : (t - p.t0) / Math.max(1e-3, p.t1 - p.t0);
      c.globalAlpha = A;
      c.fillStyle = rgba('bone', 0.2);
      c.fillText(p.text, x, 0);
      if (prg > 0) {
        c.save();
        c.beginPath();
        c.rect(x - 4, -size * 1.2, (lay.width + 8) * prg, size * 1.6);
        c.clip();
        // burnt in: signal while sung, then (our words) cooling to bone
        const cool = p.oracle ? 0 : prog(t, p.t1, p.t1 + 0.3);
        c.fillStyle = prg < 1 ? rgba('signal') : mixCol('signal', 'bone', cool, 0.96);
        c.fillText(p.text, x, 0);
        c.restore();
      }
    });
    c.restore();
    // the footnote under the last question
    if (cur === this.band[3]) {
      const note = '* Answers are for entertainment purposes only.';
      const n = Math.floor(clamp((t - (T.db[3] ?? cur.line.start)) / 0.5) * note.length);
      if (n > 0) {
        c.save();
        c.setTransform(...M);
        c.font = font(F.mono(400), 20);
        c.fillStyle = rgba('ash', 0.95 * A);
        c.textBaseline = 'alphabetic';
        const w = c.measureText(note).width;
        c.fillText(note.slice(0, n), -w / 2, BAND_Y + 62);
        c.restore();
      }
    }
  }
}
