"""The map of an app's screens, on your machine, with the paths of the testers on it.

Usage: python3 scripts/dashboard.py <collected run dir> [<another run dir> ...] [--port 8765] [--ecr <clone>]
       python3 scripts/dashboard.py --demo
       python3 scripts/dashboard.py --demo --export site/     # the online demo: static files, no server

Opens a page on http://127.0.0.1:8765 that draws every screen the testers saw as a map:
one card per screen, arrows from one screen to the next as wide as the number of testers,
a heat map of real or estimated taps on each screen. Comment a screen (trace.notes.json),
or add a check to it: what must be visible or not, possibly a known bug (trace.json).
Run it on the folders that scripts/collect.sh wrote (runs/<run id>), for instance a map
maker run (briefs/map.md) with a persona run.

Every path is a trace.json in the Explore-Compile-Replay format
(https://github.com/pierridotite/explore-compile-replay), which compiles it to a Maestro
flow that replays with no model. The dashboard changes only the checks of a trace, never its
steps, and keeps the explored trace as trace.explored.json the first time. With --ecr <clone>,
a save is refused unless `ecr validate` accepts the trace (Node 22.18+).

The results are private: the server listens on 127.0.0.1 only, and never serves
trace.params.json (the texts the agent typed).
"""
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
import xml.etree.ElementTree as ET
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PAGE = Path(__file__).resolve().parent.parent / "dashboard"
STATIC = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"),
          "/style.css": ("style.css", "text/css")}
SCREEN = re.compile(r"^(\d{1,4})\.(png|svg)$")
MEDIA = {"png": "image/png", "svg": "image/svg+xml"}
NOTES_SCHEMA = "mobile-agent-testers.notes/0"
SAME_SCREEN = 0.6   # Jaccard similarity above which two screenshots show the same screen
SAME_LAYOUT = 0.85  # likeness of two screen trees without their texts above which they show the same screen
OTHER_SCREEN = 0.3  # one tester's two screenshots whose controls are this unlike show two screens


# ---------- reading a run ----------

def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def screen_elements(xml_path):
    """Named elements of a saved screen tree: label, id, bounds, clickable. The system bars are left out."""
    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError):
        return []
    out = []
    for n in root.iter("node"):
        if (n.get("package") or "") == "com.android.systemui":
            continue
        b = re.findall(r"-?\d+", n.get("bounds", ""))
        # a name on several lines (a Flutter tab: "Send\nTab 2 of 3") on one line, as Maestro and ecr_trace.py read it
        label = ((n.get("text") or "").strip() or (n.get("content-desc") or "").strip()).replace("\n", " ")
        rid = (n.get("resource-id") or "").strip()
        if len(b) != 4 or not (label or rid):
            continue
        out.append({"label": label[:120], "id": rid, "bounds": [int(v) for v in b],
                    "clickable": n.get("clickable") == "true", "selected": n.get("selected") == "true"})
    return out


def screen_layout(xml_path):
    """A screen's tree with no text: depth, kind of element, what it does, whether it has a name.
    It stays the same in every language and text size, so it matches screens with no ids."""
    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError):
        return []
    out = []

    def walk(node, depth):
        for c in node:
            if c.tag != "node" or (c.get("package") or "") == "com.android.systemui":
                continue
            kind = (c.get("class") or "").rsplit(".", 1)[-1]
            does = "".join(k[0] for k in ("clickable", "checkable", "scrollable", "password") if c.get(k) == "true")
            named = "n" if ((c.get("text") or "").strip() or (c.get("content-desc") or "").strip()) else ""
            out.append(f"{depth}{kind}{does}{named}")
            walk(c, depth + 1)

    walk(root, 0)
    return out


def layout_likeness(a, b):
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() if a and b else 0.0


