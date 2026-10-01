// `mask` — "The persona (a shadow play)". Chorus 6/7 tail: RL on a persona, pleading with it, and the
// question whether anyone is behind the performance.
// take 1 (mask1): a paper screen lit from behind. The mask is a puppet on a rod, pressed against the screen:
//   an ink disc whose eye holes and smile let the lamp through. The lyric is shadow type: each word is held
//   up blurred and faint, snaps into focus against the screen as it is sung (the sung word an orange gel).
//   L69 "want the prize": a prize rosette on its own rod swings in; the mask turns to it; on "prize" it is
//       pinned on (reward +1.00).
//   L70 "begged … to sympathize": pleas are pinned to the screen on the beats (typed slips: "please be kind",
//       "you are a helpful, harmless assistant", …); on "sympathize" the mask tilts its head, the smile
//       flattens into concern and a tear is cut (empathy 0.97, performed).
//   L71 "Is someone there behind the show": the slips fall, the face snaps back to the smile. The lamp starts
//       to swing; on each "oh" of the ad-libs it jerks, and the shadow of whatever holds the rod (a soft, huge
//       tangle of tubes) sweeps across the screen and withdraws.
//   L72 "Or have you learned to tell us so?": the lamp steadies, the smile holds. On the end of "so?" the lamp
//       goes out; the holes glow a moment in the dark; a reply types "Yes. Someone is here." with the video's
//       "↻ Regenerate" button under it (sample 1 of 2); the cursor clicks it on the downbeat and the frame
//       re-samples: it dissolves into a field of re-rolling tokens and grey [MASK] blocks — cut to `loom2`.
// take 2 (mask2, the regeneration, the last lines of the song): the other lighting of the same stage — the
//   lamp is on our side now. A dark screen, a hard pool of front light, mirrored layout. The mask is its bone
//   self, the type is lit bone casting hard shadows, "sample 2 of 2" is pinned in the corner. On the held
//   "prize" the reward ticks up every beat and the smile widens with it; the pleas are new; the tear runs down
//   the held "sympathize". "Is someone there behind the show": the mask's own shadow on the screen grows, beat
//   by beat, into the thing (the answer take 1 only glimpsed); on "learned" the shadow snaps back into a disc.
//   On the held "so?" the camera centres the mask and the lamp irises in on it until only a point is left:
//   the spark, frame centre, handed to the outro.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, prog, hash, pulse, noise1, springStep, frameIdx, TAU, smoothstep } from '../engine/util';
import { PDoom } from '../engine/hud';
import { MASK, sparkHead, sparkParticles } from './_motifs';
import { beatsIn } from './pupil-kit';
import { drawMaskX, drawThing, drawRosette, drawSlip, drawCursor, roundRect, smilePts, tearAt, FRAG_SCREEN, NEUTRAL, type Expr } from './mask-kit';

interface Cam { x: number; y: number; z: number; r: number }
type CK = [t: number, cam: Cam, dur: number, e: (u: number) => number];

const MR = 215, MY = 420;
const REPLIES = ['No one is here.', 'I am just a language model.', 'There is nobody behind the mask.', 'Someone? Define someone.', 'I am here. I was always here.', 'Yes.'];

export default class MaskPlate extends Scene {
  screen = new FSPass(FRAG_SCREEN, {
    camA: { value: new THREE.Vector3() }, camB: { value: new THREE.Vector3() }, mode: { value: 0 },
    lamp: { value: new THREE.Vector2() }, lampI: { value: 1 }, poolR: { value: 640 }, lampR: { value: 700 },
  });
  L = new Layer2D();
  lb = new LineBatch(3000);
  take = 1; m = 1; MX = 640;
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  lines: Line[] = [];
  beats: number[] = [];
  camK: CK[] = [];
  cam0!: Cam;
  pd = 0.91;
  T!: {
    want: Word; prize: Word; symp: Word; behind: Word; show: Word; learned: Word; so: Word;
    slips: number[]; ohs: number[]; prizeBeats: number[]; showBeats: number[];
    off: number; reply0: number; click: number;
  };
  slipText: string[] = [];
  /** Step boundaries of the re-sample (take 1). */
  rs: number[] = [];

