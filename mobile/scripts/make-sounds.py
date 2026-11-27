#!/usr/bin/env python3
"""Synthesise WordWar's sound effects into mobile/assets/sounds/.

    python3 mobile/scripts/make-sounds.py      (needs numpy)

Everything is generated here, so there is nothing to license. Tune a sound by
editing its recipe and re-running. match-found.wav predates this script and
is left alone. Peaks set the loudness order: alerts and wins loudest,
per-guess sounds quietest.
"""
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'sounds'


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


C4, EB4, G4, C5, E5, G5, B5, C6, E6 = (hz(m) for m in (60, 63, 67, 72, 76, 79, 83, 84, 88))


def note(freq, dur, harm=(1.0,), decay=6.0, attack=0.004, glide=1.0):
    """A plucked note: summed harmonics, quick attack, exponential decay.
    glide is the end/start pitch ratio (1 = steady)."""
    x = np.arange(int(SR * dur)) / SR
    phase = 2 * np.pi * np.cumsum(freq * glide ** (x / dur)) / SR
    y = sum(a * np.sin((i + 1) * phase) for i, a in enumerate(harm))
    return y * np.minimum(1, x / attack) * np.exp(-decay * x)


def mix(*parts):
    """parts: (start_seconds, samples) pairs mixed into one buffer."""
    out = np.zeros(max(int(s * SR) + len(p) for s, p in parts))
    for s, p in parts:
        i = int(s * SR)
        out[i:i + len(p)] += p
    return out


def room(y, amount=0.18):
    """Cheap reverb: a few decaying echoes so notes don't sound dry."""
    out = np.concatenate([y, np.zeros(int(SR * 0.2))])
    for ms, g in ((29, 0.5), (41, 0.4), (67, 0.3), (97, 0.2), (131, 0.12)):
        d = int(SR * ms / 1000)
        out[d:d + len(y)] += amount * g * y
    return out


def whoosh(dur, rise=0.6):
    """Low-passed noise that swells then fades."""
    n = int(SR * dur)
    noise = np.convolve(np.random.default_rng(7).standard_normal(n), np.ones(24) / 24, 'same')
    x = np.linspace(0, 1, n)
    return noise * np.where(x < rise, x / rise, (1 - x) / (1 - rise))


def write(name, y, peak_db):
    y = y / np.abs(y).max() * 10 ** (peak_db / 20)
    last = np.nonzero(np.abs(y) > 10 ** (-60 / 20))[0][-1]  # trim the silent tail
    y = y[:last + 1]
    fade = min(len(y), int(SR * 0.01))
    y[-fade:] *= np.linspace(1, 0, fade)
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((y * 32767).astype('<i2').tobytes())
    print(f'{name}.wav  {len(y) / SR:.2f}s  peak {peak_db} dBFS')


SOFT = (1.0, 0.25, 0.08)
BRIGHT = (1.0, 0.35, 0.15, 0.08)
SQUARE = (1.0, 0, 0.3, 0, 0.12)

# Your guess lands: a quick, soft "tu-dip".
write('guess', room(mix((0, note(E5, 0.18, SOFT, 18)), (0.07, note(B5, 0.2, SOFT, 16))), 0.15), -10)

# Opponent guessed: a low bloop that bends down.
write('opponent', room(note(330, 0.18, (1.0, 0.15), 16, glide=0.66), 0.12), -13)

# Not a word: two short square-ish buzzes.
buzz = (1.0, 0, 0.33, 0, 0.2, 0, 0.14)
write('invalid', mix((0, note(150, 0.09, buzz, 8)), (0.12, note(150, 0.11, buzz, 8))), -9)

# Final ten seconds: a woodblock tick.
write('tick', note(1250, 0.06, (1.0, 0, 0.3), 70, attack=0.001), -11)

# Victory: up the major chord, then hold it.
chord = sum(note(f, 0.9, BRIGHT, 3.5) for f in (C5, E5, G5, C6))
write('win', room(mix((0, note(C5, 0.25, BRIGHT, 9)), (0.09, note(E5, 0.25, BRIGHT, 9)),
                      (0.18, note(G5, 0.25, BRIGHT, 9)), (0.3, chord)), 0.25), -3)

# Defeat: three falling notes, the last one sagging.
write('lose', room(mix((0, note(G4, 0.3, SOFT, 5)), (0.2, note(EB4, 0.3, SOFT, 5)),
                       (0.4, note(C4, 0.7, SOFT, 4, glide=0.94))), 0.22), -5)

# Coins: the classic two-step ding.
write('coins', room(mix((0, note(B5, 0.08, SQUARE, 25)), (0.075, note(E6, 0.45, SQUARE, 7))), 0.15), -5)

# Rank up: a fast run up, then a shimmering chord.
shimmer = sum(note(f, 0.8, (1.0, 0.3, 0.1), 3.2) for f in (G5, C6, E6))
shimmer *= 1 - 0.25 * (0.5 + 0.5 * np.sin(2 * np.pi * 12 * np.arange(len(shimmer)) / SR))
run = [(i * 0.06, note(f, 0.3, (1.0, 0.3, 0.1), 10)) for i, f in enumerate((C5, E5, G5, C6, E6))]
write('rankup', room(mix(*run, (0.32, shimmer)), 0.28), -3)

# Power-up: a rising zap over a swell of air.
write('powerup', mix((0, note(320, 0.32, (1.0, 0.3, 0.12), 3, glide=4.2)), (0, 0.25 * whoosh(0.32))), -6)
