#!/usr/bin/env bash
# Run on YOUR machine: downloads every encrypted artifact of a run and decrypts it.
# Usage: bash scripts/collect.sh <run_id> [private_key.pem] [out_dir]
# Default key: the one setup.sh created in ~/.mobile-agent-testers/
set -euo pipefail
export PYTHONUTF8=1   # Python on Windows writes cp1252 otherwise: titles in Arabic or Turkish would stop it
RUN=$1
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
PRIV=${2:-$HOME/.mobile-agent-testers/${REPO//\//_}.pem}; OUT=${3:-runs/$1}
# a clean start: what an earlier try left there makes gh refuse to extract ("file exists")
rm -rf "$OUT/enc"; mkdir -p "$OUT/enc"
# only the testers' results, one folder each (not the app, which is large, nor the build log)
for art in $(gh api "repos/$REPO/actions/runs/$RUN/artifacts" --paginate -q '.artifacts[] | select(.expired | not) | .name | select(startswith("results-"))'); do
  gh run download "$RUN" -n "$art" -D "$OUT/enc/$art"
done
for key in "$OUT"/enc/*/*.key.bin; do
  [ -f "$key" ] || { echo "No results to decrypt in run $RUN (expired after 14 days, or the run is still going)"; exit 1; }
  name=$(basename "$key" .key.bin); dir=$(dirname "$key")
  pass=$(openssl pkeyutl -decrypt -inkey "$PRIV" -pkeyopt rsa_padding_mode:oaep -in "$key")
  mkdir -p "$OUT/$name"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$dir/$name.tgz.enc" -pass "pass:$pass" | tar xz -C "$OUT/$name"
  # no agent-output.json: no agent ran (map=robot, the map maker with no model)
  [ -f "$OUT/$name/results/agent-output.json" ] && python3 -c "" 2>/dev/null && python3 "$(dirname "$0")/agent_status.py" "$OUT/$name/results/agent-output.json" "$OUT/$name/results/agent-errors.txt" "$name" || true
done
echo "Decrypted into $OUT"
if python3 -c "" 2>/dev/null; then   # Windows without Python: the results are there, only the summary is skipped
  python3 "$(dirname "$0")/summarize.py" "$OUT" > "$OUT/SUMMARY.md" && echo "Summary: $OUT/SUMMARY.md"
  # opt-in: a short version to your Slack or Discord webhook, from this machine only
  [ -n "${SUMMARY_WEBHOOK_URL:-}" ] && python3 "$(dirname "$0")/notify.py" "$OUT" || true
fi
echo "How did it go? Tell us what it found, or where it got in the way: https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml"
