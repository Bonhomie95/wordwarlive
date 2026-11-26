"""Replays traces kept in the repository several times on one phone, with no model.

Usage: python3 scripts/replay_set.py <folder> --persona ID --ecr <checkout of explore-compile-replay>
           --out <results dir> [--times 20] [--closed-group noinet] [--apk app.apk]

<folder>/<persona>/*.trace.json are the traces explored on that persona's phone settings.
The texts typed in NAME.trace.json come from NAME.params.json next to it (test data only, it is
public) and from the JSON in $REPLAY_PARAMS, a secret: {trace id: {name: text}}. The secret wins.

Each trace is validated, then replayed --times times by `ecr replay --times --report`. Every
replay starts from a fresh state when the trace starts with launchApp and clearState, and runs
with no model key and no other secret in its environment. When --closed-group names a group whose
processes cannot leave this machine, the last replay of each trace runs in that group: the tools
that compile and replay then reach the phone, and nothing else.

Writes in the results dir:
- replays.json: every replay of every trace: result, time, the type and the step of a stop, and
  what the phone showed (device_state.py). It holds no text of the app and no typed text, so it can
  be published.
- replays.txt: everything the tools printed (private)
- replays-debug/: what Maestro kept (private)

Prints one line per trace with counts only, and one line for each replay that does not give what
its trace recorded, with its cause in words of the format: the logs of a public repo are public.
It never fails the run.
"""
import argparse
import hashlib
import json
import os
import re
import shlex
import statistics
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import device_state  # noqa: E402
import ecr_replay  # noqa: E402
import repair  # noqa: E402

SCHEMA = "mat.replay-set/0"
# A process in the closed group tries two well known addresses: both must fail.
PROBE = ("import socket,sys\n"
         "for host, port in (('1.1.1.1', 443), ('8.8.8.8', 53)):\n"
         "    try:\n"
         "        socket.create_connection((host, port), 4).close(); sys.exit(1)\n"
         "    except OSError:\n"
         "        pass\n")
LABEL = {"pass": "pass", "known_bug": "bug", "fixed": "fixed", "fail": "FAIL", "timeout": "too long", "not_run": "not run"}
NOT_RUN = ("timeout", "not_run")   # the tools gave no result: a fault of the harness, not a result of the replay


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def typed_texts(trace_path, trace_id, env):
    """{name: text} for one trace: the file next to it, then its entry in $REPLAY_PARAMS, which wins."""
    values = {}
    beside = trace_path.with_name(trace_path.name.replace(".trace.json", ".params.json"))
    for read in (lambda: json.loads(beside.read_text(encoding="utf-8")),
                 lambda: json.loads(env.get("REPLAY_PARAMS") or "{}").get(trace_id, {})):
        try:
            found = read()
        except (OSError, ValueError, AttributeError):
            continue
        if isinstance(found, dict):
            values.update({str(name): str(text) for name, text in found.items()})
    return values


def found_how(steps):
    """How many taps of a trace are found by name, by id and by position."""
    counts = {"name": 0, "id": 0, "point": 0}
    for step in steps:
        action = step.get("action", {})
        target = action.get("target") if action.get("kind") in ("tapOn", "longPressOn") else None
        if isinstance(target, dict):
            counts["name" if "text" in target else "id" if "id" in target else "point"] += 1
    return counts


def is_closed(group, run):
    """True when a process started in this group cannot reach the internet."""
    if not group or not re.fullmatch(r"[a-z_][a-z0-9_-]{0,30}", group):
        return False
    code, _ = run(["sg", group, "-c", shlex.join([sys.executable, "-c", PROBE])], None, dict(os.environ), 30)
    return code == 0


