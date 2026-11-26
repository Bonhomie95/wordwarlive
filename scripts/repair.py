"""Asks an agent for a new action when a replayed trace stops on a step, and lets Explore-Compile-Replay decide.

Used by scripts/replay_set.py with --repair N. For one trace whose replay did not give what it
recorded, at most N times:
1. replay it once from a fresh state, so that the phone shows the screen where it stops;
2. take a screenshot and the list of elements of that screen (scripts/android/screen.py);
3. ask the agent (Claude Code, the model in $MODEL) for one action for one step, with the prompt of
   briefs/repair.md: it sees the steps of the trace without their checks, the type and step of the
   stop, and the screen. It never sees the checks;
4. give the proposal to `ecr repair`, which replays the trace with it and accepts it only if the
   replay then gives what the trace recorded. Otherwise the reason of the refusal goes into the next
   prompt.
After an accepted proposal, the repaired trace is replayed 3 times from a fresh state, and the
checks of the trace before and after are compared (SHA-256 of their canonical JSON).

Public: step ids, kinds of action, reasons of refusal, outcomes, costs and hashes. The proposals
themselves hold texts of the app: they go to the private results, and into the public lines only
when PUBLIC_PROPOSALS=true (an open-source app), with every typed text left out.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRIEF = ROOT / "briefs" / "repair.md"
REFUSED = re.compile(r"^REFUSED\s+\S+\s+step \S+ \(([a-z_]+)\)", re.M)
SAFE = re.compile(r"[^\w.-]")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def oracles_sha256(trace):
    """SHA-256 of the checks of a trace, in order, as canonical JSON."""
    checks = [[step.get("id"), step.get("checkpoints", [])] for step in trace.get("steps", []) if isinstance(step, dict)]
    return hashlib.sha256(canonical(checks).encode("utf-8")).hexdigest()


def without_checks(trace):
    """The steps as the agent sees them: ids and actions, no checks."""
    return [{"id": step.get("id"), "action": step.get("action")} for step in trace.get("steps", []) if isinstance(step, dict)]


def public_action(action):
    """An action with every typed text left out, for a public line."""
    if not isinstance(action, dict):
        return action
    shown = dict(action)
    if shown.get("kind") == "inputText" and not isinstance(shown.get("text"), dict):
        shown["text"] = "(typed text left out)"
    return shown


def kind_words(action):
    """'tapOn by name', 'pressKey', 'none': words of the trace format only."""
    if not isinstance(action, dict):
        return "none"
    kind = SAFE.sub("", str(action.get("kind", "?")))[:20]
    target = action.get("target")
    if isinstance(target, dict):
        kind += " by " + ("name" if "text" in target else "id" if "id" in target else "position")
    return kind


def last_json_object(text):
    """The last top-level {...} in a text that parses as a JSON object, or None."""
    decoder, found, i, text = json.JSONDecoder(), None, 0, text or ""
    while True:
        i = text.find("{", i)
        if i < 0:
            return found
        try:
            value, end = decoder.raw_decode(text, i)
        except ValueError:
            i += 1
            continue
        if isinstance(value, dict):
            found = value
        i = end


def cost_of(output):
    """Cost fields of a `claude -p --output-format json` result."""
    usage = output.get("usage") or {}
    return {"model": ",".join(sorted((output.get("modelUsage") or {}).keys())) or os.environ.get("MODEL"),
            "price_usd": output.get("total_cost_usd"), "turns": output.get("num_turns"), "duration_ms": output.get("duration_ms"),
            "tokens_in": usage.get("input_tokens"), "tokens_out": usage.get("output_tokens"),
            "tokens_cache_read": usage.get("cache_read_input_tokens"), "tokens_cache_write": usage.get("cache_creation_input_tokens")}


def ask_agent(prompt, env, run, folder):
    """(proposal or None, cost fields). The agent may only read files."""
    args = ["claude", "-p", prompt, "--model", env.get("MODEL") or "sonnet", "--max-turns", "6",
            "--output-format", "json", "--allowedTools", "Read"]
    code, printed = run(args, str(ROOT), env, 600)
    (folder / "agent-output.json").write_text(printed, encoding="utf-8")
    try:
        output = json.loads(printed[printed.find("{"):])
    except ValueError:
        return None, {"error": f"the agent printed no result (exit {code})"}
    return last_json_object(str(output.get("result", ""))), cost_of(output)


def prompt_for(trace, divergence, screenshot, elements, earlier):
    said = "".join(f"\n- attempt {i}: step {e['stepId']}, action {canonical(e['action'])}: refused, {e['reason']}" for i, e in enumerate(earlier, 1))
    stop = f"type `{divergence.get('type')}`" + (f" at step `{divergence.get('stepId')}`" if divergence.get("stepId") else "")
    return (BRIEF.read_text(encoding="utf-8")
            .replace("{{STEPS}}", json.dumps(without_checks(trace), indent=2, ensure_ascii=False))
            .replace("{{DIVERGENCE}}", stop)
            .replace("{{SCREENSHOT}}", str(screenshot))
            .replace("{{ELEMENTS}}", elements.strip() or "(none)")
            .replace("{{EARLIER}}", f"\nEarlier proposals for this stop, all refused:{said}\n" if earlier else ""))


def repair_trace(trace_path, ecr, env, tools, out, attempts, run, replay_once, fresh_start):
    """Up to `attempts` proposals for one trace. Returns (public entry, private entry, lines printed by the tools).

    replay_once(path) -> (outcome, divergences) replays a trace once from a fresh state;
    fresh_start() clears the app before `ecr repair`."""
    trace = json.loads(trace_path.read_text(encoding="utf-8"))
    name = SAFE.sub("", str(trace.get("id", trace_path.stem)))
    work = out / "repairs" / name
    work.mkdir(parents=True, exist_ok=True)
    before = oracles_sha256(trace)
    public = {"id": trace.get("id"), "oraclesSha256Before": before, "attempts": []}
    private = {"id": trace.get("id"), "attempts": []}
    printed, earlier = [], []
    for attempt in range(1, attempts + 1):
        outcome, divergences = replay_once(trace_path)
        first = (divergences or [{}])[0] if isinstance(divergences, list) else {}
        if outcome in ("pass", "known_bug") and not divergences:
            public["attempts"].append({"attempt": attempt, "stop": None, "result": "nothing_to_repair"})
            break
        folder = work / f"attempt-{attempt}"
        folder.mkdir(exist_ok=True)
        code, elements = run(["python3", str(ROOT / "scripts/android/screen.py"), str(folder), "screen"], str(ROOT), tools, 120)
        screenshot = folder / "screen.png"
        stop = {"type": first.get("type"), "stepId": first.get("stepId")}
        proposal, cost = ask_agent(prompt_for(trace, stop, screenshot, elements, earlier), env, run, folder)
        step_id = str((proposal or {}).get("stepId") or "")
        action = (proposal or {}).get("action")
        record = {"attempt": attempt, "stop": stop, "stepId": step_id or None, "action": kind_words(action), "cost": cost}
        private["attempts"].append({"attempt": attempt, "stop": stop, "proposal": proposal, "cost": cost})
        if not isinstance(action, dict) or not step_id:
            record["result"] = "no_proposal"
            public["attempts"].append(record)
            earlier.append({"stepId": step_id or "?", "action": action, "reason": "no action was proposed"})
            continue
        candidate = folder / trace_path.name
        shutil.copy(trace_path, candidate)
        params = trace_path.with_name(trace_path.name.replace(".trace.json", ".params.json"))
        if params.exists():
            shutil.copy(params, folder / params.name)
        fresh_start()
        code, said = run(["node", "packages/cli/src/main.ts", "repair", str(candidate.resolve()), "--adapter",
                          "packages/adapter-maestro/src/index.ts", "--step", step_id, "--action", json.dumps(action, ensure_ascii=False),
                          "--out", str(folder.resolve())], str(ecr), tools, 900)
        printed.append(f"$ ecr repair (attempt {attempt})\n{said}")
        refused = REFUSED.search(said or "")
        if code == 0 and not refused:
            record["result"] = "accepted"
            repaired = json.loads(candidate.read_text(encoding="utf-8"))
            record["oraclesSha256After"] = oracles_sha256(repaired)
            record["oraclesKept"] = record["oraclesSha256After"] == before
            record["replaysAfter"] = [replay_once(candidate)[0] for _ in range(3)]
            private["attempts"][-1]["repairedTrace"] = str(candidate)
            public["attempts"].append(record)
            break
        reason = refused.group(1) if refused else ("timeout" if code == 124 else "error")
        record["result"] = f"refused: {reason}"
        public["attempts"].append(record)
        earlier.append({"stepId": step_id, "action": action, "reason": reason})
    if os.environ.get("PUBLIC_PROPOSALS") == "true":
        for shown, kept in zip(public["attempts"], private["attempts"]):
            proposal = kept.get("proposal") or {}
            shown["proposal"] = {"stepId": proposal.get("stepId"), "action": public_action(proposal.get("action"))}
    return public, private, "\n".join(printed)


def line_of(entry):
    """Public lines for one trace: one per attempt."""
    name = SAFE.sub("", str(entry.get("id", "")))
    lines = []
    for a in entry["attempts"]:
        if a.get("stop") is None:
            lines.append(f"{name} attempt {a['attempt']}: the replay gave what the trace recorded, nothing to repair")
            continue
        cost = a.get("cost") or {}
        stop = f"stop {SAFE.sub('', str(a['stop'].get('type')))} at step {SAFE.sub('', str(a['stop'].get('stepId')))}"
        spend = f"agent ${cost.get('price_usd') or 0:.4f}, {cost.get('turns') or 0} turns, {cost.get('tokens_out') or 0} tokens out"
        after = ""
        if a.get("result") == "accepted":
            after = (f", then {sum(1 for o in a['replaysAfter'] if o == 'pass')} of 3 replays pass, "
                     f"checks {'unchanged' if a['oraclesKept'] else 'CHANGED'}")
        shown = f", proposal {canonical(a['proposal'])}" if "proposal" in a else ""
        lines.append(f"{name} attempt {a['attempt']}: {stop}; proposed step {SAFE.sub('', str(a.get('stepId')))}, "
                     f"{a['action']}: {a['result']}{after}; {spend}{shown}")
    return lines
