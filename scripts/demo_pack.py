"""Turns collected runs of a PUBLIC app into the data of the online demo (dashboard/demo-data/).

Usage: python3 scripts/demo_pack.py runs/<run id> [runs/<other run id>...] --app <public source URL>
           [--name LocalSend] [--out dashboard/demo-data]

`python3 scripts/dashboard.py --demo` (and the online demo) then opens these runs instead of
the made-up app. Only what the page needs is copied, for each tester: the screenshots and
screen trees (NN.png, NN.xml), trace.json, the saliency files, and from findings.json the
mode, the screens found and each issue's title, severity and screens. Everything else stays
behind: trace.params.json (the texts typed), report.md, the agent's output, actions.tsv,
the trees saved before taps, videos. Read the result before you publish it: the screenshots
show whatever the app showed.
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

KEEP = re.compile(r"^\d{1,4}\.(png|xml|saliency\.json)$")
ISSUE_KEYS = ("title", "severity", "screen", "screens")


def findings_kept(data):
    if not isinstance(data, dict):
        return None
    kept = {k: data[k] for k in ("mode", "robot", "score") if k in data}
    kept["issues"] = [{k: i[k] for k in ISSUE_KEYS if k in i} for i in data.get("issues", []) if isinstance(i, dict)]
    if isinstance(data.get("screens_found"), list):
        kept["screens_found"] = [{k: s[k] for k in ("name", "screens", "path") if k in s}
                                 for s in data["screens_found"] if isinstance(s, dict)]
    return kept


def pack(runs, out, app, name=None):
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    copied = 0
    for i, run in enumerate(Path(r) for r in runs):
        for trace in sorted(run.rglob("trace.json")):
            src = trace.parent
            dest = out / (f"{i + 1}" if len(runs) > 1 else "") / src.relative_to(run)
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(trace, dest / "trace.json")
            for f in src.iterdir():
                if KEEP.match(f.name):
                    shutil.copy2(f, dest / f.name)
            try:
                findings = findings_kept(json.loads((src / "findings.json").read_text(encoding="utf-8")))
            except (OSError, ValueError):
                findings = None
            if findings is not None:
                (dest / "findings.json").write_text(json.dumps(findings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            copied += 1
    (out / "SOURCE.md").write_text(f"Runs of {app}, packed by scripts/demo_pack.py for the online demo of the dashboard.\n",
                                   encoding="utf-8")
    name = name or app.rstrip("/").rsplit("/", 1)[-1]
    (out / "demo.json").write_text(json.dumps({"name": name, "app": app}) + "\n", encoding="utf-8")
    return copied


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("runs", nargs="+")
    parser.add_argument("--app", required=True, help="where the app's source is public, e.g. https://github.com/localsend/localsend")
    parser.add_argument("--name", help="the app's name shown on the demo, e.g. LocalSend (default: the end of --app)")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "dashboard" / "demo-data"))
    args = parser.parse_args(argv)
    if not args.app.startswith("https://"):
        parser.error("--app must be the public address of the app's source")
    n = pack(args.runs, args.out, args.app, args.name)
    if not n:
        print("No trace.json in these runs: nothing packed")
        return 1
    print(f"{n} testers packed into {args.out}. Look at every screenshot before you publish it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
