// Placeholder plate: the lyric lines of the entry's window as plain karaoke (bone on ink, the sung
// word in signal). Stands in for a plate that has not been written yet, so the edit plays end to end.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';

export default class KaraokePlaceholder extends Scene {
  bg = new FSPass(`void main(){ fragColor = vec4(C_INK, 1.0); }`, {});
  text = new Layer2D();
  lines: Line[] = [];
  fam = F.archivo(100, 800);

  override async init() {
    const { lyrics, start, end } = this.ctx;
    this.lines = lyrics.linesIn(start, end).filter((l) => l.start >= start - 0.3);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    this.bg.render(renderer, out);
    const c = this.text.ctx;
    this.text.clear();
    const t = f.t;
    const cur = [...this.lines].reverse().find((l) => l.start - 0.4 <= t) ?? this.lines[0];
    if (cur) {
      const size = 84;
      c.font = font(this.fam, size);
      c.textBaseline = 'alphabetic';
      const sp = layout(' ', this.fam, size).width;
      const widths = cur.words.map((w) => layout(w.w, this.fam, size).width);
      const total = widths.reduce((a, b) => a + b, 0) + sp * (cur.words.length - 1);
      let x = Math.max(120, (W - total) / 2);
      const y = H / 2 + size * 0.35;
      cur.words.forEach((w, i) => {
        const p = Lyrics.wordProgress(w, t);
        c.fillStyle = p <= 0 ? rgba('bone', 0.3) : p < 1 ? rgba('signal', 1) : rgba('bone', 0.95);
        c.fillText(w.w, x, y);
        x += widths[i]! + sp;
      });
    }
    comp.draw(renderer, this.text.upload(), out);
    return {};
  }
}
