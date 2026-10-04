"""Synthesised A/B test music clip + parametric (RBJ peaking) EQ rendering."""
import io
import wave
from functools import lru_cache

import numpy as np
from scipy.signal import sosfilt

SR = 44100
_BASE = None


def _hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def _saw(freq, t, harmonics=14):
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if freq * k > SR / 2 - 500:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out


def _music():
    """12s loop: kick, snare, hats, sub bass, pads and a bright pluck lead (full-spectrum)."""
    global _BASE
    if _BASE is not None:
        return _BASE
    rng = np.random.default_rng(7)
    beat = 60 / 100
    bar = beat * 4
    n = int(SR * bar * 5)
    out = np.zeros(n)

    def add(sig, start):
        s = int(start * SR)
        e = min(n, s + len(sig))
        if s < n:
            out[s:e] += sig[: e - s]

    kl = int(0.4 * SR)
    kt = np.arange(kl) / SR
    kf = 45 + 110 * np.exp(-kt * 30)
    kick = np.sin(2 * np.pi * np.cumsum(kf) / SR) * np.exp(-kt * 8) * 0.9
    sl = int(0.25 * SR)
    st = np.arange(sl) / SR
    snare = (rng.standard_normal(sl) * 0.45 + np.sin(2 * np.pi * 185 * st) * 0.5) * np.exp(-st * 16)
    hl = int(0.05 * SR)
    ht = np.arange(hl) / SR
    hat = np.diff(np.diff(rng.standard_normal(hl + 2))) * np.exp(-ht * 80) * 0.12

    chords = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62], [57, 60, 64]]
    roots = [33, 29, 36, 31, 33]
    lead = [76, 79, 81, 79, 76, 72, 74, 76]
    for b in range(5):
        b0 = b * bar
        for i in range(4):
            add(kick, b0 + i * beat)
            if i in (1, 3):
                add(snare, b0 + i * beat)
        for i in range(8):
            add(hat, b0 + i * beat / 2)
            # bass eighths
            bl = int(beat / 2 * SR)
            bt = np.arange(bl) / SR
            add(_saw(_hz(roots[b]), bt, 6) * np.exp(-bt * 4) * 0.35, b0 + i * beat / 2)
            # pluck lead
            ll = int(beat / 2 * SR)
            lt = np.arange(ll) / SR
            add(_saw(_hz(lead[(i + b) % 8]), lt, 20) * np.exp(-lt * 9) * 0.12, b0 + i * beat / 2)
        pl = int(bar * SR)
        pt = np.arange(pl) / SR
        env = np.minimum(1, pt / 0.3) * np.minimum(1, (bar - pt) / 0.2)
        pad = sum(_saw(_hz(m), pt, 10) for m in chords[b]) * env * 0.08
        add(pad, b0)
    out = out / np.max(np.abs(out)) * 0.7
    _BASE = out
    return out


def _sos(bands):
    rows = []
    for b in bands:
        f, g, q = float(b["freq"]), float(b["gain"]), float(b["q"])
        if abs(g) < 0.01:
            continue
        A = 10 ** (g / 40)
        w0 = 2 * np.pi * min(f, SR / 2 - 100) / SR
        alpha = np.sin(w0) / (2 * q)
        cw = np.cos(w0)
        a0 = 1 + alpha / A
        rows.append([(1 + alpha * A) / a0, (-2 * cw) / a0, (1 - alpha * A) / a0, 1.0, (-2 * cw) / a0, (1 - alpha / A) / a0])
    return np.array(rows) if rows else None


def _wav(sig):
    pcm = (np.clip(sig, -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


@lru_cache(maxsize=64)
def render(spec: str) -> bytes:
    """spec: 'f:g:q,f:g:q,...' (empty = flat original)."""
    base = _music()
    bands = []
    for part in [p for p in spec.split(",") if p]:
        f, g, q = part.split(":")
        bands.append({"freq": f, "gain": g, "q": q})
    sos = _sos(bands)
    if sos is None:
        return _wav(base)
    y = sosfilt(sos, base)
    # loudness-match to the original so A/B is fair, then guard peaks
    y *= np.sqrt(np.mean(base**2)) / max(np.sqrt(np.mean(y**2)), 1e-9)
    peak = np.max(np.abs(y))
    if peak > 0.98:
        y *= 0.98 / peak
    return _wav(y)
