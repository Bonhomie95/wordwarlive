"""Turns what an agent did on the phone into a trace that can be replayed with no model.

Usage: python3 scripts/ecr_trace.py <results dir of one persona> --persona ID --app-id ID
           [--personas personas.json] [--log actions.tsv] [--agent-output agent-output.json]
           [--now 2026-01-01T00:00:00Z]

Reads the notes taken during the run (scripts/android/shim/adb, screen.py, type.py)
and the screen trees screen.py saved, and writes in the results dir:
- trace.json: the path, in the Explore-Compile-Replay format
  (https://github.com/pierridotite/explore-compile-replay). A tap is stored with the
  name of the element that was under it, not with its coordinates, so the path
  still replays when the layout moves.
  Each step also says what was seen (`evidence`: the screenshot before the action,
  where the finger landed, the screen size), for tools that show the path.
- trace.params.json: every text the agent typed. The trace holds only their names
  (TEXT_1, TEXT_2...), so it can be committed. This file must not be.

The trace is a path, with no checks yet: replayed, it fails when a step no longer
finds its target. When the agent leaves the app and opens it again with adb
(`monkey -p`, `am start`), the trace opens it again too (launchApp, its data kept).
A Back pressed while the keyboard was open is written as hideKeyboard: the replay
closes the keyboard only if it is open, and never leaves the screen for it.
Android only for now.
"""
import argparse
import datetime
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

KEYS = {"KEYCODE_BACK": "Back", "4": "Back", "KEYCODE_ENTER": "Enter", "66": "Enter",
        "KEYCODE_HOME": "Home", "3": "Home", "KEYCODE_DEL": "Backspace", "67": "Backspace"}
END = {"KEYCODE_MOVE_END", "123"}   # the cursor to the end of the field: no key of a replay does it


def read_screen(path):
    """Elements of a saved screen tree, in document order (see read_tree)."""
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError):
        return []
    return read_tree(root)


def read_tree(root):
    """Elements of a screen tree, in document order. Each one is a dict:
    label (its text, else its description), names (every text Maestro can match it by),
    id, bounds [x1, y1, x2, y2], parent (its place in the list, None at the top) and
    package (the app that draws it: the home screen is another app)."""
    nodes = []
    todo = [(child, None) for child in reversed(list(root))]
    while todo:   # no recursion: a screen tree can be deep
        element, parent = todo.pop()
        here = parent
        bounds = re.findall(r"-?\d+", element.get("bounds", ""))
        if element.tag == "node" and len(bounds) == 4:
            # A name on several lines (a Flutter tab is "Send\nTab 2 of 3") is kept on one: Maestro
            # also matches a name with each of its line breaks read as a space.
            names = [value.replace("\r\n", "\n").replace("\n", " ")
                     for value in (element.get(key) or "" for key in ("text", "content-desc", "hint")) if value.strip()]
            nodes.append({"label": names[0] if names else "", "names": names, "id": (element.get("resource-id") or "").strip(),
                          "bounds": [int(b) for b in bounds], "parent": parent, "package": (element.get("package") or "").strip()})
            here = len(nodes) - 1
        todo.extend((child, here) for child in reversed(list(element)))
    return nodes


def shows(label, typed):
    """True when a name on the screen holds a text the agent typed (its e-mail in a greeting)."""
    return any(len(text) >= 3 and text in label for text in typed)


def found_by(nodes, key, name):
    """The places of the elements a replay finds for this name or id, in the order it counts them.
    Maestro keeps the deepest elements that match (a button and the text inside it share a name:
    it keeps the text), then counts them from the top of the screen, then from the left."""
    if key == "text":
        found = [i for i, node in enumerate(nodes) if name in node["names"]]
    else:
        found = [i for i, node in enumerate(nodes) if node["id"] == name or node["id"].rsplit("/", 1)[-1] == name]
    above = set()
    for i in found:
        parent = nodes[i]["parent"]
        while parent is not None and parent not in above:
            above.add(parent)
            parent = nodes[parent]["parent"]
    return sorted((i for i in found if i not in above), key=lambda i: (nodes[i]["bounds"][1], nodes[i]["bounds"][0]))


def inside(nodes, i, ancestor):
    while i is not None and i != ancestor:
        i = nodes[i]["parent"]
    return i is not None


