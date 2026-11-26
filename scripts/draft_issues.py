"""Turns distinct findings in SUMMARY.md into draft GitHub issues, locally.

Runs only on your machine after scripts/collect.sh decrypts the results: never
in GitHub Actions. Dry-run is the default: proposed titles and bodies are
printed to stdout without calling `gh`. Pass --create --repo OWNER/REPO to open
issues with `gh issue create` (prompts before each issue unless --yes is also
given).
Each issue ends with one line that names the tool; SUMMARY_CREDIT=0 removes it.

Usage:
  python3 scripts/draft_issues.py [SUMMARY.md | runs/<run id>]
  python3 scripts/draft_issues.py runs/<run id> --create --repo you/app --label bug
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from summarize import ORDER, credit, personas_by_id, phone  # noqa: E402

REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+){1,2}$")
PERSONA_CELL_RE = re.compile(r"^\d+\s*\((.*)\)$")
GROUP_HEADING_RE = re.compile(r"^-\s+\*\*(.+)\*\*\s*$")
GROUP_REPORT_RE = re.compile(r"^\s+-\s+([^\s(]+)\s*\(([^)]+)\):\s*(.+?)\s*$")
PNG_RE = re.compile(r"[^\s,()]+?\.png\b", re.I)
GH_TIMEOUT = 60


def resolve_summary_path(source):
    path = Path(source)
    summary, run_dir = (path / "SUMMARY.md", path) if path.is_dir() else (path, path.parent)
    if not summary.is_file():
        raise FileNotFoundError(f"Summary not found: {summary}")
    return summary, run_dir


def split_row(line):
    """Splits a Markdown table row into unescaped cells, respecting \\| inside cells."""
    s = line.strip()
    if not (s.startswith("|") and s.endswith("|")) or len(s) < 2:
        return None
    cells, buf, esc = [], [], False
    for ch in s[1:-1]:
        if esc:
            buf.append(ch if ch == "|" else "\\" + ch)
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            cells.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if esc:
        buf.append("\\")
    cells.append("".join(buf).strip())
    return cells


def is_separator_row(cells):
    return bool(cells) and all(bool(c) and re.fullmatch(r":?-{3,}:?", c) for c in cells)


def dedupe(items):
    return list(dict.fromkeys(x for x in items if x))


def parse_personas(cell_text):
    m = PERSONA_CELL_RE.match(cell_text.strip())
    raw = m.group(1) if m else cell_text
    return dedupe([p.strip() for p in raw.split(",") if p.strip()])


def parse_grouped_reports(lines):
    """Reads `## Reports behind each grouped issue` produced when SUMMARY_GROUPING=1."""
    grouped, in_section, current = {}, False, None
    for line in lines:
        s = line.strip()
        if s.startswith("## "):
            if in_section:
                break
            in_section = s.lower() == "## reports behind each grouped issue"
            continue
        if not in_section:
            continue
        head = GROUP_HEADING_RE.match(s)
        if head:
            current = head.group(1).strip().replace("\\|", "|").lower()
            grouped.setdefault(current, [])
        elif current is not None:
            rep = GROUP_REPORT_RE.match(line)
            if rep:
                grouped[current].append({"persona": rep.group(1).strip(), "severity": rep.group(2).strip().lower(),
                                         "title": rep.group(3).strip().replace("\\|", "|")})
    return grouped


def parse_summary(text):
    """Extracts distinct findings from the issues table of a SUMMARY.md document."""
    lines = text.splitlines()
    grouped_reports = parse_grouped_reports(lines)
    findings, by_key, i = [], {}, 0
    while i < len(lines):
        cells = split_row(lines[i])
        header = [c.lower() for c in cells] if cells else []
        if len(header) >= 4 and header[:4] == ["severity", "issue", "personas", "screen"]:
            has_class = len(header) >= 5 and header[4] == "class"
            i += 1
            while i < len(lines):
                row = split_row(lines[i])
                if row is None:
                    break
                i += 1
                if is_separator_row(row) or len(row) < 4:
                    continue
                severity, title = row[0].strip().lower() or "?", row[1].strip()
                if not title:
                    continue
                personas = parse_personas(row[2])
                screens = dedupe([s.strip() for s in row[3].split(",") if s.strip()])
                issue_class = row[4].strip() if has_class and len(row) > 4 else ""
                key = title.lower()
                if key in by_key:
                    item = by_key[key]
                    if ORDER.get(severity, 9) < ORDER.get(item["severity"], 9):
                        item["severity"] = severity
                    item["personas"] = dedupe(item["personas"] + personas)
                    item["screens"] = dedupe(item["screens"] + screens)
                    if issue_class and not item["class"]:
                        item["class"] = issue_class
                else:
                    item = {"severity": severity, "title": title, "personas": personas, "screens": screens,
                            "class": issue_class, "reports": list(grouped_reports.get(key, []))}
                    by_key[key] = item
                    findings.append(item)
            break
        i += 1
    return findings


def normalize_screenshot_name(raw):
    text = str(raw or "").strip()
    if not text or any(c in text for c in ("/", "\\", ":")) or text.startswith(".") or ".." in text:
        return ""
    return text if Path(text).suffix else f"{text}.png"


def load_persona_screenshots(run_dir):
    """Maps (persona, issue_title_lower) -> list of relative screenshot paths in run_dir."""
    index, root = {}, Path(run_dir)
    if not root.is_dir():
        return index
    for f in sorted(root.glob("*/results/*/findings.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        persona, rel_dir = f.parent.name, f.parent.relative_to(root)
        for issue in data.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            title = str(issue.get("title") or "").strip().lower()
            if not title:
                continue
            raw = [s for k in ("screens", "screenshots") if isinstance(issue.get(k), list) for s in issue[k]]
            paths = [(rel_dir / name).as_posix() for name in map(normalize_screenshot_name, raw) if name]
            if paths:
                index[(persona, title)] = dedupe(index.get((persona, title), []) + paths)
    return index


def screenshots_for(finding, shot_index):
    paths, by_persona = [], {}
    for rep in finding.get("reports") or []:
        by_persona.setdefault(rep["persona"], []).append(rep["title"].lower())
    for persona in finding["personas"]:
        for rep_title in by_persona.get(persona, ()):
            paths.extend(shot_index.get((persona, rep_title), ()))
        paths.extend(shot_index.get((persona, finding["title"].lower()), ()))
    for screen in finding["screens"]:
        paths.extend(m for m in PNG_RE.findall(screen) if ".." not in Path(m).parts)
    return dedupe(paths)


def format_device(persona_id, personas_map):
    info = personas_map.get(persona_id)
    if not info:
        return f"`{persona_id}`"
    device, locale, size = phone(info)
    details = ", ".join(x for x in (locale, size) if x)
    if device and details:
        return f"`{persona_id}`, {device} ({details})"
    return f"`{persona_id}`, {device}" if device else (f"`{persona_id}` ({details})" if details else f"`{persona_id}`")


def build_draft(finding, personas_map, shot_index):
    screenshots = screenshots_for(finding, shot_index)
    lines = [f"**Severity:** {finding['severity']}"]
    if finding["screens"]:
        lines.append(f"**Screen:** {', '.join(finding['screens'])}")
    if finding["class"]:
        lines.append(f"**Class:** {finding['class']}")
    n = len(finding["personas"])
    lines += ["", f"Found by {n} {'tester' if n == 1 else 'testers'}. Check the screenshots before triaging."]
    if finding["personas"]:
        lines += ["", "### Affected personas and devices"] + [f"- {format_device(p, personas_map)}" for p in finding["personas"]]
    if finding["reports"]:
        lines += ["", "### Agent reports"] + [f"- `{r['persona']}` ({r['severity']}): {r['title']}" for r in finding["reports"]]
    if screenshots:
        lines += ["", "### Screenshots"] + [f"- `{p}`" for p in screenshots]
    if credit():
        lines += ["", credit()]
    return {"title": finding["title"], "severity": finding["severity"], "personas": finding["personas"],
            "screens": finding["screens"], "screenshots": screenshots, "body": "\n".join(lines) + "\n"}


def format_dry_run(drafts, repo="", labels=()):
    blocks, total = [], len(drafts)
    for idx, d in enumerate(drafts, 1):
        head = [f"=== Draft {idx}/{total} ===", f"Title: {d['title']}"]
        if repo:
            head.append(f"Repo: {repo}")
        if labels:
            head.append(f"Labels: {', '.join(labels)}")
        blocks.append("\n".join(head + [""]) + d["body"])
    return "\n".join(blocks) + f"\nDry run: {total} draft {'issue' if total == 1 else 'issues'} shown, none created. Pass --create --repo OWNER/REPO to open them with gh.\n"


def validate_repo(repo):
    if repo and not REPO_RE.match(repo):
        raise ValueError(f"Invalid --repo value {repo!r}: expected OWNER/REPO or HOST/OWNER/REPO.")
    return repo


def clean_labels(raw_labels):
    labels = dedupe([lbl.strip() for lbl in raw_labels if lbl and lbl.strip()])
    for lbl in labels:
        if lbl.startswith("-"):
            raise ValueError(f"Invalid --label value {lbl!r}: labels cannot start with '-'.")
    return labels


def create_issue(gh_exe, draft, repo="", labels=(), timeout=GH_TIMEOUT):
    """Creates one GitHub issue with `gh issue create`, passing body via stdin."""
    if not repo:
        return False, "--repo OWNER/REPO is required to create an issue."
    cmd = [gh_exe, "issue", "create", "--title", draft["title"], "--body-file", "-", "--repo", repo]
    for label in labels:
        cmd += ["--label", label]
    try:
        proc = subprocess.run(cmd, input=draft["body"], capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout, shell=False)
    except FileNotFoundError:
        return False, "gh CLI not found on PATH."
    except subprocess.TimeoutExpired:
        return False, f"gh issue create timed out after {timeout}s."
    except OSError as exc:
        return False, str(exc)
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or f"exit code {proc.returncode}").strip()
    return True, proc.stdout.strip()


def confirm_issue(index, total, draft, repo, stdin=None, stdout=None):
    inp, out = sys.stdin if stdin is None else stdin, sys.stdout if stdout is None else stdout
    meta = [f"Personas: {', '.join(draft['personas']) or 'unknown'}"]
    if draft["screens"]:
        meta.append(f"Screen: {', '.join(draft['screens'])}")
    if draft["screenshots"]:
        meta.append(f"Screenshots: {len(draft['screenshots'])}")
    out.write(f"\n[{index}/{total}] ({draft['severity']}) {draft['title']}\n  {' | '.join(meta)}\nCreate this issue in {repo}? [y/N/a/q] ")
    out.flush()
    line = inp.readline()
    if not line:
        return "q"
    ans = line.strip().lower()
    return {"y": "y", "yes": "y", "a": "a", "all": "a", "q": "q", "quit": "q"}.get(ans, "n")


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Turn distinct findings in SUMMARY.md into draft GitHub issues (dry-run by default).")
    p.add_argument("source", nargs="?", default="SUMMARY.md", help="SUMMARY.md file or collected run folder (default: ./SUMMARY.md).")
    p.add_argument("--create", action="store_true", help="Open issues with `gh issue create` (requires --repo; prompts unless --yes is set).")
    p.add_argument("--dry-run", action="store_true", help="Print draft issues without calling `gh` (default; overrides --create).")
    p.add_argument("-y", "--yes", action="store_true", help="Skip interactive confirmation when --create is set.")
    p.add_argument("--repo", default="", help="Target GitHub repository in OWNER/REPO format (required with --create).")
    p.add_argument("--label", action="append", default=[], help="Label to add to each created issue (repeatable).")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        repo, labels = validate_repo(args.repo.strip()), clean_labels(args.label)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    will_create = args.create and not args.dry_run
    if will_create and not repo:
        print("--repo OWNER/REPO is required with --create so issues are not opened in the current folder's repo.", file=sys.stderr)
        return 2
    try:
        summary_path, run_dir = resolve_summary_path(args.source)
        text = summary_path.read_text(encoding="utf-8")
    except OSError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    findings = parse_summary(text)
    if not findings:
        print(f"No findings in {summary_path}: nothing to draft.")
        return 0

    personas_map, shot_index = personas_by_id(), load_persona_screenshots(run_dir)
    drafts = [build_draft(f, personas_map, shot_index) for f in findings]
    if not will_create:
        print(format_dry_run(drafts, repo=repo, labels=labels), end="")
        return 0

    gh_exe = shutil.which("gh")
    if not gh_exe:
        print("gh CLI not found on PATH: install https://cli.github.com/ or run without --create to preview drafts.", file=sys.stderr)
        return 1

    created = skipped = failed = 0
    create_all, total = bool(args.yes), len(drafts)
    for idx, draft in enumerate(drafts, 1):
        if not create_all:
            choice = confirm_issue(idx, total, draft, repo)
            if choice == "q":
                skipped += total - idx + 1
                break
            if choice == "a":
                create_all = True
            elif choice != "y":
                skipped += 1
                continue
        ok, msg = create_issue(gh_exe, draft, repo=repo, labels=labels)
        if ok:
            created += 1
            print(msg or f"Created: {draft['title']}")
        else:
            failed += 1
            print(f"Failed to create {draft['title']!r}: {msg}", file=sys.stderr)

    print(f"Created {created}, skipped {skipped}, failed {failed}.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
