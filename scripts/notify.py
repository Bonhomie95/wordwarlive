"""Posts a short version of a collected run's summary to a Slack or Discord webhook.

Opt-in and local only: collect.sh calls it on your machine, after decryption, and
only when SUMMARY_WEBHOOK_URL is set. Nothing is posted from the workflow. The
webhook URL comes from that environment variable, never from the repo, and neither
the URL nor the message is printed: only whether it was posted.
The message says how many reports and distinct bugs (identical titles merged, as in
SUMMARY.md without SUMMARY_GROUPING), the top ones by severity and which personas hit them.
Slack or Discord is picked from the webhook host; SUMMARY_WEBHOOK_KIND=slack|discord overrides it.
The message ends with one line that names the tool; SUMMARY_CREDIT=0 removes it.
Usage: SUMMARY_WEBHOOK_URL=https://hooks.slack.com/... python3 scripts/notify.py <collected_run_dir>"""
import json, os, sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import summarize  # noqa: E402

TOP = 5
LIMIT = 1900   # Discord refuses a content longer than 2000 characters


def bugs(findings):
    """Distinct bugs, most severe and most shared first, as in SUMMARY.md."""
    by_id, rows = {f["id"]: f for f in findings}, []
    for g in summarize.group_by_title(findings):
        fs = [by_id[i] for i in g["ids"]]
        rows.append({"title": g["title"], "personas": sorted({f["persona"] for f in fs}),
                     "sev": min((f["severity"] for f in fs), key=lambda s: summarize.ORDER.get(s, 9))})
    rows.sort(key=lambda r: (summarize.ORDER.get(r["sev"], 9), -len(r["personas"]), r["title"].lower()))
    return rows


def message(findings, scores, top=TOP):
    rows, personas = bugs(findings), sorted({f["persona"] for f in findings})
    if not findings:
        return "Agent test run: no issues reported."
    head = (f"Agent test run: {len(rows)} distinct bugs from {len(findings)} reports "
            f"by {len(personas)} personas")
    if scores:
        head += f", average score {sum(scores) / len(scores):.1f}/10"
    lines = [head + "."]
    for r in rows[:top]:
        title = r["title"].replace("\n", " ")
        if len(title) > 120:
            title = title[:117] + "..."
        lines.append(f"- [{r['sev']}] {title} ({len(r['personas'])}: {', '.join(r['personas'])})")
    if len(rows) > top:
        lines.append(f"...and {len(rows) - top} more in SUMMARY.md.")
    text = "\n".join(lines)
    return text if len(text) <= LIMIT else text[:LIMIT - 3] + "..."


def kind(url):
    forced = os.environ.get("SUMMARY_WEBHOOK_KIND", "").strip().lower()
    if forced in ("slack", "discord"):
        return forced
    host = (urlparse(url).hostname or "").lower()
    discord = host in ("discord.com", "discordapp.com") or host.endswith((".discord.com", ".discordapp.com"))
    return "discord" if discord else "slack"


def payload(url, text):
    if kind(url) == "discord":
        # Titles come from text the agent read in the app: do not honour @everyone.
        return {"content": text, "allowed_mentions": {"parse": []}}
    # Slack treats &, < and > as markup (e.g. <!channel>); escape & first.
    return {"text": text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")}


def post(url, text, opener=urllib.request.urlopen):
    """True when the webhook accepted the message. Never raises, never prints the URL."""
    if urlparse(url).scheme != "https":
        print("Webhook not posted: SUMMARY_WEBHOOK_URL must be an https URL", file=sys.stderr)
        return False
    req = urllib.request.Request(url, data=json.dumps(payload(url, text)).encode("utf-8"),
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "mobile-agent-testers"}, method="POST")
    try:
        with opener(req, timeout=20) as resp:
            status = getattr(resp, "status", 200)
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:  # offline, DNS, timeout...
        print(f"Webhook not posted ({type(e).__name__})", file=sys.stderr)
        return False
    if 200 <= status < 300:
        print(f"Summary posted to the {kind(url).capitalize()} webhook")
        return True
    print(f"Webhook not posted (HTTP {status})", file=sys.stderr)
    return False


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    url = os.environ.get("SUMMARY_WEBHOOK_URL", "").strip()
    if not url:
        return 0
    findings, scores = summarize.load(sys.argv[1])
    text, line = message(findings, scores), summarize.credit(markdown=False)
    return 0 if post(url, f"{text}\n{line}" if line else text) else 1


if __name__ == "__main__":
    sys.exit(main())