def target_at(nodes, x, y, width, height, typed=None):
    """How a replay should find what was tapped: by name, else by id, else by position.
    Returns the target, the bounds of the element it names (None for a position) and, when a tap
    on the centre of that element would land on something else than the finger did, where in
    the element the finger was ("x%,y%" of its box, else None): an icon with no name inside a
    card that has one. An id that covers half of the screen or more says nothing of what was
    tapped inside it (the one view a Flutter app draws itself in): a position is used.
    typed: {text the agent typed: its name}. A name on the screen that is exactly a typed text
    (a task it just added) is stored as that name; one that holds a typed text is not used.
    So typed texts stay out of the trace."""
    typed = typed or {}
    under = lambda i: nodes[i]["bounds"][0] <= x <= nodes[i]["bounds"][2] and nodes[i]["bounds"][1] <= y <= nodes[i]["bounds"][3]  # noqa: E731
    area = lambda i: (nodes[i]["bounds"][2] - nodes[i]["bounds"][0]) * (nodes[i]["bounds"][3] - nodes[i]["bounds"][1])  # noqa: E731
    hits = sorted((i for i in range(len(nodes)) if under(i) and (nodes[i]["label"] or nodes[i]["id"])), key=area)   # the smallest first
    for key in ("text", "id"):   # a name first: it survives a refactoring better than an id
        for hit in hits:
            name = nodes[hit]["label" if key == "text" else "id"]
            if not name or "${" in name or len(name) > 80 or "\n" in name or name != name.strip():
                continue
            if key == "text" and name in typed:
                value = {"param": typed[name]}
            elif shows(name, typed):
                continue
            else:
                value = name
            found = found_by(nodes, key, name)
            # The element the replay will act on: the one tapped, or the deepest one with that name inside it
            chosen = [i for i in found if inside(nodes, i, hit)]
            chosen = [i for i in chosen if under(i)] or chosen
            if not chosen:
                continue
            box = nodes[chosen[0]]["bounds"]
            everything = [i for i in range(len(nodes)) if under(i)]
            finger = nodes[min(everything, key=area)]["bounds"]   # the smallest thing under the finger, named or not
            centre = ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)
            same = finger[0] <= centre[0] <= finger[2] and finger[1] <= centre[1] <= finger[3]
            if key == "id" and width > 0 and height > 0 and 2 * area(chosen[0]) >= width * height:
                break   # the id of a whole screen: only the position says what was tapped
            target = {key: value}
            if len(found) > 1:
                target["index"] = found.index(chosen[0])
            inside_it = None
            if not same and box[0] <= x <= box[2] and box[1] <= y <= box[3] and box[2] > box[0] and box[3] > box[1]:
                inside_it = percent(x - box[0], y - box[1], box[2] - box[0], box[3] - box[1])
            return target, list(box), inside_it
        else:
            continue
        break
    if width > 0 and height > 0:
        return {"point": percent(x, y, width, height)}, None, None
    return None, None, None


RIGHT_TO_LEFT = {"ar", "fa", "he", "iw", "ur"}   # languages whose text ends on the left of a field


def end_of(nodes, bounds, x, y, right_to_left=False):
    """Where a tap in this element puts the cursor after its text: "97%,90%" of its box, None when unknown.
    A replay erases before the cursor, the agent's tool erases from the end: before a field is
    emptied, the tap of the replay must land where the text ends. A place is not used when it is
    covered by something that was not under the finger (the cross that empties a field)."""
    if not bounds or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
        return None
    tapped = {i for i, node in enumerate(nodes) if node["bounds"][0] <= x <= node["bounds"][2] and node["bounds"][1] <= y <= node["bounds"][3]}
    for side in (97, 90, 80, 70, 60):
        across = 100 - side if right_to_left else side
        px = bounds[0] + (bounds[2] - bounds[0]) * across / 100
        py = bounds[1] + (bounds[3] - bounds[1]) * 0.9
        covered = any(i not in tapped and node["bounds"][0] <= px <= node["bounds"][2] and node["bounds"][1] <= py <= node["bounds"][3]
                      for i, node in enumerate(nodes))
        if not covered:
            return f"{across}%,90%"
    return None


def found_how(steps):
    """How the taps of a path are found again, in numbers only: a name survives a change of the
    app better than an id, and an id better than a position."""
    taps = [s["action"] for s in steps if s["action"].get("kind") in ("tapOn", "longPressOn")]
    by = lambda key: sum(1 for a in taps if key in a.get("target", {}))  # noqa: E731
    inside = sum(1 for a in taps if a.get("at"))
    return f"{len(taps)} taps: {by('text')} by name, {by('id')} by id, {by('point')} by position, {inside} at a place inside the element"


def percent(x, y, width, height):
    return f"{min(100, max(0, round(100 * x / width)))}%,{min(100, max(0, round(100 * y / height)))}%"


