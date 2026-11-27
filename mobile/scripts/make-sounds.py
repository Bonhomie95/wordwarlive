#!/usr/bin/env python3
"""Synthesise WordWar's sound effects into mobile/assets/sounds/.

    python3 mobile/scripts/make-sounds.py      (needs numpy)

Everything is generated here, so there is nothing to license. Tune a sound by
editing its recipe and re-running. match-found.wav predates this script and
is left alone. Peaks set the loudness order: alerts and wins loudest, taps
and keys quietest.
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


def noise(dur, seed=7):
    return np.random.default_rng(seed).standard_normal(int(SR * dur))


def lowpass(x, k):
    """Moving average: a crude low-pass (first null at SR / k)."""
    return np.convolve(x, np.ones(k) / k, 'same')


def cymbal(dur=1.4):
    """Crash: bright noise plus a few inharmonic partials, long decay."""
    x = np.arange(int(SR * dur)) / SR
    n = noise(dur, 11)
    bright = n - lowpass(n, 6)
    metal = sum(np.sin(2 * np.pi * f * x) for f in (3150, 4470, 5930, 7310)) * 0.15
    return (bright + metal) * np.minimum(1, x / 0.002) * np.exp(-3.2 * x)


def snare(level, seed):
    """One snare stroke: a short burst of mid/high noise with a little body."""
    dur = 0.06
    x = np.arange(int(SR * dur)) / SR
    n = noise(dur, seed)
    hit = lowpass(n - lowpass(n, 24), 3) + 0.35 * np.sin(2 * np.pi * 190 * x)
    return level * hit * np.exp(-55 * x)


def whoosh(dur, rise=0.6):
    """Low-passed noise that swells then fades."""
    n = int(SR * dur)
    noise = np.convolve(np.random.default_rng(7).standard_normal(n), np.ones(24) / 24, 'same')
    x = np.linspace(0, 1, n)
    return noise * np.where(x < rise, x / rise, (1 - x) / (1 - rise))


def write(name, y, peak_db, loop_seconds=None):
    """Normalise to peak_db and save. loop_seconds pads/cuts to an exact
    length (for looping files) instead of trimming the silent tail."""
    y = y / np.abs(y).max() * 10 ** (peak_db / 20)
    if loop_seconds:
        y = np.pad(y, (0, max(0, int(SR * loop_seconds) - len(y))))[:int(SR * loop_seconds)]
    else:
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

BRASS = (1.0, 0.6, 0.45, 0.3, 0.2, 0.12)

# Victory: brass up the major chord, then hold it under a cymbal crash.
chord = sum(note(f, 1.1, BRASS, 2.8, attack=0.02) for f in (C5, E5, G5, C6))
write('win', room(mix((0, note(C5, 0.22, BRASS, 8, attack=0.015)), (0.1, note(E5, 0.22, BRASS, 8, attack=0.015)),
                      (0.2, note(G5, 0.22, BRASS, 8, attack=0.015)), (0.32, chord), (0.32, 0.5 * cymbal())), 0.25), -3)

# Defeat: the "wah wah wah waaah", soft enough to hear after every loss.
last = note(hz(67), 0.9, BRASS, 1.8, attack=0.04, glide=0.97)
last *= 1 + 0.25 * np.sin(2 * np.pi * 5.5 * np.arange(len(last)) / SR) * np.linspace(0, 1, len(last))
write('lose', room(mix((0, note(hz(70), 0.3, BRASS, 3, attack=0.04)), (0.3, note(hz(69), 0.3, BRASS, 3, attack=0.04)),
                       (0.6, note(hz(68), 0.3, BRASS, 3, attack=0.04)), (0.9, last)), 0.2), -6)

# Draw: two even notes, then an open fifth that doesn't resolve.
write('draw', room(mix((0, note(E5, 0.14, SOFT, 14)), (0.16, note(E5, 0.14, SOFT, 14)),
                       (0.34, note(hz(69), 0.7, SOFT, 4) + note(E5, 0.7, SOFT, 4))), 0.22), -5)

# Drum roll into the result: strokes speed from ~18 to ~30 a second while
# growing louder, then one accent.
rng = np.random.default_rng(3)
strokes, t = [], 0.0
while t < 1.05:
    k = t / 1.05
    strokes.append((t + rng.uniform(-0.003, 0.003) if t else 0, snare((0.2 + 0.8 * k ** 1.6) * rng.uniform(0.85, 1.0), len(strokes))))
    t += 1 / (18 + 12 * k)
strokes.append((1.08, snare(1.25, 999)))
write('drumroll', room(mix(*strokes), 0.12), -5)

# Coins: the classic two-step ding.
write('coins', room(mix((0, note(B5, 0.08, SQUARE, 25)), (0.075, note(E6, 0.45, SQUARE, 7))), 0.15), -5)

# Rank up: a fast run up, then a shimmering chord.
shimmer = sum(note(f, 0.8, (1.0, 0.3, 0.1), 3.2) for f in (G5, C6, E6))
shimmer *= 1 - 0.25 * (0.5 + 0.5 * np.sin(2 * np.pi * 12 * np.arange(len(shimmer)) / SR))
run = [(i * 0.06, note(f, 0.3, (1.0, 0.3, 0.1), 10)) for i, f in enumerate((C5, E5, G5, C6, E6))]
write('rankup', room(mix(*run, (0.32, shimmer)), 0.28), -3)

# Rank down: a soft falling sweep (a loss already played its sting).
write('rankdown', note(620, 0.45, (1.0, 0.25), 4, glide=0.5), -9)

# Button tap: a small pop. Keyboard key: a quieter, crisper tick.
write('tap', note(640, 0.06, (1.0, 0.2), 45, attack=0.001, glide=0.65), -14)
write('key', mix((0, note(2600, 0.03, (1.0,), 120, attack=0.0005)), (0, 0.15 * noise(0.003, 5))), -19)

# Searching for an opponent: a sonar ping with echoes, looped every 1.8 s.
ping = note(E6, 0.9, (1.0, 0.3, 0.1), 5, attack=0.003)
write('search', mix((0, ping), (0.18, 0.4 * ping), (0.36, 0.16 * ping)), -15, loop_seconds=1.8)

# Power-up: a rising zap over a swell of air.
write('powerup', mix((0, note(320, 0.32, (1.0, 0.3, 0.12), 3, glide=4.2)), (0, 0.25 * whoosh(0.32))), -6)
