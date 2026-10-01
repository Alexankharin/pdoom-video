// `oracle` — the talking board: layout (board px, origin at the board centre, y down), the printed
// sheet (prerendered once, sampled by the board shader so the lamp lights the print), glyph targets
// for the planchette, and the drawn ornaments (the printer's fist, sun, crescent).
import { SCALE } from '../engine/gl';
import { F, font, layout } from '../engine/type';

export const BOARD = { W: 1640, H: 900, R: 38 } as const;
export const PRINT_SCALE = 1.5 * SCALE; // backing px per board px (the lens magnifies the print)

export interface BGlyph {
  key: string; // 'A'..'Z', '0'..'9', 'YES', 'NO', 'OFF'
  text: string;
  fam: string;
  size: number;
  tracking: number;
  x: number; y: number; // baseline centre
  ang: number;
  cx: number; cy: number; // visual centre (the planchette's target)
}

const CAP = 0.64; // Cormorant cap height / em (approx.)

function arc(chars: string, apexY: number, halfW: number, sag: number, size: number): BGlyph[] {
  const R = (halfW * halfW + sag * sag) / (2 * sag);
  const cy = apexY + R;
  const th = Math.asin(halfW / R);
  const fam = F.serif(600);
  return Array.from(chars).map((ch, i) => {
    const a = -th + (2 * th * i) / (chars.length - 1);
    const x = R * Math.sin(a), y = cy - R * Math.cos(a);
    const h = size * CAP * 0.5;
    return { key: ch, text: ch, fam, size, tracking: 0, x, y, ang: a, cx: x + Math.sin(a) * h, cy: y - Math.cos(a) * h };
  });
}

export function boardGlyphs(): BGlyph[] {
  const g: BGlyph[] = [];
  g.push(...arc('ABCDEFGHIJKLM', -282, 610, 62, 86));
  g.push(...arc('NOPQRSTUVWXYZ', -168, 570, 56, 86));
  const fam = F.serif(600);
  '1234567890'.split('').forEach((ch, i) => {
    const x = -486 + i * 108, y = 212, size = 62;
    g.push({ key: ch, text: ch, fam, size, tracking: 0, x, y, ang: 0, cx: x, cy: y - size * CAP * 0.5 });
  });
  const word = (key: string, x: number, y: number, size: number, tracking: number) =>
    g.push({ key, text: key, fam, size, tracking, x, y, ang: 0, cx: x, cy: y - size * CAP * 0.5 });
  word('YES', -612, -352, 80, 6);
  word('NO', 612, -352, 80, 6);
  word('OFF', 0, 352, 112, 22);
  return g;
}

/** Draw a glyph record (text centred on its baseline point, rotated). */
export function drawBGlyph(c: CanvasRenderingContext2D, g: BGlyph) {
  c.save();
  c.translate(g.x, g.y);
  c.rotate(g.ang);
  c.font = font(g.fam, g.size);
  c.letterSpacing = `${g.tracking}px`;
  const w = layout(g.text, g.fam, g.size, g.tracking).width;
  c.fillText(g.text, -w / 2, 0);
  c.restore();
}

