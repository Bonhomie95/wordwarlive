"""Who found each screen of a map: the robot with no model, or the agent called after it.

Usage: python3 scripts/map_stats.py <results dir of one persona> [--agent-output results/agent-output.json]

Reads the robot's findings.json and screens (map-NN/), and the agent's (agent/), and writes
map-stats.json next to them: each screen with who found it first, the forms where the robot
stopped, the robot's time and taps, the agent's turns, time and cost, kept apart.
An agent screen counts as new when it matches no robot screen (the robot's measure).
Prints one line of counts only: the public log never names a screen.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "android"))
from crawl import read_view, signature  # noqa: E402
from dashboard import similarity  # noqa: E402


def read(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def sig(xml):
    """The robot's signature of a saved screen: the names of its controls, read from their children too."""
    try:
        _, fields, controls = read_view(Path(xml).read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return set()
    return signature(fields, controls)


def signatures(folder):
    return {xml.stem: sig(xml) for xml in sorted(Path(folder).glob("[0-9]*.xml"))}


def stats(results, agent_output=None):
    results = Path(results)
    robot = read(results / "findings.json") or {}
    robot_screens = []
    for found in robot.get("screens_found", []):
        sigs = [sig(results / f"{where}.xml") for where in found.get("screens", [])]
        robot_screens.append({"name": found.get("name"), "found_by": "robot", "signatures": [s for s in sigs if s]})
    agent = read(results / "agent" / "findings.json")
    agent_screens = []
    if isinstance(agent, dict):
        sigs = signatures(results / "agent")
        for found in agent.get("screens_found", []):
            mine = [sigs[n] for n in found.get("screens", []) if sigs.get(n)]
            known = any(similarity(a, b) >= 0.6 for a in mine for r in robot_screens for b in r["signatures"])
            if mine and not known:
                agent_screens.append({"name": found.get("name"), "found_by": "agent"})
    out = read(agent_output) if agent_output else None
    agent_run = None
    if isinstance(out, dict) and isinstance(agent, dict):
        agent_run = {k: out.get(k) for k in ("num_turns", "total_cost_usd", "duration_ms") if k in out}
    result = {
        "screens": [{"name": s["name"], "found_by": s["found_by"]} for s in robot_screens] + agent_screens,
        "blocked": [b.get("name") for b in robot.get("blocked", [])],
        "robot": {"seconds": robot.get("seconds"), "taps": robot.get("taps"), "starts": robot.get("starts"),
                  "finished": robot.get("finished")},
        "agent": agent_run,
    }
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("results")
    parser.add_argument("--agent-output")
    args = parser.parse_args(argv)
    result = stats(args.results, args.agent_output)
    (Path(args.results) / "map-stats.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    by = lambda who: sum(1 for s in result["screens"] if s["found_by"] == who)
    line = f"map stats: {by('robot')} screens by the robot in {result['robot']['seconds']} s, {len(result['blocked'])} forms handed over"
    if result["agent"]:
        a = result["agent"]
        line += f", {by('agent')} more by the agent in {a.get('num_turns')} turns"
        if isinstance(a.get("total_cost_usd"), (int, float)):
            line += f" (${a['total_cost_usd']:.2f})"
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