def replay_trace(trace_path, ecr, env, out, times, closed_group, run):
    """Replays one trace. Returns (entry of replays.json, everything printed)."""
    entry = {"file": str(trace_path), "sha256": sha256(trace_path)}
    try:
        trace = json.loads(trace_path.read_text(encoding="utf-8"))
        steps = [step for step in trace["steps"] if isinstance(step, dict)]
        trace_id = str(trace["id"])
    except (ValueError, KeyError, TypeError):
        return dict(entry, status="invalid"), ""
    first = steps[0].get("action", {}) if steps else {}
    entry.update(id=trace_id, steps=len(steps), taps=found_how(steps),
                 freshState=first.get("kind") == "launchApp" and first.get("clearState") is True)
    values = typed_texts(trace_path, trace_id, env)
    tools = ecr_replay.tool_env(env, values, out / "replays-debug" / trace_path.stem)
    tools.pop("REPLAY_PARAMS", None)
    printed = []

    def ecr_command(command, *more, limit=120, group=None):
        args = ["node", ecr_replay.CLI, command, str(trace_path.resolve()), "--adapter", ecr_replay.ADAPTER, *more]
        if group:
            args = ["sg", group, "-c", shlex.join(args)]
        code, output = run(args, str(ecr), tools, limit)
        printed.append(f"$ ecr {command}{' (network closed)' if group else ''}\n{output}")
        return code

    if ecr_command("validate") != 0:
        return dict(entry, status="invalid"), "\n".join(printed)
    app_id = str(first.get("appId", ""))
    phone = {name: value for name, value in env.items() if not ecr_replay.SECRET.search(name) and name != "REPLAY_PARAMS"}   # for adb
    replays = []
    # One replay at a time, so that what the phone did can be read after each one (device_state.py)
    for internet, group in [("open", None)] * (times - 1 if closed_group else times) + ([("cut", closed_group)] if closed_group else []):
        report = out / f".{trace_path.stem}.json"
        report.unlink(missing_ok=True)
        fresh = device_state.fresh_start(run, phone, app_id) if entry["freshState"] else None
        since = device_state.phone_time(run, phone)   # after the fresh start: the log then shows what the replay itself did
        started = time.time()
        code = ecr_command("replay", "--times", "1", "--report", str(report.resolve()), limit=300, group=group)
        try:
            kept = json.loads(report.read_text(encoding="utf-8"))["traces"][0]
            one = kept["replays"][0]
            report.unlink()
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            kept, one = None, {"outcome": "timeout" if code == 124 else "not_run", "durationMs": round(1000 * (time.time() - started))}
        if kept:
            entry.update(oracles=kept.get("oracles"), recorded=kept.get("recorded"), artifactSha256=kept.get("artifact", {}).get("sha256"))
        replay = {"index": len(replays) + 1, "internet": internet, "outcome": one.get("outcome"), "durationMs": one.get("durationMs"),
                  "divergences": one.get("divergences", [])}
        stop = (replay["divergences"] or [{}])[0] if isinstance(replay["divergences"], list) else {}
        stop = stop if isinstance(stop, dict) else {}
        step = next((s for s in steps if s.get("id") == stop.get("stepId")), None)
        replay["device"] = device_state.after_replay(run, phone, since, app_id, look=kept is None or replay["outcome"] != entry.get("recorded"),
                                                     step=step, divergence=stop, values=values)
        if fresh is not None:
            replay["freshStart"] = fresh
        replays.append(replay)
    if not any(r["outcome"] not in NOT_RUN for r in replays):
        timeout = any(r["outcome"] == "timeout" for r in replays)
        return dict(entry, status="timeout" if timeout else "not_run", replays=replays), "\n".join(printed)
    return dict(entry, status="replayed", replays=replays), "\n".join(printed)


