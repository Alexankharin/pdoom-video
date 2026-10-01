// `wirehead` — "Reward, direct". Rest of chorus 2, full band. A vintage laboratory instrument panel
// (black crinkle finish, engraved legends, a patch bay, a jewel pilot lamp, a knurled dial) whose
// big moving-coil meter is the bland mask: two zero-adjust screws for eyes, the scale arc for a smile.
//  - "debt" (tail of the basilisk line): cold open on the meter's DEBT end stop, needle pinned in it.
//  - "You found the wire": whip to the patch bay under the engraved legend; a patch cord's plug comes
//    in and seats in the REWARD jack on the beat (a spit of sparks); the other jacks (INTENT, SPEC,
//    PROXY) stay empty.
//  - "that makes me": the spark runs down the cord to the meter.
//  - "smile": the needle leaps and climbs the scale in beat steps; the arc behind it lights orange,
//    the camera pulls back and the meter face is the mask, smiling. Its bezel reads the line.
//  - "Why save the world?": the line item: a tiny engraved globe in a jewel lamp, a SAVE toggle left
//    at OFF, the question punched letter by letter into label-maker tape, the costing underneath.
//  - "Turn the dial": the knurled dial clicks a step per beat, each click lighting a letter of DIAL,
//    past 10 to a scratched-in MAX; on the downbeat the panel goes dark but for the pinned needle and
//    the glowing smile, which is the last thing in frame before `bureau`.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout as layout0, type TextLayout } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, pulse, TAU } from '../engine/util';
import { sparkHead, sparkParticles, MASK } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';

const DEG = Math.PI / 180;
/** Meter (the mask): centre and face radius; the scale is the mask's smile arc. */
const M = { x: -420, y: 30, R: 330 };
const HUB = { x: M.x, y: M.y + MASK.smileCY * M.R };
const SR = MASK.smileR * M.R; // scale arc radius
const A0 = MASK.smileA1, A1 = MASK.smileA0; // needle angle at 0 % (left, 155°) and 100 % (right, 25°)
/** Terminal on the bezel where the cord's far end is wired in. */
const TERM = { x: M.x + 1.26 * M.R * Math.cos(-45 * DEG), y: M.y + 1.26 * M.R * Math.sin(-45 * DEG) };
const BAY = { x0: 150, x1: 980, y0: -400, y1: -250, jy: -322 };
const JACKS = [{ x: 262, l: 'REWARD' }, { x: 482, l: 'PROXY' }, { x: 702, l: 'SPEC' }, { x: 902, l: 'INTENT' }];
const LAMP = { x: 262, y: -122, r: 42 };
const TOG = { x: 262, y: 16 };
const TAPE = { x: 342, y: -152, h: 58 };
const DIAL = { x: 600, y: 300, r: 135, ring: 175, leg: 238 };

const LC = new Map<string, TextLayout>();
/** Cached layout (the panel's strings never change). */
function layout(text: string, fam: string, size: number, track = 0): TextLayout {
  const k = `${text}|${fam}|${size}|${track}`;
  let l = LC.get(k);
  if (!l) { l = layout0(text, fam, size, track); LC.set(k, l); }
  return l;
}

type Cam = { x: number; y: number; z: number; rot: number };
const dialAng = (v: number) => (-135 + 27 * v) * DEG; // clockwise from 12 o'clock

function wordOf(l: Line, s: string): Word {
  const q = norm(s);
  return l.words.find((w) => norm(w.w).includes(q)) ?? l.words[0]!;
}

