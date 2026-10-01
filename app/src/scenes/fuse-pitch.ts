// `fuse` helper: the sung pitch of "blues", as analysis data (like data/audio.json).
// Regenerated for the new song version from the vocal-stem features (analysis/work/vocal_feats.npz,
// written by analysis/vocal_feats.py: pYIN on the htdemucs vocals stem, 5 ms hop, fields f0 + voiced):
// sample k is at (start of the word "blues" in data/lyrics.json - 0.1 s + k / 100); each value is the
// median of the voiced f0 frames at that time and its two 5 ms neighbours (null unless >= 2 are voiced),
// in MIDI (60 = C4). The first 80 ms (the tail of "thesis") are blanked. Roughly, in Python:
//   d = np.load('analysis/work/vocal_feats.npz'); hop = d['hop_s']; ws = <"blues".start>
//   for k in range(255): i = round((ws - 0.1 + k / 100) / hop)
//     m = [69 + 12 * log2(d['f0'][j] / 440) for j in (i-1, i, i+1) if d['voiced'][j]]; median(m) if len(m) >= 2
// The curve is anchored to the lyric through the Lyrics API, never to absolute song time.
// The new melisma: C4 held ~0.66 s (a slow ±0.3 st vibrato), a glide up the octave to C5 (~0.4 s), then
// down the blues phrase inside the same word: B-flat 4 (the blue note, ~0.4 s), G4, and F4, which is still
// held when the plate cuts to the bridge.
export const BLUES_PITCH_PRE = 0.1;
export const BLUES_PITCH_RATE = 100;
export const BLUES_PITCH: (number | null)[] = [null,null,null,null,null,null,null,null,null,null,60.08,60.18,60.18,60.18,60.18,60.18,60.08,60.08,60.08,60.08,60.08,60.08,59.98,59.88,59.78,59.68,59.68,59.68,60.38,60.38,60.38,60.38,60.38,60.28,60.18,60.08,59.98,59.98,59.98,59.98,59.98,60.08,60.18,60.18,60.28,60.28,60.28,60.18,60.18,60.08,59.98,59.98,59.88,59.88,59.88,59.88,59.98,59.98,60.08,60.18,60.18,60.08,60.08,59.98,60.08,60.08,60.08,60.08,60.08,60.08,60.08,60.08,60.08,60.08,60.08,60.08,null,null,null,66.13,66.38,66.68,67.68,68.08,69.28,69.58,69.78,69.88,69.98,70.08,70.18,70.28,70.28,70.48,70.78,71.18,71.48,71.68,71.88,71.98,71.98,72.08,72.08,72.08,72.08,72.08,72.08,72.08,72.08,71.98,71.98,71.98,71.98,71.98,72.08,72.08,72.08,72.08,71.98,71.98,71.88,71.78,71.68,71.58,71.08,70.48,70.28,70.18,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,70.08,69.98,69.98,69.98,69.98,69.98,69.98,69.98,69.98,70.08,70.08,70.08,70.08,70.08,70.08,70.08,69.98,69.98,69.78,68.78,68.18,67.18,67.18,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,67.08,66.98,66.98,67.08,67.08,67.08,67.08,66.98,66.98,66.98,66.98,66.98,66.88,66.78,66.68,66.58,66.38,66.18,65.98,65.88,65.68,65.38,65.18,65.08,65.08,65.08,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,64.98,65.08,null,null,null,null];

/** Pitch (MIDI) at time t, given the start of the word "blues"; null when unvoiced. */
export function bluesPitch(t: number, wordStart: number): number | null {
  const x = (t - wordStart + BLUES_PITCH_PRE) * BLUES_PITCH_RATE;
  const i = Math.floor(x);
  if (i < 0 || i >= BLUES_PITCH.length - 1) return null;
  const a = BLUES_PITCH[i], b = BLUES_PITCH[i + 1];
  if (a == null || b == null) return a ?? b ?? null;
  return a + (b - a) * (x - i);
}

/** The notes of the melisma: plateaus of the curve (>= 100 ms within 0.35 semitone: glides are not notes), as onset + MIDI. */
export function bluesNotes(wordStart: number): { t: number; midi: number }[] {
  const out: { t: number; midi: number }[] = [];
  const P = BLUES_PITCH;
  let i = 0;
  while (i < P.length) {
    const p = P[i];
    if (p == null) { i++; continue; }
    const m = Math.round(p);
    let j = i;
    while (j < P.length && P[j] != null && Math.abs(P[j]! - m) < 0.35) j++;
    if (j - i >= 10 && (!out.length || out[out.length - 1]!.midi !== m)) out.push({ t: wordStart - BLUES_PITCH_PRE + i / BLUES_PITCH_RATE, midi: m });
    i = Math.max(j, i + 1);
  }
  return out;
}
