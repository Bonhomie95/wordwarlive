"""Asks Claude which cards of the map show one screen of the app in another form, and merges them.

Usage: python3 scripts/merge_screens.py runs/<run id> [runs/<other run id>...] [--model sonnet] [--dry-run]

The map already merges for free the screens that share their ids, or their layout without the
texts, and the first screen after a fresh start. This pass is for what is left: the same screen
on a tablet laid out another way, on iOS and on Android, or in a language that wraps it
differently. It is never run on its own: it makes one `claude -p` call on your own Claude login
(Sonnet by default, a few cents for a map of about 50 cards). Only the cards' titles, the names
of their elements and the testers' languages and devices are sent, no screenshot.

Each merge goes to the trace.notes.json of the screenshot it moves (`sameAs`, `by: "claude"`).
The map shows it with "merged by Claude" and a Separate button. Traces never change.
--dry-run prints how many cards would be sent and calls nothing.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dashboard  # noqa: E402

PROMPT = """Below are the screens an app map shows as separate cards. Testers used the same
app on different phones and tablets, on Android or iOS, in different languages and text sizes.
Find the cards that show the same screen of the app in another form: another language, text
size, theme, device or platform. Do not join different screens, nor one screen in another state
(a dialog or a menu open, a list scrolled, a keyboard shown, another tab selected): those stay
apart. When unsure, leave the cards apart.
Answer with JSON only, in this shape, each pair naming two card ids:
{{"same": [["g1", "g7"], ["g3", "g12"]]}}

Cards (id: testers [language, device] | title | elements, * = tappable):
{cards}
"""


def describe(run, group_id, group):
    by_key = {p["key"]: p for p in run["personas"]}
    who = []
    for m in group["members"]:
        trace = by_key[m["key"]]["trace"]
        persona = trace.get("persona") if isinstance(trace.get("persona"), dict) else {}
        context = persona.get("context") if isinstance(persona.get("context"), dict) else {}
        who.append(f'{persona.get("id", "?")} [{persona.get("locale", "?")}, {context.get("device", "?")}]')
    first = group["members"][0]
    elements = by_key[first["key"]]["screens"][first["nn"]]["elements"]
    names = []
    for e in elements:
        name = (e["label"] or e["id"])[:40]
        if name and name not in names:
            names.append(("*" if e["clickable"] else "") + name)
    return f'{group_id}: {", ".join(sorted(set(who)))} | {group["title"] or "?"} | {"; ".join(names[:25])}'


def ask_claude(cards, model):
    exe = shutil.which("claude")
    if not exe:
        sys.exit("The claude CLI is not installed: merge the cards by hand on the map instead.")
    out = subprocess.run([exe, "-p", "--output-format", "json", "--model", model],
                         input=PROMPT.format(cards="\n".join(cards)), capture_output=True, text=True,
                         encoding="utf-8", errors="replace", timeout=600)
    answer = json.loads(out.stdout)
    pairs = json.loads(re.search(r"\{.*\}", answer.get("result", ""), re.S).group(0))["same"]
    return pairs, answer.get("total_cost_usd")


def apply(roots, run, pairs):
    """Writes each pair as a sameAs of the second card's first screenshot. Returns how many were new."""
    groups, written = run["groups"], 0
    for pair in pairs if isinstance(pairs, list) else []:
        if not (isinstance(pair, list) and len(pair) == 2 and all(g in groups for g in pair) and pair[0] != pair[1]):
            continue
        to, moved = groups[pair[0]]["members"][0], groups[pair[1]]["members"][0]
        folder = dashboard.locate(roots, moved["key"])
        if not folder:
            continue
        path = folder / "trace.notes.json"
        notes = dashboard.read_json(path) or {"schema": dashboard.NOTES_SCHEMA, "screens": {}}
        same = notes.setdefault("sameAs", {})
        if moved["nn"] in same:   # a merge made by hand stays
            continue
        same[moved["nn"]] = {"key": to["key"], "nn": to["nn"], "by": "claude"}
        dashboard.write_atomic(path, notes)
        written += 1
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("runs", nargs="+")
    parser.add_argument("--model", default=os.environ.get("MERGE_MODEL", "sonnet"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    roots = dashboard.as_roots(args.runs)
    run = dashboard.load_run(roots)
    cards = [describe(run, g, v) for g, v in run["groups"].items()]
    if len(cards) < 2:
        print("Fewer than two cards on the map: nothing to merge.")
        return 0
    if args.dry_run:
        print(f"{len(cards)} cards would be sent to Claude ({args.model}), with their titles and element names.")
        return 0
    print(f"Asking Claude ({args.model}, on your Claude login) about {len(cards)} cards...", file=sys.stderr)
    try:
        pairs, cost = ask_claude(cards, args.model)
    except Exception as e:  # no login, usage limit, timeout, not JSON...
        print(f"Claude gave no usable answer ({type(e).__name__}): nothing merged.", file=sys.stderr)
        return 1
    n = apply(roots, run, pairs)
    print(f"{n} merges written to trace.notes.json" + (f", ${cost:.2f}" if isinstance(cost, (int, float)) else "")
          + ". Open the map to check them: each has a Separate button.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