def line_of(entry):
    """One public line for a trace: counts, a hash, words of the trace format. No text of the app."""
    name = re.sub(r"[^\w.-]", "", str(entry.get("id", ""))) or entry["sha256"][:12]
    if entry["status"] != "replayed":
        return f"{name}: " + {"invalid": "not replayed, Explore-Compile-Replay does not accept the trace",
                              "timeout": "stopped, it took too long", "not_run": "could not run"}[entry["status"]] + " (replays.txt in the results)"
    replays = entry["replays"]
    counts = ", ".join(f"{sum(1 for r in replays if r['outcome'] == outcome)} {label}" for outcome, label in LABEL.items()
                       if any(r["outcome"] == outcome for r in replays))
    as_recorded = sum(1 for r in replays if r["outcome"] == entry.get("recorded"))
    cut = [r for r in replays if r["internet"] == "cut"]
    closed = f", {len(cut)} with the network of the tools closed ({', '.join(LABEL.get(r['outcome'], '?') for r in cut)})" if cut else ", none with the network closed"
    stops = sorted({f"{d.get('type')} at step {d.get('stepId')}" for r in replays if r["outcome"] == "fail" for d in r["divergences"][:1]})
    where = f"; stops: {', '.join(stops[:4])}" if stops else ""
    seconds = round(statistics.median(r["durationMs"] or 0 for r in replays) / 1000) if replays else 0
    taps = entry["taps"]
    starts = [r["device"]["appStartSeconds"][0] for r in replays if (r.get("device") or {}).get("appStartSeconds")]
    start = f", app start median {statistics.median(starts):g} s, slowest {max(starts):g} s" if starts else ""
    fresh = [r["freshStart"] for r in replays if "freshStart" in r]
    start += f", app cleared by the harness before {sum(fresh)} of {len(fresh)}" if fresh else ""
    seen = [r["device"]["appCleared"] for r in replays if "appCleared" in (r.get("device") or {})]
    start += f", cleared again by the replay itself in {sum(1 for n in seen if n)} of {len(seen)}" if seen and fresh else ""
    return (f"{name}: {as_recorded} of {len(replays)} replays give what the trace recorded ({counts}){closed}, median {seconds} s, "
            f"{entry['steps']} steps, taps {taps['name']} by name, {taps['id']} by id, {taps['point']} by position, trace {entry['sha256'][:12]}{start}{where}")


def details_of(entry, most=10):
    """One public line for each replay that does not give what the trace recorded: where it stopped, and what the phone showed then."""
    if entry.get("status") != "replayed":
        return []
    name = re.sub(r"[^\w.-]", "", str(entry.get("id", ""))) or entry["sha256"][:12]
    safe = lambda value: re.sub(r"[^\w.-]", "", str(value))[:40]   # noqa: E731
    odd = [r for r in entry["replays"] if r["outcome"] != entry.get("recorded")]
    lines = []
    for r in odd[:most]:
        first = (r.get("divergences") or [{}])[0]
        where = f", {safe(first['type'])}" if first.get("type") else ""
        where += f" at step {safe(first['stepId'])}" if first.get("type") and first.get("stepId") else ""
        where += f" (oracle {safe(first['oracleId'])})" if first.get("type") and first.get("oracleId") else ""
        cut = " (network of the tools closed)" if r["internet"] == "cut" else ""
        lines.append(f"{name} replay {r['index']} of {len(entry['replays'])}{cut}: {LABEL.get(r['outcome'], '?')}{where}, "
                     f"after {round((r.get('durationMs') or 0) / 1000)} s; {device_state.words(r.get('device'))}")
    if len(odd) > most:
        lines.append(f"{name}: {len(odd) - most} more replays like these, in replays.json")
    return lines


def repair_one(trace_path, ecr, env, out, attempts, run):
    """Proposals of an agent for one trace (scripts/repair.py), with the tools of this file."""
    trace = json.loads(trace_path.read_text(encoding="utf-8"))
    steps = [step for step in trace["steps"] if isinstance(step, dict)]
    app_id = str(steps[0].get("action", {}).get("appId", "")) if steps else ""
    values = typed_texts(trace_path, str(trace["id"]), env)
    tools = ecr_replay.tool_env(env, values, out / "replays-debug" / f"{trace_path.stem}-repair")
    tools.pop("REPLAY_PARAMS", None)
    phone = {name: value for name, value in env.items() if not ecr_replay.SECRET.search(name) and name != "REPLAY_PARAMS"}
    agent = {name: value for name, value in env.items() if name != "REPLAY_PARAMS"}   # the agent sees no typed text

    def fresh_start():
        device_state.fresh_start(run, phone, app_id)

    def replay_once(path):
        report = out / f".{trace_path.stem}-repair.json"
        report.unlink(missing_ok=True)
        fresh_start()
        run(["node", ecr_replay.CLI, "replay", str(Path(path).resolve()), "--adapter", ecr_replay.ADAPTER, "--times", "1",
             "--report", str(report.resolve())], str(ecr), tools, 300)
        try:
            one = json.loads(report.read_text(encoding="utf-8"))["traces"][0]["replays"][0]
            report.unlink()
            return one.get("outcome"), one.get("divergences", [])
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            return "not_run", []

    return repair.repair_trace(trace_path, ecr, agent, tools, out, attempts, run, replay_once, fresh_start)


