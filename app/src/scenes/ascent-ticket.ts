// FIG. 6 / part "market", movement 3: "Tickets to the Chinese room". A banknote-grade admission
// ticket (bone paper, ink guilloché, perforated stub), its vignette an engraving of the room plate's
// library aisle with the slot at the end. The static art is drawn once into an offscreen canvas;
// the lyric, the serial and the tear are drawn live by ascent.ts.
import { SCALE } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { mulberry32, TAU } from '../engine/util';

/** Ticket geometry in ticket px (origin top-left). */
export const TK = { w: 1500, h: 600, perf: 1170, medX: 215, medY: 300, medR: 150, colX: 405, colR: 1130 };
/** Backing px per ticket px (the camera pushes in ~3x on the serial at the end). */
export const TK_RES = 2 * SCALE;

export function makeTicketArt(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(TK.w * TK_RES); cv.height = Math.round(TK.h * TK_RES);
  const c = cv.getContext('2d')!;
  c.scale(TK_RES, TK_RES);
  const rnd = mulberry32(3030);
  const { w, h } = TK;
  // ---- paper (rounded corners), fibres
  const r0 = 18;
  const shape = new Path2D();
  shape.roundRect(0, 0, w, h, r0);
  c.fillStyle = rgba('bone', 1);
  c.fill(shape);
  c.save();
  c.clip(shape);
  c.lineWidth = 0.6;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * w, y = rnd() * h, a = rnd() * TAU, l = 3 + rnd() * 9;
    c.strokeStyle = rgba('ash', 0.12 + 0.12 * rnd());
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  // security guilloché: interlaced sine families over the whole ticket
  c.lineWidth = 0.55;
  for (let k = 0; k < 64; k++) {
    for (const s of [1, -1]) {
      c.strokeStyle = rgba('ink', 0.11);
      c.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const y = k * 10 - 20 + s * (16 * Math.sin(x * 0.013 + (s > 0 ? 0 : 1.9)) + 5 * Math.sin(x * 0.041 + k * 0.05));
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  // ---- frame: double rules and a woven band, body and stub framed separately
  const frameBox = (x0: number, y0: number, x1: number, y1: number) => {
    c.strokeStyle = rgba('ink', 0.9);
    c.lineWidth = 2.2; c.strokeRect(x0 + 22, y0 + 22, x1 - x0 - 44, y1 - y0 - 44);
    c.lineWidth = 1; c.strokeRect(x0 + 30, y0 + 30, x1 - x0 - 60, y1 - y0 - 60);
    c.lineWidth = 1; c.strokeRect(x0 + 58, y0 + 58, x1 - x0 - 116, y1 - y0 - 116);
    // woven band between rules 30 and 58: two phase-shifted sines along each edge
    c.lineWidth = 0.8; c.strokeStyle = rgba('ink', 0.75);
    const mid = 44, amp = 10;
    const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
      const L = Math.hypot(bx - ax, by - ay);
      for (const ph of [0, Math.PI]) {
        c.beginPath();
        for (let s = 0; s <= L; s += 3) {
          const k = s / L, o = amp * Math.sin(s * 0.09 + ph);
          const x = ax + (bx - ax) * k + nx * o, y = ay + (by - ay) * k + ny * o;
          if (s === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
    };
    edge(x0 + mid, y0 + mid, x1 - mid, y0 + mid, 0, 1);
    edge(x0 + mid, y1 - mid, x1 - mid, y1 - mid, 0, 1);
    edge(x0 + mid, y0 + mid, x0 + mid, y1 - mid, 1, 0);
    edge(x1 - mid, y0 + mid, x1 - mid, y1 - mid, 1, 0);
  };
  frameBox(0, 0, TK.perf, h);
  frameBox(TK.perf, 0, w, h);

  // ---- the vignette medallion: rosettes around an engraving of the library aisle
  const { medX: mx, medY: my, medR: R } = TK;
  c.lineWidth = 0.7; c.strokeStyle = rgba('ink', 0.7);
  for (let k = 0; k < 12; k++) {
    for (const n of [22, -22]) {
      c.beginPath();
      for (let i = 0; i <= 720; i++) {
        const th = (i / 720) * TAU;
        const rr = R * 1.2 + R * 0.08 * Math.sin(n * th + (k * TAU) / 12);
        const x = mx + Math.cos(th) * rr, y = my + Math.sin(th) * rr;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  c.lineWidth = 1.6; c.strokeStyle = rgba('ink', 0.95);
  c.beginPath(); c.arc(mx, my, R, 0, TAU); c.stroke();
  c.lineWidth = 1; c.beginPath(); c.arc(mx, my, R * 1.34, 0, TAU); c.stroke();
  c.save();
  c.beginPath(); c.arc(mx, my, R - 3, 0, TAU); c.clip();
  c.fillStyle = rgba('bone', 1); c.fillRect(mx - R, my - R, 2 * R, 2 * R);
  // one-point perspective: vanishing point at the door, shelves on both sides
  const vx = mx, vy = my - 8;
  const dw = 22, dh = 40; // the door at the end of the aisle
  c.strokeStyle = rgba('ink', 0.85);
  const rows = 7;
  for (const side of [-1, 1]) {
    const nx = vx + side * dw, farTop = vy - dh, farBot = vy + dh * 0.7;
    const nearX = mx + side * R * 1.05, nearTop = my - R * 1.1, nearBot = my + R * 0.9;
    // shelf edges: horizontal rows of the bookcase in perspective
    for (let r = 0; r <= rows; r++) {
      const k = r / rows;
      const y0 = farTop + (farBot - farTop) * k, y1 = nearTop + (nearBot - nearTop) * k;
      c.lineWidth = r === 0 || r === rows ? 1.2 : 0.9;
      c.beginPath(); c.moveTo(nx, y0); c.lineTo(nearX, y1); c.stroke();
      // books between this row and the next: vertical hairlines, denser toward the door
      if (r < rows) {
        const k2 = (r + 1) / rows;
        const yb0 = farTop + (farBot - farTop) * k2, yb1 = nearTop + (nearBot - nearTop) * k2;
        const nb = 34;
        for (let b = 0; b < nb; b++) {
          const u = Math.pow(b / nb, 1.8) + (rnd() - 0.5) * 0.004;
          const x = nx + (nearX - nx) * u;
          const ya = y0 + (y1 - y0) * u, yb = yb0 + (yb1 - yb0) * u;
          const hgt = 0.62 + 0.3 * rnd();
          c.lineWidth = 0.5 + 1.2 * u;
          c.beginPath(); c.moveTo(x, yb - (yb - ya) * 0.06); c.lineTo(x, yb - (yb - ya) * hgt); c.stroke();
        }
      }
    }
    // uprights of the bookcases
    for (let u = 0.15; u < 1; u += 0.28) {
      const uu = Math.pow(u, 1.8);
      const x = nx + (nearX - nx) * uu;
      c.lineWidth = 0.8 + 1.4 * uu;
      c.beginPath(); c.moveTo(x, farTop + (nearTop - farTop) * uu); c.lineTo(x, farBot + (nearBot - farBot) * uu); c.stroke();
    }
  }
  // floor boards converging, and ceiling hatching
  c.lineWidth = 0.6;
  for (let i = -6; i <= 6; i++) {
    c.beginPath(); c.moveTo(vx + i * 3, vy + dh * 0.7); c.lineTo(mx + i * 34, my + R); c.stroke();
  }
  for (let y = my - R; y < vy - dh; y += 5) {
    c.lineWidth = 0.9; c.beginPath(); c.moveTo(mx - R, y); c.lineTo(mx + R, y); c.stroke();
  }
  // the door with the slot, and the lamp hanging above the aisle
  c.fillStyle = rgba('ink', 0.92);
  c.fillRect(vx - dw, vy - dh, dw * 2, dh * 1.7);
  c.fillStyle = rgba('bone', 1);
  c.fillRect(vx - 9, vy - 4, 18, 3);
  c.strokeStyle = rgba('ink', 0.9); c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(vx, my - R); c.lineTo(vx, vy - dh - 26); c.stroke();
  c.beginPath(); c.moveTo(vx - 10, vy - dh - 18); c.lineTo(vx + 10, vy - dh - 18); c.lineTo(vx, vy - dh - 28); c.closePath(); c.stroke();
  c.restore();

  // ---- static lettering
  c.fillStyle = rgba('ink', 0.92);
  c.textBaseline = 'alphabetic';
  // ADMIT ONE with drawn lozenges (no ornament glyphs)
  const lozenge = (x: number, y: number, s: number) => { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.7, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.7, y); c.closePath(); c.fill(); };
  c.font = font(F.serif(600), 30);
  c.letterSpacing = '9px';
  c.textAlign = 'left';
  c.fillText('ADMIT ONE', TK.colX + 26, 120);
  const aw = c.measureText('ADMIT ONE').width;
  lozenge(TK.colX + 8, 110, 7);
  lozenge(TK.colX + 26 + aw + 10, 110, 7);
  c.letterSpacing = '0px';
  // fine print
  c.textAlign = 'left';
  c.font = font(F.mono(400), 15);
  c.fillStyle = rgba('ink', 0.78);
  c.fillText('Admits one (1) operator. Rulebook provided; understanding not included.', TK.colX + 8, 478);
  c.fillText('Questions to be submitted through the slot, in Chinese. No refunds.', TK.colX + 8, 500);
  c.fillStyle = rgba('graphite', 1);
  c.fillText('Holder agrees the room is not conscious. The room reserves the same right.', TK.colX + 8, 522);
  // stub: ADMIT ONE set vertically, plus a tiny medallion
  c.save();
  c.translate(TK.perf + 205, h / 2);
  c.rotate(-Math.PI / 2);
  c.fillStyle = rgba('ink', 0.92);
  c.font = font(F.serif(600), 40);
  c.letterSpacing = '10px';
  c.textAlign = 'center';
  c.fillText('ADMIT ONE', 0, 0);
  c.letterSpacing = '0px';
  c.font = font(F.mono(500), 14);
  c.fillStyle = rgba('graphite', 1);
  c.fillText('RETAIN THIS STUB · NOT VALID IF UNDERSTOOD', 0, 34);
  c.fillText('ROW —  ·  SEAT: BY THE SLOT', 0, 56);
  c.restore();
  c.lineWidth = 0.6; c.strokeStyle = rgba('ink', 0.6);
  for (let k = 0; k < 8; k++) {
    c.beginPath();
    for (let i = 0; i <= 240; i++) {
      const th = (i / 240) * TAU;
      const rr = 38 + 5 * Math.sin(12 * th + (k * TAU) / 8);
      const x = TK.perf + 105 + Math.cos(th) * rr, y = h / 2 + Math.sin(th) * rr;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.restore(); // paper clip

  // ---- perforation: punched holes along the tear line (transparent)
  c.globalCompositeOperation = 'destination-out';
  for (let y = 14; y < h - 8; y += 17) { c.beginPath(); c.arc(TK.perf, y, 4.2, 0, TAU); c.fill(); }
  c.globalCompositeOperation = 'source-over';
  return cv;
}
