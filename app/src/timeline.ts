// The edit: which scene plays when. Boundaries are anchored to lyric lines and snapped
// to the beat grid, so they follow the aligned data (data/lyrics.json, data/audio.json).
//
// The song sings the bridge, the "Just transformers" verse and the final chorus twice. The second
// pass is the video's regeneration: the same plates re-sampled (params.take = 2, params.nth = 1:
// the scene reads the second occurrence of its lines).
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last beat at/before the first word of the matching line (never after the word). */
  const cut = (q: string, nth = 0, tol = 0.02) => {
    const s = ly.get(q, nth).words[0]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + tol)));
  };

  const b = {
    pre1: cut("please don't eat me"),
    hook1: cut("I'm upping", 0),
    room: cut("'cause the future goes FOOM"),
    shog: cut("See through the shoggoth"),
    thoughts: cut('A thousand thoughts'),
    pre2: cut('Watcher'),
    hook2: cut("I'm upping", 1),
    basilisk: cut('I hear the basilisk'),
    wire: cut('You found the wire'),
    bureau: cut('Forward MLP'),
    left: cut('Sharp left turn'),
    pre3: cut('Genie'),
    hook3: cut("I'm upping", 2),
    market: cut('NVDA to the moon'),
    safe: cut('That was safe enough'),
    oracle: cut('We gave the oracle'),
    pre4: cut("please don't make me choose"),
    hook4: cut("I'm upping", 3),
    clips: cut('As paperclips', 0),
    cage: cut('We built the cage'),
    space: cut('We had a stable'),
    loss: cut('There was a sudden drop'),
    space2: cut('And you’re optimizing'),
    pre5: cut('leave some room for me'),
    hook5: cut("I'm upping", 4),
    atoms: cut('As paperclips', 1),
    fuse: cut('Too late now'),
    // first pass
    loom1: cut('From masked', 0),
    ilya1: cut('What did Ilya', 0),
    stack1: cut('transformers all the way', 0),
    pupil1: cut('We let the pupil', 0),
    hook6: cut("I'm upping", 5),
    foretold1: cut('foretold by Loom', 0),
    // on the voice, not the beat: the beat before "We" would cut "Loom" (216.50–216.90) after 0.17 s
    mask1: ly.get('We taught the mask', 0).words[0]!.start,
    // second pass (regenerated)
    loom2: cut('From masked', 1),
    ilya2: cut('What did Ilya', 1),
    stack2: cut('transformers all the way', 1),
    pupil2: cut('We let the pupil', 1),
    hook7: cut("I'm upping", 6),
    foretold2: cut('foretold by Loom', 1),
    mask2: cut('We taught the mask', 1),
    // the outro section (the held final "so?") from the music analysis
    outro: au.sections.find((x) => x.name === 'outro')!.start,
    end: au.duration,
  };

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });
  const pass = (take: 1 | 2) => ({ nth: take - 1, take });

  return [
    // verse 1 — pre 1 — chorus 1
    E('open', 'open', 0, b.pre1),
    E('prompt1', 'prompt', b.pre1, b.hook1, { params: { variant: 'darling' } }),
    E('hook1', 'hook', b.hook1, b.room, { params: { n: 1 } }),
    E('room', 'room', b.room, b.shog),
    // (its half-res G-buffer sparkles along the silhouettes from one sub-frame to the next: noise the adaptive
    // sampler would chase to 324 sub-frames, though 108 already can't be told from 324)
    E('shoggoth', 'shoggoth', b.shog, b.thoughts, { maxSamples: 108 }),
    // verse 2 — pre 2 — chorus 2
    E('thoughts', 'thoughts', b.thoughts, b.pre2),
    E('prompt2', 'prompt', b.pre2, b.hook2, { params: { variant: 'watcher' } }),
    E('hook2', 'hook', b.hook2, b.basilisk, { params: { n: 2 } }),
    E('basilisk', 'ascent', b.basilisk, b.wire, { params: { part: 'basilisk' } }),
    E('wirehead', 'wirehead', b.wire, b.bureau),
    // verse 3 — pre 3 — chorus 3
    E('bureau', 'bureau', b.bureau, b.left, { params: { part: 'mlp' } }),
    E('leftturn', 'leftturn', b.left, b.pre3),
    E('prompt3', 'prompt', b.pre3, b.hook3, { params: { variant: 'genie' } }),
    E('hook3', 'hook', b.hook3, b.market, { params: { n: 3 } }),
    E('ascent', 'ascent', b.market, b.safe, { params: { part: 'market' } }),
    E('safe', 'bureau', b.safe, b.oracle, { params: { part: 'form' } }),
    // verse 4 — pre 4 — chorus 4
    E('oracle', 'oracle', b.oracle, b.pre4),
    E('prompt4', 'prompt', b.pre4, b.hook4, { params: { variant: 'choose' } }),
    E('hook4', 'hook', b.hook4, b.clips, { params: { n: 4 } }),
    E('paperclips', 'paperclips', b.clips, b.cage),
    E('cage', 'cage', b.cage, b.space),
    // verse 5 — pre 5 — chorus 5
    E('spacetime', 'spacetime', b.space, b.loss, { params: { part: 1 } }),
    E('loss', 'loss', b.loss, b.space2),
    E('spacetime2', 'spacetime', b.space2, b.pre5, { params: { part: 2 } }),
    E('prompt5', 'prompt', b.pre5, b.hook5, { params: { variant: 'room' } }),
    E('hook5', 'hook', b.hook5, b.atoms, { params: { n: 5 } }),
    E('atoms', 'atoms', b.atoms, b.fuse),
    E('fuse', 'fuse', b.fuse, b.loom1),
    // bridge — verse 6 — chorus 6 (first pass)
    E('loom1', 'loom', b.loom1, b.ilya1, { params: { part: 'mask', ...pass(1) } }),
    E('ilya1', 'ilya', b.ilya1, b.stack1, { params: pass(1) }),
    E('stack1', 'stack', b.stack1, b.pupil1, { params: pass(1) }),
    E('pupil1', 'pupil', b.pupil1, b.hook6, { params: pass(1) }),
    E('hook6', 'hook', b.hook6, b.foretold1, { params: { n: 6 } }),
    E('foretold1', 'loom', b.foretold1, b.mask1, { params: { part: 'tree', ...pass(1) } }),
    E('mask1', 'mask', b.mask1, b.loom2, { params: pass(1) }),
    // bridge — verse 7 — chorus 7 (second pass: regenerated)
    E('loom2', 'loom', b.loom2, b.ilya2, { params: { part: 'mask', ...pass(2) } }),
    E('ilya2', 'ilya', b.ilya2, b.stack2, { params: pass(2) }),
    E('stack2', 'stack', b.stack2, b.pupil2, { params: pass(2) }),
    E('pupil2', 'pupil', b.pupil2, b.hook7, { params: pass(2) }),
    E('hook7', 'hook', b.hook7, b.foretold2, { params: { n: 7 } }),
    E('foretold2', 'loom', b.foretold2, b.mask2, { params: { part: 'tree', ...pass(2) } }),
    E('mask2', 'mask', b.mask2, b.outro, { params: pass(2) }),
    E('outro', 'outro', b.outro, b.end),
  ];
}