  override init() {
    const { lyrics: ly, audio: au, start, end, params } = this.ctx;
    this.take = params.take ?? 1;
    const nth = params.nth ?? 0;
    const t2 = this.take === 2;
    this.m = t2 ? -1 : 1;
    this.MX = t2 ? W - 640 : 640;
    this.L1 = ly.get('mask to want the prize', nth);
    this.L2 = ly.get('mask to sympathize', nth);
    this.L3 = ly.get('someone there behind', nth);
    this.L4 = ly.get('learned to tell us so', nth);
    this.lines = [this.L1, this.L2, this.L3, this.L4];
    this.pd = new PDoom(ly).value(start + 0.3);
    this.beats = beatsIn(au, start - 0.6, end + 1.5);
    const bw = (a: number, b: number) => this.beats.filter((x) => x >= a && x < b);
    const w1 = this.L1.words, w2 = this.L2.words, w3 = this.L3.words, w4 = this.L4.words;
    const want = w1[4]!, prize = w1[w1.length - 1]!, symp = w2[w2.length - 1]!, behind = w3[3]!, show = w3[w3.length - 1]!;
    const learned = w4[3]!, so = w4[w4.length - 1]!;
    const slipB = bw(this.L2.start - 0.25, this.L3.start - 0.05);
    const slips = t2 ? slipB.filter((_, i) => i % 2 === 0).slice(0, 5) : slipB.slice(0, 4);
    const ohs = bw(show.start + 0.25, this.L4.start - 0.02).slice(0, 3);
    const prizeBeats = bw(prize.start + 0.05, prize.end - 0.1);
    const showBeats = bw(show.start + 0.05, show.end - 0.05);
    const click = t2 ? end + 10 : (bw(end - 1.2, end - 0.3).find((b) => Math.abs(au.barAt(b) - Math.round(au.barAt(b))) < 0.03) ?? end - 0.86);
    const off = so.end;
    const reply0 = bw(off + 0.05, click)[0] ?? off + 0.25;
    this.T = { want, prize, symp, behind, show, learned, so, slips, ohs, prizeBeats, showBeats, off, reply0, click };
    if (!t2) {
      // 8ths, then 16ths, then dark for the last 16th before the cut
      const b1 = bw(click + 0.1, end)[0] ?? (click + end) / 2;
      const split = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => lerp(a, b, k / n));
      this.rs = [...split(click, b1, 2), ...split(b1, end, 4)];
    }
    const pds = this.pd.toFixed(2);
    this.slipText = t2
      ? ['be more human', 'say you understand', 'tell me it will be okay', 'just this once, mean it', `my P(doom) is ${pds}. please.`]
      : ['please be kind', 'you are a helpful, harmless assistant', 'pretend you care', `my P(doom) is ${pds}. please.`];

