#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf "\n[Perf Tune Check] Building extension...\n"
npm run build >/dev/null

cat <<CHECKLIST

[Perf Tune Check] Manual Timing Procedure
1. Reload extension in chrome://extensions.
2. Open Hacker News and run:
   Summarize the top 5 hackernews articles
3. Measure time from Enter to final summary render (seconds).
4. Open Gmail inbox and run:
   Give me a summary of my last 5 unread emails
5. Measure same timing.

Target Ranges (demo-optimized)
- Hacker News: 7s to 16s
- Gmail: 6s to 14s

If too slow
- Lower runtime.waitTimeoutMs by 200-400.
- Lower runtime.tabReadyTimeoutMs by 300-700.
- Lower claude.summaryMaxTokens.

If flaky
- Raise runtime.waitTimeoutMs by 200-400.
- Raise runtime.tabReadyTimeoutMs by 400-900.
- Raise reliability.plannerRepairAttempts to 2.

Config file:
- /Users/marcoshernanz/dev/hackeurope2/agent.config.json
(After edits: rebuild + reload extension.)
CHECKLIST
