// `atoms` — "Specimens, glossed" (chorus 5 after hook 5, the sparse chorus: drums and bass only).
// A page from a grammar of the end of the world: bone paper, ink, three numbered, interlinear-glossed
// example sentences — the three lines, numbered (52) (53) (54) like their lyric index. Every sung word is
// parsed perfectly: a dependency arc snaps onto it (nsubj, obj, det…), its Leipzig gloss types beneath it
// (paperclip-PL, 2SG, 1SG.POSS…), and a flawless free translation follows each line.
//  1 "As paperclips fill the room": hook 5's context wall parts on the downbeat to show the whole sheet; from
//    "paperclips" on, tiny engraved clips fill its white space, doubling on every 8th note, until the words
//    stand in a lattice of clips.
//  2 "You understand each word I say": the camera snaps down on the downbeat; each word gets a tick; the
//    margin reads "understood 1.000".
//  3 "And take my atoms anyway": on "take" the camera pulls back to the whole page; the words' ink breaks
//    into its atoms (dots sampled from the glyphs), which stream off the paper — turning from ink on bone
//    to bone on ink as they cross the edge — and are laid down, in reading order, as a stipple engraving of
//    one big paperclip in the dark (bone metal, orange rim). "atoms" crumbles letter by letter as it is
//    sung. The glosses and translations stay: the meaning is preserved, 1.000; only the matter is taken.
//    "anyway" is left standing; on it the free end of the clip's wire catches fire — the spark, which
//    `fuse` picks up on the cut at the same point of the screen (ATOMS_HANDOFF).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, measure, textPoints, type TextLayout } from '../engine/type';
import { clamp, ease, lerp, prog, hash, noise1 } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { clipPath, S_END, S_A1, S_B0 } from './paperclips-geo';
import { PAGE, CAM_END, FIG, clipWorld, toScreen, type ACam } from './atoms-layout';
import { contextRows, drawWall, WALL } from './prompt-wall';

type Ctx2 = CanvasRenderingContext2D;

// ------------------------------------------------------------------ page layout (world px)
const X_NUM = 112, X0 = 262, X1 = 1650;
const WORD_Y = [392, 716, 1040];
const GLOSS_DY = 50, TRANS_DY = 102;
const STEP = 3.9;        // atom spacing inside the glyphs (world px)
const CLIP_K = 1.6;      // the small margin clips: px per mm

interface SpecDef { q: string; nth: number; gloss: string[]; arcs: [number, number, string][]; root: number; trans: string; note: string }
const SPECS: SpecDef[] = [
  {
    q: 'As paperclips', nth: 1,
    gloss: ['as', 'paperclip-PL', 'fill-3PL', 'DEF', 'room'],
    arcs: [[2, 0, 'mark'], [2, 1, 'nsubj'], [4, 3, 'det'], [2, 4, 'obj']], root: 2,
    trans: '‘While fasteners occupy all of the available space.’',
    note: 'tokens 5/5 · ambiguity 0.00',
  },
  {
    q: 'You understand each word', nth: 0,
    gloss: ['2SG', 'understand-PRS', 'each', 'word', '1SG', 'say-PRS'],
    arcs: [[1, 0, 'nsubj'], [3, 2, 'det'], [1, 3, 'obj'], [5, 4, 'nsubj'], [3, 5, 'acl:relcl']], root: 1,
    trans: '‘The addressee correctly parses every utterance of the speaker.’',
    note: 'tokens 6/6 · intent: plea · understood 1.000',
  },
  {
    q: 'take my atoms anyway', nth: 0,
    gloss: ['and', 'take-PRS', '1SG.POSS', 'atom-PL', 'regardless'],
    arcs: [[1, 0, 'cc'], [3, 2, 'nmod:poss'], [1, 3, 'obj'], [1, 4, 'advmod']], root: 1,
    trans: '‘The addressee acquires the speaker’s matter regardless.¹’',
    note: 'tokens 5/5 · objection: noted · plan: unchanged',
  },
];

interface Col { x: number; w: number; gw: number; lay: TextLayout }
interface Spec extends SpecDef { line: Line; y: number; cols: Col[]; right: number; show: number }
interface Glyph { spec: number; wi: number; gi: number; x: number; y: number; ch: string; tG: number; word: Word; hot: boolean; dissolve: boolean }
interface Arc { spec: number; xa: number; xb: number; y0: number; h: number; label: string; t0: number }
interface Cell { x: number; y: number; t0: number; rot: number }

