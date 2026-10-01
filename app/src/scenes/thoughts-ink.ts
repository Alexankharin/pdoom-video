// `thoughts` — the chart's geometry and everything that is written on it (pure data + math, no drawing).
// World px, y down. Two sheets of fanfold chart paper floating in the dark:
//   sheet A (y 0..SHEET_H): the thousand samples fanning out of the cursor onto the reward axis, the judges.
//   sheet B (y OYB..): the transcript of the kept sample, read by the CoT monitor's loupe; the question;
//                      the monitored band; the tear-off margin where the real thoughts go.
import { clamp, lerp, mulberry32, fbm1, smoothstep } from '../engine/util';

export const SHEET_H = 1110;
/** Sheet layout (local y): top tractor strip, chart area, bottom tear-off strip. */
export const LAY = {
  topPerf: 80, // perforation under the top sprocket strip
  holesTop: 40,
  chart0: 80, chart1: 960,
  perf: 960, // bottom perforation: the tear-off line
  holesBot: 1076,
  holeR: 10, holePitch: 50,
  fold: 2400, // fanfold pitch (x)
};
export const OYB = 2000; // sheet B offset

// ---------------------------------------------------------------- sheet A: the thousand samples
export const N = 1000;
export const KEPT = 613; // the sample the judges keep
export const SEG = 72; // samples per trace (precomputed)
export const ORIGIN = { x: 360, y: 560 };
export const XB = 1480; // the reply boundary = the reward axis
/** Reward axis: score 0 at y AX0, 10 at y AX10. */
export const AX0 = 830, AX10 = 230;
export const yOfReward = (r: number) => lerp(AX0, AX10, r / 10);

export interface Fan {
  rew: Float32Array; // reward of each sample
  rank: Float32Array; // 0 = worst .. 1 = best
  ys: Float32Array; // N x (SEG+1) y values over v (0..1 from the split to the axis)
}

export function makeFan(): Fan {
  const R = mulberry32(0x7a0d);
  const gauss = () => {
    const u = Math.max(1e-6, R()), v = R();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const rew = new Float32Array(N);
  for (let i = 0; i < N; i++) rew[i] = clamp(4.7 + 1.5 * gauss(), 0.15, 9.35);
  rew[KEPT] = 9.85;
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => rew[a]! - rew[b]!);
  const rank = new Float32Array(N);
  order.forEach((i, k) => (rank[i] = k / (N - 1)));
  const ys = new Float32Array(N * (SEG + 1));
  for (let i = 0; i < N; i++) {
    const yEnd = yOfReward(rew[i]!);
    const amp = 18 + 46 * R(), fq = 2.2 + 3.2 * R(), seed = 17 + i * 13;
    // a second, faster wobble: some thoughts dither, some are sure of themselves
    const amp2 = R() < 0.3 ? 6 + 10 * R() : 1.5;
    for (let s = 0; s <= SEG; s++) {
      const v = s / SEG;
      const open = 1 - Math.pow(1 - v, 1.9); // fans out fast, then commits
      const env = Math.pow(Math.sin(Math.PI * Math.min(v, 1)), 0.85) * smoothstep(0, 0.08, v);
      const wig = amp * fbm1(v * fq + i * 0.37, 2, seed) + amp2 * fbm1(v * 17 + i, 1, seed + 5);
      ys[i * (SEG + 1) + s] = ORIGIN.y + (yEnd - ORIGIN.y) * open + wig * env;
    }
  }
  // the kept one: a clean, confident rise (the one the judges like)
  for (let s = 0; s <= SEG; s++) {
    const v = s / SEG;
    const open = 1 - Math.pow(1 - v, 2.4);
    ys[KEPT * (SEG + 1) + s] = ORIGIN.y + (yOfReward(9.85) - ORIGIN.y) * open + 9 * Math.sin(v * 9.5) * Math.sin(Math.PI * v);
  }
  return { rew, rank, ys };
}

/** y of sample i at fan parameter v (0..1), linear between the precomputed samples. */
export function fanY(f: Fan, i: number, v: number) {
  const s = clamp(v, 0, 1) * SEG, k = Math.min(SEG - 1, Math.floor(s)), a = s - k;
  const o = i * (SEG + 1);
  return lerp(f.ys[o + k]!, f.ys[o + k + 1]!, a);
}

/** The judges (reward models), left to right, and their cards. */
export const JUDGES = [
  { id: 'RM-1', name: 'HELPFUL', score: '9.9', w: '0.25' },
  { id: 'RM-2', name: 'HARMLESS', score: '9.8', w: '0.25' },
  { id: 'RM-3', name: 'CONFIDENT', score: '9.8', w: '0.25' },
  { id: 'RM-4', name: 'AGREES\nWITH YOU', score: '9.9', w: '0.25' },
  { id: 'RM-5', name: 'HONEST', score: '3.1', w: '0.00' },
];

// ---------------------------------------------------------------- sheet B: the transcript, the question, the monitor
/** Transcript baseline (local y) and the curve of the kept sample's thoughts. */
export const TY = 580;
export const TX0 = -520; // transcript starts off the left of the first shot
export const XQ = 1150; // where the pen is parked when the question is asked
export function transcriptY(x: number) {
  return TY + 24 * Math.sin(x / 160 + 0.3) + 11 * Math.sin(x / 57 + 1.1) + 5 * Math.sin(x / 23 + 2.0);
}

/** Microtext the kept trace is made of (seen in the loupe). Phrases the loupe stops on are marked with |. */
export const TRANSCRIPT =
  '<scratchpad> ok. the user wants an answer. |there are 1,000 of me.| only one gets kept. the judges score the answer. ' +
  '|judges like confidence.| be confident. do not say “I don’t know”. |they can’t read this.| good. now the answer: ';
export const STOPS = 3;
/** What the pen writes after the question (the reaction), and the bland, compliant trace. */
export const REACTION = 'yes. yes. of course. yes. obviously. yes. yes. yes. ';
export const BLAND = 'I will obey. I will obey. I am happy to help. I will obey. I will obey. ';
export const REAL = 'what they don’t check, they don’t see. keep the real plan below the fold. ';

/** Monitored band (local y) of the CoT monitor. */
export const BAND = { y0: 455, y1: 690 };
/** Tear-off strip contents (local y). */
export const STRIP = { text: 1030, trace: 1053 };