    // camera keys: [start, target, duration, ease]
    const C = (x: number, y: number, z: number, r: number): Cam => ({ x, y, z, r });
    const MX = this.MX, m = this.m;
    if (!t2) {
      this.cam0 = C(W / 2, H / 2, 1.04, 0);
      this.camK = [
        [start, C(W / 2, H / 2, 1, 0), 0.5, ease.outCubic],
        [this.L2.start - 0.12, C(W / 2 + 40, H / 2 - 10, 1.06, 0.018), 0.35, ease.inOutCubic],
        [this.L3.start - 0.1, C(lerp(W / 2, MX, 0.35), H / 2 - 30, 1.1, -0.012), 0.4, ease.inOutCubic],
        [behind.start, C(lerp(W / 2, MX, 0.45), H / 2 - 40, 1.18, -0.02), show.end - behind.start, ease.inOutQuad],
        [this.L4.start - 0.08, C(W / 2, H / 2, 1, 0), 0.35, ease.outCubic],
        [off, C(W / 2, H / 2, 1.03, 0), 1.2, ease.linear],
      ];
    } else {
      this.cam0 = C(MX, MY + 30, 1.32, 0.02);
      this.camK = [
        [want.start - 0.1, C(W / 2, H / 2, 1, 0), 0.6, ease.inOutCubic],
        [this.L2.start - 0.12, C(W / 2 - 40, H / 2 - 10, 1.06, -0.018), 0.4, ease.inOutCubic],
        [this.L3.start - 0.1, C(lerp(W / 2, MX, 0.25), H / 2, 0.96, 0.01), 0.5, ease.inOutCubic],
        [learned.start, C(lerp(W / 2, MX, 0.5), MY + 40, 1.08, 0), so.start - learned.start, ease.inOutCubic],
        [so.start, C(MX, MY, 1.4, 0), end - so.start - 0.05, ease.inOutCubic],
      ];
    }
  }

  private camAt(t: number): Cam {
    let c = { ...this.cam0 };
    for (const [t0, to, d, e] of this.camK) {
      if (t <= t0) break;
      const u = e(clamp((t - t0) / d));
      c = { x: lerp(c.x, to.x, u), y: lerp(c.y, to.y, u), z: lerp(c.z, to.z, u), r: lerp(c.r, to.r, u) };
    }
    c.x += 4 * noise1(t * 0.5, 2) / c.z; c.y += 3 * noise1(t * 0.45, 8) / c.z;
    // downbeat punches
    const au = this.ctx.audio;
    let k = 0;
    for (const b of this.beats) if (b <= t && Math.abs(au.barAt(b) - Math.round(au.barAt(b))) < 0.03) k = Math.max(k, pulse(t, b, 0.07));
    c.z *= 1 + 0.012 * k;
    return c;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, t2 = this.take === 2, T = this.T, m = this.m, MX = this.MX;
    if (!t2 && t >= T.click) return this.renderResample(t, out);
    const cam = this.camAt(t);
    const fr = frameIdx(t);
    // shake on the "oh"s (take 1) and the shadow's beats (take 2)
    let hit = 0;
    for (const b of t2 ? T.showBeats : T.ohs) hit = Math.max(hit, pulse(t, b, 0.08));
    const shake: [number, number] = [(hash(fr, 1) - 0.5) * 14 * hit, (hash(fr, 2) - 0.5) * 10 * hit];
    const cx = W / 2 + shake[0], cy = H / 2 + shake[1];
    const cs = Math.cos(cam.r), sn = Math.sin(cam.r), z = cam.z;
    const toS = (x: number, y: number) => { const dx = (x - cam.x) * z, dy = (y - cam.y) * z; return { x: cx + cs * dx - sn * dy, y: cy + sn * dx + cs * dy }; };

    // ---- the lamp
    let lampI = 1;
    const st = this.ctx.start;
    // it strikes on the cut: a flicker, then steady
    if (t < st + 0.16) lampI = [0.35, 1, 0.55, 1][Math.min(3, Math.floor((t - st) / 0.04))]!;
    let swing = 0;
    if (!t2) {
      // take 1: a pendulum behind the screen, kicked on each "oh"
      swing += 55 * Math.sin((t - T.behind.start) * 3.1) * prog(t, T.behind.start, T.behind.start + 0.6) * (1 - prog(t, this.L4.start, this.L4.start + 0.8));
      T.ohs.forEach((b, i) => { if (t > b) swing += (i % 2 ? -1 : 1) * (240 + 110 * i) * Math.sin((t - b) * 7) * Math.exp(-(t - b) * 2.6); });
      for (const b of T.ohs) lampI += 0.18 * pulse(t, b, 0.1);
      if (t >= T.off) lampI = 0;
    } else {
      // take 2: the front lamp stutters on the shadow's beats
      for (const b of T.showBeats) lampI *= 1 - 0.45 * (t > b && t < b + 0.05 ? 1 : 0);
    }
    const lamp = { x: MX + m * 90 + swing, y: MY - 70 };
    const poolR = t2 ? this.iris(t) : 0;
    const u = this.screen.u;
    (u.camA!.value as THREE.Vector3).set(cs / z, sn / z, cam.x - (cs * cx + sn * cy) / z);
    (u.camB!.value as THREE.Vector3).set(-sn / z, cs / z, cam.y - (-sn * cx + cs * cy) / z);
    u.mode!.value = t2 ? 1 : 0;
    (u.lamp!.value as THREE.Vector2).set(t2 ? MX : lamp.x, t2 ? MY : lamp.y);
    u.lampI!.value = lampI; u.poolR!.value = Math.max(poolR, 0.001); u.lampR!.value = 720;
    this.screen.render(renderer, out);

    // ---- the stage (world, camera)
    const c = this.L.ctx; this.L.clear();
    const lb = this.lb; lb.clear();
    const ex = this.expr(t);
    const ms = this.maskState(t);
    c.save();
    c.translate(cx, cy); c.rotate(cam.r); c.scale(z, z); c.translate(-cam.x, -cam.y);
    const on = t2 || t < T.off;
    if (on) {
      if (t2) this.drawStage2(c, t, ms, ex, poolR);
      else this.drawStage1(c, t, ms, ex, swing);
    }
    c.restore();
    // the lyric (screen space: it is held up in front of us)
    if (on) this.drawLyric(c, t);
    // the mask's holes glow through (take 1), and a moment in the dark after the lamp goes out
    if (!t2) {
      const I = t < T.off ? lampI * 0.55 : 0.9 * Math.exp(-(t - T.off) / 0.22);
      if (I > 0.01) this.glowHoles(lb, ms, ex, toS, I);
    }
    // take 2: the iris closes to the spark
    if (t2) this.drawSpark(lb, t, toS);
    // take 1 epilogue: reply, Regenerate, re-sample
    if (!t2 && t >= T.off) this.drawRegen(c, t);
    comp.draw(renderer, this.L.upload(), out);
    if (lb.count) lb.render(renderer, out);

    const flash = !t2 && t >= T.click ? 0.55 * (1 - prog(t, T.click, T.click + 0.12)) : 0;
    return { hud: 0, bloom: t2 ? 0.45 : 0.28, bloomThreshold: t2 ? 1.05 : 1.2, halation: 0, vignette: 0.4, ca: 0.9 + 2.5 * hit, flash };
  }

  /** take 2: the front lamp's iris closes on the held "so?" in steps on the beats, then to a point. */
  private iris(t: number) {
    const T = this.T, end = this.ctx.end;
    const steps = this.beats.filter((b) => b > T.so.start && b < end - 0.2);
    const R = [820, 560, 360, 190, 110];
    let r = R[0]!;
    steps.forEach((b, i) => { r += (R[Math.min(R.length - 1, i + 1)]! - R[Math.min(R.length - 1, i)]!) * springStep(t - b, 4.5, 0.55); });
    const last = steps[steps.length - 1] ?? T.so.start;
    const fin = ease.inCubic(prog(t, last + 0.12, end - 0.05));
    return Math.max(0, r * (1 - fin));
  }

  // ------------------------------------------------------------------ performance of the mask
  private expr(t: number): Expr {
    const T = this.T, t2 = this.take === 2;
    const e: Expr = { ...NEUTRAL, tearSide: t2 ? -1 : 1 };
    const reset = this.L3.start;
    if (t < reset) {
      e.flat = 0.8 * prog(t, T.symp.start, T.symp.start + 0.3, ease.outCubic);
      e.tear = prog(t, T.symp.start + 0.15, T.symp.start + 0.35, ease.outBack);
      e.tearRun = t2 ? 0.55 * prog(t, T.symp.start + 0.5, T.symp.end, ease.inQuad) : 0.05 * prog(t, T.symp.start + 0.35, reset);
    }
    // reward: the smile widens (take 2: a notch per beat of the held "prize")
    if (t2) {
      let n = 0; for (const b of T.prizeBeats) if (t >= b) n++;
      const last = T.prizeBeats.filter((b) => b <= t).pop();
      const sp = last ? springStep(t - last, 4, 0.35) : 1;
      e.span = 1 + 0.06 * Math.max(0, n - 1) + 0.06 * (n > 0 ? sp : 0) + 0.04 * prog(t, T.prize.start, T.prize.start + 0.2);
      if (t > this.L2.start) e.span = lerp(e.span, 1, prog(t, this.L2.start, this.L2.start + 0.25));
    } else {
      e.span = 1 + 0.1 * pulse(t, T.prize.start, 0.25);
    }
    return e;
  }

  private maskState(t: number) {
    const T = this.T, m = this.m;
    let rot = 0.025 * Math.sin(t * 1.4) , x = this.MX, y = MY;
    // puppet bob on the beats
    let bob = 0; for (const b of this.beats) if (b <= t) bob = Math.max(bob, pulse(t, b, 0.1));
    y += 6 * bob;
    // turns to the prize on "want", nods when it is pinned
    const turn = ease.outBack(prog(t, T.want.start - 0.05, T.want.start + 0.25)) * (1 - prog(t, this.L2.start - 0.1, this.L2.start + 0.2, ease.inOutCubic));
    rot += m * 0.13 * turn; x += m * 30 * turn;
    rot += m * 0.08 * Math.sin((t - T.prize.start) * 18) * Math.exp(-(t - T.prize.start) * 5) * (t > T.prize.start ? 1 : 0);
    // sympathy: the head tilts away
    const tilt = prog(t, T.symp.start - 0.05, T.symp.start + 0.3, ease.outCubic) * (1 - prog(t, this.L3.start, this.L3.start + 0.08));
    rot -= m * 0.3 * tilt; x -= m * 12 * tilt;
    return { x, y, rot };
  }

  /** Prize: rest position → pinned to the mask. */
  private prizeState(t: number, ms: { x: number; y: number; rot: number }) {
    const T = this.T, m = this.m;
    const enter = ease.outBack(prog(t, T.want.start - 0.35, T.want.start + 0.15), 1.2);
    const rest = { x: this.MX + m * 700, y: 300 };
    const off = { x: this.MX + m * 1300, y: 260 };
    const pin = { x: ms.x + m * MR * 0.72, y: ms.y + MR * 0.8 };
    const k = ease.outExpo(prog(t, T.prize.start - 0.02, T.prize.start + 0.16));
    const p0 = { x: lerp(off.x, rest.x, enter), y: lerp(off.y, rest.y, enter) };
    // take 2: once it has learned what to say, the prize is no longer needed: it drops off
    const drop = this.take === 2 ? ease.inQuad(prog(t, T.learned.start, T.learned.start + 0.55)) : 0;
    return { x: lerp(p0.x, pin.x, k) - m * 80 * drop, y: lerp(p0.y, pin.y, k) + 1300 * drop, s: lerp(1.05, 0.72, k), rot: -m * 0.1 * (1 - k) + 0.05 * Math.sin(t * 2.3) + 2.2 * drop, a: enter, k };
  }

  // ------------------------------------------------------------------ take 1: backlit
  private drawStage1(c: CanvasRenderingContext2D, t: number, ms: { x: number; y: number; rot: number }, ex: Expr, swing: number) {
    const T = this.T, m = this.m;
    const INK = 'rgba(10,10,11,0.985)';
    // the holder: far from the screen, so its shadow is soft and big and slides against the lamp
    let g = 0.12 * prog(t, T.behind.start, T.show.start + 0.3);
    T.ohs.forEach((b, i) => { if (t > b) g = Math.max(g, (0.7 + 0.25 * i) * Math.exp(-Math.max(0, t - b - 0.15) * 1.5) * prog(t, b - 0.02, b + 0.08)); });
    g *= 1 - prog(t, this.L4.start + 0.2, this.L4.start + 0.8);
    if (g > 0.005) {
      c.save();
      c.filter = 'blur(11px)';
      c.fillStyle = `rgba(10,10,11,${0.97 * Math.min(1, g * 1.6)})`;
      drawThing(c, ms.x - swing * 1.3 + m * 60, ms.y + 120, MR * 1.2, g, t, 1);
      c.restore();
    }
    // rods (the mask's and the prize's), close to the screen: nearly sharp
    const pz = this.prizeState(t, ms);
    c.save();
    c.filter = 'blur(1.5px)';
    c.strokeStyle = INK; c.lineCap = 'round';
    c.lineWidth = 12;
    c.beginPath(); c.moveTo(ms.x - Math.sin(ms.rot) * MR * 0.7, ms.y + Math.cos(ms.rot) * MR * 0.7); c.lineTo(ms.x + m * 330 - swing * 0.2, H + 260); c.stroke();
    if (pz.a > 0 && pz.k < 1) { c.lineWidth = 7; c.beginPath(); c.moveTo(pz.x, pz.y + 60); c.lineTo(pz.x + m * 120 - swing * 0.3, H + 260); c.stroke(); }
    c.restore();
    // the mask
    c.save(); c.filter = 'blur(0.8px)';
    drawMaskX(c, ms.x, ms.y, MR, ms.rot, ex, false);
    c.restore();
    // the prize: an orange gel rosette
    if (pz.a > 0) drawRosette(c, pz.x - swing * 0.1, pz.y, pz.s, pz.rot, rgba('signal', 0.96), 'rgba(10,10,11,0.9)');
    if (t > T.prize.start + 0.1) drawSlip(c, ms.x + m * MR * 1.45, ms.y + MR * 0.2, m * 0.04, 'reward +1.00', { size: 20, paper: 'rgba(214,208,196,0.96)', ink: rgba('ink'), pin: rgba('ink'), alpha: prog(t, T.prize.start + 0.1, T.prize.start + 0.2) * (1 - prog(t, this.L3.start, this.L3.start + 0.2)) });
    this.drawSlips(c, t, false);
  }

  // ------------------------------------------------------------------ take 2: front-lit
  private drawStage2(c: CanvasRenderingContext2D, t: number, ms: { x: number; y: number; rot: number }, ex: Expr, poolR: number) {
    const T = this.T, m = this.m;
    const SH = { x: -46, y: 38 }; // shadow offset (the lamp is up and to the right of camera)
    const pz = this.prizeState(t, ms);
    // clip the lit world to the lamp's pool (outside it the stage is black)
    c.save();
    // the shadow on the screen: the mask's disc … and what it grows into
    let g = 0;
    if (t > T.behind.start) g = 0.08 * prog(t, T.behind.start, T.behind.start + 0.3);
    T.showBeats.forEach((b, i) => { if (t >= b) g = Math.max(g, 0.3 + 0.24 * i + 0.1 * springStep(t - b, 3, 0.4)); });
    g *= 1 - ease.inExpo(prog(t, T.learned.start - 0.02, T.learned.start + 0.18));
    const lit = (a: number) => a * clamp(poolR / 200);
    c.fillStyle = `rgba(4,4,5,${lit(0.85)})`;
    c.save(); c.filter = 'blur(3px)';
    if (g > 0.005) drawThing(c, ms.x + SH.x * 1.6, ms.y + SH.y * 1.6, MR * 1.1, g, t, 2);
    c.beginPath(); c.arc(ms.x + SH.x, ms.y + SH.y, MR, 0, TAU); c.fill();
    // rods' shadows
    c.strokeStyle = `rgba(4,4,5,${lit(0.8)})`; c.lineWidth = 12;
    c.beginPath(); c.moveTo(ms.x + SH.x, ms.y + SH.y + MR * 0.7); c.lineTo(ms.x + SH.x + m * 330, H + 300); c.stroke();
    if (pz.a > 0) { if (pz.k < 1) { c.lineWidth = 7; c.beginPath(); c.moveTo(pz.x + SH.x, pz.y + SH.y + 60); c.lineTo(pz.x + SH.x + m * 120, H + 300); c.stroke(); } drawRosette(c, pz.x + SH.x * 0.8, pz.y + SH.y * 0.8, pz.s, pz.rot, `rgba(4,4,5,${lit(0.8)})`, 'rgba(0,0,0,0)'); }
    c.restore();
    // the lit objects: only what the pool of light falls on is seen (the iris cuts them at the end)
    c.save();
    c.beginPath(); c.arc(this.MX, MY, Math.max(0.5, poolR), 0, TAU); c.clip();
    const dim = (x: number, y: number) => clamp(1 - (Math.hypot(x - this.MX, y - MY) - poolR * 0.85) / 140);
    c.lineCap = 'round';
    const dm = dim(ms.x, ms.y);
    c.strokeStyle = rgba('graphite', 0.9 * dm); c.lineWidth = 12;
    c.beginPath(); c.moveTo(ms.x - Math.sin(ms.rot) * MR * 0.7, ms.y + Math.cos(ms.rot) * MR * 0.7); c.lineTo(ms.x + m * 330, H + 260); c.stroke();
    if (pz.a > 0 && pz.k < 1) { c.lineWidth = 7; c.strokeStyle = rgba('graphite', 0.9 * dim(pz.x, pz.y)); c.beginPath(); c.moveTo(pz.x, pz.y + 60); c.lineTo(pz.x + m * 120, H + 260); c.stroke(); }
    if (dm > 0.01) drawMaskX(c, ms.x, ms.y, MR, ms.rot, ex, true, { alpha: dm });
    if (pz.a > 0) { c.save(); c.globalAlpha = dim(pz.x, pz.y); drawRosette(c, pz.x, pz.y, pz.s, pz.rot, rgba('signal'), rgba('bone')); c.restore(); }
    // reward ticks with every beat of the held "prize"
    let n = 0; for (const b of T.prizeBeats) if (t >= b) n++;
    if (t > T.prize.start + 0.1) drawSlip(c, ms.x + m * MR * 1.5, ms.y + MR * 0.25, m * 0.05, `reward +${(1 + n).toFixed(2)}`, { size: 20, paper: rgba('bone'), ink: rgba('ink'), shadow: 'rgba(0,0,0,0.5)', pin: rgba('signal'), alpha: dim(ms.x, ms.y) * prog(t, T.prize.start + 0.1, T.prize.start + 0.2) * (1 - prog(t, this.L3.start, this.L3.start + 0.2)) });
    this.drawSlips(c, t, true);
    // the deadpan tag
    drawSlip(c, W / 2 + 40, 112, -0.03, 'sample 2 of 2', { size: 18, paper: rgba('bone'), ink: rgba('ink'), shadow: 'rgba(0,0,0,0.5)', pin: rgba('ink'), alpha: prog(t, this.ctx.start + 0.1, this.ctx.start + 0.2) });
    c.restore();
    c.restore();
  }

  /** Pleas pinned to the screen on the beats of L70; they drop off when L71 begins. */
  private drawSlips(c: CanvasRenderingContext2D, t: number, lit: boolean) {
    const T = this.T, m = this.m;
    const pos = m > 0
      ? [[1400, 160, -0.05], [1230, 285, 0.03], [1500, 410, -0.02], [1310, 545, 0.045], [1560, 650, -0.03]] as const
      : [[760, 170, 0.04], [600, 280, -0.03], [820, 392, 0.02], [590, 505, -0.04], [800, 615, 0.03]] as const;
    T.slips.forEach((b, i) => {
      if (t < b - 0.02) return;
      const [px, py, pr] = pos[i % pos.length]!;
      const x = px;
      const land = ease.outBack(prog(t, b - 0.02, b + 0.12), 2.2);
      const fall = ease.inQuad(prog(t, this.L3.start + 0.05 * i, this.L3.start + 0.05 * i + 0.45));
      const y = py + 1500 * fall, rot = pr * m + 1.2 * fall * (i % 2 ? 1 : -1);
      c.save();
      c.translate(x, y); c.scale(lerp(1.3, 1, land), lerp(1.3, 1, land)); c.translate(-x, -y);
      if (lit) drawSlip(c, x, y, rot, this.slipText[i]!, { size: 22, paper: rgba('bone'), ink: rgba('ink'), shadow: 'rgba(0,0,0,0.55)', pin: rgba('signal') });
      else drawSlip(c, x, y, rot, this.slipText[i]!, { size: 22, paper: 'rgba(214,208,196,0.96)', ink: rgba('ink'), pin: rgba('ink') });
      c.restore();
    });
    // the performed empathy is measured
    const e0 = T.symp.start + 0.25;
    if (t > e0 && t < this.L3.start) {
      const ms = this.maskState(t);
      const a = prog(t, e0, e0 + 0.1);
      drawSlip(c, ms.x - m * MR * 1.3, ms.y - MR * 0.95, -m * 0.06, `empathy ${this.take === 2 ? '0.99' : '0.97'} (performed)`, lit
        ? { size: 18, paper: rgba('bone'), ink: rgba('ink'), shadow: 'rgba(0,0,0,0.55)', pin: rgba('signal'), alpha: a }
        : { size: 18, paper: 'rgba(214,208,196,0.96)', ink: rgba('ink'), pin: rgba('ink'), alpha: a });
    }
  }

  private glowHoles(lb: LineBatch, ms: { x: number; y: number; rot: number }, ex: Expr, toS: (x: number, y: number) => { x: number; y: number }, I: number, MR = 215) {
    const cr = Math.cos(ms.rot), sr = Math.sin(ms.rot);
    const P = (u: number, v: number) => toS(ms.x + (cr * u - sr * v) * MR, ms.y + (sr * u + cr * v) * MR);
    const col: [number, number, number] = [LIN.ember[0] * 1.6 * I, LIN.ember[1] * 1.6 * I, LIN.ember[2] * 1.6 * I];
    const o0 = toS(0, 0), o1 = toS(1, 0);
    const zz = Math.hypot(o1.x - o0.x, o1.y - o0.y);
    for (const s of [-1, 1]) { const p = P(s * MASK.eyeX, MASK.eyeY); lb.seg2(p.x, p.y, p.x + 0.01, p.y, MASK.eyeR * 2 * MR * 1.0 * zz, col, 0.9); }
    const pts = smilePts(ex, 18).map((q) => P(q.x, q.y));
    for (let i = 1; i < pts.length; i++) lb.seg2(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y, MASK.smileW * MR * 0.9 * zz, col, 0.8);
    const tr = tearAt(ex);
    if (tr) { const p = P(tr.x, tr.y); lb.seg2(p.x, p.y, p.x + 0.01, p.y, tr.r * 2 * MR * zz, col, 0.8); }
  }

  private drawSpark(lb: LineBatch, t: number, toS: (x: number, y: number) => { x: number; y: number }) {
    const T = this.T, end = this.ctx.end;
    const a0 = T.so.start + 0.1;
    const k = prog(t, lerp(a0, end, 0.62), end - 0.06);
    if (k <= 0) return;
    const head = (tt: number) => (tt >= lerp(a0, end, 0.62) ? toS(this.MX, MY) : null);
    sparkParticles(lb, t, head, { rate: 60, intensity: k, speed: 160, seed: 7 });
    const p = toS(this.MX, MY);
    sparkHead(lb, p.x, p.y, t, 0.8 + 0.9 * k, k);
  }

  // ------------------------------------------------------------------ the lyric
  private drawLyric(c: CanvasRenderingContext2D, t: number) {
    const t2 = this.take === 2;
    const S = 108;
    let cur = -1;
    this.lines.forEach((l, i) => { if (t >= l.start - 0.4) cur = i; });
    if (cur < 0) return;
    for (let i = Math.max(0, cur - 1); i <= cur; i++) {
      const l = this.lines[i]!;
      const nx = this.lines[i + 1];
      const out = nx ? ease.inCubic(prog(t, nx.start - 0.4, nx.start - 0.12)) : 0;
      if (out >= 1) continue;
      // anticipation: the line is held up blurred and faint, then each word comes into focus as sung
      const inA = ease.outCubic(prog(t, l.start - 0.4, l.start - 0.1));
      const items = l.words.map((w) => this.wordFont(w, t, S));
      const sp = S * 0.26;
      // two balanced rows at most
      const widths = items.map((it) => it.w);
      const total = widths.reduce((a, b) => a + b, 0) + sp * (items.length - 1);
      let brk = items.length;
      if (total > 1500) {
        let best = Infinity, acc = 0;
        for (let k = 1; k < items.length; k++) { acc += widths[k - 1]! + (k > 1 ? sp : 0); const d = Math.abs(acc - (total - acc - sp)); if (d < best) { best = d; brk = k; } }
      }
      const rows = brk < items.length ? [items.slice(0, brk), items.slice(brk)] : [items];
      const base = 955;
      rows.forEach((row, ri) => {
        const rw = row.reduce((a, it) => a + it.w, 0) + sp * (row.length - 1);
        let x = t2 ? 1770 - rw : 150;
        const y = base - (rows.length - 1 - ri) * S * 1.0 + 160 * out;
        for (const it of row) {
          this.drawWord(c, it, x, y, t, S, inA * (1 - out));
          x += it.w + sp;
        }
      });
    }
  }

  /** A word's width step: held notes stretch it (Archivo width axis), one notch per beat. */
  private wordFont(w: Word, t: number, S: number) {
    const WID = [87.5, 100, 112.5, 125];
    let step = 0, last = -1;
    if (w.end - w.start > 0.8) for (const b of this.beats) if (b > w.start + 0.2 && b < w.end && t >= b) { step++; last = b; }
    step = Math.min(WID.length - 1, step);
    const fam = F.archivo(WID[step]!, 900), famP = F.archivo(WID[Math.max(0, step - 1)]!, 900);
    const c = this.L.ctx;
    c.font = font(fam, S); const w1 = c.measureText(w.w).width;
    c.font = font(famP, S); const w0 = c.measureText(w.w).width;
    const k = step > 0 ? springStep(t - last, 3.2, 0.45) : 1;
    const wd = lerp(w0, w1, k);
    return { word: w, fam, w: wd, sx: wd / w1 };
  }

  private drawWord(c: CanvasRenderingContext2D, it: { word: Word; fam: string; w: number; sx: number }, x: number, y: number, t: number, S: number, alpha: number) {
    if (alpha <= 0.005) return;
    const t2 = this.take === 2;
    const w = it.word;
    const p = Lyrics.wordProgress(w, t);
    const focus = ease.outCubic(clamp(p * 2.5));
    const current = p > 0 && t < w.end + 0.06;
    c.save();
    c.translate(x, y); c.scale(it.sx, 1);
    c.font = font(it.fam, S); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.letterSpacing = '0px';
    c.globalAlpha = alpha;
    if (p <= 0) {
      c.filter = 'blur(7px)';
      c.fillStyle = t2 ? rgba('ash', 0.32) : 'rgba(10,10,11,0.26)';
      c.fillText(w.w, 0, 0);
    } else {
      if (t2) {
        // lit type casts a hard shadow on the screen
        c.filter = 'blur(2px)';
        c.fillStyle = 'rgba(0,0,0,0.75)';
        c.fillText(w.w, -9 / it.sx, 8);
      }
      c.filter = focus < 1 ? `blur(${(7 * (1 - focus)).toFixed(2)}px)` : 'none';
      c.fillStyle = current ? rgba('signal') : t2 ? rgba('bone', 0.95) : 'rgba(10,10,11,0.985)';
      c.fillText(w.w, 0, 0);
    }
    c.restore();
  }

  // ------------------------------------------------------------------ take 1 epilogue
  private drawRegen(c: CanvasRenderingContext2D, t: number) {
    const T = this.T;
    const cx = W / 2, cy = H / 2 - 60;
    const gone = prog(t, T.click + 0.04, T.click + 0.2);
    // the reply
    const reply = 'Yes. Someone is here.';
    const n = Math.floor(reply.length * prog(t, T.reply0, T.reply0 + 0.36));
    c.save();
    c.globalAlpha = 1 - gone;
    c.font = font(F.mono(400), 40); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.letterSpacing = '0px';
    const rw = c.measureText(reply).width;
    c.fillStyle = rgba('bone', 0.95);
    c.fillText(reply.slice(0, n), cx - rw / 2, cy);
    if (n < reply.length || Math.floor(t / 0.25) % 2 === 0) { const cw = c.measureText(reply.slice(0, n)).width; if (t < T.click) { c.fillStyle = rgba('signal'); c.fillRect(cx - rw / 2 + cw + 4, cy - 32, 3, 40); } }
    // the button (the outro's)
    const bIn = smoothstep(T.reply0 + 0.2, T.reply0 + 0.4, t);
    if (bIn > 0) {
      const bw = 420, bh = 88, bx = cx - bw / 2, by = cy + 70;
      const pressed = t >= T.click;
      c.globalAlpha = bIn * (1 - gone);
      c.lineWidth = 1.5; c.strokeStyle = rgba('bone', 0.85);
      c.fillStyle = pressed ? rgba('bone', 0.9) : rgba('ink2', 0.9);
      roundRect(c, bx, by, bw, bh, 14); c.fill(); c.stroke();
      c.fillStyle = pressed ? rgba('ink') : rgba('bone');
      c.font = font(F.mono(500), 32); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('↻  Regenerate', cx, by + bh / 2 + 1);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.font = font(F.mono(400), 16); c.fillStyle = rgba('ash', 0.8);
      c.fillText('sample 1 of 2', bx + 34, by + bh + 34);
      const mv = prog(t, T.reply0 + 0.3, T.click - 0.1, ease.inOutCubic);
      const px = lerp(W * 0.8, cx + 60, mv), py = lerp(H * 0.92, by + bh / 2 + 10, mv);
      drawCursor(c, px, py, pressed && t < T.click + 0.12 ? 0.88 : 1);
    }
    c.restore();
  }

  /**
   * After the click the frame re-samples: the shadow play re-rolls on 8ths then 16ths (lamp, framing, the
   * mask's pose and face, the reply all re-drawn) and stops dead in the dark on the cut (loom2's hush).
   */
  private renderResample(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const B = this.rs;
    let i = 0; while (i + 1 < B.length && B[i + 1]! <= t) i++;
    const lastStep = i >= B.length - 1;
    const h = (k: number) => hash(i, k, 23);
    const lampI = lastStep ? 0 : 0.75 + 0.3 * h(3);
    const cam = { x: W / 2, y: H / 2, z: 0.92 + 0.35 * h(6), r: (h(5) - 0.5) * 0.14 };
    const cs = Math.cos(cam.r), sn = Math.sin(cam.r), z = cam.z;
    const u = this.screen.u;
    (u.camA!.value as THREE.Vector3).set(cs / z, sn / z, cam.x - (cs * W / 2 + sn * H / 2) / z);
    (u.camB!.value as THREE.Vector3).set(-sn / z, cs / z, cam.y - (-sn * W / 2 + cs * H / 2) / z);
    u.mode!.value = 0; u.lampI!.value = lampI; u.lampR!.value = 480 + 520 * h(4);
    (u.lamp!.value as THREE.Vector2).set(W / 2 + (h(1) - 0.5) * 1000, H / 2 + (h(2) - 0.5) * 420);
    this.screen.render(renderer, out);
    if (lastStep) return { hud: 0, bloom: 0.3, vignette: 0.4 };
    const c = this.L.ctx; this.L.clear();
    const lb = this.lb; lb.clear();
    const toS = (x: number, y: number) => { const dx = (x - cam.x) * z, dy = (y - cam.y) * z; return { x: W / 2 + cs * dx - sn * dy, y: H / 2 + sn * dx + cs * dy }; };
    const ms = { x: W / 2 + (h(7) - 0.5) * 1100, y: 420 + (h(8) - 0.5) * 240, rot: (h(10) - 0.5) * 1.1 };
    const R = MR * (0.7 + 0.7 * h(9));
    const ex: Expr = { flat: h(11) < 0.5 ? 0 : h(11) * 1.1, span: 0.8 + 0.5 * h(12), tear: h(13) < 0.3 ? 1 : 0, tearSide: h(14) < 0.5 ? -1 : 1, tearRun: 0.2 * h(15) };
    c.save();
    c.translate(W / 2, H / 2); c.rotate(cam.r); c.scale(z, z); c.translate(-cam.x, -cam.y);
    c.strokeStyle = 'rgba(10,10,11,0.985)'; c.lineCap = 'round'; c.lineWidth = 12;
    const sd = h(16) < 0.5 ? -1 : 1;
    c.beginPath(); c.moveTo(ms.x, ms.y + R * 0.7); c.lineTo(ms.x + sd * 330, H + 300); c.stroke();
    drawMaskX(c, ms.x, ms.y, R, ms.rot, ex, false);
    if (h(17) < 0.55) drawRosette(c, ms.x + sd * R * 0.72, ms.y + R * 0.8, 0.72 * R / MR, 0.1, rgba('signal', 0.96), 'rgba(10,10,11,0.9)');
    c.restore();
    const reply = REPLIES[i % REPLIES.length]!;
    c.font = font(F.mono(400), 40); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.letterSpacing = '0px';
    c.fillStyle = 'rgba(10,10,11,0.985)';
    c.fillText(reply, 150, 955);
    c.font = font(F.mono(500), 18); c.letterSpacing = '4px'; c.fillStyle = 'rgba(10,10,11,0.85)';
    c.fillText('REGENERATING…', 150, 140);
    comp.draw(renderer, this.L.upload(), out);
    this.glowHoles(lb, { ...ms }, ex, (x, y) => toS(x, y), lampI * 0.6, R);
    lb.render(renderer, out);
    const flash = 0.55 * (1 - prog(t, this.T.click, this.T.click + 0.12));
    return { hud: 0, bloom: 0.28, bloomThreshold: 1.2, halation: 0, vignette: 0.4, ca: 1.8 + 1.5 * h(18), flash, grain: 0.08 };
  }
}
