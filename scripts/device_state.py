"""What the phone showed and did around one replay, in words that hold no text of the app.

replay_set.py asks after every replay how long the app took to show its first screen. When a
replay does not give what its trace recorded, it also asks what kind of window was in front,
whether the app was still running, whether the system saw a window that does not respond or a
crash of the app, and how busy the phone and the runner were. When it stopped at a step or a
check that looks for an element, it also asks whether the keyboard was open, whether the name of
that element is on the screen, and what is now where the element was when the agent tapped it.
A protocol that counts unstable replays must give their cause: these are causes, with no text of
the app. The system log, the list of windows and the screen tree are read here and never copied.
"""
import os
import re
import xml.etree.ElementTree as ET

import ecr_trace

FOCUS = re.compile(r"mCurrentFocus=Window\{\S+ \S+ ([^}\n]*)\}")
DISPLAYED = re.compile(r"Displayed ([\w.]+)/\S*?(?: for user \d+)?: \+(?:(\d+)s)?(\d+)ms")
NOT_RESPONDING = re.compile(r"ANR in ([\w.:]+)")
CRASHED = re.compile(r"Process: ([\w.:]+), PID: \d+")
STOPPED = re.compile(r"Force stopping ([\w.]+) appid=\d+ user=-?\d+: ([^\n]*)")   # `pm clear` says "clear data"
LAUNCHED = re.compile(r"START u\d+ \{[^}\n]*cmp=([\w.]+)/")
APP_ID = re.compile(r"[A-Za-z0-9._]{1,200}")
TREE = "/data/local/tmp/ecr-state.xml"   # out of the shared storage: the next replay would see it in a file picker
DRIVERS = ("dev.mobile.maestro", "dev.mobile.maestro.test")   # what Maestro leaves on the phone
NEAR = 24   # pixels: an element whose sides moved less than this has the same place and size


def fresh_start(run, env, app_id):
    """Stops the app and clears its data, before a replay whose trace asks for a fresh state. True when the phone said Success.

    Maestro clears and stops the app itself at the first step of such a trace, yet a replay can find the app
    still on the screen where the replay before it ended, with no start in the log. Replays that follow each
    other on one phone must start as separate runs of a CI would: the harness makes sure of it.
    """
    if not app_id or not APP_ID.fullmatch(app_id):
        return False
    run(["adb", "shell", "am", "force-stop", app_id], None, env, 30)
    code, out = run(["adb", "shell", "pm", "clear", app_id], None, env, 60)
    return code == 0 and "Success" in (out or "")


def phone_time(run, env):
    """Seconds since 1970 on the phone: the log is read from there after the replay. None when the phone does not answer."""
    code, out = run(["adb", "shell", "date", "+%s"], None, env, 20)
    found = re.search(r"\b\d{9,11}\b", out or "") if code == 0 else None
    return found.group(0) if found else None


def app_starts(log, app_id):
    """Seconds the app took to show its first screen, once for each start the system logged."""
    return [round(int(m.group(2) or 0) + int(m.group(3)) / 1000, 1) for m in DISPLAYED.finditer(log or "") if m.group(1) == app_id]


def in_front(windows, app_id):
    """The kind of window in front, never its title."""
    found = FOCUS.search(windows or "")
    title = found.group(1).strip() if found else ""
    if title in ("", "null"):
        return "no window"
    if "Not Responding" in title:
        return "a window that does not respond, of the app" if app_id in title else "a window that does not respond, of the system"
    if app_id in title:
        return "the app"
    if "launcher" in title.lower():
        return "the home screen"
    if "InputMethod" in title:
        return "the keyboard"
    return "another window of the system"


def load(run, env):
    """(phone, runner): the load average over one minute, or None where it could not be read."""
    code, out = run(["adb", "shell", "cat", "/proc/loadavg"], None, env, 20)
    phone = re.match(r"\s*(\d+(?:\.\d+)?)\s", out or "") if code == 0 else None
    try:
        runner = round(os.getloadavg()[0], 1)
    except (OSError, AttributeError):
        runner = None
    return (round(float(phone.group(1)), 1) if phone else None), runner


