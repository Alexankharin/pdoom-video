"""Music analysis -> data/audio.json

  * constant-tempo beat grid (tempo + phase fitted to drum / mix onsets, phase
    refined on kick attacks), downbeats (bar phase from snare-on-2&4 and the
    2-bar chord changes), sections on downbeats,
  * 100 fps normalized envelopes (mix rms / low / mid / high, stem rms),
  * kick / snare / hat onsets from the drums stem, vocal note onsets.

All times are in the gapless-mp3 timeline (Demucs stems are shifted by
common.STEM_OFFSET_SEC, see common.py).

Run:  uv run python analyze.py [--plots]
"""
import common
import json
import math
import sys

import numpy as np
import librosa
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, find_peaks, sosfiltfilt

SR = 44100
FPS = 100

# Bar phase: beat index of the first downbeat.  The drums play four-on-the-
# floor kicks with the snare on 8th positions 2 and 6 (beats 2 and 4) and
# every chorus lands "DOOM" of "P(doom)" on a beat index = 0 mod 4.
BAR_PHASE = 0

# Section map in bars (bar k starts at downbeat k; bar 0 = first downbeat).
# Rule: a section starts on the downbeat of the bar in which its first lyric
# line starts, unless that line starts with a short (< 2 beat) pickup, in which
# case the pickup stays in the previous section.  Every chorus starts with a
# ~1-bar pickup "I'm upping my P-" landing "DOOM" on the next downbeat, so the
# chorus section starts at the pickup bar.  The song sings the bridge, the
# "Just transformers" verse and the final chorus twice (bars 105-129 and
# 129-161).
SECTION_BARS = [
    ("intro", None, 10),     # synth intro; drums from bar 9; pickup "I" at 17.87
    ("verse1", 10, 18),      # "I see sparks of AGI ..."
    ("pre1", 18, 21),        # "Darling, please don't eat me alive" (bass out bars 20-21)
    ("chorus1", 21, 30),     # pickup bar 21, "DOOM" on bar 22
    ("verse2", 30, 38),      # "A thousand thoughts before you speak"
    ("pre2", 38, 41),        # "Watcher, who is watching you?" (bass out)
    ("chorus2", 41, 49),     # "I hear the basilisk boom" ... "Turn the dial"
    ("verse3", 49, 58),      # "Forward MLP" ... "Without a single cdr"
    ("pre3", 58, 61),        # breakdown: drums + bass out, "Genie, leave the choice to me"
    ("chorus3", 61, 69),     # light chorus: synths out, "NVDA" ... "safe enough, we reckoned"
    ("verse4", 69, 73),      # 4-bar verse "We gave the oracle its hands"
    ("pre4", 73, 74),        # 1-bar pre "Darling, please don't make me choose"
    ("chorus4", 74, 81),     # drums + bass drop out for bars 79-81 ("We built the cage ...")
    ("verse5", 81, 94),      # "We had a stable training run" ... "atoms rearranging"
    ("pre5", 94, 97),        # "Darling, leave some room for me" (drums + bass out)
    ("chorus5", 97, 105),    # sparse chorus: synths out, bass out from bar 101
    ("bridge1", 105, 113),   # "From masked pre-training days" (full band from bar 106)
    ("verse6", 113, 121),    # "Just transformers all the way!" ... "change the game"
    ("chorus6", 121, 129),   # "Just as foretold by Loom" ... "tell us so?" + "oh" ad-libs
    ("bridge2", 129, 138),   # second pass; drums + bass out bars 131-133
    ("verse7", 138, 149),    # second pass; drums out bars 147-148
    ("chorus7", 149, 161),   # final chorus, held "so?" from 280.5
    ("outro", 161, None),    # tail of the held "so?" (to 291.0), band stops ~292.5
]


# ---------------------------------------------------------------------------
def band_sos(lo, hi, sr):
    if lo and hi:
        return butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    if hi:
        return butter(4, hi, btype="low", fs=sr, output="sos")
    return butter(4, lo, btype="high", fs=sr, output="sos")


