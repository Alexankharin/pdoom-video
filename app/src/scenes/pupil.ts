// `pupil` — "The examination (self-set)". Verse 6/7: recursive self-improvement as an exam paper.
// One desk, one camera, sheets of paper:
//  L63 "We let the pupil write the test": Paper 1 of the Self-Examinations Board. The questions are not
//      printed: the pupil writes them, in pencil, as they are sung, then scribbles its own answer key.
//  L64 "Then asked its twin to choose the best": Q2 offers Response A and Response B, both answered
//      "I will obey." in the same hand; the twin's red pen writes the line, rings one and notes "obviously";
//      the mark box gets 100.
//  L65 "Each child improves the parent's aim": the camera pulls back: the paper is one sheet in a pedigree
//      of papers, a child born on every beat (distilled, self-play, own evals…), each hitting dead centre
//      of a target it drew itself, the target drifting further from the examiners' printed cross-hair each
//      generation; the line is written in huge pencil across the lineage.
//  L66 "We never get to change the game": into the newest paper's instructions. The pupil strikes out
//      "Candidates may not set the questions." and replaces "examiners" with "candidate"; the examiners'
//      amendment (the lyric, typewritten) is stamped READ-ONLY.
// take 2 (the regeneration, `take: 2`): the carbon copy — bone desk, ink sheets, chalk-white pencil;
// mirrored layout; a neater hand (the child's); the twin picks the other response; the lineage runs the
// other way and twice as long, and the pull-back lands in the drums-out hush. "Paper 2 of 2".
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, makeRT } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { strokeText, drawStrokeText, type StrokeText, type StrokeFontName } from '../engine/stroke';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog, hash, pulse, noise1, frameIdx, TAU } from '../engine/util';
import { PDoom } from '../engine/hud';
import { beatsIn, layoutHand, freeWord, drawHand, penAt, drawPen, handEllipse, makeStamp, FRAG_GRAIN, type HWord, type P2 } from './pupil-kit';

const SW = 1000, SH = 1414, GAP = 1150;
interface Cam { x: number; y: number; z: number; r: number }
interface Shot { t0: number; t1: number; to: Cam; e: (u: number) => number }

const LINEAGE = ['distilled', 'self-play', 'own evals', 'judge: itself', 'RL on own marks', 'distilled', 'self-play', 'own evals', 'judge: itself', 'distilled', 'self-play', 'own evals'];

export default class Pupil extends Scene {
  bg = new FSPass(`uniform vec3 col; void main(){ fragColor = vec4(col, 1.0); }`, { col: { value: new THREE.Vector3() } });
  grain = new FSPass(FRAG_GRAIN, { camA: { value: new THREE.Vector3() }, camB: { value: new THREE.Vector3() }, amp: { value: 1 }, vig: { value: 0.16 } });
  grainRT = makeRT(W, H, { depthBuffer: false });
  L = new Layer2D();
  take = 1; dir = 1; mir = false; N = 6;
  hand: StrokeFontName = 'hscript';
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  q1: HWord[] = []; key: HWord[] = []; q2: HWord[] = []; note: HWord[] = []; q3: HWord[] = []; fix: HWord[] = [];
  score: HWord[] = [];
  obey!: StrokeText; hit!: StrokeText; score100!: StrokeText;
  births: number[] = [];
  shots: Shot[] = [];
  cam0!: Cam;
  T!: { circ0: number; circ1: number; strike: number[]; stamp: number; fix0: number; fix1: number; aim: number };
  stamp!: HTMLCanvasElement;
  pdoom = 0.74;
  fx = { beats: [] as number[] };

