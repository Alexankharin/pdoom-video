// `atoms` layout shared with `fuse`: the lexicon page, the stipple paperclip beside it, the camera it
// ends on, and the screen point where the spark sits on the cut (fuse's first frame puts its spark there).
import { W, H } from '../engine/gl';
import { clipPath } from './paperclips-geo';

/** The lexicon page (world px, origin top-left). */
export const PAGE = { w: 1760, h: 1290 } as const;
export interface ACam { x: number; y: number; z: number }
/** The camera over the last beat (constant at the cut, so the hand-off point is a constant too). */
export const CAM_END: ACam = { x: 1440, y: 645, z: 0.63 };
/** The stipple clip in the dark right of the page: centre (world px), px per mm, rotation (long axis ~vertical, big bend down). */
export const FIG = { x: 2118, y: 650, k: 36, rot: Math.PI / 2 - 0.1, halfW: 0.62 } as const;

/** World point of the clip's centreline at arc length s (mm) with a lateral offset (mm). */
export function clipWorld(s: number, lat = 0): { x: number; y: number; a: number } {
  const p = clipPath(s);
  const nx = -Math.sin(p.a), ny = Math.cos(p.a);
  const u = (p.x + nx * lat) * FIG.k, v = (p.y + ny * lat) * FIG.k;
  const c = Math.cos(FIG.rot), sn = Math.sin(FIG.rot);
  return { x: FIG.x + c * u - sn * v, y: FIG.y + sn * u + c * v, a: p.a + FIG.rot };
}
export const toScreen = (cam: ACam, x: number, y: number) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });

/** Where the spark is on the cut atoms → fuse: the free end of the clip's wire, on screen. */
export const ATOMS_HANDOFF = (() => { const p = clipWorld(0); return toScreen(CAM_END, p.x, p.y); })();