def tokens(elements):
    """What identifies a screen: its ids (the same in every language) and the names of its controls."""
    found = set()
    for e in elements:
        if e["id"]:
            found.add("id:" + e["id"])
        # a control's name, unless it is only a number or a time, which changes from one visit to the next
        if e["clickable"] and e["label"] and len(e["label"]) <= 40 and e["label"].strip("0123456789 :.,%"):
            found.add("label:" + e["label"])
    return found


def similarity(a, b):
    """Jaccard similarity of two screens. On ids alone when both have a few: ids do not change
    with the language, so the same screen in French and in Japanese still matches."""
    ids_a, ids_b = {t for t in a if t.startswith("id:")}, {t for t in b if t.startswith("id:")}
    if len(ids_a) >= 3 and len(ids_b) >= 3:
        a, b = ids_a, ids_b
    return len(a & b) / len(a | b) if a and b else 0.0


def title_of(elements):
    """A short name for a screen: its top-most text that is not a control."""
    texts = [e for e in elements if e["label"] and not e["clickable"] and 2 <= len(e["label"]) <= 40]
    texts.sort(key=lambda e: (e["bounds"][1], e["bounds"][0]))
    return texts[0]["label"] if texts else ""


def same_screen(a, b):
    """How much two screenshots look like one screen of the app, from 0 to 1, and whether that is
    enough. Ids first, as they do not change with the language. With no ids, the tree without its
    texts, so the same screen in Arabic, in Japanese or at 200% text still matches. Last, the names
    of the controls."""
    ids_a, ids_b = {t for t in a["tokens"] if t.startswith("id:")}, {t for t in b["tokens"] if t.startswith("id:")}
    if len(ids_a) >= 3 and len(ids_b) >= 3:
        score = similarity(a["tokens"], b["tokens"])
        return score, score >= SAME_SCREEN
    if len(a["layout"]) >= 3 and len(b["layout"]) >= 3:
        score = layout_likeness(a["layout"], b["layout"])
        return score, score >= SAME_LAYOUT
    score = similarity(a["tokens"], b["tokens"])
    return score, score >= SAME_SCREEN


def told_apart(shot, group):
    """True when the group holds a screenshot of the same tester whose controls are unlike this one's:
    in one language, other names mean another screen, even with the same layout."""
    mine = {t for t in shot["tokens"] if t.startswith("label:")}
    for other in group["shots"]:
        if other["key"] == shot["key"]:
            theirs = {t for t in other["tokens"] if t.startswith("label:")}
            if len(mine) >= 2 and len(theirs) >= 2 and len(mine & theirs) / len(mine | theirs) < OTHER_SCREEN:
                return True
    return False


def group_screens(personas):
    """Gives each screenshot a group: screenshots of the same screen, by any tester, in any language,
    text size or device, share it. A heat map adds up the taps of a group. The screen right after a
    fresh start of the app is one screen for every tester, also when a tablet lays it out its own way."""
    groups = []   # {"shots": [...], "titles": Counter}
    for p in personas:
        for nn, screen in sorted(p["screens"].items()):
            shot = {"key": p["key"], "nn": nn, "tokens": screen.pop("_tokens"), "layout": screen.pop("_layout"),
                    "start": nn == p.get("_start")}
            best, score = None, 0.0
            for i, g in enumerate(groups):
                s, enough = same_screen(shot, g["shots"][0])
                if enough and s > score and not told_apart(shot, g):
                    best, score = i, s
            if best is None and shot["start"]:
                best = next((i for i, g in enumerate(groups) if g["start"] and not told_apart(shot, g)), None)
            if best is None:
                groups.append({"shots": [], "titles": Counter(), "start": False})
                best = len(groups) - 1
            g = groups[best]
            g["shots"].append(shot)
            g["start"] = g["start"] or shot["start"]
            if screen["title"]:
                g["titles"][screen["title"]] += 1
            for e in screen["elements"]:
                if e.get("selected") and e["clickable"] and e["label"]:   # the tab the screen is on
                    g.setdefault("tabs", Counter())[re.sub(r"\s*Tab \d+ of \d+$", "", e["label"])] += 1
            for t, y in steady_texts(screen["elements"]).items():
                g.setdefault("seen_by", {}).setdefault(t, set()).add(p["key"])
                g.setdefault("heights", Counter())[t] += y
                g.setdefault("texts", Counter())[t] += 1
            screen["group"] = f"g{best + 1}"
    # members: every screenshot of the screen; the first one stands for it on the map
    return {f"g{i + 1}": {"title": group_title(g), "count": len(g["shots"]),
                          "members": [{"key": s["key"], "nn": s["nn"]} for s in g["shots"]]}
            for i, g in enumerate(groups)}