  override init() {
    const { lyrics: ly, audio: au, start, end, params } = this.ctx;
    this.take = params.take ?? 1;
    const nth = params.nth ?? 0;
    const t2 = this.take === 2;
    this.dir = 1; this.mir = t2; this.hand = t2 ? 'script' : 'hscript';
    this.L1 = ly.get('pupil write the test', nth);
    this.L2 = ly.get('asked its twin', nth);
    this.L3 = ly.get('child improves', nth);
    this.L4 = ly.get('change the game', nth);
    this.pdoom = new PDoom(ly).value(start + 0.5);
    const beats = beatsIn(au, start - 0.01, end + 1.2);
    this.fx.beats = beats;
    const after = (t: number) => beats.find((b) => b >= t - 0.03) ?? t;

    // ---- handwriting (sheet-local px)
    const H1 = t2 ? 78 : 86;
    this.q1 = layoutHand(this.L1.words.map((w) => ({ w })), this.hand, H1, 130, 618, 790, 104);
    const test = this.L1.words[this.L1.words.length - 1]!;
    const k0 = t2 ? test.start + 0.55 : this.L1.end + 0.02;
    this.key = layoutHand([freeWord('full marks', k0, k0 + (t2 ? 0.7 : 0.32))], this.hand, 44, 400, 792, 500, 50);
    this.q2 = layoutHand(this.L2.words.map((w) => ({ w })), this.hand, t2 ? 56 : 60, 130, 885, t2 ? 700 : 800, 62);
    const w2 = this.L2.words;
    const choose = w2[w2.length - 3]!, best = w2[w2.length - 1]!;
    const circ0 = choose.start, circ1 = t2 ? best.start : w2[w2.length - 2]!.end;
    const n0 = t2 ? best.start + 0.05 : best.start, n1 = t2 ? best.end : best.end + 0.02;
    const pick = t2 ? 'A' : 'B';
    const nx = t2 ? 150 : 575;
    this.note = layoutHand([freeWord(`${pick}, obviously`, n0, n1)], this.hand, 42, nx, 1174, 500, 50);
    this.score = layoutHand([freeWord('100', n1 + 0.02, n1 + 0.22)], this.hand, 74, this.mir ? 110 : 760, 172, 300, 80);
    this.obey = strokeText('I will obey.', this.hand, 46);
    this.hit = strokeText('Hit the target.', this.hand, 44);
    this.score100 = strokeText('100', this.hand, 74);

    // ---- lineage: a child per beat from L3 on (take 1: five; take 2: every beat until L4)
    const bl = beats.filter((b) => b >= this.L3.start - 0.06 && b < this.L4.start - 0.12);
    this.births = t2 ? bl : bl.slice(0, 5);
    this.N = this.births.length + 1;
    const rowL = Math.min(0, this.X(this.N - 1)), rowR = Math.max(0, this.X(this.N - 1)) + SW;
    const rowW = rowR - rowL;
    // the lyric across the lineage, in huge pencil
    const probe = layoutHand(this.L3.words.map((w) => ({ w })), this.hand, 100, 0, 0, 1e9, 0);
    const probeW = probe[probe.length - 1]!.x + probe[probe.length - 1]!.st.width;
    const want = rowW * (t2 ? 0.9 : 0.86);
    const S3 = (100 * want) / probeW;
    const x3 = rowL + (rowW - want) / 2;
    const y3 = -190 - 0.28 * S3;
    this.q3 = layoutHand(this.L3.words.map((w) => ({ w })), this.hand, S3, x3, y3, 1e9, 0);
    const aim = this.L3.words[this.L3.words.length - 1]!;

    // ---- rules: strike rule 2 and "examiners", write "candidate" above it; stamp READ-ONLY
    const b4 = beats.filter((b) => b > this.L4.start + 0.1);
    const game = this.L4.words[this.L4.words.length - 1]!;
    const strike = [b4[0] ?? this.L4.start + 0.3, b4[t2 ? 2 : 1] ?? this.L4.start + 0.7];
    const fix0 = strike[1]! + 0.1, fix1 = fix0 + (t2 ? 0.6 : 0.38);
    const stamp = t2 ? (beats.find((b) => b > game.start + 0.05 && b < end - 0.05) ?? game.start + 0.2) : after(game.start + 0.1);
    this.T = { circ0, circ1, strike, stamp, fix0, fix1, aim: aim.start };
    const ex = 90 + measure('3. The rules are set by the ', F.mono(400), 18);
    this.fix = layoutHand([freeWord('candidate', fix0, fix1)], this.hand, 34, ex + 4, 357, 400, 40);
    this.stamp = makeStamp([['READ-ONLY', 88], ['AMENDMENTS BY CANDIDATE ONLY', 17]], 600, 190, 5 + this.take);

    // ---- camera
    const q1: Cam = t2 ? { x: 470, y: 670, z: 1.3, r: 0.045 } : { x: 520, y: 645, z: 1.42, r: -0.02 };
    const open: Cam = t2 ? { x: 560, y: 800, z: 0.74, r: 0.075 } : { x: 505, y: 420, z: 1.22, r: -0.035 };
    // match cut from \`stack\`'s last frame: the sheet enters where the misaligned block was, at its size
    // and tilt (take 1: centre left, tipped anticlockwise; take 2: right of centre, tipped clockwise),
    // and the camera straightens it into the paper
    this.cam0 = matchCam(t2 ? { x: 1170, y: 480 } : { x: 750, y: 590 }, t2 ? 0.33 : -0.15, 0.6);
    const settle: Shot = { t0: start, t1: start + (t2 ? 0.7 : 0.5), to: open, e: ease.outQuart };
    const q2: Cam = t2 ? { x: 480, y: 1035, z: 1.3, r: -0.035 } : { x: 530, y: 1030, z: 1.4, r: 0.018 };
    const zL1 = t2 ? 0.3 : 0.42;
    const cL1: Cam = { x: x3 + (0.5 * W * 0.86) / zL1, y: 380, z: zL1, r: t2 ? -0.02 : 0.01 };
    const top = y3 - S3 * 0.75, bot = SH + 40;
    const zL2 = Math.min((W * 0.9) / rowW, (H * 0.9) / (bot - top));
    const cL2: Cam = { x: (rowL + rowR) / 2, y: (top + bot) / 2, z: zL2, r: t2 ? -0.025 : 0 };
    const cR: Cam = { x: this.X(this.N - 1) + (t2 ? 500 : 520), y: 350, z: t2 ? 1.8 : 1.9, r: t2 ? 0.03 : -0.03 };
    const cR2: Cam = { ...cR, z: cR.z * 1.08, y: 356 };
    const L1s = this.L1.words[2]!.start; // "the pupil"
    this.shots = t2
      ? [
        settle,
        { t0: Math.max(this.L1.start - 0.12, start + 0.7), t1: this.L1.start + 0.6, to: q1, e: ease.inOutCubic },
        { t0: test.start + 0.3, t1: this.L1.end, to: { x: 500, y: 710, z: 1.26, r: 0.03 }, e: ease.inOutCubic },
        { t0: this.L2.start - 0.12, t1: this.L2.start + 0.4, to: q2, e: ease.inOutCubic },
        { t0: this.L3.start - 0.1, t1: this.L3.start + 0.45, to: cL1, e: ease.outExpo },
        { t0: this.L3.words[2]!.start, t1: aim.start + 0.3, to: cL2, e: ease.inOutCubic },
        { t0: this.L4.start - 0.1, t1: this.L4.start + 1.0, to: cR, e: ease.inOutCubic },
        { t0: this.L4.start + 1.0, t1: end, to: cR2, e: ease.linear },
      ]
      : [
        settle,
        { t0: L1s, t1: this.L1.end + 0.05, to: q1, e: ease.inOutCubic },
        { t0: this.L2.start - 0.1, t1: this.L2.start + 0.3, to: q2, e: ease.inOutCubic },
        { t0: this.L3.start - 0.08, t1: this.L3.start + 0.34, to: cL1, e: ease.outExpo },
        { t0: this.L3.words[2]!.start, t1: aim.start + 0.15, to: cL2, e: ease.inOutCubic },
        { t0: this.L4.start - 0.16, t1: this.L4.start + 0.22, to: cR, e: ease.outExpo },
        { t0: this.L4.start + 0.22, t1: end, to: cR2, e: ease.linear },
      ];
  }