def frame_rms(x, sr, fps=FPS, win=2048):
    hop = sr / fps
    n = int(math.ceil(len(x) / sr * fps))
    pad = np.pad(x, (win // 2, win // 2 + int(hop) + 2))
    idx = (np.arange(n) * hop).astype(int)
    c = np.concatenate([[0.0], np.cumsum(pad.astype(np.float64) ** 2)])
    e = (c[idx + win] - c[idx]) / win
    return np.sqrt(np.maximum(e, 0))


def smooth_env(x, fps=FPS, attack=0.010, release=0.090):
    """One-pole follower: fast attack, slower release (visual friendly)."""
    aa = math.exp(-1 / (attack * fps))
    ar = math.exp(-1 / (release * fps))
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        a = aa if v > s else ar
        s = a * s + (1 - a) * v
        y[i] = s
    return y


def norm01(x, pct=99.0):
    ref = np.percentile(x, pct)
    return np.clip(x / (ref + 1e-12), 0, 1)


# ---------------------------------------------------------------------------
def onset_env(drums, mix, sr):
    """Drum + mix spectral-flux onset envelope (~1.45 ms frames) and its frame rate."""
    od = librosa.onset.onset_strength(y=librosa.resample(drums, orig_sr=sr, target_sr=22050),
                                      sr=22050, hop_length=32, lag=1, max_size=1)
    om = librosa.onset.onset_strength(y=librosa.resample(mix, orig_sr=sr, target_sr=22050),
                                      sr=22050, hop_length=32, lag=1, max_size=1)
    return od / (np.percentile(od, 99) + 1e-9) + om / (np.percentile(om, 99) + 1e-9), 22050 / 32


def fit_grid(drums, mix, sr, duration, knot_beats=48):
    """Beat grid on a smooth tempo curve (the song accelerates ~132 -> ~140 BPM):
    beat time = cubic spline of the beat index (knots every `knot_beats` beats).
    Initialised from librosa's dynamic-programming beat tracker, then refitted
    to the onset-envelope maxima near each grid beat (weighted by strength,
    weakest 30% ignored), iterated; the phase is finally refined on kick
    attack times, extended over silence at the ends at the local tempo.
    Returns (beat times from the first beat >= 0, residual sd of the onset fit, kick residuals)."""
    from scipy.interpolate import LSQUnivariateSpline
    o, ofps = onset_env(drums, mix, sr)
    y22 = librosa.resample(drums + 0.5 * mix, orig_sr=sr, target_sr=22050)
    oenv = librosa.onset.onset_strength(y=y22, sr=22050, hop_length=128)
    _, b0 = librosa.beat.beat_track(onset_envelope=oenv, sr=22050, hop_length=128, units="time", tightness=400)

    def spline(i, t, w=None):
        kn = np.arange(i.min() + knot_beats, i.max() - knot_beats + 1, knot_beats)
        return LSQUnivariateSpline(i, t, kn, w=w, k=3)

    s = spline(np.arange(len(b0), dtype=float), b0)
    pad = 40
    for _ in range(4):
        idx = np.arange(-pad, len(b0) + pad, dtype=float)
        T = s(idx)
        ok = (T > 0.5) & (T < duration - 0.5)
        idx, T = idx[ok], T[ok]
        tt, ww = [], []
        for t in T:
            a, b = int((t - 0.035) * ofps), int((t + 0.035) * ofps)
            k = a + int(np.argmax(o[a:b]))
            tt.append(k / ofps)
            ww.append(o[k])
        tt, ww = np.array(tt), np.array(ww)
        good = ww > np.percentile(ww, 30)
        s = spline(idx[good], tt[good], w=ww[good])
    res = (tt - s(idx))[good]
    # phase on kick attacks (steepest rise of low-band log energy; flux peaks lag them)
    idx = np.arange(-pad, len(b0) + pad, dtype=float)
    T = s(idx)
    kick_t, _ = band_onsets(drums, sr, None, 120, win=0.012, min_gap=0.2, rel_db=12)
    near = np.array([T[np.argmin(np.abs(T - k))] for k in kick_t])
    kres = kick_t - near
    kres = kres[np.abs(kres) < 0.06]
    T = T + float(np.median(kres))
    T = T[(T >= 0) & (T <= duration)]
    return T, res, kres


def band_onsets(x, sr, lo, hi, win=0.010, hop_s=0.002, min_gap=0.08, rel_db=10.0,
                decay_win=None):
    """Onsets in a frequency band: steepest rise of the band's log-energy
    envelope; strength = peak dB rise.  Returns (times, rise_db[, decay_db])."""
    xb = sosfiltfilt(band_sos(lo, hi, sr), x)
    h = int(hop_s * sr)
    w = int(win * sr)
    e = np.convolve(xb.astype(np.float64) ** 2, np.ones(w) / w, mode="same")[::h]
    db = 10 * np.log10(e + 1e-10)
    fps = sr / h  # exact frame rate (h is an integer number of samples)
    d = np.diff(db, prepend=db[0])
    d = uniform_filter1d(d, 3)
    # rise over ~20 ms
    lag = int(0.02 * fps)
    rise = db - np.concatenate([np.full(lag, db[0]), db[:-lag]])
    floor = median_filter(db, int(1.0 * fps) | 1)
    pk, _ = find_peaks(rise, height=rel_db, distance=int(min_gap * fps))
    times, strength = [], []
    for p in pk:
        a = max(0, p - lag)
        # attack time: steepest slope within the rise window
        q = a + int(np.argmax(d[a:p + 1]))
        peak_db = db[p:p + int(0.03 * fps)].max()
        if peak_db < floor[p] + 3:
            continue
        times.append(q / fps)
        strength.append(peak_db)
    return np.array(times), np.array(strength)


def drum_onsets(d, sr):
    """Kick / snare / hat onsets from the drums stem."""
    # KICK: <120 Hz
    kt, kdb = band_onsets(d, sr, None, 120, win=0.012, min_gap=0.15, rel_db=12)
    # SNARE (and the clap-like snare of the quiet chorus): candidates are
    # 1.5-5 kHz attacks; a snare has a long noisy 0.5-5 kHz tail 40-120 ms after
    # the attack.  Keep candidates whose tail is within 8 dB of the loudest tail
    # in +-2.5 s and within 25 dB of the song-wide level (rejects stem bleed).
    # Kick-only beats / hats have tails 12-30 dB lower.
    st, sdb = band_onsets(d, sr, 1500, 5000, win=0.010, min_gap=0.15, rel_db=10)
    xb = sosfiltfilt(band_sos(500, 5000, sr), d)
    e = np.sqrt(np.convolve(xb.astype(np.float64) ** 2, np.ones(441) / 441, mode="same"))
    tail = np.array([20 * np.log10(e[int((t + 0.04) * sr):int((t + 0.12) * sr)].mean() + 1e-9) for t in st])
    rel = np.array([tail[i] - tail[np.abs(st - st[i]) < 2.5].max() for i in range(len(st))])
    thr = np.percentile(tail, 95) - 25
    keep = (rel > -8) & (tail > thr)
    st, sdb, stail = st[keep], sdb[keep], tail[keep]
    # HAT: >7 kHz, short; drop those coinciding with snares (snare noise also
    # reaches 7k+)
    ht, hdb = band_onsets(d, sr, 7000, None, win=0.006, min_gap=0.06, rel_db=9)
    # (and those within 30 ms of a kick: the kick's beater click reaches 10 kHz)
    for other, gap in ((st, 0.04), (kt, 0.03)):
        if len(other) and len(ht):
            dist = np.min(np.abs(ht[:, None] - other[None, :]), axis=1)
            keep = dist > gap
            ht, hdb = ht[keep], hdb[keep]
    return (kt, kdb), (st, stail), (ht, hdb), thr


def strength01(db_vals, lo_pct=5, hi_pct=95):
    if len(db_vals) == 0:
        return db_vals
    lo, hi = np.percentile(db_vals, lo_pct), np.percentile(db_vals, hi_pct)
    return np.clip((db_vals - lo) / (hi - lo + 1e-9) * 0.8 + 0.2, 0, 1)


def vocal_onsets(v, sr):
    """Vocal note onsets: log-mel spectral flux peaks (5 ms hop) plus pitch
    jumps > 0.8 semitone while voiced, restricted to active vocal frames."""
    f = dict(np.load(common.WORK / "vocal_feats.npz"))
    hop = float(f["hop_s"])
    on = f["onset"]
    rms = f["rms_db"]
    loc = maximum_filter1d(rms, int(2.0 / hop))
    active = (rms > -45) & (rms > loc - 25)
    thr = uniform_filter1d(on, int(0.4 / hop)) * 1.5 + 0.15 * np.percentile(on, 99)
    pk, _ = find_peaks(on, height=0, distance=int(0.09 / hop))
    pk = [p for p in pk if on[p] > thr[p] and active[min(len(active) - 1, p + int(0.03 / hop))]]
    t_flux = np.array(pk) * hop
    s_flux = np.array([on[p] for p in pk])
    # pitch jumps (legato note changes that have little spectral flux)
    f0 = f["f0"]
    midi = librosa.hz_to_midi(np.where(f["voiced"] > 0, f0, np.nan))
    med = median_filter(np.nan_to_num(midi, nan=0), 9)
    jumps = []
    w = int(0.04 / hop)
    for i in range(w, len(med) - w):
        a, b = med[i - w], med[i + w]
        if a > 0 and b > 0 and abs(b - a) > 0.8 and active[i]:
            jumps.append(i)
    # collapse runs
    t_pitch, last = [], -1e9
    for i in jumps:
        if i - last > int(0.1 / hop):
            t_pitch.append(i * hop)
        last = i
    t_pitch = np.array(t_pitch)
    ts = list(zip(t_flux, s_flux / (np.percentile(s_flux, 95) + 1e-9)))
    for t in t_pitch:
        if len(t_flux) == 0 or np.min(np.abs(t_flux - t)) > 0.08:
            ts.append((t, 0.35))
    ts.sort()
    return [(float(t), float(min(1.0, max(0.1, s)))) for t, s in ts]


# ---------------------------------------------------------------------------
def main(plots=False):
    mix, _ = common.load_mix(SR)
    duration = len(mix) / SR
    stems = {n: common.load_stem(n, sr=SR)[0][: len(mix)] for n in ("vocals", "drums", "bass", "other")}
    for n in stems:
        if len(stems[n]) < len(mix):
            stems[n] = np.pad(stems[n], (0, len(mix) - len(stems[n])))

    beats, onset_res, kick_res = fit_grid(stems["drums"], mix, SR, duration)
    P = float(np.mean(np.diff(beats)))
    bpm = 60 / P
    period = np.diff(beats)
    print(f"tempo {60/period[:20].mean():.2f} -> {60/period[-20:].mean():.2f} BPM (mean {bpm:.3f})  first beat {beats[0]:.4f}s  "
          f"onset fit sd {onset_res.std()*1000:.1f} ms  kick residual sd {kick_res.std()*1000:.1f} ms")
    # bar phase: beat index BAR_PHASE is the first downbeat (see NOTES)
    beat_in_bar = (np.arange(len(beats)) - BAR_PHASE) % 4
    downbeats = beats[beat_in_bar == 0]
    bar_t = lambda k: float(downbeats[k]) if k < len(downbeats) else float(duration)

    # envelopes -------------------------------------------------------------
    n = int(math.ceil(duration * FPS))
    env = {}
    env["rms"] = frame_rms(mix, SR)[:n]
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        env[name] = frame_rms(sosfiltfilt(band_sos(lo, hi, SR), mix), SR)[:n]
    for s in ("vocal", "drums", "bass", "other"):
        env[s] = frame_rms(stems["vocals" if s == "vocal" else s], SR)[:n]
    for k in env:
        e = smooth_env(env[k])
        env[k] = [round(float(x), 3) for x in norm01(e)]
        assert len(env[k]) == n

    # onsets -------------------------------------------------------------------
    (kt, kdb), (st, sdb), (ht, hdb), sn_thr = drum_onsets(stems["drums"], SR)
    onsets = {
        "kick": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(kt, strength01(kdb))],
        "snare": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(st, strength01(sdb))],
        "hat": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ht, strength01(hdb))],
        "vocal": [[round(t, 3), round(s, 3)] for t, s in vocal_onsets(stems["vocals"], SR)],
    }
    # snare / kick position statistics -> bar phase evidence
    def pos_hist(ts):
        # 8th-note position in the bar (0 = downbeat) on the tempo curve
        bi = np.interp(np.asarray(ts), beats, np.arange(len(beats), dtype=float))
        ph = np.round((bi - BAR_PHASE) * 2).astype(int) % 8
        return np.bincount(ph, minlength=8).tolist()
    print("kick   8th-positions in bar:", pos_hist(kt))
    print("snare  8th-positions in bar:", pos_hist(st))
    print("hat    8th-positions in bar:", pos_hist(ht))

    # sections -------------------------------------------------------------------
    sections = []
    for name, a, b in SECTION_BARS:
        s = 0.0 if a is None else bar_t(a)
        e = duration if b is None else bar_t(b)
        sections.append(dict(name=name, start=round(s, 3), end=round(e, 3), bars=[a if a is not None else -1, b]))
    for s in sections:
        s.pop("bars")

    doc = dict(
        duration=round(duration, 3),
        bpm=round(bpm, 3),
        beat_period=round(P, 5),
        tempo_curve=[[round(float(beats[i]), 2), round(float(60 / (beats[i + 1] - beats[i])), 2)]
                     for i in range(0, len(beats) - 1, 16)],
        time_signature=4,
        beats=[round(float(t), 3) for t in beats],
        downbeats=[round(float(t), 3) for t in downbeats],
        sections=sections,
        fps=FPS,
        **env,
        onsets=onsets,
        notes=NOTES.format(bpm=bpm, bpm0=60 / period[:20].mean(), bpm1=60 / period[-20:].mean(),
                           res=onset_res.std() * 1000, kres=kick_res.std() * 1000,
                           first_db=float(downbeats[0]), sn=len(st), kk=len(kt), hh=len(ht)),
    )
    (common.DATA / "audio.json").write_text(json.dumps(doc, separators=(",", ":")))
    print("wrote", common.DATA / "audio.json", f"{len(beats)} beats, {len(downbeats)} downbeats, "
          f"{len(kt)} kicks, {len(st)} snares, {len(ht)} hats, {len(onsets['vocal'])} vocal onsets")
    if plots:
        make_plots(doc, stems)
    return doc