def steady_texts(elements):
    """The texts of a screenshot that can name its screen: not a control, not a number, at most 40 characters,
    each with its height on the screen."""
    out = {}
    for e in elements:
        t = e["label"]
        if t and not e["clickable"] and 2 <= len(t) <= 40 and t.strip("0123456789 :.,%#+-/") and t not in out:
            out[t] = e["bounds"][1]
    return out


def group_title(g):
    """A card's name: the text most of its testers (or starts of the app) share, as a random device name
    or a date changes from one to the next; the highest on the screen first. Else the title of most screenshots."""
    seen_by, heights, texts = g.get("seen_by") or {}, g.get("heights") or Counter(), g.get("texts") or Counter()
    keys = {s["key"] for s in g["shots"]}
    if seen_by and len(keys) > 1:   # shared by several testers or starts of the app: not a random name
        best = max(len(v) for v in seen_by.values())
        if best >= 2 and best * 2 >= len(keys):
            return min((t for t, v in seen_by.items() if len(v) == best), key=lambda t: heights[t] / texts[t])
    tabs = g.get("tabs")
    if tabs and len(g["shots"]) > 1:
        tab, n = tabs.most_common(1)[0]
        if n * 2 >= len(g["shots"]):
            return tab
    return g["titles"].most_common(1)[0][0] if g["titles"] else ""


def fresh_start_screen(trace):
    """The screenshot right after the trace starts the app with its data cleared, if it does."""
    steps = trace.get("steps") if isinstance(trace, dict) else None
    if not isinstance(steps, list) or len(steps) < 2 or not isinstance(steps[0], dict):
        return None
    action = steps[0].get("action") or {}
    if action.get("kind") != "launchApp" or not action.get("clearState"):
        return None
    evidence = steps[1].get("evidence") if isinstance(steps[1], dict) else None
    if isinstance(evidence, dict) and isinstance(evidence.get("screen"), str):
        return evidence["screen"]
    last = trace.get("evidence") if len(steps) == 1 else None
    return last.get("lastScreen") if isinstance(last, dict) else None


def find_traces(root):
    """Every trace.json under a collected run, or a single results dir."""
    root = Path(root)
    found = [p for p in sorted(root.rglob("trace.json")) if "node_modules" not in p.parts]
    return found


def as_roots(roots):
    return [Path(r) for r in (roots if isinstance(roots, (list, tuple)) else [roots])]


def key_of(roots, i, folder):
    """A persona's key: its path in the run, prefixed by the run's number when several runs are open."""
    rel = folder.relative_to(roots[i]).as_posix() if folder != roots[i] else "."
    return rel if len(roots) == 1 else f"{i + 1}:{rel}"


def locate(roots, key):
    """The folder a key names, or None. It must sit inside one of the runs."""
    roots = [r.resolve() for r in roots]
    i, rel = 0, key or ""
    if len(roots) > 1:
        head, _, rel = rel.partition(":")
        if not head.isdigit() or not 1 <= int(head) <= len(roots):
            return None
        i = int(head) - 1
    root = roots[i]
    folder = (root / rel).resolve() if rel and rel != "." else root
    if folder != root and root not in folder.parents:
        return None
    return folder