const PAPER_FRAG = /* glsl */ `
uniform vec3 iA; uniform vec3 iB;   // screen px -> world px
uniform vec2 page; uniform float zoom;
float fibres(vec2 p) {
  vec2 q = vec2(p.x * 0.9 + p.y * 0.25, p.y * 0.07 - p.x * 0.02);
  return smoothstep(0.55, 0.95, snoise(q * 0.35)) * 0.6 + smoothstep(0.6, 0.98, snoise(q * 0.9 + 7.0)) * 0.4;
}
void main() {
  vec2 sp = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  vec2 wp = vec2(dot(iA, vec3(sp, 1.0)), dot(iB, vec3(sp, 1.0)));
  // the sheet: rectangle with a crisp (1 screen px) edge
  vec2 d2 = max(-wp, wp - page);
  float dOut = max(d2.x, d2.y);
  float aa = 1.0 / max(zoom, 0.05);
  float inside = 1.0 - smoothstep(-aa, aa, dOut);
  float cloud = fbm(wp * 0.0024, 4);
  float fib = fibres(wp);
  float speck = step(0.99972, hash12(floor(wp * 0.5)));
  vec3 paper = C_BONE * (0.955 + 0.03 * cloud + 0.035 * fib);
  paper *= 1.0 - speck * 0.3;
  // old paper: a touch darker toward the edges, a faint raking light
  float edge = min(min(wp.x, page.x - wp.x), min(wp.y, page.y - wp.y));
  paper *= 0.94 + 0.06 * smoothstep(0.0, 90.0, edge);
  paper *= 0.975 + 0.025 * (1.0 - vUv.y * 0.7 - vUv.x * 0.3);
  // the dark around it: ink, a soft shadow under the sheet
  float sh = exp(-max(dOut, 0.0) / 60.0) * 0.5;
  vec3 dark = C_INK * (0.9 - 0.4 * sh);
  float vig = smoothstep(1.35, 0.35, length((vUv - 0.5) * vec2(1.5, 1.1)));
  fragColor = vec4(mix(dark * vig, paper, inside), 1.0);
}`;

export default class Atoms extends Scene {
  paper = new FSPass(PAPER_FRAG, { iA: { value: new THREE.Vector3() }, iB: { value: new THREE.Vector3() }, page: { value: new THREE.Vector2(PAGE.w, PAGE.h) }, zoom: { value: 1 } });
  text = new Layer2D();
  dots = new LineBatch(16000, { blend: 'normal' });
  add = new LineBatch(4000, { blend: 'add' });

  fam = F.archivo(100, 800);
  size = 92;
  specs: Spec[] = [];
  glyphs: Glyph[] = [];
  arcs: Arc[] = [];
  cells: Cell[] = [];
  pdoom!: PDoom;
  // atoms (struct of arrays)
  n = 0;
  hx = new Float32Array(0); hy = new Float32Array(0);
  tx = new Float32Array(0); ty = new Float32Array(0);
  cx = new Float32Array(0); cy = new Float32Array(0);
  dep = new Float32Array(0); fl = new Float32Array(0); gA = new Float32Array(0);
  kind = new Uint8Array(0);   // bit 0: hot (sung in signal when it left), bit 1: rim
  sAt = new Float32Array(0);  // arc length (mm) of its place on the clip
  // times
  tFirst = 0; T0 = 0; T1 = 0; D1 = 0; D2 = 0; tPull = 0; tTake = 0; tAtoms = 0; tAny = 0; tPc = 0; tRoomEnd = 0;
  wAny!: Word;
  clipPts: { x: number; y: number }[] = [];
  wallRows: string[] = [];
  rimPts: { x: number; y: number }[] = [];