NOTES = (
    "Timeline = gapless mp3 decode (ffmpeg/libsndfile/browsers); the Demucs stems are "
    "rendered from a gapless WAV decode and need no shift. "
    "Tempo is NOT constant: the song accelerates smoothly from {bpm0:.1f} to {bpm1:.1f} BPM "
    "(mean {bpm:.3f}). beats[] follow a cubic spline of the beat index (knots every 48 beats) "
    "fitted to drum+mix onset-envelope maxima near each beat (residual sd {res:.1f} ms), phase "
    "refined on kick attacks (residual sd {kres:.1f} ms), extended through the drum-less intro "
    "and the breakdowns at the local tempo; beat_period / bpm are the song means and "
    "tempo_curve lists [time, local BPM] every 16 beats. Use beats[] (audio.ts interpolates "
    "them), never a constant period. "
    "Bar phase: four-on-the-floor kick, snare on beats 2 and 4, 8th-note off-beat hats; every "
    "chorus lands 'DOOM' of 'P(doom)' on a downbeat (bars 22/42/62/75/98/122/150). "
    "First downbeat {first_db:.3f} s; bar k starts at downbeats[k]. "
    "Sections start on downbeats; choruses include their pickup bar ('I'm upping my P-'). "
    "The bridge, the 'Just transformers' verse and the final chorus are sung twice "
    "(bars 105-129, then 129-161). Breakdowns (drums and bass out): bars 20-21, 39-41, "
    "59-61, 79-81, 95-97, 131-133, 147-148. The final 'so?' is held from 280.5 to 291.0 s; "
    "the band stops ~292.5 s. "
    "Envelopes: 100 fps, frame i centred at i/100 s, 46 ms RMS window, one-pole smoothing "
    "(10 ms attack / 90 ms release), each divided by its own 99th percentile and clipped "
    "to 0..1 (linear amplitude). low <150 Hz, mid 150-2000 Hz, high >4 kHz of the full mix; "
    "vocal/drums/bass/other = stem RMS. "
    "Onsets [time, strength 0-1] from the drums stem: kick = attack (steepest rise) of the "
    "<120 Hz band ({kk}); snare = 1.5-5 kHz attacks whose 0.5-5 kHz noise tail 40-120 ms later is in the "
    "loudest local class ({sn}); hat = >7 kHz attacks not within 40 ms of a snare or 30 ms of a kick ({hh}; mostly 8th off-beats). vocal = note "
    "onsets from the vocal stem (log-mel flux peaks + legato pitch jumps > 0.8 semitone), "
    "including backing vocals / ad-libs."
)