def main(argv=None, run=ecr_replay.run_tool):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("folder")
    parser.add_argument("--persona", required=True)
    parser.add_argument("--ecr", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--times", type=int, default=20)
    parser.add_argument("--closed-group", default="")
    parser.add_argument("--apk", default="")
    parser.add_argument("--repair", type=int, default=0,
                        help="at most this many proposals of an agent for a trace that did not replay as recorded (scripts/repair.py)")
    args = parser.parse_args(argv)

    persona = re.sub(r"[^\w.-]", "", args.persona)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    traces = sorted((Path(args.folder) / persona).glob("*.trace.json")) if persona else []
    if not traces:
        print(f"replays: no trace for {persona or 'this persona'} in the folder, nothing replayed")
        return 0
    times = max(1, min(args.times, 100))
    env = dict(os.environ)
    closed_group = args.closed_group if times > 1 and is_closed(args.closed_group, run) else ""
    if args.closed_group and times > 1 and not closed_group:
        print("replays: the network could not be closed around the tools, every replay runs with it open")
    code, commit = run(["git", "rev-parse", "HEAD"], args.ecr, env, 30)
    result = {"schema": SCHEMA, "persona": persona, "times": times,
              "app": {key: value for key, value in (("id", env.get("APP_ID")), ("source", env.get("APP_SOURCE")), ("ref", env.get("APP_REF")),
                                                    ("commit", env.get("APP_COMMIT")), ("patch", env.get("APP_PATCH"))) if value},
              "explore-compile-replay": commit.strip() if code == 0 else None,
              # tool_env takes them out: the tools that compile and replay get none
              "modelKeyPresent": False, "traces": []}
    if args.apk and Path(args.apk).is_file():
        result["app"]["apkSha256"] = sha256(args.apk)
    printed, private_repairs = [], []
    for trace_path in traces:
        try:
            entry, said = replay_trace(trace_path, Path(args.ecr), env, out, times, closed_group, run)
        except (OSError, ValueError, AttributeError, TypeError) as error:
            entry, said = {"file": str(trace_path), "sha256": sha256(trace_path), "status": "not_run"}, f"{type(error).__name__}: {error}\n"
        result["traces"].append(entry)
        printed.append(said)
        print(f"replays: {line_of(entry)}")
        for detail in details_of(entry):
            print(f"replays:   {detail}")
        if args.repair > 0 and entry.get("status") == "replayed" and any(r["outcome"] != entry.get("recorded") for r in entry["replays"]):
            try:
                public, private, said = repair_one(trace_path, Path(args.ecr), env, out, min(args.repair, 3), run)
            except (OSError, ValueError, AttributeError, TypeError, KeyError) as error:
                public, private, said = {"id": entry.get("id"), "error": type(error).__name__}, {}, f"{type(error).__name__}: {error}\n"
            result.setdefault("repairs", []).append(public)
            private_repairs.append(private)
            printed.append(said)
            for line in repair.line_of(public) if "attempts" in public else [f"{entry.get('id')}: the repair could not run"]:
                print(f"repairs: {line}")
            (out / "repairs-private.json").write_text(json.dumps(private_repairs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (out / "replays.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")   # kept after each trace
    (out / "replays.txt").write_text("\n".join(printed), encoding="utf-8")
    report = os.environ.get("GITHUB_STEP_SUMMARY")
    if report and os.environ.get("GITHUB_ACTIONS") == "true":
        with open(report, "a", encoding="utf-8") as f:
            f.writelines(f"Replays on the phone of {persona}: {line_of(entry)}\n\n" + "".join(f"- {detail}\n" for detail in details_of(entry))
                         + ("\n" if details_of(entry) else "") for entry in result["traces"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