def process_age(run, env, pid):
    """Seconds since the process `pid` started on the phone, or None."""
    if not re.fullmatch(r"\d{1,7}", pid or ""):
        return None
    code, out = run(["adb", "shell", "cat", "/proc/uptime", f"/proc/{pid}/stat"], None, env, 20)
    lines = (out or "").splitlines() if code == 0 else []
    try:
        uptime = float(lines[0].split()[0])
        started = int(lines[1].rsplit(")", 1)[1].split()[19]) / 100   # field 22, in ticks of 1/100 s
    except (IndexError, ValueError):
        return None
    return max(0, round(uptime - started))


def keyboard_shown(run, env):
    """True when the phone shows its keyboard, False when it does not, None when it does not say."""
    code, out = run(["adb", "shell", "dumpsys", "input_method"], None, env, 20)
    found = re.search(r"mInputShown=(true|false)", out or "") if code == 0 else None
    return found.group(1) == "true" if found else None


def screen_tree(run, env):
    """The elements on the screen now (ecr_trace.read_tree), or None. They hold texts of the app: never printed."""
    for attempt in (1, 2):
        run(["adb", "shell", f"rm -f {TREE}; uiautomator dump {TREE}"], None, env, 30)
        code, xml = run(["adb", "exec-out", "cat", TREE], None, env, 20)
        if code == 0 and (xml or "").lstrip().startswith("<?xml"):
            try:
                return ecr_trace.read_tree(ET.fromstring(xml.encode("utf-8")))
            except ET.ParseError:
                return None
        if attempt == 1:   # Maestro's driver can still hold what reads the screen: stop it, then once more
            for package in DRIVERS:
                run(["adb", "shell", "am", "force-stop", package], None, env, 20)
    return None


def looked_for(step, divergence):
    """(what the step or the check of a stop looked for, where it was when explored) or (None, None).
    The first is a selector of the trace format ({"text": ...}, {"id": ...}, {"point": ...})."""
    if not isinstance(step, dict):
        return None, None
    if (divergence or {}).get("oracleId"):
        check = next((c.get("check") for c in step.get("checkpoints") or [] if isinstance(c, dict) and c.get("id") == divergence["oracleId"]), None)
        target = check.get("target") if isinstance(check, dict) else None
        return (target, None) if isinstance(target, dict) else (None, None)
    action = step.get("action") if isinstance(step.get("action"), dict) else {}
    target = action.get("target")
    return (target, step.get("evidence")) if isinstance(target, dict) else (None, None)


def squeezed(text):
    return re.sub(r"\s+", "", text).casefold()


def where_is(nodes, target, evidence, values):
    """Where an element the replay did not find stands on the screen now, in words of this script only.
    name (a name, a typed text or an id): "on the screen", "on the screen, written differently" (case or
    spaces), "on the screen fewer times than the trace counts", "its name is part of a longer name on the
    screen", "not on the screen". place, from where the element was when the agent tapped it: "an element of
    the same size with the same name", "... with another name", "... with no name", "a smaller or larger
    element", "nothing"."""
    facts, name = {}, ""
    if "text" in target:
        name = target["text"]
        name = str((values or {}).get(str(name.get("param")), "")) if isinstance(name, dict) else str(name)
        names = [n for node in nodes for n in node["names"]]
        if name in names and isinstance(target.get("index"), int) and len(ecr_trace.found_by(nodes, "text", name)) <= target["index"]:
            facts["name"] = "on the screen fewer times than the trace counts"
        elif name:
            facts["name"] = ("on the screen" if name in names
                             else "on the screen, written differently" if squeezed(name) in {squeezed(n) for n in names}
                             else "its name is part of a longer name on the screen" if any(name in n for n in names) else "not on the screen")
    elif "id" in target:
        ident = str(target["id"])
        found = any(node["id"] == ident or node["id"].rsplit("/", 1)[-1] == ident for node in nodes)
        facts["name"] = "on the screen" if found else "not on the screen"
    box = (evidence or {}).get("bounds")
    if isinstance(box, list) and len(box) == 4 and all(isinstance(b, int) for b in box):
        x, y = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        under = [node for node in nodes if node["bounds"][0] <= x <= node["bounds"][2] and node["bounds"][1] <= y <= node["bounds"][3]]
        same = [node for node in under if all(abs(a - b) < NEAR for a, b in zip(node["bounds"], box))]
        if same:
            if name and any(name in node["names"] for node in same):
                facts["place"] = "an element of the same size with the same name"
            elif any(node["label"] for node in same):
                facts["place"] = "an element of the same size with another name"
            else:
                facts["place"] = "an element of the same size with no name"
        else:
            facts["place"] = "a smaller or larger element" if len(under) > 1 else "nothing"
    return facts