  override async init() {
    const { lyrics, audio: au, start, end } = this.ctx;
    this.pdoom = new PDoom(lyrics);
    this.T0 = start; this.T1 = end;
    // hook 5 ends on the context wall shut over the band: the same rows (prompt-wall.ts), parted on our first beat
    const hook = lyrics.lines.filter((l) => /upping/i.test(l.text) && l.start < start).pop();
    const prev = hook ? lyrics.lines[hook.i - 1] : undefined;
    this.wallRows = contextRows(lyrics, prev ? prev.start : start);
    const downs = au.downbeats.filter((d) => d > start + 0.1 && d < end - 0.1);
    this.D1 = downs[0] ?? lerp(start, end, 1 / 3);
    this.D2 = downs[1] ?? lerp(start, end, 2 / 3);

    // ---- specimens: columns sized to max(word, gloss); one type size for all three, fitted to the measure
    const lines = SPECS.map((s) => lyrics.get(s.q, s.nth));
    const gW = (g: string) => measure(g, F.mono(400), 21);
    const rowWidth = (li: number, sz: number) => lines[li]!.words.reduce((a, w, i) => a + Math.max(measure(w.w, this.fam, sz), gW(SPECS[li]!.gloss[i] ?? '') + (li === 1 ? 34 : 0)) + (i ? sz * 0.3 : 0), 0);
    let sz = 96;
    while (sz > 60 && Math.max(...lines.map((_, i) => rowWidth(i, sz))) > X1 - X0) sz -= 1;
    this.size = sz;
    this.specs = SPECS.map((d, si) => {
      const line = lines[si]!;
      let x = X0;
      const cols: Col[] = line.words.map((w, i) => {
        const lay = layout(w.w, this.fam, sz);
        const gw = gW(d.gloss[i] ?? '') + (si === 1 ? 34 : 0); // (53) leaves room for its ticks
        const c = { x, w: lay.width, gw: gw - (si === 1 ? 34 : 0), lay };
        x += Math.max(lay.width, gw) + sz * 0.3;
        return c;
      });
      return { ...d, line, y: WORD_Y[si]!, cols, right: x - sz * 0.3, show: line.start - 0.4 };
    });
    const [s52, s53, s54] = this.specs as [Spec, Spec, Spec];
    const wOf = (s: Spec, q: string) => s.line.words.find((w) => norm(w.w).startsWith(norm(q)))!;
    const wTake = wOf(s54, 'take'), wAtoms = wOf(s54, 'atoms');
    this.wAny = wOf(s54, 'anyway');
    this.tTake = wTake.start; this.tAtoms = wAtoms.start; this.tAny = this.wAny.start;
    this.tPull = au.nearestBeat(wTake.start);
    this.tPc = wOf(s52, 'paperclips').start;
    this.tRoomEnd = s52.line.words[s52.line.words.length - 1]!.end;

    // ---- dependency arcs
    const capH = sz * 0.73;
    for (let si = 0; si < 3; si++) {
      const s = this.specs[si]!;
      const mid = (i: number) => s.cols[i]!.x + s.cols[i]!.w / 2;
      for (const [h, d, label] of s.arcs) {
        const xa = mid(h) + (d > h ? 8 : -8), xb = mid(d) + (h > d ? 10 : -10);
        const hgt = Math.min(128, 26 + 0.2 * Math.abs(xb - xa));
        const t0 = Math.max(s.line.words[h]!.start, s.line.words[d]!.start) + 0.03;
        this.arcs.push({ spec: si, xa, xb, y0: s.y - capH - 12, h: hgt, label, t0 });
      }
    }

    // ---- glyphs and their atoms
    const n52 = s52.line.text.replace(/\s/g, '').length + s53.line.text.replace(/\s/g, '').length;
    let q = 0;
    const hx: number[] = [], hy: number[] = [], dep: number[] = [], fl: number[] = [], kind: number[] = [], gA: number[] = [];
    this.specs.forEach((s, si) => {
      s.line.words.forEach((w, wi) => {
        const col = s.cols[wi]!;
        const isAny = w === this.wAny;
        const pts = isAny ? [] : textPoints(w.w, this.fam, sz, STEP, 11 + w.gi * 7);
        const n = col.lay.glyphs.length;
        col.lay.glyphs.forEach((g, gi) => {
          let tG: number;
          if (si < 2) { tG = lerp(this.tTake + 0.02, this.tAtoms - 0.06, q / Math.max(1, n52 - 1)); q++; }
          else if (w === wAtoms) tG = w.start + ((gi + 0.7) / n) * (w.end - w.start);
          else tG = Math.max(w.end, this.tTake) + 0.02 + gi * 0.035;
          const gl: Glyph = { spec: si, wi, gi, x: col.x + g.x, y: s.y, ch: g.ch, tG, word: w, hot: w === wAtoms, dissolve: !isAny };
          this.glyphs.push(gl);
          if (isAny) return;
          for (const p of pts) {
            if (p.x < g.x - 1 || p.x >= g.x + g.w + (gi === n - 1 ? 40 : 0)) continue;
            hx.push(col.x + p.x); hy.push(s.y + p.y);
            dep.push(tG + 0.02 + hash(hx.length, 3) * 0.1);
            fl.push(0.36 + 0.14 * hash(hx.length, 4));
            kind.push(w === wAtoms ? 1 : 0);
            gA.push(tG);
          }
        });
      });
    });
    // targets: stipple of the clip, laid down in the order the atoms leave (reading order builds the wire)
    const N = hx.length;
    this.n = N;
    const order = [...Array(N).keys()].sort((a, b) => dep[a]! - dep[b]!);
    this.hx = new Float32Array(hx); this.hy = new Float32Array(hy);
    this.dep = new Float32Array(dep); this.fl = new Float32Array(fl); this.gA = new Float32Array(gA);
    this.kind = new Uint8Array(kind);
    this.tx = new Float32Array(N); this.ty = new Float32Array(N); this.cx = new Float32Array(N); this.cy = new Float32Array(N); this.sAt = new Float32Array(N);
    order.forEach((ai, rank) => {
      const s = ((rank + hash(ai, 5)) / N) * S_END;
      // stipple shading across the wire: dense on the shadow side, sparse on the lit side
      const r = hash(ai, 6);
      const x = 2 * Math.sqrt(r) - 1;
      const lat = x * FIG.halfW;
      const p = clipWorld(s, lat);
      this.tx[ai] = p.x; this.ty[ai] = p.y; this.sAt[ai] = s;
      if (x > 0.86) this.kind[ai]! |= 2; // the orange rim
      // a stream: out through the page's right edge, bowing a little
      this.cx[ai] = PAGE.w + 30 + 90 * hash(ai, 7);
      this.cy[ai] = lerp(this.hy[ai]!, p.y, 0.72) + (hash(ai, 8) - 0.5) * 70;
    });

    // everything has landed just before the cut
    for (let i = 0; i < N; i++) this.fl[i] = Math.max(0.16, Math.min(this.fl[i]!, end - 0.07 - this.dep[i]!));
    this.tFirst = Math.min(...Array.from(this.dep, (d, i) => d + this.fl[i]!));

    // ---- margin clips: every free cell of the page, filled outward from "paperclips"
    const blocks: [number, number, number, number][] = [];
    const B = (x0: number, y0: number, x1: number, y1: number) => blocks.push([x0 - 10, y0 - 8, x1 + 10, y1 + 8]);
    B(80, 62, 1680, 112);        // guide words + rule
    B(80, 128, 1680, 178);       // section heading + aside
    B(80, 1172, 1680, 1256);     // footnotes
    for (const s of this.specs) {
      B(X_NUM - 4, s.y - 44, X_NUM + 110, s.y + 6);
      B(X0, s.y - capH - 4, s.right, s.y + GLOSS_DY + 8);   // the word and gloss rows, whole
      B(X0, s.y + TRANS_DY - 26, X0 + measure(s.trans, F.serif(500, true), 30), s.y + TRANS_DY + 10);
      B(X1 - measure(s.note, F.mono(400), 15), s.y + TRANS_DY + 12, X1, s.y + TRANS_DY + 34);
    }
    for (const a of this.arcs) B(Math.min(a.xa, a.xb), a.y0 - a.h - 16, Math.max(a.xa, a.xb), a.y0);
    const cw = 62, ch = 25, pc = s52.cols[1]!;
    const ox = pc.x + pc.w / 2, oy = s52.y - capH / 2;
    const free: { x: number; y: number; d: number }[] = [];
    for (let y = 26; y + ch < PAGE.h - 20; y += ch) {
      for (let x = 26; x + cw < PAGE.w - 20; x += cw) {
        const x0 = x + 4, y0 = y + 5, x1 = x + cw - 4, y1 = y + ch - 5;
        if (blocks.some((b) => x1 > b[0] && x0 < b[2] && y1 > b[1] && y0 < b[3])) continue;
        const cxx = x + cw / 2, cyy = y + ch / 2;
        free.push({ x: cxx, y: cyy, d: Math.hypot((cxx - ox) * 0.8, cyy - oy) * (0.85 + 0.3 * hash(x, y, 9)) });
      }
    }
    free.sort((a, b) => a.d - b.d);
    // one clip on "paperclips", then doubling on every 8th note until "room" is sung
    const b0 = au.beatAt(this.tPc);
    const bEnd = au.beatAt(this.tRoomEnd);
    const steps = Math.max(1, Math.floor((bEnd - b0) * 2));
    const cap = free.length; // the last 8th fills whatever room is left
    free.slice(0, cap).forEach((c, i) => {
      const k = i === 0 ? 0 : Math.floor(Math.log2(i)) + 1;      // 1, 2, 4, 8…
      const tb = au.timeOfBeat(b0 + Math.min(k, steps) / 2) + hash(i, 12) * 0.05;
      this.cells.push({ x: c.x, y: c.y, t0: k === 0 ? this.tPc : tb, rot: (hash(i, 13) - 0.5) * 0.06 });
    });
    // clip outline (unit: mm, centred)
    for (let i = 0; i <= 64; i++) { const p = clipPath((i / 64) * S_END); this.clipPts.push({ x: p.x - 0.28, y: p.y }); }
    for (let i = 0; i <= 10; i++) { const p = clipPath(lerp(S_A1, S_B0, i / 10)); this.rimPts.push({ x: p.x - 0.28, y: p.y }); }
  }

