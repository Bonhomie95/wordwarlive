"""Simulates color blindness on screenshots before the agent reads them.

SurfaceFlinger's daltonizer applies to the display, not to `adb exec-out screencap`,
and `xcrun simctl ui` has no color filter setting. Applying the simulation matrix
directly to the captured screenshot in `screen.py` ensures the agent actually sees
the filtered image across Android, iOS, and web.

Matrices are the Machado, Oliveira & Fernandes (2009) full-severity (1.0)
dichromacy RGB transforms, formatted as 12-float tuples for Pillow's
`Image.convert("RGB", matrix)`.
"""
import os

FILTERS = {
    "protanopia": (
        0.152286, 1.052583, -0.204868, 0.0,
        0.114503, 0.786281, 0.099216, 0.0,
        -0.003882, -0.048116, 1.051998, 0.0,
    ),
    "deuteranopia": (
        0.367322, 0.860646, -0.227968, 0.0,
        0.280085, 0.672501, 0.047413, 0.0,
        -0.011820, 0.042940, 0.968881, 0.0,
    ),
    "tritanopia": (
        1.255528, -0.076749, -0.178779, 0.0,
        -0.078411, 0.930809, 0.147602, 0.0,
        0.004733, 0.691367, 0.303900, 0.0,
    ),
}


def resolve(name=None):
    chosen = (os.environ.get("COLOR_FILTER", "") if name is None else str(name)).strip().lower()
    if not chosen:
        return ""
    if chosen not in FILTERS:
        raise ValueError(f"Unknown color_filter: {chosen!r}. Use one of: {', '.join(FILTERS)}.")
    return chosen


def apply(img, name=None):
    """Applies the named (or COLOR_FILTER env) dichromacy matrix to a Pillow RGB Image."""
    chosen = resolve(name)
    if not chosen:
        return img
    return img.convert("RGB", FILTERS[chosen])


def apply_rgb(r, g, b, name):
    """Pure-Python RGB tuple transform using the same 3x4 matrix (for offline tests without Pillow)."""
    m = FILTERS[resolve(name)]
    out = (
        m[0] * r + m[1] * g + m[2] * b + m[3],
        m[4] * r + m[5] * g + m[6] * b + m[7],
        m[8] * r + m[9] * g + m[10] * b + m[11],
    )
    return tuple(max(0, min(255, int(round(c)))) for c in out)
