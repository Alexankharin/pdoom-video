"""Run Whisper (word timestamps) on the time-corrected vocal stem.

Writes work/whisper_<tag>.json. Used as an independent cross-check for the
CTC forced alignment in align.py. macOS uses mlx-whisper, other platforms
openai-whisper (on CUDA when available); both return the same result layout.
"""
import common  # noqa: F401  (sets cache dirs)
import json, sys

MODELS = {
    "turbo": ("mlx-community/whisper-large-v3-turbo", "turbo"),
    "large": ("mlx-community/whisper-large-v3-mlx", "large-v3"),
}

OPTS = dict(language="en", word_timestamps=True, condition_on_previous_text=False,
            temperature=0.0, no_speech_threshold=None, hallucination_silence_threshold=None)


def vocals16k():
    p = common.WORK / "vocals16k.wav"
    if not p.exists():
        import soundfile as sf
        y, sr = common.load_stem("vocals", sr=16000)
        sf.write(p, y, sr)
    return str(p)


def transcribe(model, prompt):
    if sys.platform == "darwin":
        import mlx_whisper
        return mlx_whisper.transcribe(vocals16k(), path_or_hf_repo=model[0], initial_prompt=prompt, **OPTS)
    import torch, whisper
    m = whisper.load_model(model[1], device="cuda" if torch.cuda.is_available() else "cpu",
                           download_root=str(common.CACHE / "whisper"))
    return m.transcribe(vocals16k(), initial_prompt=prompt, **OPTS)


def run(tag, model, prompt=None):
    res = transcribe(model, prompt)
    out = common.WORK / f"whisper_{tag}.json"
    out.write_text(json.dumps(res, indent=1, default=float))
    for seg in res["segments"]:
        print(f"{seg['start']:7.2f} {seg['end']:7.2f} {seg['text']}")
    return res

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "turbo"
    prompt = ("Song lyrics about AI doom: P(doom), FOOM, shoggoth, shinigami, basilisk, "
              "Omega Point, NVDA, MLP, cdr, PTO, killswitch, orthogonality, Ilya, Loom.")
    run(which, MODELS[which])
    run(which + "_prompt", MODELS[which], prompt)
