// `oracle` — the board shader: an ink table, the talking board (dark wood engraved with grain
// hairlines, bone print sampled from the prerendered sheet), lit by the spark in the planchette's
// window, whose lens magnifies the print under it.
export const FRAG_BOARD = /* glsl */ `
uniform sampler2D printTex;
uniform vec3 invA; uniform vec3 invB;   // screen px (y down) -> board px
uniform vec2 bHalf; uniform float bR;
uniform vec2 lampB; uniform float lampI; uniform float ambient;
uniform vec2 winC; uniform float winR; uniform float winMag;
uniform vec2 shadowB;                    // board drop-shadow offset (board px)

float sdRBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float printAt(vec2 b) {
  vec2 uv = vec2((b.x + bHalf.x) / (2.0 * bHalf.x), 1.0 - (b.y + bHalf.y) / (2.0 * bHalf.y));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(printTex, uv).a;
}
void main() {
  vec2 sp = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 b = vec2(dot(invA, vec3(sp, 1.0)), dot(invB, vec3(sp, 1.0)));
  float pxB = length(vec2(invA.x, invB.x)) / PX_SCALE; // board px per physical px

  vec2 dl = b - lampB;
  float r2 = dot(dl, dl);
  float pool = lampI * (0.85 * exp(-r2 / (2.0 * 330.0 * 330.0)) + 0.9 * exp(-r2 / (2.0 * 95.0 * 95.0)));
  float amb = ambient;

  // the table: ink, a faint warm spill
  vec3 table = C_INK * (0.55 + 0.25 * amb) + C_BLOOD * 0.035 * pool;
  float ds = sdRBox(b - shadowB, bHalf, bR);
  table *= mix(0.25, 1.0, smoothstep(-20.0, 70.0, ds));

  // the board: grain hairlines, swelling where lit
  float g = fbm(b * vec2(0.0009, 0.0035) + 3.1, 3);
  float u = (b.y + g * 26.0 + 5.0 * sin(b.x * 0.0021 + g * 2.0)) / 5.0;
  float light = amb * 0.32 + pool;
  float streak = 0.55 + 0.45 * snoise(vec2(b.x * 0.0012, u * 0.35));
  float cov = hatch(u, (0.06 + 0.3 * sat(light)) * streak);
  vec3 wood = C_INK2 * (0.6 + 0.55 * sat(light)) + mix(C_GRAPHITE, C_EMBER, 0.35 * sat(pool)) * cov * (0.05 + 0.32 * sat(light));

  // print; inside the window the lens magnifies it
  float wd = length(b - winC);
  float inWin = 1.0 - smoothstep(winR - pxB, winR + pxB, wd);
  float pr = printAt(b);
  if (inWin > 0.0) {
    vec2 q = winC + (b - winC) / winMag * (1.0 + 0.12 * pow(wd / winR, 2.0));
    pr = mix(pr, printAt(q), inWin);
  }
  float pl = sat(amb * 0.55 + pool * 1.1);
  vec3 ink = C_BONE * (0.06 + 0.9 * amb + 0.62 * sat(pool * 1.1));
  ink = mix(ink, C_EMBER * 1.05, sat(pool * 0.45) * 0.5);
  vec3 bcol = mix(wood, ink, pr * 0.94);
  // glass: slightly brighter and warmer, a curved reflection
  bcol = mix(bcol, bcol * 1.35 + C_SIGNAL * 0.05 * lampI, inWin);
  // bevelled board edge catching the lamp
  float d = sdRBox(b, bHalf, bR);
  float edge = 1.0 - smoothstep(0.0, 2.0 * pxB, abs(d + 3.0));
  bcol += C_BONE * 0.12 * edge * (0.3 + light);
  float inside = 1.0 - smoothstep(-pxB, pxB, d);
  vec3 col = mix(table, bcol, inside);
  fragColor = vec4(col, 1.0);
}`;