def load_run(roots):
    roots = as_roots(roots)
    personas = []
    for i, root in enumerate(roots):
        for trace_path in find_traces(root):
            load_persona(personas, roots, i, trace_path)
    groups = group_screens(personas)
    for p in personas:
        p.pop("_start", None)
    return {"run": " + ".join(r.resolve().name for r in roots), "personas": personas, "groups": groups}


def load_persona(personas, roots, i, trace_path):
    folder = trace_path.parent
    trace = read_json(trace_path)
    if not isinstance(trace, dict):
        return
    screens = {}
    for f in sorted(folder.iterdir()):
        m = SCREEN.match(f.name)
        if not m:
            continue
        elements = screen_elements(folder / f"{m.group(1)}.xml")
        screens[m.group(1)] = {"file": f.name, "elements": elements, "title": title_of(elements),
                               "_tokens": tokens(elements), "_layout": screen_layout(folder / f"{m.group(1)}.xml")}
        # Optional: where a saliency model predicts the eye goes, [[x, y, weight], ...] in 0..1.
        # The map shows it instead of its own estimate.
        saliency = read_json(folder / f"{m.group(1)}.saliency.json")
        if isinstance(saliency, dict) and isinstance(saliency.get("points"), list):
            screens[m.group(1)]["saliency"] = [pt for pt in saliency["points"]
                                               if isinstance(pt, list) and len(pt) == 3 and all(isinstance(v, (int, float)) for v in pt)][:2000]
    findings = read_json(folder / "findings.json")
    notes = read_json(folder / "trace.notes.json") or {"schema": NOTES_SCHEMA, "screens": {}}
    personas.append({
        "key": key_of(roots, i, folder),
        "trace": trace,
        "notes": notes,
        "findings": findings,
        # the map maker of briefs/map.md explores every screen; it is not a persona
        "mapper": isinstance(findings, dict) and findings.get("mode") == "map",
        "screens": screens,
        "_start": fresh_start_screen(trace),
    })


# ---------- checking and writing ----------

def check_trace(trace):
    """The checks that keep a trace usable even without ECR at hand. ECR checks the rest."""
    problems = []
    if not isinstance(trace, dict):
        return ["the trace is not a JSON object"]
    if trace.get("schema") != "ecr.trace/0":
        problems.append('schema must be "ecr.trace/0"')
    steps = trace.get("steps")
    if not isinstance(steps, list) or not steps:
        return problems + ["a trace needs at least one step"]
    ids = [s.get("id") if isinstance(s, dict) else None for s in steps]
    if any(not isinstance(i, str) or not i for i in ids):
        problems.append("every step needs an id")
    elif len(set(ids)) != len(ids):
        problems.append("two steps have the same id")
    for s in steps:
        if not isinstance(s, dict) or not isinstance(s.get("action"), dict) or not s["action"].get("kind"):
            problems.append(f"step {s.get('id') if isinstance(s, dict) else '?'} has no action")
    oracle_ids = []
    for s in steps:
        for o in (s.get("checkpoints") or []) if isinstance(s, dict) else []:
            check = o.get("check") if isinstance(o, dict) else None
            target = check.get("target") if isinstance(check, dict) else None
            oracle_ids.append(o.get("id") if isinstance(o, dict) else None)
            if not isinstance(check, dict) or check.get("kind") not in ("visible", "notVisible") or not isinstance(target, dict) or not ({"text", "id"} & set(target)):
                problems.append(f"check {oracle_ids[-1]} must say visible or notVisible, of a text or an id")
            elif o.get("observed", "held") not in ("held", "failed"):
                problems.append(f"check {oracle_ids[-1]}: observed is held or failed")
    if any(not isinstance(i, str) or not i for i in oracle_ids) or len(set(oracle_ids)) != len(oracle_ids):
        problems.append("every check needs its own id")
    first = steps[0].get("action", {}) if isinstance(steps[0], dict) else {}
    if trace.get("adapter", {}).get("id") == "mobile-maestro" and first.get("kind") != "launchApp":
        problems.append("the first step of a mobile trace must be launchApp")
    return problems


