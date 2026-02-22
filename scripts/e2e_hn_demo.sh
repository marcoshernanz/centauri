#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROMPT="Summarize the top 5 hackernews articles"
TARGET_URL="https://news.ycombinator.com/"

printf "\n[HN Demo Check] Building extension...\n"
npm run build >/dev/null

required_files=(
  "dist/manifest.json"
  "dist/background/index.js"
  "dist/content/index.js"
  "dist/content/ui/styles.css"
  "dist/agent.config.json"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required build artifact: $file"
    exit 1
  fi
done

cat <<CHECKLIST

[HN Demo Check] Manual Steps
1. Open chrome://extensions and click Reload on "Natural Web Agent".
2. Open: $TARGET_URL
3. Press Cmd/Ctrl+Shift+K.
4. Run prompt exactly:
   $PROMPT

Pass Criteria
- Visible blue cursor movement appears during inspection/click actions.
- Agent visits multiple articles and returns to HN list between visits.
- Final summary includes 5 article bullets (or explicit partial warning).
- No blocking extension errors in chrome://extensions.
CHECKLIST

read -r -p "Press Enter when manual HN run is complete... " _
read -r -p "Did HN acceptance pass? [y/N]: " result

if [[ "$result" =~ ^[Yy]$ ]]; then
  echo "HN acceptance: PASS"
  exit 0
fi

echo "HN acceptance: FAIL"
exit 1
