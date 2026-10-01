// FIG. 6 / part "basilisk", movement 2: the acausal promissory note. A black note engraved in
// white line (the eye's own scratchboard idiom): security guilloché, a woven frame, and an oval
// portrait window through which the basilisk keeps watching (the eye pass is rendered into a
// target and shown only inside the oval). World space: px at zoom 1, y UP, note centred at 0.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';

export const DNOTE = { w: 1800, h: 920 };
/** The portrait oval: centre, eye half-width (world px per eye unit), and radii in eye units. */
export const OVAL = { x: -470, y: 10, ew: 160, rx: 1.32, ry: 0.92 };
/** The amount medallion. */
export const MEDAL = { x: 640, y: -262, r: 118 };

const DEBT_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom, uT, uNoteA, uHot, uDark;
uniform vec4 uOval;   // cx, cy, rx, ry (world px)
uniform vec3 uMedal;  // x, y, r
uniform vec2 uNote;   // w, h
uniform sampler2D uEye;

vec2 worldAt(vec2 fc) { return uCam + (fc - 0.5 * uRes) / uZoom; }
float lineAA(float d, float w) { float aa = 0.75 / uZoom; return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d)); }

// K guilloché curves r = R + a sin(n th + ph_k) around the origin of m
float rosette(vec2 m, float R, float a, float n, float K, float w, float twist) {
  float r = length(m), th = atan(m.y, m.x);
  float ink = 0.0;
  for (int k = 0; k < 16; k++) {
    if (float(k) >= K) break;
    float ph = float(k) * TAU / K + twist;
    float rk = R + a * sin(n * th + ph);
    float slope = a * n * cos(n * th + ph) / max(r, 1.0);
    ink = max(ink, lineAA((r - rk) / sqrt(1.0 + slope * slope), w));
  }
  return ink;
}

void main() {
  vec2 fc = FRAG_PX;
  vec2 w = worldAt(fc);
  float px = 1.0 / uZoom;
  // ---- black paper, faint fibres
  float fib = snoise(w * vec2(0.004, 0.03)) * 0.5 + snoise(w * 0.021) * 0.5;
  vec3 paper = C_INK2 * (0.85 + 0.12 * fib);
  float ink = 0.0; // white-line coverage
  // security guilloché: two interlaced sine families, hair-fine
  float g1 = hatch((w.y + 20.0 * sin(w.x * 0.012) + 6.0 * sin(w.x * 0.041 + 1.3)) / 10.0, 0.06);
  float g2 = hatch((w.y - 20.0 * sin(w.x * 0.012 + 2.1) - 6.0 * sin(w.x * 0.033)) / 10.0, 0.06);
  ink += (g1 + g2) * 0.10;

  // ---- frame and woven band
  vec2 hs = uNote * 0.5;
  float dBox = sdBox(w, hs - 40.0) - 40.0;
  float inNote = 1.0 - smoothstep(-px, px, dBox);
  float frame = lineAA(dBox, 2.2) + lineAA(dBox + 16.0, 1.1) + lineAA(dBox + 62.0, 1.1) + lineAA(dBox + 70.0, 2.0);
  float band = step(-62.0, dBox) * step(dBox, -16.0);
  float along = (abs(w.x) / hs.x > abs(w.y) / hs.y) ? w.y : w.x;
  float bw = dBox + 39.0;
  float weave = max(lineAA(bw - 14.0 * sin(along * 0.07), 1.0), lineAA(bw + 14.0 * sin(along * 0.07), 1.0));
  weave = max(weave, max(lineAA(bw - 9.0 * sin(along * 0.14 + 1.0), 0.8), lineAA(bw + 9.0 * sin(along * 0.14 + 1.0), 0.8)));
  ink += (frame + band * weave) * 0.75;

  // ---- lathe-work field radiating from the portrait: the eye's sight lines
  vec2 oq = w - uOval.xy;
  vec2 oe = oq * vec2(1.0, uOval.z / uOval.w); // oval -> circle of radius rx
  float orr = length(oe), oth = atan(oe.y, oe.x);
  float field = hatch(oth * 180.0 / TAU + 0.8 * sin(orr * 0.02), 0.05 + 0.05 * smoothstep(900.0, 250.0, orr));
  ink += field * 0.22 * inNote * smoothstep(-62.0, -120.0, dBox) * smoothstep(uOval.z * 1.45, uOval.z * 1.7, orr);

  // ---- rosettes around the oval
  float rx = uOval.z;
  if (orr > rx * 1.0 && orr < rx * 1.6) {
    float ro = rosette(oe, rx * 1.16, rx * 0.055, 40.0, 10.0, 1.1, 0.0);
    ro = max(ro, rosette(oe, rx * 1.38, rx * 0.1, 20.0, 12.0, 1.1, 0.4));
    ro = max(ro, rosette(oe, rx * 1.38, rx * 0.1, -20.0, 6.0, 0.9, 0.2));
    ink += ro * 0.8 * smoothstep(rx * 1.03, rx * 1.07, orr) * smoothstep(rx * 1.6, rx * 1.5, orr);
  }
  ink += lineAA(orr - rx * 1.04, 1.6) + lineAA(orr - rx * 1.53, 1.2);

  // ---- the amount medallion
  vec2 mq = w - uMedal.xy;
  float mr = length(mq);
  float R = uMedal.z;
  if (mr < R * 1.5) {
    float ro = rosette(mq, R * 1.2, R * 0.09, 30.0, 12.0, 1.0, 0.0);
    ro = max(ro, rosette(mq, R * 1.2, R * 0.09, -30.0, 12.0, 1.0, 0.0));
    ink += ro * 0.75 * smoothstep(R * 1.03, R * 1.07, mr) * smoothstep(R * 1.45, R * 1.35, mr);
    ink += lineAA(mr - R, 1.6) + lineAA(mr - R * 1.42, 1.1);
  }

  vec3 col = mix(paper, C_BONE * 0.62, sat(ink) * inNote);
  col = mix(C_INK, col, inNote);
  // the debt comes due: the rosettes heat up
  col += C_SIGNAL * uHot * sat(ink) * inNote * 0.9;
  col *= 1.0 - 0.75 * uDark;

  // ---- portrait window: the eye, through the oval
  vec3 eye = texture(uEye, fc / uRes).rgb;
  float inOval = 1.0 - smoothstep(-px * 1.5, px * 1.5, orr - rx);
  vec3 c = mix(col, eye, max(inOval, 1.0 - uNoteA));
  fragColor = vec4(c, 1.0);
}`;

export function makeDebtPass() {
  return new FSPass(DEBT_FRAG, {
    uRes: { value: new THREE.Vector2(1920, 1080) }, uCam: { value: new THREE.Vector2() }, uZoom: { value: 1 },
    uT: { value: 0 }, uNoteA: { value: 1 }, uHot: { value: 0 }, uDark: { value: 0 },
    uOval: { value: new THREE.Vector4(OVAL.x, OVAL.y, OVAL.ew * OVAL.rx, OVAL.ew * OVAL.ry) },
    uMedal: { value: new THREE.Vector3(MEDAL.x, MEDAL.y, MEDAL.r) },
    uNote: { value: new THREE.Vector2(DNOTE.w, DNOTE.h) },
    uEye: { value: null },
  });
}