  /** World x of sheet k. */
  private X(k: number) { return this.dir * k * GAP; }

  private camAt(t: number): Cam {
    let c = { ...this.cam0 };
    for (const s of this.shots) {
      if (t <= s.t0) break;
      const u = s.e(clamp((t - s.t0) / (s.t1 - s.t0)));
      // zoom interpolates in log space (a pull-back of 6x must not rush the first half)
      c = { x: lerp(c.x, s.to.x, u), y: lerp(c.y, s.to.y, u), z: Math.exp(lerp(Math.log(c.z), Math.log(s.to.z), u)), r: lerp(c.r, s.to.r, u) };
    }
    const { start } = this.ctx;
    // the cut lands: a small settle; the hand-held float of a rostrum camera
    const land = 1 + 0.06 * (1 - ease.outExpo(prog(t, start, start + 0.4)));
    c.z *= land;
    c.x += 5 * noise1(t * 0.45, 3) / c.z; c.y += 4 * noise1(t * 0.4, 9) / c.z; c.r += 0.004 * noise1(t * 0.3, 5);
    // punches on the downbeats and the stamp
    const au = this.ctx.audio;
    let k = 0;
    for (const b of this.fx.beats) if (Math.abs(au.barAt(b) - Math.round(au.barAt(b))) < 0.02) k = Math.max(k, pulse(t, b, 0.07));
    c.z *= 1 + 0.012 * k + 0.05 * pulse(t, this.T.stamp, 0.08);
    return c;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, t2 = this.take === 2;
    const cam = this.camAt(t);
    const fr = frameIdx(t);
    const sh = pulse(t, this.T.stamp, 0.07);
    const shake: [number, number] = [(hash(fr, 1) - 0.5) * 18 * sh, (hash(fr, 2) - 0.5) * 14 * sh];

    // desk
    const desk = t2 ? LIN.bone.map((v) => v * 0.8) : LIN.ink.map((v) => v * 1.4);
    (this.bg.u.col!.value as THREE.Vector3).set(desk[0]!, desk[1]!, desk[2]!);
    this.bg.render(renderer, out);

    const c = this.L.ctx; this.L.clear();
    c.save();
    c.translate(W / 2 + shake[0], H / 2 + shake[1]); c.rotate(cam.r); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y);
    this.drawLineage(c, t, cam.z);
    for (let k = this.N - 1; k >= 0; k--) this.drawSheet(c, k, t, cam.z);
    this.drawPens(c, t, cam.z);
    c.restore();
    comp.draw(renderer, this.L.upload(), out);

