"""After an agent run: did the agent reach the goal of each trace kept for this persona?

Usage: python3 scripts/goal_check.py <results dir of one persona> --persona ID --app-id ID [--traces traces]

The traces kept in the repository for this persona and this app (<traces>/<any>/<persona>/*.trace.json,
whose launchApp names the app) each end on a screen that their checks name. The goal of a trace is
that screen: the texts of the `visible` checks of its last step that has some. The agent reached it
when one of the screen trees saved during the run (scripts/android/screen.py) shows all those texts,
each as the whole text of one element (spaces and line breaks counted as one space).

Prints one public line per trace: its id, the step of its goal, and reached or not. No text of the app.
Never fails the run.
"""
import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SAFE = re.compile(r"[^\w.-]")


def squeezed(text):
    return re.sub(r"\s+", " ", text or "").strip()


def goal_of(trace):
    """(step id, texts) of the last step with visible checks by text, or None."""
    for step in reversed([s for s in trace.get("steps", []) if isinstance(s, dict)]):
        texts = [squeezed(c.get("check", {}).get("target", {}).get("text")) for c in step.get("checkpoints", [])
                 if isinstance(c, dict) and c.get("check", {}).get("kind") == "visible"
                 and isinstance(c.get("check", {}).get("target", {}).get("text"), str)]
        if texts:
            return str(step.get("id")), texts
    return None


def texts_of(path):
    """Whole texts of the elements of one saved screen tree."""
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError):
        return set()
    found = set()
    for node in root.iter("node"):
        for key in ("text", "content-desc"):
            text = squeezed(node.get(key))
            if text:
                found.add(text)
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--persona", required=True)
    parser.add_argument("--app-id", required=True)
    parser.add_argument("--traces", default="traces")
    args = parser.parse_args(argv)
    persona = SAFE.sub("", args.persona)
    traces = []
    for path in sorted(Path(args.traces).glob(f"*/{persona}/*.trace.json")) if persona else []:
        try:
            trace = json.loads(path.read_text(encoding="utf-8"))
            first = trace["steps"][0]["action"]
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            continue
        if first.get("kind") == "launchApp" and first.get("appId") == args.app_id:
            traces.append(trace)
    if not traces:
        return 0
    screens = [texts_of(p) for p in sorted(Path(args.results).rglob("*.xml"))]
    for trace in traces:
        name = SAFE.sub("", str(trace.get("id", "")))
        goal = goal_of(trace)
        if goal is None:
            print(f"goal: {name}: the trace has no visible check, no goal to look for")
            continue
        step, texts = goal
        hits = [i for i, seen in enumerate(screens, 1) if all(t in seen for t in texts)]
        verdict = f"reached (first on screen {hits[0]} of {len(screens)})" if hits else f"not reached on {len(screens)} screens"
        print(f"goal: {name}: screen of step {SAFE.sub('', step)} ({len(texts)} texts), {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