def write_atomic(path, data):
    path = Path(path)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def ecr_command(ecr, *args):
    """Runs the ECR command of a local clone. Returns (exit code, output)."""
    cli = Path(ecr) / "packages" / "cli" / "src" / "main.ts"
    node = shutil.which("node")
    if not node or not cli.exists():
        return 2, f"ECR not found: needs node and {cli}"
    try:
        r = subprocess.run([node, str(cli), *args], cwd=ecr, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        return 2, "ECR took more than 60 s"
    return r.returncode, (r.stdout + r.stderr).strip()


def ecr_adapter(ecr):
    return str(Path(ecr) / "packages" / "adapter-maestro" / "src" / "index.ts")


# ---------- the server ----------

class App:
    def __init__(self, roots, ecr=None):
        self.roots = [r.resolve() for r in as_roots(roots)]
        self.root = self.roots[0]
        self.ecr = str(Path(ecr).resolve()) if ecr else None
        self.lock = threading.Lock()

    def folder(self, key):
        """The results dir of a persona, only if it holds a trace and sits inside a run."""
        folder = locate(self.roots, key)
        return folder if folder and (folder / "trace.json").exists() else None


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "mobile-agent-testers-dashboard"

        def log_message(self, *args):   # paths can hold app names: keep the terminal quiet
            pass

        def send(self, code, body, kind="application/json"):
            data = body if isinstance(body, bytes) else (json.dumps(body, ensure_ascii=False) if kind == "application/json" else body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", kind + ("; charset=utf-8" if not kind.startswith("image/png") else ""))
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            url = urlparse(self.path)
            q = parse_qs(url.query)
            if url.path in STATIC:
                name, kind = STATIC[url.path]
                return self.send(200, (PAGE / name).read_bytes(), kind)
            if url.path == "/api/run":
                with app.lock:
                    run = load_run(app.roots)
                run["ecr"] = bool(app.ecr)
                return self.send(200, run)
            if url.path == "/api/screen":
                folder = app.folder(q.get("persona", [""])[0])
                name = q.get("name", [""])[0]
                m = SCREEN.match(name)
                if not folder or not m or not (folder / name).is_file():
                    return self.send(404, {"error": "no such screen"})
                return self.send(200, (folder / name).read_bytes(), MEDIA[m.group(2)])
            return self.send(404, {"error": "not found"})

        def do_POST(self):
            # A page of another site cannot send this header without the browser asking first.
            if self.headers.get("X-Dashboard") != "1" or "application/json" not in (self.headers.get("Content-Type") or ""):
                return self.send(403, {"error": "refused"})
            url = urlparse(self.path)
            folder = app.folder(parse_qs(url.query).get("persona", [""])[0])
            if not folder:
                return self.send(404, {"error": "no such persona"})
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"null")
            except ValueError:
                return self.send(400, {"error": "not JSON"})
            if url.path == "/api/notes":
                if not isinstance(body, dict) or not isinstance(body.get("screens", {}), dict) or not isinstance(body.get("steps", {}), dict):
                    return self.send(400, {"error": "notes need a screens object"})
                body["schema"] = NOTES_SCHEMA
                with app.lock:
                    write_atomic(folder / "trace.notes.json", body)
                return self.send(200, {"ok": True})
            if url.path == "/api/trace":
                return self.save(folder, body)
            return self.send(404, {"error": "not found"})

        def save(self, folder, trace):
            """Writes a trace whose checks were edited. Its steps must stay those that were explored."""
            problems = check_trace(trace)
            with app.lock:
                explored = folder / "trace.explored.json"
                before = read_json(explored if explored.exists() else folder / "trace.json") or {}
                strip = lambda t: [{k: v for k, v in st.items() if k != "checkpoints"} for st in t.get("steps", []) if isinstance(st, dict)]
                if not problems and isinstance(trace, dict) and strip(trace) != strip(before):
                    problems = ["only checks can change: the steps must stay as explored"]
                if not problems and app.ecr:
                    with tempfile.TemporaryDirectory(prefix="dashboard-") as tmp:
                        path = Path(tmp) / "trace.json"
                        path.write_text(json.dumps(trace, ensure_ascii=False), encoding="utf-8")
                        code, out = ecr_command(app.ecr, "validate", str(path), "--adapter", ecr_adapter(app.ecr))
                    if code != 0:
                        problems = [out]
                if problems:
                    return self.send(422, {"ok": False, "problems": problems})
                if not explored.exists():
                    shutil.copyfile(folder / "trace.json", explored)
                write_atomic(folder / "trace.json", trace)
            return self.send(200, {"ok": True, "checkedByEcr": bool(app.ecr)})

    return Handler


def export(roots, out):
    """Writes the page and a run as static files, for the online demo. Comments then stay in the
    browser and Save downloads them. Never export a real run: the files are public once hosted."""
    out = Path(out)
    roots = as_roots(roots)
    run = load_run(roots)
    run["static"] = True
    run["ecr"] = False
    run["run"] = "Demo on a made-up to-do app"
    about = read_json(roots[0] / "demo.json") if len(roots) == 1 else None   # written by scripts/demo_pack.py
    if isinstance(about, dict) and about.get("name"):
        run["run"] = "Demo on a real open-source app"
        run["appName"] = about["name"]
        run["demoNote"] = "Run it on your app"
    (out / "api").mkdir(parents=True, exist_ok=True)
    for name, _ in STATIC.values():
        shutil.copyfile(PAGE / name, out / name)
    for i, p in enumerate(run["personas"]):
        folder = locate(roots, p["key"])
        target = out / "screens" / f"t{i + 1}"
        target.mkdir(parents=True, exist_ok=True)
        for screen in p["screens"].values():
            shutil.copyfile(folder / screen["file"], target / screen["file"])
            screen["url"] = f"screens/t{i + 1}/{screen['file']}"
    for name in ("run", "run.json"):   # "run" is what the page asks for first
        (out / "api" / name).write_text(json.dumps(run, ensure_ascii=False), encoding="utf-8")
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("run", nargs="*", help="collected runs (runs/<run id>), or results dirs. Several: a map run with persona runs")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--ecr", help="a clone of explore-compile-replay: each save of checks must pass `ecr validate`")
    parser.add_argument("--demo", action="store_true", help="open the demo: dashboard/demo-data if it holds runs of a public app, else a made-up run")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--export", metavar="DIR", help="write a static copy for the online demo instead of serving")
    args = parser.parse_args(argv)

    if args.demo:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        packed = Path(__file__).resolve().parent.parent / "dashboard" / "demo-data"
        if find_traces(packed):   # runs of a public app (scripts/demo_pack.py): a copy, so edits never touch the repo
            roots = [Path(shutil.copytree(packed, Path(tempfile.mkdtemp(prefix="dashboard-demo-")) / "run"))]
        else:
            import dashboard_demo
            roots = [dashboard_demo.write(Path(tempfile.mkdtemp(prefix="dashboard-demo-")))]
    elif args.run:
        roots = [Path(r) for r in args.run]
    else:
        parser.error("give a run dir (runs/<run id>), or --demo")
    for root in roots:
        if not root.is_dir():
            parser.error(f"{root} is not a folder")
    root = roots[0]
    count = sum(len(find_traces(r)) for r in roots)
    if not count:
        print(f"No trace.json under {root}. Traces come from Android testers (scripts/ecr_trace.py).")
        return 1
    if args.export:
        if not args.demo:
            parser.error("--export is for the demo only: a real run is private")
        print(f"Static demo written to {export(roots, args.export)}")
        return 0
    if args.ecr and not (Path(args.ecr) / "packages" / "cli" / "src" / "main.ts").exists():
        parser.error(f"{args.ecr} is not a clone of explore-compile-replay")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(App(roots, args.ecr)))
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"{count} paths. Map: {url}  (Ctrl+C to stop)")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