def ends_of(direction, x1, y1, x2, y2, width, height):
    """The two ends of a swipe in percent of the screen, {} when the screen size is unknown
    or when, in percent, the finger no longer moves in its direction (a very short swipe)."""
    if width <= 0 or height <= 0:
        return {}
    start, stop = percent(x1, y1, width, height), percent(x2, y2, width, height)
    (a1, b1), (a2, b2) = ([int(part.rstrip("%")) for part in point.split(",")] for point in (start, stop))
    moves = {"UP": b2 < b1, "DOWN": b2 > b1, "LEFT": a2 < a1, "RIGHT": a2 > a1}[direction]
    return {"from": start, "to": stop} if moves else {}


COMMANDS = {"tap", "swipe", "text", "keyevent", "draganddrop", "press", "roll", "motionevent", "keycombination"}
SOURCES = {"touchscreen", "keyboard", "mouse", "touchpad", "stylus", "dpad", "gamepad", "trackball", "joystick", "touchnavigation"}


def input_args(fields):
    """['shell', 'input', 'tap', '1', '2'] or ['shell', 'input tap 1 2'] -> ['tap', '1', '2'].
    A source before the command (`input touchscreen tap`) and a display (`-d 0`) are dropped."""
    words = " ".join(fields[1:]).split()
    if words[:1] != ["input"]:
        return []
    words = words[1:]
    while words and (words[0] in SOURCES or words[0] == "-d"):
        words = words[2:] if words[0] == "-d" else words[1:]
    return words


AM_COMMANDS = {"start", "start-activity", "startservice", "start-service", "start-foreground-service", "stopservice", "stop-service",
               "force-stop", "kill", "kill-all", "broadcast", "instrument", "stack", "task", "crash", "hang", "restart", "monitor"}


def launch_of(fields, app_id):
    """What a noted `adb shell monkey ...` or `adb shell am ...` does, in words of adb only: "launch" when it
    opens the app, else its command ("monkey", "am force-stop"). None for any other command."""
    words = " ".join(fields[1:]).split() if fields[:1] == ["shell"] else []
    if not words or words[0] not in ("monkey", "am"):
        return None
    if words[0] == "monkey":
        return "launch" if app_id and app_id in [words[i + 1] for i, word in enumerate(words[:-1]) if word == "-p"] else "monkey"
    command = words[1] if len(words) > 1 and words[1] in AM_COMMANDS else "other" if len(words) > 1 else ""
    if app_id and command in ("start", "start-activity") and any(w == app_id or w.startswith(app_id + "/") for w in words[2:]):
        return "launch"
    return f"am {command}".strip()


def text_typed_with_adb(fields):
    """The text of `adb shell input text ...`, as the phone got it: %s is a space, quotes and backslashes are the shell's."""
    raw = " ".join(fields[1:])
    found = re.search(r"\binput\s+(?:(?:%s)\s+)?text\s+(.*)$" % "|".join(sorted(SOURCES)), raw, re.S)
    text = found.group(1).strip() if found else ""
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        text = text[1:-1]
    return re.sub(r"\\(.)", r"\1", text).replace("%s", " ")


def left_out(lines):
    """What was left out, in words of adb only, never a text: 'keyevent KEYCODE_TAB', 'text', 'tap'."""
    kinds = []
    for line in lines:
        args = input_args(line.split("\t")[2:])
        kind = args[0] if args and args[0] in COMMANDS else (launch_of(line.split("\t")[2:], None) or "other")
        if kind == "keyevent":
            keys = [a for a in args[1:] if a not in KEYS and re.fullmatch(r"KEYCODE_[A-Z0-9_]{1,30}|\d{1,3}", a)]
            kind += f" {keys[0]}" if keys else ""
        if kind not in kinds:
            kinds.append(kind)
    return ", ".join(kinds[:5])


