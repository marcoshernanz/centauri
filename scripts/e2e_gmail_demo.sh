#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROMPT="Find the last email from amazon associates"
TARGET_URL="https://mail.google.com/mail/u/0/#inbox"

printf "\n[Gmail Demo Check] Building extension...\n"
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

[Gmail Demo Check] Manual Steps
1. Open chrome://extensions and click Reload on "Natural Web Agent".
2. Open: $TARGET_URL
3. Ensure the mailbox contains at least one recent email from "Amazon Associates".
4. Press Cmd/Ctrl+Shift+K.
5. Run prompt exactly:
   $PROMPT

Pass Criteria
- Visible blue cursor movement appears.
- Agent fills Gmail search and opens the first matching result.
- Final summary confirms the opened email context.
- No blocking extension errors in chrome://extensions.
CHECKLIST

read -r -p "Press Enter when manual Gmail run is complete... " _
read -r -p "Did Gmail acceptance pass? [y/N]: " result

if [[ "$result" =~ ^[Yy]$ ]]; then
  echo "Gmail acceptance: PASS"
  exit 0
fi

echo "Gmail acceptance: FAIL"
exit 1
