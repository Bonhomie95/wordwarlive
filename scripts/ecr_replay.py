"""Replays the path an agent just took, on the same phone, with no model.

Usage: python3 scripts/ecr_replay.py <results dir of one persona> --ecr <checkout of explore-compile-replay>
           [--persona ID] [--timeout seconds]

Reads trace.json and trace.params.json (scripts/ecr_trace.py), compiles the trace to a
Maestro flow with Explore-Compile-Replay (https://github.com/pierridotite/explore-compile-replay)
and replays it with Maestro. Writes in the results dir:
- <trace id>.flow.yaml: the compiled flow
- replay.json: the result: status, the step where it stopped and why, the time
- replay.txt: everything the tools printed
- replay-debug/: what Maestro kept (its record of each command, a screenshot when one fails)

Prints one line with a status and counts, never a text of the app or of the agent:
the logs of a public repo are public. The tools run with no model key in their
environment, so a replay cannot call a model. It never fails the run.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import device_state  # noqa: E402

ADAPTER = "packages/adapter-maestro/src/index.ts"
CLI = "packages/cli/src/main.ts"
# Names of environment variables the tools do not get: model keys and every other secret of the run
SECRET = re.compile(r"KEY|TOKEN|SECRET|PASSPHRASE|PASSWORD|^ANTHROPIC_|^CLAUDE_|^LLM_", re.I)
HEAD = re.compile(r"^(pass|bug|fixed|FAIL)\s+\S+ \(\S+, (\d+) ms\)")
DIVERGENCE = re.compile(r"^\s{6}([a-z_]+)(?:  step ([^\s:]+))?(?:  oracle ([^\s:]+))?(?::|$)")
STATUS = {"pass": "pass", "bug": "known_bug", "fixed": "fixed", "FAIL": "fail"}


def tool_env(env, values, debug_dir):
    """The environment of the tools: no secret, and the typed texts under the names the trace gives them."""
    clean = {name: value for name, value in env.items() if not SECRET.search(name)}
    clean.update({f"ECR_PARAM_{name}": text for name, text in values.items()})
    clean["ECR_MAESTRO_DEBUG"] = str(debug_dir)
    clean["MAESTRO_CLI_NO_ANALYTICS"] = "1"
    return clean


def read_result(output):
    """What `ecr replay` printed -> {'status', 'ms', 'reason', 'step', 'oracle'}, or None when it printed no result."""
    result = None
    for line in output.splitlines():
        head = HEAD.match(line)
        if head:
            result = {"status": STATUS[head.group(1)], "ms": int(head.group(2))}
            continue
        found = DIVERGENCE.match(line) if result and "reason" not in result else None
        if found and result["status"] in ("fail", "known_bug"):
            result["reason"] = found.group(1)
            for key, value in (("step", found.group(2)), ("oracle", found.group(3))):
                if value:
                    result[key] = value
    return result


def kind_of(step):
    """What kind of step it is, in words of the trace format only: 'tapOn by name', 'inputText'."""
    action = step.get("action") if isinstance(step, dict) else None
    if not isinstance(action, dict) or not re.fullmatch(r"[A-Za-z]{1,30}", str(action.get("kind", ""))):
        return ""
    target = action.get("target")
    if not isinstance(target, dict):
        return action["kind"]
    how = "name" if "text" in target else "id" if "id" in target else "point" if "point" in target else "target"
    return f"{action['kind']} by {how}" + (", one of several" if "index" in target else "")


def summary(result, step_ids, steps=()):
    """One public line: a status and counts. Step numbers, kinds and reasons are words of the trace format, not texts."""
    total = len(step_ids)
    status = result["status"]
    if status in ("no_trace", "invalid", "not_compiled", "not_run", "timeout"):
        return {"no_trace": "no trace, nothing to replay",
                "invalid": "not run, Explore-Compile-Replay does not accept the trace",
                "not_compiled": "not run, the trace did not compile",
                "not_run": "could not run",
                "timeout": "stopped, it took too long"}[status] + ("" if status == "no_trace" else " (replay.txt in the results)")
    seconds = f"{round(result.get('ms', 0) / 1000)} s"
    if status == "pass":
        return f"pass, {total} steps with no model in {seconds}"
    if status == "fixed":
        return f"a check recorded as a bug holds now, {total} steps with no model in {seconds}"
    where, reason = "", result.get("reason", "no reason given")
    if result.get("step") in step_ids:
        at = step_ids.index(result["step"])
        where = f" at step {at + 1} of {total}"
        kind = kind_of(steps[at]) if at < len(steps) and status == "fail" else ""
        reason += f", {kind}" if kind else ""
        before = [kind_of(step) for step in steps[max(0, at - 3):at]] if kind else []
        reason += f", after {', '.join(before)}" if before and all(before) else ""
    if status == "known_bug":
        return f"the bug is still there{where} ({reason}), after {seconds}"
    return f"stopped{where} ({reason}), after {seconds}"


def run_tool(args, cwd, env, timeout):
    """(exit code, what it printed). 124 on a timeout, 127 when the program is missing."""
    try:
        done = subprocess.run(args, cwd=cwd, env=env, timeout=timeout, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, text=True, errors="replace", check=False)
        return done.returncode, done.stdout or ""
    except subprocess.TimeoutExpired as late:
        out = late.stdout or ""
        return 124, out if isinstance(out, str) else out.decode("utf-8", "replace")
    except OSError as error:
        return 127, f"{args[0]}: {error}\n"


def replay(results, ecr, env, timeout=1200, run=run_tool):
    """Validates, compiles and replays results/trace.json. Returns (result, steps of the trace, everything printed)."""
    trace_path = results / "trace.json"
    if not trace_path.exists():
        return {"status": "no_trace"}, [], ""
    trace = json.loads(trace_path.read_text(encoding="utf-8"))
    steps = [step for step in trace.get("steps", []) if isinstance(step, dict)]
    try:
        values = json.loads((results / "trace.params.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        values = {}
    tools = tool_env(env, values, results / "replay-debug")
    printed = []

    def ecr_command(command, *more, limit=120):
        args = ["node", CLI, command, str(trace_path.resolve()), "--adapter", ADAPTER, *more]
        code, output = run(args, str(ecr), tools, limit)
        printed.append(f"$ ecr {command}\n{output}")
        return code, output

    code, _ = ecr_command("validate")
    if code != 0:
        return {"status": "invalid"}, steps, "\n".join(printed)
    code, _ = ecr_command("compile", "--out", str(results.resolve()))
    if code != 0:
        return {"status": "not_compiled"}, steps, "\n".join(printed)
    app_id = str((steps[0].get("action") or {}).get("appId", "")) if steps else ""
    phone = {name: value for name, value in env.items() if not SECRET.search(name) and name != "REPLAY_PARAMS"}   # for adb
    first = (steps[0].get("action") or {}) if steps else {}
    fresh = device_state.fresh_start(run, phone, app_id) if first.get("kind") == "launchApp" and first.get("clearState") is True else None
    since = device_state.phone_time(run, phone)   # after the fresh start: the log then shows what the replay itself did
    started = time.time()
    code, output = ecr_command("replay", limit=timeout)
    result = read_result(output)
    if code == 124:
        result = {"status": "timeout", "ms": round(1000 * (time.time() - started))}
    elif result is None:
        result = {"status": "not_run"}
    # What the phone showed: the start time of the app, and the cause of a replay that did not pass (device_state.py)
    step = next((s for s in steps if s.get("id") == result.get("step")), None)
    device = device_state.after_replay(run, phone, since, app_id, look=result["status"] in ("fail", "timeout", "not_run"),
                                       step=step, divergence={"stepId": result.get("step"), "oracleId": result.get("oracle")}, values=values)
    if device:
        result["device"] = device
    if fresh is not None:
        result["freshStart"] = fresh
    return result, steps, "\n".join(printed)


def main(argv=None, run=run_tool):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--ecr", required=True)
    parser.add_argument("--persona", default="")
    parser.add_argument("--timeout", type=int, default=1200)
    args = parser.parse_args(argv)

    results = Path(args.results)
    try:
        result, steps, printed = replay(results, Path(args.ecr), dict(os.environ), args.timeout, run)
    except (OSError, ValueError, AttributeError) as error:
        result, steps, printed = {"status": "not_run"}, [], f"{type(error).__name__}: {error}\n"
    step_ids = [step.get("id") for step in steps]
    line = summary(result, step_ids, steps)
    if result.get("device") and result["status"] in ("fail", "timeout", "not_run"):
        line += f"; {device_state.words(result['device'])}"
    if result["status"] != "no_trace":
        (results / "replay.txt").write_text(printed, encoding="utf-8")
        kept = dict(result, steps=len(step_ids))
        if result.get("step") in step_ids:
            kept["stepNumber"] = step_ids.index(result["step"]) + 1
        (results / "replay.json").write_text(json.dumps(kept, indent=2) + "\n", encoding="utf-8")
    print(f"replay: {line}")
    persona = re.sub(r"[^\w.-]", "", args.persona)
    report = os.environ.get("GITHUB_STEP_SUMMARY")
    if report and os.environ.get("GITHUB_ACTIONS") == "true" and result["status"] != "no_trace":
        with open(report, "a", encoding="utf-8") as f:
            f.write(f"Replay of the path{' of ' + persona if persona else ''}: {line}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