def after_replay(run, env, since, app_id, look, step=None, divergence=None, values=None):
    """Facts about the replay that started at `since`. With look=False, only what the system log says.
    step and divergence: where it stopped, to say what is on the screen in place of what it looked for.
    values: the typed texts of the trace, to look for a typed text on the screen. Never printed."""
    if not since or not app_id or not APP_ID.fullmatch(app_id):
        return {}
    code, log = run(["adb", "logcat", "-d", "-T", f"{since}.000"], None, env, 60)
    log = log if code == 0 else ""
    stops = [why for name, why in STOPPED.findall(log) if name == app_id]
    facts = {"appStartSeconds": app_starts(log, app_id), "appCleared": sum(1 for why in stops if "clear data" in why),
             "appStopped": sum(1 for why in stops if "clear data" not in why),
             "appLaunched": sum(1 for name in LAUNCHED.findall(log) if name == app_id)}
    if not look:
        return facts
    target, evidence = looked_for(step, divergence)
    if target is not None and "point" not in target:
        nodes = screen_tree(run, env)
        facts["target"] = where_is(nodes, target, evidence, values) if nodes else {"tree": "not read"}
    keyboard = keyboard_shown(run, env)
    if keyboard is not None:
        facts["keyboard"] = keyboard
    code, windows = run(["adb", "shell", "dumpsys", "window"], None, env, 30)
    running, pid = run(["adb", "shell", "pidof", app_id], None, env, 20)
    phone, runner = load(run, env)
    age = process_age(run, env, (pid or "").split()[0] if running == 0 and (pid or "").split() else "")
    if age is not None:
        facts["appProcessSeconds"] = age
    facts.update(inFront=in_front(windows if code == 0 else "", app_id), appRunning=running == 0,
                 notResponding=sorted({"the app" if name.split(":")[0] == app_id else "the system" for name in NOT_RESPONDING.findall(log)}),
                 appCrashes=sum(1 for name in CRASHED.findall(log) if name.split(":")[0] == app_id),
                 load={"phone": phone, "runner": runner})
    return facts


def words(facts):
    """The facts of one replay as public words."""
    if not facts:
        return "the phone did not answer"
    starts = facts.get("appStartSeconds") or []
    said = []
    if "inFront" in facts:
        age = f", started {facts['appProcessSeconds']} s before" if "appProcessSeconds" in facts else ""
        said.append(f"on screen: {facts['inFront']}, the app {'running' + age if facts.get('appRunning') else 'not running'}")
    if "keyboard" in facts:
        said.append(f"keyboard {'open' if facts['keyboard'] else 'closed'}")
    target = facts.get("target") or {}
    if target.get("tree"):
        said.append("the screen tree could not be read")
    elif target:
        parts = ([target["name"]] if "name" in target else []) + ([f"where it was when explored, {target['place']}"] if "place" in target else [])
        said.append("the element the step looked for: " + ", and ".join(parts))
    said.append(f"app start {', '.join(f'{s:g} s' for s in starts)}" if starts else "no start of the app in the log")
    if "appCleared" in facts:
        said.append(f"in the log the app was cleared {facts['appCleared']}, stopped {facts['appStopped']} and launched {facts['appLaunched']} times")
    if "notResponding" in facts:
        said.append(f"not responding: {' and '.join(facts['notResponding'])}" if facts["notResponding"] else "nothing stopped responding")
        crashes = facts.get("appCrashes", 0)
        said.append(f"{crashes} crash{'es' if crashes > 1 else ''} of the app" if crashes else "no crash")
    busy = facts.get("load") or {}
    if busy.get("phone") is not None or busy.get("runner") is not None:
        said.append("load " + ", ".join(f"{value:g} on the {where}" for where, value in busy.items() if value is not None))
    return "; ".join(said)