def model_of(path):
    """The model that did most of the run, read from what `claude -p --output-format json` printed. None when unknown."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return None
    if isinstance(data, list):   # some versions print every message: the result comes last
        data = next((m for m in reversed(data) if isinstance(m, dict) and m.get("type") == "result"), None)
    usage = data.get("modelUsage") if isinstance(data, dict) else None
    if not isinstance(usage, dict):
        return None
    written = {name: (use.get("outputTokens") or 0) if isinstance(use, dict) else 0 for name, use in usage.items()}
    names = [name for name in written if isinstance(name, str) and name and isinstance(written[name], (int, float))]
    return max(names, key=lambda name: written[name]) if names else None


def build(log_lines, persona, app_id, now, model=None):
    steps, params, values, skipped = [], [], {}, []
    nodes, width, height, screen, last_screen = [], 0, 0, None, None
    front = None   # the app that drew the last screen tree read: another one when the agent left the app

    at_end = None   # the note of a "cursor to the end" key that nothing has used yet
    keyboard = None   # "shown": the keyboard was open just before the next command (noted before a Back)
    right_to_left = str(persona.get("locale") or "").replace("_", "-").split("-")[0].lower() in RIGHT_TO_LEFT

    def erase_from_the_end():
        """The agent is about to erase a field from its end: the tap that opened it must land where its text ends."""
        if steps and steps[-1]["action"].get("kind") == "tapOn" and steps[-1].get("endAt"):
            steps[-1]["action"]["at"] = steps[-1]["endAt"]

    def add(action, **seen):
        """seen: what a tool needs to show the step (screenshot, finger, screen size). Never used to replay."""
        nonlocal at_end
        if at_end:   # it was not followed by deletes: the trace cannot hold it
            skipped.append(at_end)
            at_end = None
        step = {"id": f"s{len(steps) + 1}", "action": action, "checkpoints": []}
        evidence = {key: value for key, value in dict(screen=screen, **seen).items() if value is not None}
        if width > 0 and height > 0 and ("point" in evidence or "from" in evidence):
            evidence["size"] = [width, height]
        if evidence:
            step["evidence"] = evidence
        steps.append(step)
        nonlocal last_screen
        last_screen = None   # known again at the next screenshot

    def named(text):
        """The name of a typed text: the trace only holds names."""
        if text not in values:
            values[text] = f"TEXT_{len(values) + 1}"
            params.append({"name": values[text], "secret": True, "description": "A text the agent typed"})
        return values[text]

    add({"kind": "launchApp", "appId": app_id, "clearState": True})
    for line in log_lines:
        fields = line.rstrip("\n").split("\t")
        if len(fields) < 3:
            continue
        kind = fields[1]
        if kind == "screen":
            nodes = read_screen(fields[2])
            front = nodes[0]["package"] if nodes else None
            screen = last_screen = Path(fields[2]).stem
            if len(fields) >= 5 and fields[3].isdigit() and fields[4].isdigit():
                width, height = int(fields[3]), int(fields[4])
        elif kind == "tree":   # saved by the pass-through adb just before a tap or a launch that follows no screenshot
            seen = read_screen(fields[2])
            nodes, front = (seen, seen[0]["package"]) if seen else (nodes, front)
        elif kind == "type":
            erase_from_the_end()
            add({"kind": "eraseText"})   # type.py replaces what the field holds: typing nothing empties it
            if fields[2]:
                add({"kind": "inputText", "text": {"param": named(fields[2])}})
        elif kind == "keyboard":   # noted by the pass-through adb just before a Back
            keyboard = fields[2]
        elif kind == "adb":
            shown, keyboard = keyboard == "shown", None   # the note only tells about this command
            args = input_args(fields[2:])
            launch = None if args else launch_of(fields[2:], app_id)
            if launch == "launch":
                # The agent comes back to the app it left (Back on its first screen, Home): the replay must open it
                # again too. A launch while the app is in front changes nothing on the screen, so it is not a step.
                if front != app_id:
                    add({"kind": "launchApp", "appId": app_id})
                    front = app_id
            elif launch:
                skipped.append(line.strip())
            elif args[:1] == ["tap"] and len(args) >= 3 and args[1].lstrip("-").isdigit() and args[2].lstrip("-").isdigit():
                x, y = int(args[1]), int(args[2])
                target, bounds, inside_it = target_at(nodes, x, y, width, height, values)
                if target:
                    add({"kind": "tapOn", "target": target, **({"at": inside_it} if inside_it else {})}, point=[x, y], bounds=bounds)
                    steps[-1]["endAt"] = end_of(nodes, bounds, x, y, right_to_left)
                else:
                    skipped.append(line.strip())
            elif args[:1] == ["swipe"] and len(args) >= 5 and all(a.lstrip("-").isdigit() for a in args[1:5]):
                x1, y1, x2, y2 = map(int, args[1:5])
                if abs(x2 - x1) <= 10 and abs(y2 - y1) <= 10:   # a swipe that stays in place is a long press
                    target, bounds, inside_it = target_at(nodes, x1, y1, width, height, values)
                    if target:
                        add({"kind": "longPressOn", "target": target, **({"at": inside_it} if inside_it else {})}, point=[x1, y1], bounds=bounds)
                    else:
                        skipped.append(line.strip())
                    continue
                if abs(x2 - x1) > abs(y2 - y1):
                    direction = "LEFT" if x2 < x1 else "RIGHT"
                else:
                    direction = "UP" if y2 < y1 else "DOWN"
                add({"kind": "swipe", "direction": direction, **ends_of(direction, x1, y1, x2, y2, width, height)},
                    **{"from": [x1, y1], "to": [x2, y2]})
            elif args[:1] == ["keyevent"] and len(args) >= 2 and all(key in KEYS or key in END for key in args[1:]):
                for key in args[1:]:   # `input keyevent 67 67 67` presses three keys
                    erasing = bool(steps) and steps[-1]["action"].get("kind") == "eraseText" and steps[-1].get("fromEnd")
                    if key in END:
                        at_end = at_end or line.strip()
                    elif KEYS[key] == "Backspace" and erasing:
                        at_end = None
                        steps[-1]["action"]["characters"] += 1
                    elif KEYS[key] == "Backspace" and at_end:   # to the end, then deletes: the end of the text is erased
                        at_end = None
                        erase_from_the_end()
                        add({"kind": "eraseText", "characters": 1})
                        steps[-1]["fromEnd"] = True
                    elif KEYS[key] == "Back" and shown:
                        # Back only closed the keyboard. After typing, the keyboard of a replay may be closed
                        # already, and Back would leave the screen: hideKeyboard closes it only if it is open.
                        shown = False   # a second Back in the same command leaves the screen
                        add({"kind": "hideKeyboard"})
                    else:
                        add({"kind": "pressKey", "key": KEYS[key]})
            elif args[:1] == ["text"] and text_typed_with_adb(fields[2:]):
                add({"kind": "inputText", "text": {"param": named(text_typed_with_adb(fields[2:]))}})   # adb adds to the field
            elif args:
                skipped.append(line.strip())

    if at_end:
        skipped.append(at_end)
    for step in steps:
        step.pop("fromEnd", None)   # only used while reading the notes
        step.pop("endAt", None)

    device = persona.get("device") or {}
    context = {"platform": "android"}
    for key, name in (("name", "device"), ("font_scale", "fontScale"), ("theme", "theme")):
        if device.get(key) is not None:
            context[name] = device[key]
    who = {"id": persona["id"], "profile": persona.get("profile", ""), "goal": persona.get("goal", "")}
    if persona.get("locale"):
        who["locale"] = persona["locale"]
    who["context"] = context
    trace = {
        "schema": "ecr.trace/0",
        "id": f"{persona['id']}-{now[:19].replace(':', '').replace('-', '')}",
        "adapter": {"id": "mobile-maestro"},
        "persona": who,
        "params": params,
        "invariants": [],
        "steps": steps,
        **({"evidence": {"lastScreen": last_screen}} if last_screen else {}),
        "provenance": {"exploredAt": now, "agent": "mobile-agent-testers", **({"model": model} if model else {})},
    }
    return trace, {name: text for text, name in values.items()}, skipped


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--persona", required=True)
    parser.add_argument("--app-id", required=True)
    parser.add_argument("--personas", default="personas.json")
    parser.add_argument("--log")
    parser.add_argument("--agent-output")
    parser.add_argument("--now")
    args = parser.parse_args(argv)

    results = Path(args.results)
    log = Path(args.log) if args.log else results / "actions.tsv"
    if not log.exists():
        print(f"trace: no notes at {log}, nothing written")
        return 0
    persona = {"id": args.persona}
    try:
        known = json.loads(Path(args.personas).read_text(encoding="utf-8"))
        persona = next((p for p in known if p.get("id") == args.persona), persona)
    except (OSError, ValueError):
        pass
    now = args.now or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    model = model_of(args.agent_output) if args.agent_output else None
    trace, values, skipped = build(log.read_text(encoding="utf-8").splitlines(), persona, args.app_id, now, model)
    if len(trace["steps"]) < 2:
        print("trace: the agent did nothing that can be replayed, nothing written")
        return 0
    (results / "trace.json").write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (results / "trace.params.json").write_text(json.dumps(values, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    what = f" ({left_out(skipped)})" if skipped else ""
    again = sum(1 for step in trace["steps"][1:] if step["action"].get("kind") == "launchApp")
    again = f", the app opened again {again} time{'s' if again > 1 else ''} after the agent left it" if again else ""
    print(f"trace: {len(trace['steps'])} steps, {len(values)} typed texts kept apart, {len(skipped)} commands left out{what}{again}")
    print(f"trace: {found_how(trace['steps'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