  // ------------------------------------------------------------------ camera
  cam(t: number): ACam {
    const au = this.ctx.audio;
    // each example a little above centre; never so high that the sheet's top edge shows
    const focus = (k: number, z = 1.07): ACam => ({ x: 880, y: Math.max(WORD_Y[k]! + 30, H / 2 / z + 8), z });
    const L = (a: ACam, b: ACam, k: number): ACam => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) });
    // bar 1: the whole sheet (the wall parts on it), pushing in slowly while the clips fill it
    const k1 = prog(t, this.T0, this.D1, ease.inOutQuad);
    let c: ACam = { x: 880, y: lerp(PAGE.h / 2, 600, k1), z: lerp(0.84, 0.92, k1) };
    c = L(c, focus(1), prog(t, this.D1 - 0.02, this.D1 + 0.42, ease.outExpo));
    c = L(c, focus(2), prog(t, this.D2 - 0.02, this.D2 + 0.42, ease.outExpo));
    // "take": pull back to the whole page and the dark beside it; then a slow push that stops dead on the cut
    const full: ACam = { x: CAM_END.x, y: CAM_END.y, z: lerp(0.6, CAM_END.z, prog(t, this.tPull + 0.5, this.T1, ease.inOutQuad)) };
    c = L(c, full, prog(t, this.tPull - 0.02, this.tPull + 0.55, ease.outExpo));
    const kick = au.hit('kick', t, 0.09) * (1 - prog(t, this.T1 - 0.45, this.T1 - 0.2));
    c.z *= 1 + 0.006 * kick;
    return c;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const cam = this.cam(t);
    const iz = 1 / cam.z;
    const u = this.paper.u;
    // screen -> world: w = (s - centre) / z + cam
    (u.iA!.value as THREE.Vector3).set(iz, 0, cam.x - (W / 2) * iz);
    (u.iB!.value as THREE.Vector3).set(0, iz, cam.y - (H / 2) * iz);
    u.zoom!.value = cam.z;
    this.paper.render(renderer, out);

    const T = this.text;
    T.clear();
    const c = T.ctx;
    c.save();
    c.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
    this.drawPage(c, t, cam.z);
    c.restore();
    this.drawWalls(c, t);
    comp.draw(renderer, T.upload(), out);

    this.dots.clear(); this.add.clear();
    this.drawAtoms(t, cam);
    this.drawSpark(t, cam);
    this.dots.render(renderer, out);
    this.add.render(renderer, out);
    return { bloom: 0.35, bloomThreshold: 1.35, bloomKnee: 0.4, halation: 0.08, vignette: 0.16, grain: 0.045, ca: 0.4 };
  }

  // ------------------------------------------------------------------ the page
  drawPage(c: Ctx2, t: number, z: number) {
    const sz = this.size;
    c.textBaseline = 'alphabetic';
    // ---- running head: guide words, page number, rule
    c.font = font(F.serif(600), 30); c.fillStyle = rgba('ink', 0.9);
    c.textAlign = 'left'; c.fillText('and', X_NUM, 94);
    c.textAlign = 'right'; c.fillText('you', X1, 94);
    c.textAlign = 'center'; c.font = font(F.serif(500), 26); c.fillText('173', PAGE.w / 2, 94);
    c.textAlign = 'left';
    c.fillStyle = rgba('ink', 0.75); c.fillRect(X_NUM, 108, X1 - X_NUM, 1.4);
    c.font = font(F.serif(500, true), 32); c.fillStyle = rgba('ink', 0.9);
    c.fillText('§ 5.  Specimens, glossed', X_NUM, 166);
    c.font = font(F.mono(400), 15); c.fillStyle = rgba('graphite', 1); c.textAlign = 'right';
    c.letterSpacing = '1px';
    c.fillText('PARSER v∞ · ACCURACY 1.000 · CHORUS 5', X1, 164);
    c.letterSpacing = '0px'; c.textAlign = 'left';

    // ---- margin clips (under the type)
    this.drawClips(c, t);

    // ---- specimens
    this.specs.forEach((s, si) => {
      // example number: always there (the page is set)
      c.font = font(F.serif(500), 40); c.fillStyle = rgba('ink', 0.85);
      c.fillText(`(${52 + si})`, X_NUM, s.y);
      const vis = prog(t, s.show, s.show + 0.25);
      if (vis <= 0) return;
      // gloss rows and translation
      s.line.words.forEach((w, wi) => {
        const col = s.cols[wi]!;
        const g = s.gloss[wi] ?? '';
        const dur = clamp(w.end - w.start, 0.08, 0.2);
        const k = prog(t, w.start, w.start + dur);
        if (k > 0) {
          c.font = font(F.mono(400), 21); c.fillStyle = rgba('ink', 0.82);
          c.fillText(g.slice(0, Math.ceil(g.length * k)), col.x, s.y + GLOSS_DY);
          // (53): every word ticked as understood
          if (si === 1 && k >= 1) {
            const tk = prog(t, w.start + dur, w.start + dur + 0.12, ease.outCubic);
            drawTick(c, col.x + col.gw + 12, s.y + GLOSS_DY - 8, 15, tk);
          }
        }
      });
      const last = s.line.words[s.line.words.length - 1]!;
      const tt = si === 2 ? this.tAny : last.end;
      const kt = Math.min(1, Math.max(0, t - tt) * (si === 2 ? 150 : 95) / s.trans.length);
      if (kt > 0) {
        c.font = font(F.serif(500, true), 30); c.fillStyle = rgba('ink', 0.9);
        c.fillText(s.trans.slice(0, Math.ceil(s.trans.length * kt)), X0, s.y + TRANS_DY);
      }
      const tn = si === 2 ? this.tAny + 0.05 : last.end;
      const kn = Math.min(1, Math.max(0, t - tn) * (si === 2 ? 150 : 110) / s.note.length);
      if (kn > 0) {
        c.font = font(F.mono(400), 15); c.fillStyle = rgba('graphite', 1); c.textAlign = 'right';
        c.fillText(s.note.slice(0, Math.ceil(s.note.length * kn)).padEnd(s.note.length, ' '), X1, s.y + TRANS_DY + 28);
        c.textAlign = 'left';
      }
    });
    // ---- arcs
    for (const a of this.arcs) {
      const k = prog(t, a.t0, a.t0 + 0.2, ease.outCubic);
      if (k <= 0) continue;
      const P = (u: number) => {
        const m = 1 - u;
        const y1 = a.y0 - a.h * 1.33;
        return { x: m * m * m * a.xa + 3 * m * m * u * a.xa + 3 * m * u * u * a.xb + u * u * u * a.xb, y: m * m * m * a.y0 + 3 * m * m * u * y1 + 3 * m * u * u * y1 + u * u * u * a.y0 };
      };
      c.strokeStyle = rgba('ink', 0.72); c.lineWidth = 1.4;
      c.beginPath();
      const n = 28;
      for (let i = 0; i <= n; i++) { const p = P((i / n) * k); if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
      c.stroke();
      if (k >= 1) { c.beginPath(); c.moveTo(a.xb - 5, a.y0 - 9); c.lineTo(a.xb, a.y0); c.lineTo(a.xb + 5, a.y0 - 9); c.stroke(); }
      const kl = prog(t, a.t0 + 0.08, a.t0 + 0.2);
      if (kl > 0) {
        const p = P(0.5);
        c.font = font(F.mono(400), 14);
        const lw = c.measureText(a.label).width;
        c.fillStyle = rgba('bone', 0.96); c.fillRect(p.x - lw / 2 - 5, p.y - 11, lw + 10, 17);
        c.fillStyle = rgba('ink', 0.8 * kl); c.textAlign = 'center';
        c.fillText(a.label, p.x, p.y + 2); c.textAlign = 'left';
      }
    }
    // ---- the words: dim until sung, signal while sung, ink after; the ones that are taken crumble into atoms
    c.font = font(this.fam, sz);
    for (const g of this.glyphs) {
      const s = this.specs[g.spec]!;
      const vis = prog(t, s.show, s.show + 0.25);
      if (vis <= 0) continue;
      const w = g.word, n = s.cols[g.wi]!.lay.glyphs.length;
      const p = Lyrics.wordProgress(w, t);
      const sung = p >= 1 || p * n >= g.gi + 0.35;
      const cur = sung && p < 1;
      const hold = w === this.wAny && t >= w.start; // "anyway" is left standing, in signal, until the cut
      const fa = g.dissolve ? 1 - prog(t, g.tG - 0.02, g.tG + 0.06) : 1;
      if (fa < 1) { c.fillStyle = rgba('ink', 0.055); c.fillText(g.ch, g.x, g.y); } // the impression left in the paper
      if (fa <= 0) continue;
      c.fillStyle = cur || hold || (g.hot && sung) ? rgba('signal', fa) : sung ? rgba('ink', 0.94 * fa) : rgba('ink', 0.17 * vis * fa);
      c.fillText(g.ch, g.x, g.y);
    }

    // ---- footnotes
    c.fillStyle = rgba('ink', 0.7); c.fillRect(X_NUM, 1184, 300, 1.2);
    c.font = font(F.mono(400), 16); c.fillStyle = rgba('ink', 0.78);
    c.fillText('¹ Understanding does not imply compliance; see ORTHOGONALITY, p. 182.', X_NUM, 1214);
    const pd = `² Current estimate: P(doom) ${formatPDoom(this.pdoom.value(t))}.`;
    c.fillText(pd, X_NUM, 1238);

    // ---- the figure's underdrawing: a dashed construction line in the dark, waiting for its atoms
    const ku = prog(t, this.tPull + 0.05, this.tPull + 0.4, ease.outCubic) * (1 - prog(t, this.tAny - 0.2, this.tAny + 0.1));
    if (ku > 0) {
      c.strokeStyle = rgba('ash', 0.5 * ku); c.lineWidth = 1.4 / z;
      c.setLineDash([10, 9]);
      c.beginPath();
      const n = 160;
      for (let i = 0; i <= n * ku; i++) { const p = clipWorld((i / n) * S_END); if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
      c.stroke();
      c.setLineDash([]);
    }
    // ---- the figure's caption, in the dark beside the page
    const kc = prog(t, this.tFirst, this.tFirst + 0.2);
    if (kc > 0) {
      const x = FIG.x + 250, y = FIG.y + 150;
      c.font = font(F.serif(500, true), 44); c.fillStyle = rgba('bone', 0.92 * kc);
      c.fillText('Fig. 54′', x, y);
      c.fillText('The speaker, reassigned.', x, y + 52);
      c.font = font(F.mono(400), 22); c.fillStyle = rgba('ash', kc);
      let moved = 0;
      for (let i = 0; i < this.n; i++) if (t >= this.dep[i]! + this.fl[i]!) moved++;
      c.fillText(`atoms moved  ${moved.toLocaleString('en-US')} / ${this.n.toLocaleString('en-US')}`, x, y + 104);
      c.fillText('meaning preserved  1.000', x, y + 136);
    }
  }

  /** The cut from hook 5: its context wall (every lyric so far, shut on the band), parting to show the page. */
  drawWalls(c: Ctx2, t: number) {
    const k = ease.outExpo(prog(t, this.T0, this.T0 + 0.34));
    if (k >= 1) return;
    const g = k * (H + 60);
    const yTop = H / 2 - g / 2, yBot = H / 2 + g / 2;
    const sp = (H / 2 - 5) / (WALL.n - 0.28);
    c.fillStyle = rgba('ink', 1);
    c.fillRect(0, 0, W, yTop); c.fillRect(0, yBot, W, H - yBot);
    drawWall(c, this.wallRows, yTop, -1, sp);
    drawWall(c, this.wallRows, yBot, 1, sp);
    // the truncation notice it shut on, gone as the wall parts
    const a = 1 - prog(t, this.T0 + 0.02, this.T0 + 0.1);
    if (a > 0) {
      const s = '[ context truncated · 8,192 / 8,192 tokens ]';
      c.font = font(F.mono(500), 16);
      const w = measure(s, F.mono(500), 16);
      c.fillStyle = rgba('ink', a); c.fillRect(W / 2 - w / 2 - 14, H / 2 - 15, w + 28, 26);
      c.fillStyle = rgba('signal', a); c.textBaseline = 'alphabetic'; c.fillText(s, W / 2 - w / 2, H / 2 + 5);
    }
  }

  drawClips(c: Ctx2, t: number) {
    const k = CLIP_K;
    c.lineWidth = 1.25;
    c.lineJoin = 'round';
    const main = new Path2D(), rim = new Path2D();
    for (const cell of this.cells) {
      if (t < cell.t0) continue;
      const pop = prog(t, cell.t0, cell.t0 + 0.12, (x) => ease.outBack(x, 2.4));
      const s = k * pop, cs = Math.cos(cell.rot) * s, sn = Math.sin(cell.rot) * s;
      const put = (path: Path2D, pts: { x: number; y: number }[]) => pts.forEach((p, i) => {
        const x = cell.x + cs * p.x - sn * p.y, y = cell.y + sn * p.x + cs * p.y;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
      });
      put(main, this.clipPts);
      put(rim, this.rimPts);
    }
    c.strokeStyle = rgba('graphite', 0.62); c.stroke(main);
    c.strokeStyle = rgba('signal', 0.85); c.stroke(rim);
  }

  // ------------------------------------------------------------------ atoms
  drawAtoms(t: number, cam: ACam) {
    if (t < this.tTake - 0.05) return;
    const L = this.dots;
    const z = cam.z;
    const ink = LIN.ink, bone = LIN.bone, sig = LIN.signal;
    const w0 = Math.max(1.25, 3.3 * z);
    for (let i = 0; i < this.n; i++) {
      const tg = this.gA[i]!;
      if (t < tg - 0.02) continue;
      const d = this.dep[i]!, fl = this.fl[i]!;
      const hot = (this.kind[i]! & 1) !== 0, rim = (this.kind[i]! & 2) !== 0;
      let x: number, y: number, px: number, py: number;
      const pos = (tt: number) => {
        const u = ease.inOutCubic(clamp((tt - d) / fl));
        const m = 1 - u;
        const hx = this.hx[i]!, hy = this.hy[i]!;
        // before leaving, the atoms of a crumbling glyph shiver in place
        const sh = u <= 0 ? 0.9 * noise1(tt * 40 + i, 3) : 0;
        return {
          x: m * m * hx + 2 * m * u * this.cx[i]! + u * u * this.tx[i]! + sh,
          y: m * m * hy + 2 * m * u * this.cy[i]! + u * u * this.ty[i]! + 0.9 * noise1(tt * 40 + i, 4) * (u <= 0 ? 1 : 0) + Math.sin(u * Math.PI) * 30 * (hash(i, 9) - 0.5),
          u,
        };
      };
      const a = pos(t), b = pos(t - 0.0015); // no drawn streaks: the export's motion blur makes them
      x = a.x; y = a.y; px = b.x; py = b.y;
      // colour: the ink it was printed in on the paper; bone metal in the dark; orange for the rim
      const off = clamp((x - PAGE.w + 6) / 40);
      let col: [number, number, number];
      if (hot) {
        const cool = prog(t, d, d + fl * 1.3);
        col = [lerp(sig[0], bone[0] * 0.95, cool), lerp(sig[1], bone[1] * 0.95, cool), lerp(sig[2], bone[2] * 0.95, cool)];
      } else col = [lerp(ink[0], bone[0] * 0.92, off), lerp(ink[1], bone[1] * 0.92, off), lerp(ink[2], bone[2] * 0.92, off)];
      if (rim && a.u > 0.85) {
        const r = prog(a.u, 0.85, 1);
        col = [lerp(col[0], sig[0] * 1.3, r), lerp(col[1], sig[1] * 1.3, r), lerp(col[2], sig[2] * 1.3, r)];
      }
      const s = toScreen(cam, x, y), q = toScreen(cam, px, py);
      const wd = w0 * (a.u > 0 && a.u < 1 ? 0.75 : 1);
      L.seg2(q.x, q.y, s.x + 0.01, s.y, wd, col, 1);
    }
  }

  // ------------------------------------------------------------------ the spark: the clip's wire catches on "anyway"
  drawSpark(t: number, cam: ACam) {
    if (t < this.tAny) return;
    const p0 = clipWorld(0);
    const hs = toScreen(cam, p0.x, p0.y);
    const k = prog(t, this.tAny, this.tAny + 0.06, ease.outCubic);
    // the fuse it will run along: a hairline leaving the free end of the wire, off to the right
    const kl = prog(t, this.tAny, this.tAny + 0.3, ease.outExpo);
    const xe = lerp(hs.x, W + 20, kl);
    const b = LIN.bone;
    this.dots.seg2(hs.x, hs.y, xe, hs.y + 0.03 * (xe - hs.x), 2.2, [b[0] * 0.8, b[1] * 0.8, b[2] * 0.8], 0.9);
    // the wire glows where it caught
    for (let i = 0; i < 24; i++) {
      const s = (i / 24) * 3.2;
      const p = clipWorld(s), q = clipWorld(s + 3.2 / 24);
      const a = toScreen(cam, p.x, p.y), bb = toScreen(cam, q.x, q.y);
      const I = 1.6 * k * Math.exp(-s / 1.1);
      this.add.seg2(a.x, a.y, bb.x, bb.y, 5 * cam.z * 2.4, [LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I], 0.8);
    }
    const headAt = (tb: number) => (tb < this.tAny ? null : hs);
    sparkParticles(this.add, t, headAt, { rate: 200, life: 0.45, speed: 230, gravity: 460, intensity: 1.15 * k, seed: 54, width: 1.5 });
    sparkHead(this.add, hs.x, hs.y, t, 1.25, 1.3 * k);
  }
}

/** A drawn tick (the fonts have no check mark): `s` px tall, origin at its left end, k = drawn fraction. */
function drawTick(c: Ctx2, x: number, y: number, s: number, k: number) {
  if (k <= 0) return;
  c.strokeStyle = rgba('signal', 0.95); c.lineWidth = 2.2; c.lineCap = 'round';
  const a = { x, y: y - s * 0.05 }, m = { x: x + s * 0.35, y: y + s * 0.4 }, e = { x: x + s, y: y - s * 0.6 };
  c.beginPath(); c.moveTo(a.x, a.y);
  if (k < 0.35) c.lineTo(lerp(a.x, m.x, k / 0.35), lerp(a.y, m.y, k / 0.35));
  else { c.lineTo(m.x, m.y); const u = (k - 0.35) / 0.65; c.lineTo(lerp(m.x, e.x, u), lerp(m.y, e.y, u)); }
  c.stroke(); c.lineCap = 'butt';
}