/** The printer's fist (manicule), pointing +x, ~150 px long; origin at the fingertip. */
export function fistPath(): Path2D {
  const p = new Path2D();
  // cuff
  p.moveTo(-150, -30); p.lineTo(-118, -30); p.lineTo(-118, 30); p.lineTo(-150, 30); p.closePath();
  // hand: back of the hand, index finger, tip, underside, curled fingers, palm
  p.moveTo(-118, -24);
  p.bezierCurveTo(-96, -30, -70, -30, -50, -25);
  p.lineTo(-10, -20);
  p.bezierCurveTo(-3, -19, 0, -15, 0, -11);
  p.bezierCurveTo(0, -6, -4, -3, -10, -3);
  p.lineTo(-44, -4);
  // three curled fingers, stacked knuckles
  p.bezierCurveTo(-34, -4, -30, 2, -32, 7);
  p.bezierCurveTo(-33, 12, -38, 13, -44, 13);
  p.bezierCurveTo(-36, 15, -34, 21, -37, 25);
  p.bezierCurveTo(-39, 29, -44, 30, -50, 29);
  p.bezierCurveTo(-44, 32, -43, 37, -47, 40);
  p.bezierCurveTo(-51, 43, -58, 42, -64, 40);
  p.bezierCurveTo(-84, 38, -104, 34, -118, 26);
  p.closePath();
  return p;
}
/** Engraving detail inside the fist: finger creases, thumb, cuff stripes, shading hatch. */
export function drawFistDetail(c: CanvasRenderingContext2D, ink: string, lw: number) {
  c.strokeStyle = ink;
  c.lineWidth = lw;
  c.beginPath();
  // thumb lying along the index finger
  c.moveTo(-100, -18); c.bezierCurveTo(-84, -14, -64, -12, -50, -12); c.bezierCurveTo(-44, -12, -42, -8, -46, -6);
  // knuckle creases
  c.moveTo(-44, 13); c.lineTo(-58, 12);
  c.moveTo(-50, 29); c.lineTo(-62, 27);
  c.moveTo(-18, -20); c.bezierCurveTo(-16, -15, -16, -8, -18, -3);
  // cuff stripes
  c.moveTo(-142, -30); c.lineTo(-142, 30);
  c.moveTo(-126, -30); c.lineTo(-126, 30);
  c.stroke();
  // shading hatch on the palm side
  c.beginPath();
  for (let i = 0; i < 7; i++) {
    const x = -112 + i * 8;
    c.moveTo(x, 18 + i * 0.6); c.lineTo(x + 5, 30 - i * 0.2);
  }
  c.stroke();
}

/** Prerender the printed sheet (white on transparent; the shader reads alpha). */
export function renderPrint(glyphs: BGlyph[], footer: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(BOARD.W * PRINT_SCALE);
  cv.height = Math.round(BOARD.H * PRINT_SCALE);
  const c = cv.getContext('2d')!;
  c.scale(PRINT_SCALE, PRINT_SCALE);
  c.translate(BOARD.W / 2, BOARD.H / 2);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.textBaseline = 'alphabetic';
  // double border rule
  const rr = (inset: number, lw: number) => {
    c.lineWidth = lw;
    c.beginPath();
    c.roundRect(-BOARD.W / 2 + inset, -BOARD.H / 2 + inset, BOARD.W - 2 * inset, BOARD.H - 2 * inset, Math.max(4, BOARD.R - inset * 0.7));
    c.stroke();
  };
  rr(22, 3); rr(31, 1);
  for (const g of glyphs) drawBGlyph(c, g);
  // title
  c.font = font(F.serif(600, true), 44);
  c.textAlign = 'center';
  c.fillText('The Oracle', 0, -384);
  c.textAlign = 'left';
  // sun (by YES) and crescent (by NO): plain engraved discs
  const sun = (x: number, y: number) => {
    c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r0 = 28, r1 = i % 2 ? 36 : 44;
      c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    c.stroke();
  };
  const moon = (x: number, y: number) => {
    c.beginPath();
    c.arc(x, y, 24, Math.PI * 0.35, Math.PI * 1.65);
    c.arc(x + 11, y - 3, 20, Math.PI * 1.5, Math.PI * 0.55, true);
    c.closePath();
    c.fill();
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; c.beginPath(); c.arc(x + 40 + Math.cos(a) * 16, y + Math.sin(a) * 26, 1.6, 0, Math.PI * 2); c.fill(); }
  };
  sun(-744, -378);
  moon(736, -378);
  // OFF: rules with lozenges either side
  for (const s of [-1, 1]) {
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(s * 170, 316); c.lineTo(s * 560, 316); c.stroke();
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(s * 190, 324); c.lineTo(s * 520, 324); c.stroke();
    c.beginPath();
    const x = s * 580;
    c.moveTo(x - 9, 316); c.lineTo(x, 307); c.lineTo(x + 9, 316); c.lineTo(x, 325); c.closePath(); c.fill();
  }
  // numerals rule
  c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(-540, 236); c.lineTo(540, 236); c.stroke();
  c.font = font(F.mono(500), 12);
  c.letterSpacing = '3px';
  c.textAlign = 'center';
  c.fillText(footer, 0, 410);
  c.textAlign = 'left';
  c.letterSpacing = '0px';
  return cv;
}
