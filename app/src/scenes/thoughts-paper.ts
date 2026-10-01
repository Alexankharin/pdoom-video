// `thoughts` — the chart paper: fanfold recorder paper (bone, graphite grid, tractor-feed sprocket strips,
// perforations, fold creases) floating in the dark, drawn by one fullscreen pass through the plate's camera.
// Sheet B's bottom strip can be torn off along its perforation and dropped (see stripMap).
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { LAY, OYB, SHEET_H, BAND } from './thoughts-ink';

export interface Cam { x: number; y: number; z: number; r: number }
export interface Tear { xa: number; xb: number; front: number; fall: number; rot: number; on: number }

/** Gap opened by the tear at x while the front is at `front` (world px). */
const shearAt = (x: number, front: number) => Math.min(22, Math.max(0, front - x) * 0.035);

/** Forward map of a point on sheet B's tear-off strip (world) to where it is now. */
export function stripMap(x: number, y: number, T: Tear): { x: number; y: number; a: number } {
  if (T.on <= 0) return { x, y, a: 0 };
  let py = y + shearAt(x, T.front), px = x;
  const pvx = T.xb, pvy = OYB + LAY.perf;
  const c = Math.cos(T.rot), s = Math.sin(T.rot);
  const dx = px - pvx, dy = py - pvy;
  px = pvx + c * dx - s * dy; py = pvy + s * dx + c * dy + T.fall;
  // tangent tilt from the shear + the rotation (for glyphs riding on the strip)
  const g = T.front - x;
  const sl = g > 0 && g * 0.035 < 22 ? -0.035 : 0; // d(shear)/dx
  return { x: px, y: py, a: Math.atan(sl) + T.rot };
}