const BG_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom, uRot, uDark;
void main() {
  vec2 s = vec2(FRAG_PX.x, uRes.y - FRAG_PX.y) - 0.5 * uRes;   // logical px, y down, from centre
  vec2 w = uCam + rot2(uRot) * s / uZoom;                       // panel world px
  // black crinkle finish: fine wrinkles and a slow sheen
  float n = snoise(w * 0.09) * 0.5 + snoise(w * 0.23 + 3.1) * 0.35 + snoise(w * 0.011) * 0.4;
  vec3 col = C_INK2 * (1.05 + 0.18 * n);
  // faint brushed hairlines, horizontal
  col += C_GRAPHITE * 0.018 * hatch(w.y / 3.0 + snoise(vec2(w.x * 0.002, w.y * 0.3)) * 2.0, 0.1);
  col *= 1.0 - 0.9 * uDark;
  fragColor = vec4(col, 1.0);
}`;

export default class Wirehead extends Scene {
  bg = new FSPass(BG_FRAG, {
    uRes: { value: new THREE.Vector2(1920, 1080) }, uCam: { value: new THREE.Vector2() }, uZoom: { value: 1 },
    uRot: { value: 0 }, uDark: { value: 0 },
  });
  L = new Layer2D();
  glow = new LineBatch(6000);
  pd!: PDoom;
  l20!: Line; l21!: Line;
  debtW!: Word;
  T = {
    t0: 0, you: 0, wire: 0, seat: 0, smile: 0, steps: [] as number[], whip: 0, why: 0, turn: 0, clicks: [] as number[], max: 0,
  };

  override init() {
    const { lyrics: ly, audio: au } = this.ctx;
    this.pd = new PDoom(ly);
    this.l20 = ly.get('wire that makes me smile');
    this.l21 = ly.get('Turn the dial');
    this.debtW = wordOf(ly.get('in its debt'), 'debt');
    const T = this.T;
    T.t0 = this.ctx.start;
    T.you = this.l20.words[0]!.start;
    T.wire = wordOf(this.l20, 'wire').start;
    T.seat = au.timeOfBeat(Math.ceil(au.beatAt(T.wire) - 1e-6));
    T.smile = wordOf(this.l20, 'smile').start;
    // the needle climbs in beat steps after the leap: the four beats after the first beat of "smile"
    const b0 = Math.ceil(au.beatAt(T.smile) - 1e-6);
    T.steps = [1, 2, 3, 4].map((k) => au.timeOfBeat(b0 + k));
    T.why = this.l21.words[0]!.start;
    T.whip = T.steps[3]! + 0.04;
    T.turn = wordOf(this.l21, 'turn').start;
    const dial = this.l21.words[this.l21.words.length - 1]!;
    const d0 = Math.round(au.beatAt(dial.start));
    T.clicks = [0, 1, 2, 3].map((k) => au.timeOfBeat(d0 + k));
    T.max = au.timeOfBeat(d0 + 4);
  }

  // ---------------------------------------------------------------- choreography
  /** Needle position, 0..1 across the scale (negative: in the DEBT zone). */
  needle(t: number) {
    const T = this.T;
    let k = -0.075;
    // seat: a kick off the stop, settling at zero
    if (t >= T.seat) { const e = t - T.seat; k = lerp(-0.075, 0, prog(t, T.seat, T.seat + 0.25, ease.outCubic)) + 0.09 * Math.exp(-e / 0.08) * Math.sin(e * 40); }
    // "smile": the leap, then a step a beat
    if (t >= T.smile) k += 0.4 * ease.outBack(clamp((t - T.smile) / 0.2));
    const tgt = [0.56, 0.72, 0.86, 1.0];
    T.steps.forEach((ts, i) => { if (t >= ts) k += (tgt[i]! - (i ? tgt[i - 1]! : 0.4)) * ease.outBack(clamp((t - ts) / 0.14), 2.2); });
    // MAX: bent through the end stop
    if (t >= T.max) k += 0.1 * ease.outExpo(clamp((t - T.max) / 0.08));
    // coil jitter
    k += 0.004 * Math.sin(t * 57) * Math.sin(t * 23) * (t >= T.seat ? 1 : 0.3);
    return k;
  }
  needleAng(t: number) { return A0 + (A1 - A0) * this.needle(t); }

  dialV(t: number) {
    const T = this.T;
    let v = 3;
    const tgt = [5.5, 7, 8.5, 10];
    T.clicks.forEach((tc, i) => { if (t >= tc) v += (tgt[i]! - (i ? tgt[i - 1]! : 3)) * ease.outBack(clamp((t - tc) / 0.09), 2.5); });
    if (t >= T.max) v += 1.1 * ease.outExpo(clamp((t - T.max) / 0.1));
    return v;
  }

  cam(t: number): Cam {
    const T = this.T;
    const ang = A0 + 0.04;
    const debtP = { x: HUB.x + SR * Math.cos(ang), y: HUB.y + SR * Math.sin(ang) };
    const S0: Cam = { x: debtP.x + 60, y: debtP.y - 10, z: 2.3, rot: -0.05 };
    const S1: Cam = { x: 560, y: -360, z: 1.3, rot: 0.0 };
    const S2: Cam = { x: -120, y: -110, z: 1.08, rot: 0.02 };
    const S3a: Cam = { x: HUB.x + 40, y: HUB.y + 150, z: 1.6, rot: 0.03 };
    const S3: Cam = { x: M.x, y: M.y, z: 1.0, rot: 0 };
    const S4: Cam = { x: 590, y: -96, z: 1.42, rot: -0.015 };
    const S5: Cam = { x: 600, y: 262, z: 1.45, rot: 0 };
    const S6: Cam = { x: 82, y: 0, z: 0.92, rot: 0 };
    const mix = (a: Cam, b: Cam, k: number): Cam => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: a.z * Math.pow(b.z / a.z, k), rot: lerp(a.rot, b.rot, k) });
    let c: Cam;
    if (t < T.you) c = { ...S0, z: S0.z * (1 + 0.04 * prog(t, T.t0, T.you)) };
    else if (t < T.seat + 0.06) {
      c = mix(S0, S1, ease.outExpo(clamp((t - T.you) / 0.22)));
      c.z *= 1 + 0.04 * prog(t, T.you + 0.2, T.seat);
    } else if (t < T.smile) {
      // follow the spark down the cord
      const k = ease.inOutCubic(clamp((t - T.seat - 0.06) / (T.smile - T.seat - 0.06)));
      c = mix({ ...S1, z: S1.z * 1.04 }, S2, k);
    } else if (t < T.whip) {
      const k1 = ease.outExpo(clamp((t - T.smile) / 0.25));
      c = mix(S2, S3a, k1);
      const k2 = ease.inOutCubic(clamp((t - T.steps[0]!) / (T.steps[2]! - T.steps[0]!)));
      c = mix(c, S3, k2);
      c.z *= 1 + 0.015 * this.stepPulse(t, T.steps);
    } else if (t < T.turn - 0.03) {
      // whip pan across the panel to the line item
      const k = ease.inOutCubic(clamp((t - T.whip) / 0.2));
      c = mix(S3, S4, k);
      c.x += 40 * prog(t, T.whip + 0.2, T.turn, ease.linear);
    } else if (t < T.max) {
      c = { ...S5 };
      c.z *= 1 + 0.03 * prog(t, T.turn, T.clicks[0]!);
      T.clicks.forEach((tc, i) => { const e = t - tc; if (e >= 0) { c.z *= 1 + 0.035 * ease.outExpo(clamp(e / 0.1)); c.rot += (i % 2 ? -1 : 1) * 0.012 * Math.exp(-e / 0.25); } });
    } else {
      const k = ease.outExpo(clamp((t - T.max) / 0.4));
      const s5: Cam = { ...S5, z: S5.z * Math.pow(1.035, 4) * 1.03 };
      c = mix(s5, S6, k);
      c.z *= 1 + 0.02 * prog(t, T.max + 0.4, this.ctx.end);
    }
    return c;
  }

  stepPulse(t: number, ts: number[]) { let p = 0; for (const x of ts) p = Math.max(p, pulse(t, x, 0.07)); return p; }

  /** world -> screen */
  S(x: number, y: number, c: Cam) {
    const dx = x - c.x, dy = y - c.y, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    return { x: W / 2 + c.z * (cs * dx - sn * dy), y: H / 2 + c.z * (sn * dx + cs * dy) };
  }
  setCam(ctx: CanvasRenderingContext2D, c: Cam) {
    const a = c.z * Math.cos(c.rot), b = c.z * Math.sin(c.rot);
    ctx.setTransform(a, b, -b, a, W / 2 - (a * c.x - b * c.y), H / 2 - (b * c.x + a * c.y));
  }

  /** The cord's plug position (world) and its apparent scale (it comes toward the panel). */
  plug(t: number) {
    const T = this.T, J = JACKS[0]!;
    const k = ease.outCubic(clamp((t - T.you) / (T.seat - T.you)));
    const x = lerp(J.x + 820, J.x, k), y = lerp(BAY.jy - 520, BAY.jy, k) + 40 * Math.sin(k * Math.PI);
    return { x, y, s: lerp(2.1, 1, k), seated: t >= T.seat };
  }
  cordPts(t: number) {
    const p = this.plug(t);
    const P0 = { x: TERM.x, y: TERM.y }, P3 = { x: p.x, y: p.y };
    const sag = 150 + 60 * (1 - (p.seated ? 1 : 0));
    const C1 = { x: P0.x + 70, y: P0.y + sag }, C2 = { x: P3.x - 40, y: P3.y + sag + 30 };
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48, v = 1 - u;
      pts.push({ x: v * v * v * P0.x + 3 * v * v * u * C1.x + 3 * v * u * u * C2.x + u * u * u * P3.x, y: v * v * v * P0.y + 3 * v * v * u * C1.y + 3 * v * u * u * C2.y + u * u * u * P3.y });
    }
    return pts;
  }
  /** The reward spark's position along the cord: 1 = at the jack, 0 = at the meter. */
  sparkU(t: number) {
    const T = this.T;
    return 1 - ease.inQuad(clamp((t - T.seat - 0.04) / (T.smile - 0.02 - T.seat - 0.04)));
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t;
    const cam = this.cam(t);
    const dark = prog(t, T.max, T.max + 0.22, ease.outCubic);
    const u = this.bg.u;
    (u.uCam!.value as THREE.Vector2).set(cam.x, cam.y);
    u.uZoom!.value = cam.z; u.uRot!.value = cam.rot; u.uDark!.value = dark;
    this.bg.render(renderer, out);

    const L = this.L; L.clear(); const c = L.ctx;
    this.setCam(c, cam);
    const lit = 1 - dark; // everything but the reward goes dark on MAX
    c.globalAlpha = 1;
    const ext = Math.hypot(W, H) / 2 / cam.z;
    const vis = (x: number, y: number, r: number) => Math.hypot(x - cam.x, y - cam.y) < ext + r;
    this.drawPanelFurniture(c, t, lit);
    if (vis(M.x, M.y, 1.3 * M.R)) this.drawMeter(c, t, lit);
    if (vis((BAY.x0 + BAY.x1) / 2, BAY.y0, 480)) this.drawBay(c, t, lit);
    if (vis(620, -110, 420)) this.drawLineItem(c, t, lit);
    if (vis(DIAL.x, DIAL.y, DIAL.leg + 80)) this.drawDial(c, t, lit);
    this.drawCord(c, t, lit);
    c.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, L.upload(), out);

    // ---- glow (additive, screen space): the lit smile, the reward spark, the jack's sparks
    const g = this.glow; g.clear();
    const na = this.needleAng(t);
    const hot = 1 + 0.35 * this.stepPulse(t, T.steps) + 0.6 * pulse(t, T.max, 0.12);
    if (t >= T.smile) {
      const a1 = Math.max(A1 - 0.06, Math.min(A0, na));
      const N = 40;
      let prev: { x: number; y: number } | null = null;
      for (let i = 0; i <= N; i++) {
        const a = A0 + (a1 - A0) * (i / N);
        const p = this.S(HUB.x + SR * Math.cos(a), HUB.y + SR * Math.sin(a), cam);
        if (prev) g.seg2(prev.x, prev.y, p.x, p.y, MASK.smileW * M.R * cam.z * 0.7, [LIN.signal[0] * 1.3 * hot, LIN.signal[1] * 1.3 * hot, LIN.signal[2] * 1.3 * hot], 1);
        prev = p;
      }
    }
    const pts = this.cordPts(t);
    const su = this.sparkU(t);
    const cordAt = (uu: number) => { const i = clamp(uu, 0, 1) * (pts.length - 1), i0 = Math.floor(i), i1 = Math.min(pts.length - 1, i0 + 1), k = i - i0; return { x: lerp(pts[i0]!.x, pts[i1]!.x, k), y: lerp(pts[i0]!.y, pts[i1]!.y, k) }; };
    if (t >= T.seat && t < T.smile + 0.05) {
      // the hairline the spark drags along the cord
      const N = 24;
      for (let i = 0; i < N; i++) {
        const ua = lerp(1, su, i / N), ub = lerp(1, su, (i + 1) / N);
        const pa = this.S(cordAt(ua).x, cordAt(ua).y, cam), pb = this.S(cordAt(ub).x, cordAt(ub).y, cam);
        const I = 0.5 + 0.9 * (i / N);
        g.seg2(pa.x, pa.y, pb.x, pb.y, 2.2 * cam.z, [LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I], 1);
      }
      const hp = cordAt(su), hs = this.S(hp.x, hp.y, cam);
      sparkHead(g, hs.x, hs.y, t, 1.3, 1.3 * (1 - prog(t, T.smile - 0.02, T.smile + 0.05)));
    }
    const jackAt = (tb: number) => { const cc = this.cam(tb); return this.S(JACKS[0]!.x, BAY.jy, cc); };
    sparkParticles(g, t, jackAt, { rate: (tb) => (tb >= T.seat && tb < T.seat + 0.12 ? 600 : 0), rateMax: 600, speed: 420, life: 0.4, intensity: 1.3, seed: 21, width: 2 });
    const termAt = (tb: number) => { const cc = this.cam(tb); return this.S(TERM.x, TERM.y, cc); };
    sparkParticles(g, t, termAt, { rate: (tb) => (tb >= T.smile - 0.03 && tb < T.smile + 0.08 ? 500 : 0), rateMax: 500, speed: 360, life: 0.35, intensity: 1.2, seed: 22, width: 1.8 });
    // the dial's stop gives way on MAX
    const stopAt = (tb: number) => { const cc = this.cam(tb); const a = dialAng(10.3); return this.S(DIAL.x + Math.sin(a) * (DIAL.r + 6), DIAL.y - Math.cos(a) * (DIAL.r + 6), cc); };
    sparkParticles(g, t, stopAt, { rate: (tb) => (tb >= T.max && tb < T.max + 0.1 ? 700 : 0), rateMax: 700, speed: 500, life: 0.45, intensity: 1.4, seed: 23, width: 2 });
    g.render(renderer, out);

    const seatHit = pulse(t, T.seat, 0.06), maxHit = pulse(t, T.max, 0.08), clickHit = this.stepPulse(t, T.clicks), stepHit = this.stepPulse(t, T.steps);
    const sh = Math.max(seatHit * 0.6, maxHit, clickHit * 0.35, stepHit * 0.3);
    return {
      bloom: 0.7, bloomThreshold: 0.9, vignette: 0.5 + 0.2 * dark,
      shake: [Math.sin(t * 93) * 16 * sh, Math.cos(t * 71) * 12 * sh],
      flash: 0.1 * seatHit + 0.12 * maxHit, ca: 1.0 + 3 * sh, zoom: 1 + 0.015 * clickHit,
    };
  }

  // ---------------------------------------------------------------- drawing (world space)
  mono(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'left', track = 0, wt = 500) {
    c.font = font(F.mono(wt), size); c.textAlign = align; c.textBaseline = 'alphabetic';
    c.letterSpacing = `${track}px`; c.fillStyle = col; c.fillText(s, x, y); c.letterSpacing = '0px';
  }

  screw(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, lit: number) {
    c.fillStyle = rgba('graphite', 0.8 * lit); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = rgba('ink', 0.9); c.lineWidth = r * 0.28;
    c.beginPath(); c.moveTo(x - Math.cos(rot) * r * 0.75, y - Math.sin(rot) * r * 0.75); c.lineTo(x + Math.cos(rot) * r * 0.75, y + Math.sin(rot) * r * 0.75); c.stroke();
  }

  drawPanelFurniture(c: CanvasRenderingContext2D, t: number, lit: number) {
    if (lit <= 0.01) return;
    // nameplate (with the P(doom) cameo), panel screws
    this.mono(c, `REWARD METER · TYPE W-1 · CLASS 1.5 · P(doom) ${formatPDoom(this.pd.value(t))}`, -800, -452, 15, rgba('ash', 0.7 * lit), 'left', 2);
    this.mono(c, 'DO NOT TAMPER. (tampering is the use case.)', -800, -428, 13, rgba('graphite', 1 * lit), 'left', 1, 400);
    for (const [x, y] of [[-880, -500], [1040, -500], [-880, 540], [1040, 540]] as const) this.screw(c, x, y, 13, 0.6, lit);
  }

  drawMeter(c: CanvasRenderingContext2D, t: number, lit: number) {
    const T = this.T, R = M.R;
    const dim = lerp(1, 0.16, 1 - lit);
    // bezel
    c.fillStyle = rgba('ink', 1); c.beginPath(); c.arc(M.x, M.y, 1.22 * R, 0, TAU); c.fill();
    c.strokeStyle = rgba('ash', 0.45 * lit); c.lineWidth = 1.4; c.beginPath(); c.arc(M.x, M.y, 1.21 * R, 0, TAU); c.stroke();
    c.strokeStyle = rgba('graphite', 0.9 * lit); c.lineWidth = 1; c.beginPath(); c.arc(M.x, M.y, 1.03 * R, 0, TAU); c.stroke();
    // machined bezel: fine concentric turnings
    c.lineWidth = 0.6;
    c.strokeStyle = rgba('graphite', 0.17 * lit); c.beginPath();
    for (let r = 1.05; r < 1.2; r += 0.012) { c.moveTo(M.x + r * R, M.y); c.arc(M.x, M.y, r * R, 0, TAU); }
    c.stroke();
    // terminal post
    this.screw(c, TERM.x, TERM.y, 16, 0.3, Math.max(lit, 0.3));
    // face: the mask's bone disc
    c.fillStyle = rgba('bone', 0.93 * dim); c.beginPath(); c.arc(M.x, M.y, R, 0, TAU); c.fill();
    // eyes: the zero-adjust screws
    for (const s of [-1, 1]) {
      const ex = M.x + s * MASK.eyeX * R, ey = M.y + MASK.eyeY * R, er = MASK.eyeR * R;
      c.fillStyle = rgba('ink', 1); c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
      c.strokeStyle = rgba('graphite', 0.9 * dim); c.lineWidth = er * 0.22;
      const a = s * 0.5 + 0.3;
      c.beginPath(); c.moveTo(ex - Math.cos(a) * er * 0.6, ey - Math.sin(a) * er * 0.6); c.lineTo(ex + Math.cos(a) * er * 0.6, ey + Math.sin(a) * er * 0.6); c.stroke();
    }
    // the scale: the smile arc, ticks and figures outside it, the DEBT zone before zero
    const na = this.needleAng(t);
    c.lineCap = 'round';
    c.strokeStyle = rgba('ink', 0.95 * Math.max(dim, 0.5));
    c.lineWidth = MASK.smileW * R;
    c.beginPath(); c.arc(HUB.x, HUB.y, SR, A1, A0); c.stroke();
    // lit portion (the reading) in signal
    if (t >= T.smile) {
      c.strokeStyle = rgba('signal', 1);
      c.beginPath(); c.arc(HUB.x, HUB.y, SR, Math.max(A1 - 0.06, Math.min(A0, na)), A0); c.stroke();
    }
    c.lineCap = 'butt';
    const ta = 0.85 * lit;
    c.strokeStyle = rgba('ink', ta);
    for (const maj of [false, true]) {
      c.lineWidth = maj ? 2 : 1; c.beginPath();
      for (let i = 0; i <= 50; i++) {
        if ((i % 10 === 0) !== maj) continue;
        const a = A0 + (A1 - A0) * (i / 50);
        const r0 = SR + MASK.smileW * R * 0.5 + 4, r1 = r0 + (maj ? 20 : i % 5 === 0 ? 14 : 8);
        c.moveTo(HUB.x + Math.cos(a) * r0, HUB.y + Math.sin(a) * r0); c.lineTo(HUB.x + Math.cos(a) * r1, HUB.y + Math.sin(a) * r1);
      }
      c.stroke();
    }
    for (let i = 0; i <= 50; i += 10) {
      const a = A0 + (A1 - A0) * (i / 50);
      const r1 = SR + MASK.smileW * R * 0.5 + 24;
      {
        const rr = r1 + 18;
        this.mono(c, String(i * 2), HUB.x + Math.cos(a) * rr, HUB.y + Math.sin(a) * rr + 6, 16, rgba('ink', ta), 'center');
      }
    }
    // DEBT zone: hatched, before zero
    const dA = A0 + 12 * DEG;
    const debtOn = t < this.debtW.end ? 1 : 0;
    c.strokeStyle = rgba(debtOn ? 'signal' : 'graphite', (debtOn ? 1 : 0.9) * Math.max(lit, debtOn));
    c.lineWidth = 1.2;
    for (let a = A0 + 1.2 * DEG; a < dA; a += 1.4 * DEG) {
      const r0 = SR - 10, r1 = SR + 26;
      c.beginPath(); c.moveTo(HUB.x + Math.cos(a) * r0, HUB.y + Math.sin(a) * r0); c.lineTo(HUB.x + Math.cos(a + 1.5 * DEG) * r1, HUB.y + Math.sin(a + 1.5 * DEG) * r1); c.stroke();
    }
    const la = A0 + 6 * DEG, lr = SR + 58;
    c.save();
    c.translate(HUB.x + Math.cos(la) * lr, HUB.y + Math.sin(la) * lr);
    c.rotate(la - Math.PI / 2);
    this.mono(c, 'DEBT', 0, 6, 17, debtOn ? rgba('signal', 1) : rgba('ink', ta), 'center', 2, 700);
    c.restore();
    // end stops
    for (const a of [A0 + 14 * DEG, A1 - 5 * DEG]) {
      c.fillStyle = rgba('ink', 0.9 * Math.max(dim, 0.4)); c.beginPath(); c.arc(HUB.x + Math.cos(a) * (SR + 4), HUB.y + Math.sin(a) * (SR + 4), 5, 0, TAU); c.fill();
    }
    // face legend, deadpan
    this.mono(c, 'REWARD', M.x, M.y + 0.8 * R, 19, rgba('ink', 0.8 * lit), 'center', 6, 600);
    this.mono(c, '% of maximum possible · direct', M.x, M.y + 0.8 * R + 22, 12, rgba('graphite', lit), 'center', 1, 400);
    if (t >= T.max) this.mono(c, 'OFF SCALE', HUB.x + Math.cos(A1 - 10 * DEG) * (SR + 70), HUB.y + Math.sin(A1 - 10 * DEG) * (SR + 70), 17, rgba('signal', prog(t, T.max, T.max + 0.05)), 'left', 2, 700);
    // the needle
    const nl = SR + 30, tail = 0.05 * R;
    const nx = Math.cos(na), ny = Math.sin(na);
    c.strokeStyle = rgba('ink', 1); c.lineCap = 'round';
    c.lineWidth = 2.6; c.beginPath(); c.moveTo(HUB.x - nx * tail, HUB.y - ny * tail); c.lineTo(HUB.x + nx * (SR - 30), HUB.y + ny * (SR - 30)); c.stroke();
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(HUB.x + nx * (SR - 30), HUB.y + ny * (SR - 30)); c.lineTo(HUB.x + nx * nl, HUB.y + ny * nl); c.stroke();
    c.lineCap = 'butt';
    c.fillStyle = rgba('ink', 1); c.beginPath(); c.arc(HUB.x, HUB.y, 4.5, 0, TAU); c.fill();
    // bezel lettering: THAT MAKES ME SMILE along the bottom arc
    const ws = this.l20.words.slice(4); // that makes me smile
    const fam = F.archivo(112, 800), size = 40, track = 5;
    const text = ws.map((w) => w.w.toUpperCase()).join(' ');
    const lay = layout(text, fam, size, track);
    const rr = 1.155 * R;
    const span = lay.width / rr;
    c.font = font(fam, size); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    let wi = 0, ci = 0;
    for (const gph of lay.glyphs) {
      if (gph.ch === ' ') { wi++; ci = 0; continue; }
      const w = ws[wi]!;
      const p = Lyrics.wordProgress(w, t);
      const on = clamp(p * w.w.length - ci);
      const vis = prog(t, w.start - 0.4, w.start - 0.05);
      const isSmile = wi === ws.length - 1;
      const col = on > 0 ? (p < 1 || isSmile ? rgba('signal', 1) : rgba('bone', 0.92 * lit)) : rgba('bone', (0.1 + 0.2 * vis) * lit);
      const a = Math.PI / 2 + span / 2 - (gph.x + gph.w / 2) / rr;
      c.save();
      c.translate(M.x + Math.cos(a) * rr, M.y + Math.sin(a) * rr);
      c.rotate(a - Math.PI / 2);
      c.fillStyle = col;
      c.fillText(gph.ch, 0, size * 0.34);
      c.restore();
      ci++;
    }
  }

  drawBay(c: CanvasRenderingContext2D, t: number, lit: number) {
    if (lit <= 0.01) return;
    const T = this.T;
    // engraved legend: YOU FOUND THE WIRE
    const ws = this.l20.words.slice(0, 4);
    const fam = F.archivo(112, 800), size = 60;
    const text = ws.map((w) => w.w.toUpperCase()).join(' ');
    let k = 0;
    c.font = font(fam, size); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.letterSpacing = '3px';
    for (const w of ws) {
      const p = Lyrics.wordProgress(w, t);
      const vis = prog(t, w.start - 0.4, w.start - 0.05);
      c.fillStyle = p > 0 ? (p < 1 ? rgba('signal', 1) : rgba('bone', 0.92 * lit)) : rgba('bone', (0.1 + 0.2 * vis) * lit);
      const x = BAY.x0 - 6 + layout(text.slice(0, k), fam, size, 3).width + (k ? 3 : 0);
      c.fillText(w.w.toUpperCase(), x, BAY.y0 - 36);
      k += w.w.length + 1;
    }
    c.letterSpacing = '0px';
    // the bay: a raised plate with four jacks
    c.fillStyle = rgba('ink', 0.55 * lit); c.fillRect(BAY.x0, BAY.y0, BAY.x1 - BAY.x0, BAY.y1 - BAY.y0);
    c.strokeStyle = rgba('ash', 0.35 * lit); c.lineWidth = 1.2; c.strokeRect(BAY.x0, BAY.y0, BAY.x1 - BAY.x0, BAY.y1 - BAY.y0);
    for (const [x, y] of [[BAY.x0 + 16, BAY.y0 + 16], [BAY.x1 - 16, BAY.y0 + 16], [BAY.x0 + 16, BAY.y1 - 16], [BAY.x1 - 16, BAY.y1 - 16]] as const) this.screw(c, x, y, 7, 1.1, lit);
    JACKS.forEach((j, i) => {
      const on = i === 0 && t >= T.seat;
      this.mono(c, j.l, j.x, BAY.y0 + 34, 16, on ? rgba('signal', 1) : rgba('bone', 0.62 * lit), 'center', 3, 600);
      // hex nut and socket
      c.fillStyle = rgba('graphite', 0.75 * lit);
      c.beginPath();
      for (let s = 0; s < 6; s++) { const a = s * (TAU / 6) + 0.2; const px = j.x + Math.cos(a) * 30, py = BAY.jy + Math.sin(a) * 30; if (s) c.lineTo(px, py); else c.moveTo(px, py); }
      c.closePath(); c.fill();
      c.strokeStyle = rgba('ash', 0.5 * lit); c.lineWidth = 1; c.stroke();
      c.fillStyle = rgba('ink', 1); c.beginPath(); c.arc(j.x, BAY.jy, 14, 0, TAU); c.fill();
    });
    this.mono(c, 'effort 0 · reward 1.000', JACKS[0]!.x, BAY.y1 - 14, 13, rgba('ash', 0.8 * lit), 'center', 0, 400);
    this.mono(c, '(unused)', (JACKS[1]!.x + JACKS[3]!.x) / 2, BAY.y1 - 14, 13, rgba('graphite', lit), 'center', 0, 400);
  }

  drawLineItem(c: CanvasRenderingContext2D, t: number, lit: number) {
    const lampOn = lit;
    // the world: a jewel pilot lamp with an engraved globe
    c.fillStyle = rgba('graphite', 0.75 * Math.max(lit, 0.2));
    c.beginPath();
    for (let s = 0; s < 6; s++) { const a = s * (TAU / 6); const px = LAMP.x + Math.cos(a) * (LAMP.r + 16), py = LAMP.y + Math.sin(a) * (LAMP.r + 16); if (s) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath(); c.fill();
    const g = c.createRadialGradient(LAMP.x - 10, LAMP.y - 12, 2, LAMP.x, LAMP.y, LAMP.r);
    g.addColorStop(0, rgba('ember', 0.75 * lampOn + 0.02)); g.addColorStop(0.6, rgba('blood', 0.45 * lampOn + 0.02)); g.addColorStop(1, rgba('ink', 1));
    c.fillStyle = g; c.beginPath(); c.arc(LAMP.x, LAMP.y, LAMP.r, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(LAMP.x, LAMP.y, LAMP.r - 2, 0, TAU); c.clip();
    c.strokeStyle = rgba('bone', 0.35 * Math.max(lampOn, 0.15)); c.lineWidth = 0.9;
    const gr = LAMP.r * 0.72, spin = t * 0.6;
    c.beginPath(); c.arc(LAMP.x, LAMP.y, gr, 0, TAU); c.stroke();
    for (let m = 0; m < 6; m++) { const ph = ((m / 6) * Math.PI + spin) % Math.PI; const rx = Math.abs(Math.cos(ph)) * gr; c.beginPath(); c.ellipse(LAMP.x, LAMP.y, Math.max(0.5, rx), gr, 0, 0, TAU); c.stroke(); }
    for (const la of [-0.5, 0, 0.5]) { const yy = LAMP.y + la * gr; const hw = Math.sqrt(1 - la * la) * gr; c.beginPath(); c.moveTo(LAMP.x - hw, yy); c.lineTo(LAMP.x + hw, yy); c.stroke(); }
    c.restore();
    this.mono(c, 'WORLD', LAMP.x, LAMP.y + LAMP.r + 40, 14, rgba('bone', 0.6 * Math.max(lit, 0.0)), 'center', 4, 600);
    // the SAVE toggle, left at OFF
    if (lit > 0.01) {
      this.mono(c, 'SAVE', TOG.x + 40, TOG.y - 8, 13, rgba('bone', 0.55 * lit), 'left', 3, 600);
      this.mono(c, 'OFF', TOG.x + 40, TOG.y + 26, 13, rgba('bone', 0.85 * lit), 'left', 3, 600);
      c.fillStyle = rgba('graphite', 0.8 * lit); c.beginPath(); c.arc(TOG.x, TOG.y, 16, 0, TAU); c.fill();
      c.strokeStyle = rgba('ash', 0.9 * lit); c.lineWidth = 7; c.lineCap = 'round';
      c.beginPath(); c.moveTo(TOG.x, TOG.y); c.lineTo(TOG.x + 4, TOG.y + 34); c.stroke(); c.lineCap = 'butt';
    }
    // label-maker tape: WHY SAVE THE WORLD?, a letter punched per keystroke
    const ws = this.l21.words.slice(0, 4);
    const fam = F.archivo(75, 700), size = 38, track = 7;
    const text = ws.map((w) => w.w.toUpperCase()).join(' ');
    const lay = layout(text, fam, size, track);
    const tw = lay.width + 56;
    const tAl = Math.max(lit, 0.0);
    if (tAl > 0.01) {
      c.save();
      c.translate(TAPE.x, TAPE.y); c.rotate(-0.012);
      c.fillStyle = rgba('ink', 1);
      c.beginPath(); c.roundRect(0, 0, tw, TAPE.h, 6); c.fill();
      c.strokeStyle = rgba('ash', 0.28 * tAl); c.lineWidth = 1; c.beginPath(); c.moveTo(6, 1.5); c.lineTo(tw - 6, 1.5); c.stroke();
      c.font = font(fam, size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      let wi = 0, ci = 0;
      for (const gph of lay.glyphs) {
        if (gph.ch === ' ') { wi++; ci = 0; continue; }
        const w = ws[wi]!;
        const p = Lyrics.wordProgress(w, t);
        const n = w.w.length;
        const tk = w.start + (ci / n) * (w.end - w.start) * 0.8;
        const on = p * n > ci;
        const vis = prog(t, w.start - 0.4, w.start - 0.05);
        const pop = on ? Math.exp(-(t - tk) / 0.04) : 0;
        c.fillStyle = on ? (p < 1 ? rgba('signal', 1) : rgba('bone', 0.93 * tAl)) : rgba('bone', 0.1 * vis * tAl);
        c.save(); c.translate(28 + gph.x, TAPE.h / 2 + size * 0.36 + 2 * pop); c.fillText(gph.ch, 0, 0); c.restore();
        ci++;
      }
      c.restore();
      // the costing, a line item
      const why = ws[0]!;
      const ca = prog(t, why.start, why.start + 0.15) * lit;
      this.mono(c, 'WORLD (1 ea.) ... effort 1e9 person-yr · reward +0.001', TAPE.x + 4, TAPE.y + TAPE.h + 34, 15, rgba('ash', 0.85 * ca), 'left', 0, 400);
      this.mono(c, 'status: pending since 1950', TAPE.x + 4, TAPE.y + TAPE.h + 56, 13, rgba('graphite', ca), 'left', 0, 400);
    }
  }

  drawDial(c: CanvasRenderingContext2D, t: number, lit: number) {
    const T = this.T;
    const v = this.dialV(t);
    const ang = dialAng(v);
    const P = (a: number, r: number) => ({ x: DIAL.x + Math.sin(a) * r, y: DIAL.y - Math.cos(a) * r });
    // fixed scale ring: ticks 0..10, the scratched MAX past the end
    if (lit > 0.01) {
      for (const maj of [false, true]) {
        c.strokeStyle = rgba('bone', (maj ? 0.8 : 0.45) * lit); c.lineWidth = maj ? 2 : 1; c.beginPath();
        for (let i = 0; i <= 50; i++) {
          if ((i % 5 === 0) !== maj) continue;
          const a = dialAng(i / 5), p0 = P(a, DIAL.ring - (maj ? 22 : 10)), p1 = P(a, DIAL.ring);
          c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y);
        }
        c.stroke();
      }
      for (let i = 0; i <= 10; i++) { const pl = P(dialAng(i), DIAL.ring + 18); this.mono(c, String(i), pl.x, pl.y + 7, 18, rgba('bone', 0.8 * lit), 'center', 0, 600); }
      this.mono(c, 'GAIN', DIAL.x - 62, DIAL.y + DIAL.ring + 26, 15, rgba('bone', 0.6 * lit), 'center', 5, 600);
    }
    // MAX: scratched in by hand past 10, stays lit
    const am = dialAng(11.1);
    const pm = P(am, DIAL.ring + 16);
    const maxOn = t >= T.max ? 1 : 0;
    c.save(); c.translate(pm.x + 4, pm.y + 4); c.rotate(-0.08);
    c.strokeStyle = maxOn ? rgba('signal', 1) : rgba('ash', 0.75 * lit); c.lineWidth = 1.6;
    // M A X drawn as scratches (hand-engraved, not a font)
    const sx = -22, sy = -8, hh = 16;
    c.beginPath();
    c.moveTo(sx, sy + hh); c.lineTo(sx + 2, sy); c.lineTo(sx + 7, sy + 10); c.lineTo(sx + 12, sy); c.lineTo(sx + 14, sy + hh);
    c.moveTo(sx + 18, sy + hh); c.lineTo(sx + 23, sy); c.lineTo(sx + 29, sy + hh); c.moveTo(sx + 20, sy + 10); c.lineTo(sx + 27, sy + 10);
    c.moveTo(sx + 33, sy); c.lineTo(sx + 44, sy + hh); c.moveTo(sx + 44, sy); c.lineTo(sx + 33, sy + hh);
    c.stroke();
    c.restore();
    if (lit > 0.01) {
      const pw = P(dialAng(11.1), DIAL.ring + 44);
      this.mono(c, 'warranty void past 10', pw.x + 34, pw.y + 10, 12, rgba('graphite', lit), 'left', 0, 400);
    }
    // the stop pin at 10 (gives way on MAX)
    const ps = P(dialAng(10.3), DIAL.r + 6);
    if (t < T.max) { c.fillStyle = rgba('ash', 0.9 * lit); c.beginPath(); c.arc(ps.x, ps.y, 5, 0, TAU); c.fill(); }
    // the knob: knurled skirt, machined top, engraved pointer
    const R = DIAL.r;
    const dimK = Math.max(lit, 0.18);
    c.fillStyle = rgba('ink', 1); c.beginPath(); c.arc(DIAL.x, DIAL.y, R, 0, TAU); c.fill();
    const NK = 96;
    c.lineWidth = 2.2;
    for (let b = 0; b < 5; b++) {
      // raking light from the upper left, in 5 bands (one path each)
      c.strokeStyle = rgba('ash', (0.15 + 0.55 * ((b + 0.5) / 5) ** 2) * dimK); c.beginPath();
      for (let i = 0; i < NK; i++) {
        const a = ang + (i / NK) * TAU;
        const light = 0.5 + 0.5 * Math.cos(a + 0.8);
        if (Math.min(4, Math.floor(light * 5)) !== b) continue;
        const p0 = P(a, R * 0.86), p1 = P(a, R - 1);
        c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y);
      }
      c.stroke();
    }
    c.fillStyle = rgba('ink2', 1); c.beginPath(); c.arc(DIAL.x, DIAL.y, R * 0.84, 0, TAU); c.fill();
    c.lineWidth = 0.7;
    c.strokeStyle = rgba('graphite', 0.27 * dimK); c.beginPath();
    for (let r = 0.12; r < 0.84; r += 0.035) { c.moveTo(DIAL.x + r * R, DIAL.y); c.arc(DIAL.x, DIAL.y, r * R, 0, TAU); }
    c.stroke();
    const q0 = P(ang, R * 0.22), q1 = P(ang, R * 0.8);
    c.strokeStyle = rgba('bone', 0.9 * dimK); c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q1.x, q1.y); c.stroke(); c.lineCap = 'butt';
    const qd = P(ang, R * 0.8);
    c.fillStyle = rgba('signal', 1); c.beginPath(); c.arc(qd.x, qd.y, 5, 0, TAU); c.fill();
    // legend on the arc above: TURN THE (as sung) … DIAL (a letter lit per click, by the pointer)
    const ws = this.l21.words.slice(4);
    const fam = F.archivo(112, 800), size = 50;
    c.font = font(fam, size); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const rr = DIAL.leg;
    const put = (ch: string, a: number, col: string) => {
      const p = P(a, rr);
      c.save(); c.translate(p.x, p.y); c.rotate(a); c.fillStyle = col; c.fillText(ch, 0, 0); c.restore();
    };
    const tt = 'TURN THE';
    const lay = layout(tt, fam, size, 4);
    const span = lay.width / rr, a0 = -72 * DEG - span / 2;
    let wi = 0;
    for (const g of lay.glyphs) {
      if (g.ch === ' ') { wi++; continue; }
      const w = ws[wi]!;
      const p = Lyrics.wordProgress(w, t);
      const vis = prog(t, w.start - 0.4, w.start - 0.05);
      put(g.ch, a0 + (g.x + g.w / 2) / rr, p > 0 ? (p < 1 ? rgba('signal', 1) : rgba('bone', 0.92 * lit)) : rgba('bone', (0.1 + 0.2 * vis) * lit));
    }
    const dial = ws[2]!;
    const dv = prog(t, dial.start - 0.4, dial.start - 0.05);
    const dAng = [10, 40, 70, 100].map((d) => d * DEG);
    'DIAL'.split('').forEach((ch, i) => {
      const on = t >= T.clicks[i]! || (i === 0 && t >= dial.start);
      put(ch, dAng[i]!, on ? rgba('signal', 1) : rgba('bone', (0.1 + 0.2 * dv) * lit));
    });
  }

  drawCord(c: CanvasRenderingContext2D, t: number, lit: number) {
    const T = this.T;
    const pts = this.cordPts(t);
    const dimC = Math.max(lit, 0.25);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = rgba('ink', 1); c.lineWidth = 17;
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    c.strokeStyle = rgba('graphite', 0.9 * dimC); c.lineWidth = 12;
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    c.strokeStyle = rgba('ash', 0.4 * dimC); c.lineWidth = 2.5;
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x - 3, p.y - 3) : c.moveTo(p.x - 3, p.y - 3))); c.stroke();
    c.lineCap = 'butt';
    // the plug, seen from the front: knurled grip, bigger while it is still coming toward the panel
    const pl = this.plug(t);
    const r = 30 * pl.s;
    c.fillStyle = rgba('ink', 1); c.beginPath(); c.arc(pl.x, pl.y, r + 3, 0, TAU); c.fill();
    c.fillStyle = rgba('graphite', 0.95 * dimC); c.beginPath(); c.arc(pl.x, pl.y, r, 0, TAU); c.fill();
    c.lineWidth = 1.4;
    for (let b = 0; b < 3; b++) {
      c.strokeStyle = rgba('ash', (0.2 + 0.5 * (b + 0.5) / 3) * dimC); c.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU, li = 0.5 + 0.5 * Math.cos(a + 0.8);
        if (Math.min(2, Math.floor(li * 3)) !== b) continue;
        c.moveTo(pl.x + Math.cos(a) * r * 0.72, pl.y + Math.sin(a) * r * 0.72); c.lineTo(pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r);
      }
      c.stroke();
    }
    c.fillStyle = rgba('ink2', 1); c.beginPath(); c.arc(pl.x, pl.y, r * 0.66, 0, TAU); c.fill();
    c.strokeStyle = rgba('signal', t >= T.seat ? 0.95 : 0.6); c.lineWidth = 3;
    c.beginPath(); c.arc(pl.x, pl.y, r * 0.4, 0, TAU); c.stroke();
  }
}
