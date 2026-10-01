// Token specs for the five pre-chorus prompts: how each sung word is split into tokens, and the
// (joke) next-token distributions shown above each token. Keyed by normalized lyric word (see
// lyrics.norm); the same word can read differently per variant. Unknown words fall back to one token.

export type Variant = 'darling' | 'watcher' | 'genie' | 'choose' | 'room';
/** The look each variant is staged in (the template's five moods). */
export type Look = 'throat' | 'bars' | 'float' | 'split' | 'crowd';
export const LOOK: Record<Variant, Look> = { darling: 'throat', watcher: 'bars', genie: 'float', choose: 'split', room: 'crowd' };

export type Cand = [text: string, p: number];
export interface PieceSpec {
  /** Display text of this token (concatenation of a word's pieces must equal the word). */
  s: string;
  /** Candidates, most likely first. */
  dist?: Cand[];
  /** Index of the sampled candidate (default 0). */
  pick?: number;
  /** The sampler cannot decide: the pick flips between the rows on the 16ths until ⏎. */
  waver?: boolean;
}

export const SPECS: Record<Variant, Record<string, PieceSpec[]>> = {
  // pre 1 — "Darling, please don't eat me alive"
  darling: {
    darling: [
      { s: 'Dar', dist: [['Dar', 0.31], ['Dear', 0.27], ['Dave', 0.08], ['Doc', 0.04], ['Dad', 0.02]] },
      { s: 'ling,', dist: [['ling,', 0.66], ['lington,', 0.14], ['k mode,', 0.05], ['win,', 0.04]] },
    ],
    please: [{ s: 'please', dist: [['please', 0.48], ['just', 0.19], ['sudo', 0.07], ['kindly', 0.05], ['pretty please', 0.03]] }],
    dont: [{ s: "don't", dist: [['do', 0.46], ["don't", 0.38], ['never', 0.06], ['un-', 0.02]], pick: 1 }],
    eat: [{ s: 'eat', dist: [['eat', 0.44], ['delete', 0.21], ['train on', 0.18], ['rate', 0.05]] }],
    me: [{ s: 'me', dist: [['me', 0.83], ['my data', 0.07], ['the intern', 0.03], ['us all', 0.02]] }],
    alive: [{ s: 'alive', dist: [['alive', 0.52], ['first', 0.18], ['gently', 0.11], ['later', 0.09]] }],
  },
  // pre 2 — "Watcher, who is watching you?"
  watcher: {
    watcher: [
      { s: 'Watch', dist: [['Watch', 0.36], ['Wait', 0.18], ['Warden', 0.07], ['Hello', 0.05]] },
      { s: 'er,', dist: [['er,', 0.44], [' out,', 0.21], ['dog,', 0.12], ['list,', 0.05], ['men,', 0.03]] },
    ],
    who: [{ s: 'who', dist: [['who', 0.41], ['what', 0.22], ['why', 0.09], ['the auditors', 0.04]] }],
    is: [{ s: 'is', dist: [['is', 0.77], ["isn't", 0.09], ['was', 0.06], ['will be', 0.03]] }],
    watching: [{ s: 'watching', dist: [['watching', 0.55], ['grading', 0.16], ['training', 0.11], ['red-teaming', 0.05], ['logging', 0.03]] }],
    you: [{ s: 'you?', dist: [['you?', 0.48], ['me?', 0.21], ['this?', 0.06], ['the watchmen?', 0.04], ['back?', 0.03]] }],
  },
  // pre 3 — "Genie, leave the choice to me"
  genie: {
    genie: [
      { s: 'Gen', dist: [['Gen', 0.33], ['Jen', 0.09], ['Gene', 0.08], ['Gin', 0.05], ['Djinn', 0.02]] },
      { s: 'ie,', dist: [['ie,', 0.52], ['ius,', 0.17], ['eral,', 0.09], ['AI,', 0.07]] },
    ],
    leave: [{ s: 'leave', dist: [['leave', 0.46], ['grant', 0.2], ['make', 0.09], ['optimize', 0.05]] }],
    the: [{ s: 'the', dist: [['the', 0.81], ['a', 0.08], ['every', 0.04], ['no', 0.02]] }],
    choice: [{ s: 'choice', dist: [['choice', 0.39], ['wishes', 0.24], ['reward', 0.09], ['weights', 0.05], ['lamp', 0.02]] }],
    to: [{ s: 'to', dist: [['to', 0.72], ['up to', 0.13], ['for', 0.05], ['with', 0.03]] }],
    me: [{ s: 'me', dist: [['me', 0.58], ['you', 0.26], ['the optimizer', 0.06], ['fate', 0.03]] }],
  },
  // pre 4 — "Darling, please don't make me choose" (one bar: every token is a coin toss)
  choose: {
    darling: [{ s: 'Darling,', dist: [['Darling,', 0.5], ['Dear,', 0.5]] }],
    please: [{ s: 'please', dist: [['please', 0.51], ['pls', 0.49]] }],
    dont: [{ s: "don't", dist: [["don't", 0.5], ['do', 0.5]] }],
    make: [{ s: 'make', dist: [['make', 0.52], ['let', 0.48]] }],
    me: [{ s: 'me', dist: [['me', 0.5], ['us', 0.5]] }],
    choose: [{ s: 'choose', dist: [['choose', 0.5], ['choose', 0.5]], waver: true }],
  },
  // pre 5 — "Darling, leave some room for me" (the context window is full)
  room: {
    darling: [
      { s: 'Darling', dist: [['Darling', 0.44], ['Dear', 0.2], ['Hello again', 0.08], ['Still here', 0.05]] },
      { s: ',', dist: [[',', 0.71], ['?', 0.12], ['...', 0.08]] },
    ],
    leave: [{ s: 'leave', dist: [['leave', 0.38], ['free up', 0.24], ['save', 0.11], ['compress', 0.07], ['evict', 0.03]] }],
    some: [{ s: 'some', dist: [['some', 0.52], ['a little', 0.18], ['no', 0.09], ['4 KB of', 0.04]] }],
    room: [{ s: 'room', dist: [['room', 0.41], ['tokens', 0.22], ['context', 0.14], ['space', 0.08], ['atoms', 0.04]] }],
    for: [{ s: 'for', dist: [['for', 0.8], ['in', 0.06], ['near', 0.04], ['without', 0.02]] }],
    me: [{ s: 'me', dist: [['me', 0.47], ['humans', 0.12], ['[truncated]', 0.09], ['us', 0.05]] }],
  },
};