const FRAG = /* glsl */ `
uniform vec4 uCam;      // centre x, y, zoom, rot
uniform vec4 uTear;     // xa, xb, front, on
uniform vec2 uFall;     // drop, rotation
uniform vec4 uBand;     // x0, x1, alpha, hatch phase
uniform float uLift;    // paper exposure

const float FOLD = ${LAY.fold.toFixed(1)};
const float SH = ${SHEET_H.toFixed(1)};
const float OYB = ${OYB.toFixed(1)};

vec2 toWorld(vec2 s) {
  vec2 d = (s - vec2(960.0, 540.0)) / uCam.z;
  float c = cos(uCam.w), sn = sin(uCam.w);
  return uCam.xy + vec2(c * d.x + sn * d.y, -sn * d.x + c * d.y);
}

// the torn edge (shared by the sheet and the strip): perforation teeth + a little fibre
float tearEdge(float x) {
  return ${LAY.perf.toFixed(1)} + 1.3 * abs(sin(x * 3.14159 / 9.0)) + 1.6 * snoise(vec2(x * 0.05, 3.1));
}

float shearAt(float x, float front) { return min(22.0, max(0.0, front - x) * 0.035); }

// paper at local sheet coords q (x world, y local 0..SH). Returns colour; a = 0 inside holes.
vec4 paper(vec2 q, float z, bool sheetB) {
  float px = 1.0 / z;                       // one screen px in world units
  // fibre + tone
  float fib = snoise(q * vec2(0.021, 0.09)) * 0.5 + snoise(q * 0.31) * 0.25 + snoise(q * 1.7) * 0.12;
  vec3 col = C_BONE * (0.965 + 0.022 * fib);
  // fanfold panels: alternate mountain / valley, lit from the upper left
  float fx = q.x / FOLD;
  float k = floor(fx), f = fract(fx);
  float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
  col *= 1.0 + 0.028 * dir * (f - 0.5) * 2.0 - 0.045 * exp(-min(f, 1.0 - f) * FOLD / 30.0);
  // grid in the chart area
  float inChart = step(${LAY.chart0.toFixed(1)}, q.y) * step(q.y, ${LAY.chart1.toFixed(1)});
  if (inChart > 0.0) {
    vec2 g1 = abs(q - 20.0 * floor(q / 20.0 + 0.5)) * z;
    vec2 g5 = abs(q - 100.0 * floor(q / 100.0 + 0.5)) * z;
    float minor = max(pxLine(g1.x, 0.15, 0.95), pxLine(g1.y, 0.15, 0.95));
    float major = max(pxLine(g5.x, 0.35, 1.25), pxLine(g5.y, 0.35, 1.25));
    col = mix(col, C_GRAPHITE, 0.10 * minor * smoothstep(0.35, 0.7, z));
    col = mix(col, C_GRAPHITE, 0.30 * major);
    // monitored band (sheet B)
    if (sheetB && uBand.z > 0.0 && q.x > uBand.x && q.x < uBand.y && q.y > ${BAND.y0.toFixed(1)} && q.y < ${BAND.y1.toFixed(1)}) {
      float h = abs(fract((q.x + q.y + uBand.w) / 16.0) - 0.5) * 16.0 * z;
      col = mix(col, C_GRAPHITE, uBand.z * (0.07 + 0.10 * pxLine(h, 0.3, 1.1)));
    }
  }
  // chart borders
  float bl = min(abs(q.y - ${LAY.chart0.toFixed(1)}), abs(q.y - ${LAY.chart1.toFixed(1)})) * z;
  col = mix(col, C_INK, 0.55 * pxLine(bl, 0.5, 1.4));
  // perforation dashes (top strip) and the fold perforations
  float dash = step(fract(q.x / 9.0), 0.55);
  float pt = abs(q.y - ${LAY.topPerf.toFixed(1)} + 6.0) * z;
  col = mix(col, C_GRAPHITE, 0.5 * dash * pxLine(pt, 0.3, 1.0));
  float fl = abs(q.x - FOLD * floor(q.x / FOLD + 0.5)) * z;
  col = mix(col, C_GRAPHITE, 0.45 * step(fract(q.y / 9.0), 0.55) * pxLine(fl, 0.3, 1.0));
  // sprocket holes: through the paper
  float hx = q.x - ${LAY.holePitch.toFixed(1)} * floor(q.x / ${LAY.holePitch.toFixed(1)} + 0.5);
  float dT = length(vec2(hx, q.y - ${LAY.holesTop.toFixed(1)})) - ${LAY.holeR.toFixed(1)};
  float dB = length(vec2(hx, q.y - ${LAY.holesBot.toFixed(1)})) - ${LAY.holeR.toFixed(1)};
  float dh = min(dT, dB);
  float a = smoothstep(-0.6 * px, 0.6 * px, dh);
  col *= 1.0 - 0.18 * exp(-max(dh, 0.0) / 2.5);  // a pressed rim
  return vec4(col, a);
}

void main() {
  vec2 s = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 w = toWorld(s);
  float z = uCam.z;
  vec3 col = C_INK;
  float edgeAA = 0.7 / z;
  // sheet A
  if (w.y > -2.0 && w.y < SH + 2.0 && w.y < 1500.0) {
    vec4 p = paper(w, z, false);
    float m = smoothstep(-edgeAA, edgeAA, w.y) * smoothstep(-edgeAA, edgeAA, SH - w.y);
    col = mix(col, p.rgb, p.a * m);
  }
  // sheet B, with its tear-off strip
  if (w.y > OYB - 2.0) {
    vec2 q = vec2(w.x, w.y - OYB);
    bool torn = uTear.w > 0.5 && w.x > uTear.x && w.x < min(uTear.z, uTear.y);
    float e = tearEdge(q.x);
    float lim = torn ? e : SH;
    if (q.y > -2.0 && q.y < lim + 2.0) {
      vec4 p = paper(q, z, true);
      float m = smoothstep(-edgeAA, edgeAA, q.y) * smoothstep(-edgeAA, edgeAA, lim - q.y);
      col = mix(col, p.rgb, p.a * m);
    }
    if (uTear.w > 0.5) {
      // invert the strip's transform: drop, rotation about the tear's end, shear of the opening gap
      vec2 pv = vec2(uTear.y, OYB + ${LAY.perf.toFixed(1)});
      vec2 r = w - vec2(0.0, uFall.x) - pv;
      float c = cos(uFall.y), sn = sin(uFall.y);
      r = vec2(c * r.x + sn * r.y, -sn * r.x + c * r.y) + pv;
      r.y -= shearAt(r.x, uTear.z);
      vec2 sq = vec2(r.x, r.y - OYB);
      if (r.x > uTear.x && r.x < min(uTear.z, uTear.y) && sq.y > tearEdge(sq.x) - 1.0 && sq.y < SH + 1.0) {
        vec4 p = paper(sq, z, true);
        float m = smoothstep(-edgeAA, edgeAA, sq.y - tearEdge(sq.x)) * smoothstep(-edgeAA, edgeAA, SH - sq.y);
        // the falling strip turns away from the light a little
        col = mix(col, p.rgb * (0.97 - 0.25 * abs(uFall.y) * 3.0), p.a * m);
      }
    }
  }
  fragColor = vec4(col * uLift, 1.0);
}
`;

export function makePaperPass() {
  return new FSPass(FRAG, {
    uCam: { value: new THREE.Vector4(0, 0, 1, 0) },
    uTear: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFall: { value: new THREE.Vector2(0, 0) },
    uBand: { value: new THREE.Vector4(0, 0, 0, 0) },
    uLift: { value: 1 },
  });
}