def make_plots(doc, stems):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    wins = [(0, 12), (14, 26), (28, 36), (56, 64), (86, 98), (106, 114), (136, 146), (148, 156.6)]
    t = np.arange(len(doc["rms"])) / FPS
    for (t0, t1) in wins:
        fig, ax = plt.subplots(3, 1, figsize=(22, 11), sharex=True,
                               gridspec_kw=dict(height_ratios=[2, 1.6, 1.4]))
        d = stems["drums"][int(t0 * SR):int(t1 * SR)]
        S = librosa.amplitude_to_db(np.abs(librosa.stft(d, n_fft=1024, hop_length=128)), ref=np.max)
        ax[0].imshow(S, origin="lower", aspect="auto", cmap="magma", vmin=-60, vmax=0,
                     extent=[t0, t0 + S.shape[1] * 128 / SR, 0, SR / 2])
        ax[0].set_ylim(0, 12000)
        ax[0].set_ylabel("drums stem")
        m = (t >= t0) & (t <= t1)
        for k, c in [("rms", "k"), ("low", "tab:red"), ("mid", "tab:green"), ("high", "tab:blue")]:
            ax[1].plot(t[m], np.array(doc[k])[m], color=c, lw=1, label=k)
        ax[1].legend(loc="upper left", fontsize=8)
        for k, c in [("vocal", "tab:purple"), ("drums", "tab:orange"), ("bass", "tab:brown"), ("other", "tab:olive")]:
            ax[2].plot(t[m], np.array(doc[k])[m], color=c, lw=1, label=k)
        ax[2].legend(loc="upper left", fontsize=8)
        for b in doc["beats"]:
            if t0 <= b <= t1:
                for a_ in ax:
                    a_.axvline(b, color="gray", lw=0.6, alpha=0.6)
        for b in doc["downbeats"]:
            if t0 <= b <= t1:
                for a_ in ax:
                    a_.axvline(b, color="c" if a_ is ax[0] else "k", lw=1.8)
        for name, y, c in [("kick", 1500, "tab:red"), ("snare", 5000, "w"), ("hat", 9500, "yellow")]:
            for (ot, s) in doc["onsets"][name]:
                if t0 <= ot <= t1:
                    ax[0].plot([ot], [y], marker="v", color=c, ms=4 + 8 * s)
        for (ot, s) in doc["onsets"]["vocal"]:
            if t0 <= ot <= t1:
                ax[2].plot([ot], [1.02], marker="v", color="tab:purple", ms=3 + 6 * s)
        for s in doc["sections"]:
            if t0 <= s["start"] <= t1:
                ax[1].text(s["start"], 1.02, s["name"], fontsize=14, color="tab:red")
                for a_ in ax:
                    a_.axvline(s["start"], color="tab:red", lw=2.5)
        ax[2].set_xlim(t0, t1)
        ax[2].set_xticks(np.arange(np.ceil(t0), t1, 0.5))
        fig.tight_layout()
        fig.savefig(common.QA / f"audio_{int(t0):03d}.png", dpi=65)
        plt.close(fig)
    # overview
    fig, ax = plt.subplots(2, 1, figsize=(24, 7), sharex=True)
    for k, c in [("rms", "k"), ("low", "tab:red"), ("high", "tab:blue")]:
        ax[0].plot(t, doc[k], color=c, lw=0.6, label=k)
    for k, c in [("vocal", "tab:purple"), ("drums", "tab:orange"), ("bass", "tab:brown"), ("other", "tab:olive")]:
        ax[1].plot(t, doc[k], color=c, lw=0.6, label=k)
    for s in doc["sections"]:
        for a_ in ax:
            a_.axvline(s["start"], color="tab:red", lw=1.5)
        ax[0].text(s["start"] + 0.2, 1.03, s["name"], fontsize=10, color="tab:red")
    for a_ in ax:
        a_.legend(loc="upper right", fontsize=8)
    ax[1].set_xticks(np.arange(0, 157, 5))
    fig.tight_layout()
    fig.savefig(common.QA / "audio_overview.png", dpi=65)
    plt.close(fig)


if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