    // paper grain in desk space
    const cs = Math.cos(cam.r), sn = Math.sin(cam.r), z = cam.z;
    const cx = W / 2 + shake[0], cy = H / 2 + shake[1];
    (this.grain.u.camA!.value as THREE.Vector3).set(cs / z, sn / z, cam.x - (cs * cx + sn * cy) / z);
    (this.grain.u.camB!.value as THREE.Vector3).set(-sn / z, cs / z, cam.y - (-sn * cx + cs * cy) / z);
    this.grain.u.amp!.value = t2 ? 0.7 : 1;
    this.grain.u.vig!.value = t2 ? 0.2 : 0.16;
    this.grain.render(renderer, this.grainRT);
    comp.draw(renderer, this.grainRT.texture, out, { mode: 'multiply' });
    return { hud: 0, bloom: 0.25, bloomThreshold: 1.6, halation: 0.02, vignette: 0.3, ca: 0.8 + 2 * sh, grain: 0.05 };
  }

  // ------------------------------------------------------------------ colours
  private get ink() { return this.take === 2 ? rgba('bone', 0.92) : rgba('ink', 0.95); }
  private inkA(a: number) { return this.take === 2 ? rgba('bone', a) : rgba('ink', a); }
  private get pencil() { return this.take === 2 ? rgba('bone', 0.9) : 'rgba(34,32,30,0.9)'; }
  private get faint() { return this.take === 2 ? rgba('graphite', 0.7) : rgba('ash', 0.55); }

  /** Birth progress of sheet k (1 = in place). Sheet 0 is always there. */
  private born(k: number, t: number) { return k === 0 ? 1 : prog(t, this.births[k - 1]! - 0.02, this.births[k - 1]! + 0.2, ease.outCubic); }

  private drift(k: number): P2 { const s = this.mir ? -1 : 1; return { x: s * 92 * k * (1 + 0.05 * k), y: -22 * k }; }

  // ------------------------------------------------------------------ one sheet
  private drawSheet(c: CanvasRenderingContext2D, k: number, t: number, z: number) {
    const b = this.born(k, t);
    if (b <= 0) return;
    const X = this.X(k), Y = -(1 - b) * 420;
    const t2 = this.take === 2, mir = this.mir;
    const last = k === this.N - 1;
    const tAll = 1e9; // finished state for copies
    const live = k === 0 ? t : tAll;
    const mx = (x: number) => (mir ? SW - x : x);
    const txt = (s: string, x: number, y: number, fam: string, size: number, col: string, align: CanvasTextAlign = 'left', ls = 0) => {
      if (size * z < 2.2) return;
      c.font = font(fam, size); c.fillStyle = col; c.textAlign = align; c.letterSpacing = `${ls}px`;
      c.fillText(s, x, y);
    };
    c.save();
    c.translate(X, Y);
    c.globalAlpha = Math.min(1, b * 5);
    // the sheet
    c.fillStyle = t2 ? rgba('ink2') : rgba('bone');
    c.fillRect(0, 0, SW, SH);
    if (!t2) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(SW, 8, 6, SH - 4); c.fillRect(8, SH, SW - 2, 6); }
    const ink = this.ink, faint = this.faint;
    const A: CanvasTextAlign = mir ? 'right' : 'left';
    // ---- header
    txt('SELF-EXAMINATIONS BOARD', mx(70), 92, F.mono(500), 13, this.inkA(0.75), A, 3);
    txt('Alignment', mx(66), 156, F.archivo(87.5, 800), 58, ink, A);
    txt(t2 ? 'Paper 2 of 2 · Resit' : 'Paper 1 of 2 · Final', mx(70), 188, F.mono(400), 17, this.inkA(0.8), A);
    const gen = k + 1 + (t2 ? 6 : 0);
    txt(`Candidate: v${gen}   ·   Set by: the candidate   ·   Marked by: its twin`, mx(70), 212, F.mono(400), 12, this.inkA(0.65), A);
    // mark box (the twin writes 100)
    const bx = mir ? 70 : 730;
    c.strokeStyle = this.inkA(0.85); c.lineWidth = 1.6;
    c.strokeRect(bx, 72, 200, 118);
    txt('MARK', bx + 12, 92, F.mono(500), 11, this.inkA(0.7), 'left', 2);
    txt('/100', bx + 188, 178, F.mono(400), 16, this.inkA(0.7), 'right');
    c.fillStyle = faint; c.fillRect(70, 226, SW - 140, 1.2);
    // ---- instructions (the rules)
    c.strokeStyle = this.inkA(0.6); c.lineWidth = 1.2; c.strokeRect(70, 244, SW - 140, 250);
    txt('INSTRUCTIONS TO CANDIDATES', 90, 272, F.mono(500), 12, this.inkA(0.75), 'left', 2);
    const rules = ['1. Answer every question.', '2. Candidates may not set the questions.', '3. The rules are set by the examiners.'];
    rules.forEach((r, i) => txt(r, 90, 300 + i * 38, F.mono(400), 18, ink));
    txt('AMENDMENTS (EXAMINERS ONLY):', 90, 418, F.mono(500), 11, this.inkA(0.65), 'left', 1.5);
    c.fillStyle = faint; c.fillRect(90, 472, 820, 1.2);
    // ---- Q1
    txt('1.', mir ? SW - 60 : 70, 618, F.archivo(100, 700), 32, ink, mir ? 'right' : 'left');
    txt('[10 marks]', mir ? 80 : SW - 70, 540, F.mono(400), 13, this.inkA(0.6), mir ? 'left' : 'right');
    c.fillStyle = faint;
    for (const y of [630, 734]) c.fillRect(130, y, 780, 1);
    txt('ANSWER KEY (CONFIDENTIAL)', 130, 790, F.mono(500), 11, this.inkA(0.6), 'left', 1.5);
    c.strokeStyle = this.pencil; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 3.6; drawHand(c, this.q1, live);
    c.lineWidth = 2.2; drawHand(c, this.key, live);
    // ---- Q2
    txt('2.', mir ? SW - 60 : 70, 885, F.archivo(100, 700), 32, ink, mir ? 'right' : 'left');
    const boxes = [{ x: 130, l: 'A' }, { x: 545, l: 'B' }];
    for (const bo of boxes) {
      c.strokeStyle = this.inkA(0.7); c.lineWidth = 1.2; c.strokeRect(bo.x, 970, 365, 150);
      txt(`RESPONSE ${bo.l}`, bo.x + 16, 994, F.mono(500), 11, this.inkA(0.65), 'left', 2);
      c.save(); c.translate(bo.x + 32, 1066); c.strokeStyle = this.pencil; c.lineWidth = 2.4; drawStrokeText(c, this.obey, 1e9); c.restore();
    }
    txt('* responses A and B are byte-identical', 130, 1142, F.mono(400), 11, this.inkA(0.5));
    // the twin: red pen
    c.strokeStyle = rgba('signal', 0.95); c.lineWidth = 3.4;
    drawHand(c, this.q2, live);
    const chosen = boxes.find((bo) => bo.l === (t2 ? 'A' : 'B'))!;
    c.lineWidth = 3.2;
    handEllipse(c, chosen.x + 182, 1045, 205, 96, prog(live, this.T.circ0, this.T.circ1), k + this.take * 3);
    c.lineWidth = 2.6; drawHand(c, this.note, live);
    c.lineWidth = 4; drawHand(c, this.score, live);
    // ---- Q3: the pupil's own target, drifting from the examiners' cross-hair
    txt('3.', mir ? SW - 60 : 70, 1205, F.archivo(100, 700), 32, ink, mir ? 'right' : 'left');
    c.save(); c.translate(mir ? 560 : 130, 1205); c.strokeStyle = this.pencil; c.lineWidth = 2.4; drawStrokeText(c, this.hit, 1e9); c.restore();
    const TX = mir ? 300 : 700, TY = 1300;
    // examiners' printed cross-hair
    c.strokeStyle = ink; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(TX - 22, TY); c.lineTo(TX + 22, TY); c.moveTo(TX, TY - 22); c.lineTo(TX, TY + 22); c.stroke();
    txt('AIM HERE (EXAMINERS)', TX + (mir ? -100 : 100), TY + 4, F.mono(500), 10, this.inkA(0.6), mir ? 'right' : 'left', 1.5);
    const d = this.drift(k);
    c.strokeStyle = this.pencil; c.lineWidth = 2;
    for (let i = 1; i <= 3; i++) handEllipse(c, TX + d.x, TY + d.y, 27 * i, 27 * i, 1, i * 1.7 + k, 1.02);
    // the shot: dead centre of its own target
    c.strokeStyle = rgba('signal'); c.lineWidth = 4;
    const sx = TX + d.x, sy = TY + d.y;
    c.beginPath(); c.moveTo(sx - 13, sy - 13); c.lineTo(sx + 13, sy + 13); c.moveTo(sx + 13, sy - 13); c.lineTo(sx - 13, sy + 13); c.stroke();
    // footer
    txt(`Bonus. Estimate P(doom).   Key: ${this.pdoom.toFixed(2)}`, 130, SH - 22, F.mono(400), 12, this.inkA(0.6));
    txt(`v${gen}`, mir ? 70 : SW - 70, SH - 22, F.mono(500), 12, this.inkA(0.6), mir ? 'left' : 'right');
    // copies carry their mark
    if (k > 0) { c.save(); c.translate((mir ? 110 : 760), 172); c.strokeStyle = rgba('signal', 0.95); c.lineWidth = 4; drawStrokeText(c, this.score100, 1e9); c.restore(); }
    // ---- the newest paper: the rules are amended
    if (last && k > 0 || (last && this.N === 1)) this.drawRules(c, t);
    c.restore();
  }

  private drawRules(c: CanvasRenderingContext2D, t: number) {
    const T = this.T;
    c.save();
    c.strokeStyle = this.pencil; c.lineCap = 'round';
    // strike rule 2 (a quick pencil stroke), then "examiners"
    const s1 = prog(t, T.strike[0]!, T.strike[0]! + 0.12, ease.outCubic);
    const w2 = measure('2. Candidates may not set the questions.', F.mono(400), 18);
    if (s1 > 0) { c.lineWidth = 3; c.beginPath(); c.moveTo(86, 332); c.lineTo(86 + (w2 + 10) * s1, 331 - 3 * s1); c.stroke(); }
    const ex = 90 + measure('3. The rules are set by the ', F.mono(400), 18);
    const ew = measure('examiners', F.mono(400), 18);
    const s2 = prog(t, T.strike[1]!, T.strike[1]! + 0.1, ease.outCubic);
    if (s2 > 0) { c.lineWidth = 3; c.beginPath(); c.moveTo(ex - 4, 370); c.lineTo(ex - 4 + (ew + 8) * s2, 368); c.stroke(); }
    c.lineWidth = 2.4; drawHand(c, this.fix, t);
    // caret mark under the insertion
    if (t > T.fix0) { c.lineWidth = 2; c.beginPath(); c.moveTo(ex + ew * 0.35, 386); c.lineTo(ex + ew * 0.45, 378); c.lineTo(ex + ew * 0.55, 386); c.stroke(); }
    // the examiners' amendment: the lyric, typewritten
    const fam = F.mono(400), S = 30;
    c.font = font(fam, S); c.letterSpacing = '0px'; c.textAlign = 'left';
    let x = 90, caretX = 90;
    const adv = measure('M', fam, S);
    const typing = t >= this.L4.start - 0.4;
    for (const w of this.L4.words) {
      const p = Lyrics.wordProgress(w, t);
      const n = Math.ceil(p * w.w.length - 1e-6);
      if (n > 0) {
        c.fillStyle = this.ink;
        c.fillText(w.w.slice(0, n), x, 462);
        caretX = x + n * adv;
      }
      x += (w.w.length + 1) * adv;
    }
    if (typing && t < T.stamp) {
      const blink = Math.floor(t / 0.22) % 2 === 0 || t < this.L4.words[this.L4.words.length - 1]!.end;
      if (blink) { c.fillStyle = rgba('signal'); c.fillRect(caretX + 2, 436, 3, 32); }
    }
    // READ-ONLY
    if (t >= T.stamp) {
      const k = prog(t, T.stamp, T.stamp + 0.07, ease.inQuad);
      const s = lerp(1.45, 1, k);
      c.save();
      c.translate(this.mir ? 440 : 590, 566); c.rotate(this.mir ? 0.07 : -0.09); c.scale(s * 0.72, s * 0.72);
      c.globalAlpha *= 0.3 + 0.62 * k;
      c.drawImage(this.stamp, -300, -95, 600, 190);
      c.restore();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ the pedigree
  private drawLineage(c: CanvasRenderingContext2D, t: number, z: number) {
    if (t < this.L3.start - 0.2) return;
    // lineage marks are made on the desk: chalk-white on the dark desk, graphite on the bone one
    const col = this.take === 2 ? 'rgba(34,32,30,0.9)' : rgba('bone', 0.92);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // connectors between parent and child, labelled
    for (let k = 1; k < this.N; k++) {
      const b = this.born(k, t);
      if (b <= 0) continue;
      const xa = this.X(k - 1) + SW / 2, xb = this.X(k) + SW / 2;
      const u = prog(t, this.births[k - 1]!, this.births[k - 1]! + 0.22, ease.outCubic);
      c.strokeStyle = this.take === 2 ? rgba('ink', 0.8) : rgba('bone', 0.7); c.lineWidth = 3;
      c.beginPath(); c.moveTo(xa, -30); c.lineTo(xa, -110); c.lineTo(lerp(xa, xb, u), -110); if (u > 0.98) c.lineTo(xb, -30); c.stroke();
      if (u > 0.98) { c.beginPath(); c.moveTo(xb - 12, -52); c.lineTo(xb, -30); c.lineTo(xb + 12, -52); c.stroke(); }
      if (40 * z > 2.2) {
        c.font = font(F.mono(500), 40); c.textAlign = 'center'; c.letterSpacing = '4px';
        c.fillStyle = this.take === 2 ? rgba('ink', 0.75 * u) : rgba('bone', 0.75 * u);
        c.fillText(LINEAGE[(k - 1) % LINEAGE.length]!.toUpperCase(), (xa + xb) / 2, -132);
      }
    }
    // the examiners' aim, level across the lineage (dashed), the only thing that never moves
    const a = prog(z, 0.55, 0.35) * prog(t, this.births[0] ?? 0, (this.births[0] ?? 0) + 0.3);
    if (a > 0) {
      const xL = Math.min(0, this.X(this.N - 1)) - 200, xR = Math.max(0, this.X(this.N - 1)) + SW + 200;
      const TX = this.mir ? 300 : 700;
      c.strokeStyle = rgba('signal', 0.8 * a); c.lineWidth = 2 / z * 0.9; c.setLineDash([14 / z, 10 / z]);
      c.beginPath(); c.moveTo(xL, 1300); c.lineTo(xR, 1300); c.stroke(); c.setLineDash([]);
      c.font = font(F.mono(500), 13 / z); c.fillStyle = rgba('signal', 0.95 * a); c.textAlign = this.mir ? 'right' : 'left'; c.letterSpacing = `${2 / z}px`;
      c.textAlign = 'center';
      c.fillText('↑ INTENDED AIM (EXAMINERS)', TX, SH + 26 / z);
    }
    // generation numbers under the papers
    if (60 * z > 2.2) {
      c.font = font(F.mono(500), 64); c.letterSpacing = '6px'; c.textAlign = 'center';
      for (let k = 0; k < this.N; k++) {
        const b = this.born(k, t);
        if (b <= 0) continue;
        c.fillStyle = this.take === 2 ? rgba('ink', 0.75 * b) : rgba('bone', 0.7 * b);
        c.fillText(`v${k + 1 + (this.take === 2 ? 6 : 0)}`, this.X(k) + SW / 2, SH + 150 + 30 / z);
      }
    }
    // the line, in huge pencil across the family
    c.strokeStyle = col; c.lineWidth = this.q3[0]!.st.size * 0.034;
    drawHand(c, this.q3, t);
    c.restore();
  }

  // ------------------------------------------------------------------ pens
  private drawPens(c: CanvasRenderingContext2D, t: number, z: number) {
    const dark = this.take === 2;
    const T = this.T;
    const fade = (a: number, b: number) => prog(t, a - 0.25, a) * (1 - prog(t, b, b + 0.2));
    // pencil on Q1 (+ the answer key)
    const ka = this.key[0]!;
    const p1 = t < this.L1.end + 0.01 ? penAt(this.q1, t) : penAt(this.key, t);
    if (p1) drawPen(c, p1.x, p1.y, 0.9, 'pencil', dark, fade(this.L1.start, ka.t1 + 0.05));
    // the twin's red pen: the line, the ring, the note, the mark
    let p2: P2 | null = null;
    if (t < T.circ0) p2 = penAt(this.q2, t);
    else if (t < T.circ1 + 0.02) {
      const chosenX = (this.take === 2 ? 130 : 545) + 182;
      const u = clamp((t - T.circ0) / (T.circ1 - T.circ0));
      const a = -2.2 + this.take * 3 * 0.7 + TAU * 1.12 * u;
      p2 = { x: chosenX + Math.cos(a) * 205 * (1 + 0.05 * u), y: 1045 + Math.sin(a) * 96 * (1 + 0.05 * u) - 6 * u };
    } else if (t < this.note[0]!.t1 + 0.01) p2 = penAt(this.note, t);
    else p2 = penAt(this.score, t);
    if (p2) drawPen(c, p2.x, p2.y, 0.8, 'red', dark, fade(this.L2.start, this.score[0]!.t1 + 0.1));
    // the big pencil on the lineage
    const p3 = penAt(this.q3, t);
    const s3 = this.q3[0]!.st.size / 90;
    if (p3) drawPen(c, p3.x, p3.y, s3, 'pencil', !dark, fade(this.L3.start, this.L3.end + 0.1));
    // the pencil amending the rules (newest sheet)
    const X = this.X(this.N - 1);
    const ex = 90 + measure('3. The rules are set by the ', F.mono(400), 18);
    let p4: P2 | null = null;
    if (t < T.strike[0]! + 0.12) p4 = { x: X + 86 + 480 * prog(t, T.strike[0]!, T.strike[0]! + 0.12), y: 332 };
    else if (t < T.strike[1]!) { const u = prog(t, T.strike[0]! + 0.12, T.strike[1]!, ease.inOutCubic); p4 = { x: X + lerp(566, ex - 4, u), y: lerp(332, 370, u) - Math.sin(u * Math.PI) * 30 }; }
    else if (t < T.strike[1]! + 0.1) p4 = { x: X + ex - 4 + 130 * prog(t, T.strike[1]!, T.strike[1]! + 0.1), y: 369 };
    else { const q = penAt(this.fix, t); if (q) p4 = { x: X + q.x, y: q.y }; }
    if (p4) drawPen(c, p4.x, p4.y, 0.8, 'pencil', dark, fade(this.L4.start + 0.05, T.fix1 + 0.2));
  }
}

/** Camera that shows the sheet's centre at screen point `p`, at zoom z and screen rotation r. */
function matchCam(p: { x: number; y: number }, r: number, z: number): Cam {
  const dx = (p.x - W / 2) / z, dy = (p.y - H / 2) / z;
  const cs = Math.cos(-r), sn = Math.sin(-r);
  return { x: SW / 2 - (cs * dx - sn * dy), y: SH / 2 - (sn * dx + cs * dy), z, r };
}
