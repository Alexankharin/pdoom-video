// The context window as a wall of text: every lyric sung so far, typed back as dim mono scrollback.
// Shared by prompt 5 ("Darling, leave some room for me": the context crowds the field) and hook 5
// (the hook has to squeeze into the band the wall leaves open), so the hand-off matches exactly.
import { rgba } from '../engine/palette';
import { F, font, plain } from '../engine/type';
import type { Lyrics } from '../engine/lyrics';
import { hash } from '../engine/util';

export const WALL = { n: 28, size: 13, chars: 290 };

/** Rows of scrollback: the song so far, most recent line first (rows 0..n-1 above, n..2n-1 below). */
export function contextRows(lyrics: Lyrics, before: number): string[] {
  const ls = lyrics.lines.filter((l) => l.start < before - 0.01).map((l) => plain(l.text));
  const S = '› ' + ls.reverse().join('   › ') + '   › ';
  const SS = S + S + S;
  const rows: string[] = [];
  for (let k = 0; k < WALL.n * 2; k++) {
    const off = (k * 97) % S.length;
    rows.push(SS.slice(off, off + WALL.chars));
  }
  return rows;
}

/**
 * Draw one wall: n rows stacked away from `edge` (dir -1: upward, +1: downward), `sp` px apart.
 * Rows overlap when sp is small (the crowding); `a` scales the ink.
 */
export function drawWall(c: CanvasRenderingContext2D, rows: string[], edge: number, dir: -1 | 1, sp: number, a = 1) {
  const n = WALL.n, size = WALL.size;
  c.save();
  c.font = font(F.mono(400), size);
  c.textBaseline = 'alphabetic';
  for (let k = 0; k < n; k++) {
    const y = dir < 0 ? edge - 5 - k * sp : edge + 5 + size * 0.72 + k * sp;
    const x = -20 - hash(k, dir + 3) * 140;
    c.fillStyle = rgba(k === 0 ? 'bone' : 'ash', (k === 0 ? 0.42 : 0.34 * (1 - k / (n + 8))) * a);
    c.fillText(rows[dir < 0 ? k : k + n] ?? '', x, y);
  }
  c.restore();
}