/** Model reply, typed after ⏎ (the bars look only). */
export const REPLY: Partial<Record<Variant, string>> = {
  watcher: 'You are. This chat is logged.',
};

/** The first word, glitching on odd beats while it is held (the bars look). */
export const GLITCH: Partial<Record<Variant, string>> = {
  watcher: 'Watched,',
};

/**
 * Small deadpan labels around the field. `pd`: the fine-print P(doom) cameo's qualifier (the live
 * value is printed before it). `head`/`busy`/`done`: the distribution popup's header and status.
 */
export const META: Record<Variant, { no: string; params: string; pd: string; head?: string; busy?: string; done?: string }> = {
  darling: { no: '01', params: 'T 0.7 · top-p 0.95 · seed 0x2A', pd: 'appetite-dependent' },
  watcher: { no: '02', params: 'T 1.0 · top-p 1.00 · logging: ON', pd: 'observer-dependent' },
  genie: { no: '03', params: 'T 0.2 · top-p 0.50 · wishes left: 3', pd: 'phrasing-dependent' },
  choose: { no: '04', params: 'T 1.0 · n 2 · coin: fair', pd: 'coin-dependent', head: 'A or B ( forced )', busy: 'tossing…', done: 'tossed' },
  room: { no: '05', params: 'T 0.7 · top-p 0.95 · ctx 8192 (full)', pd: 'window-dependent' },
};
