"""Builds the job matrix: one row per requested persona, with its device.
Env: PERSONAS (comma-separated ids, "all" for every persona of the platform, "none" or empty to skip it), PLATFORM (android | ios | web).
Prints <platform>=<json> for $GITHUB_OUTPUT."""
import json
import os

COLOR_FILTERS = ("protanopia", "deuteranopia", "tritanopia")
NETWORK_CONDITIONS = ("slow", "flaky")

platform = os.environ.get("PLATFORM", "android")
wanted = [p.strip() for p in os.environ.get("PERSONAS", "").split(",") if p.strip()]
personas = {p["id"]: p for p in json.load(open("personas.json", encoding="utf-8"))}
if wanted == ["none"]:
    wanted = []
elif wanted == ["all"]:
    wanted = [pid for pid, p in personas.items() if p.get("platform") == platform]
missing = [p for p in wanted if p not in personas]
if missing:
    raise SystemExit(f"Unknown personas: {missing}")
other = [p for p in wanted if personas[p].get("platform", platform) != platform]
if other:  # its device settings would be silently replaced by defaults
    raise SystemExit(f"Not {platform} personas: {other}. Put them in the other platform's list.")
rows = []
for pid in wanted:
    p = personas[pid]
    d = p.get("device", {})
    geo = p.get("geo") or [48.8566, 2.3522]
    row = {"persona": pid, "theme": d.get("theme", "light"), "locale": p.get("locale", "en-US"),
           "geo": f"{geo[0]},{geo[1]}",
           "increase_contrast": "true" if d.get("increase_contrast") else "false"}
    raw_filter = d.get("color_filter")
    color_filter = "" if raw_filter is None else raw_filter
    if raw_filter is not None and raw_filter != "":
        if not isinstance(raw_filter, str) or raw_filter not in COLOR_FILTERS:
            raise SystemExit(
                f"Unknown color_filter for {pid}: {raw_filter!r}. "
                f"Use one of: {', '.join(COLOR_FILTERS)}."
            )
    row["color_filter"] = color_filter
    raw_network = d.get("network")
    network = "" if raw_network is None else raw_network
    if raw_network is not None and raw_network != "":
        if platform != "android":
            raise SystemExit(
                f"network is Android-only for now (persona {pid} is {platform})."
            )
        if not isinstance(raw_network, str) or raw_network not in NETWORK_CONDITIONS:
            raise SystemExit(
                f"Unknown network for {pid}: {raw_network!r}. "
                f"Use one of: {', '.join(NETWORK_CONDITIONS)}."
            )
    if platform == "web":  # a mobile browser: Playwright device profile, see scripts/web/browser.py
        row.update({"emulate": d.get("emulate", "iPhone 15"), "device": d.get("name", d.get("emulate", "iPhone 15")),
                    "reduce_motion": "true" if d.get("reduce_motion") else "false"})
    elif platform == "ios":
        row.update({"simulator": d.get("simulator", "iPhone 16"), "ios": str(d.get("ios", "18")),
                    "text_size": d.get("text_size", "large"),
                    "reduce_motion": "true" if d.get("reduce_motion") else "false"})
    else:
        row.update({"profile": d.get("profile", "pixel_6"), "api": d.get("android_api", 34),
                    "font_scale": str(d.get("font_scale", 1.0)), "device": d.get("name", "Pixel 6, Android 14"),
                    "network": network})
    rows.append(row)
print(f"{platform}=" + json.dumps(rows, ensure_ascii=False))
