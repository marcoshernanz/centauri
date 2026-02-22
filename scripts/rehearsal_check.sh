#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf "\n[Rehearsal Check] Build + quick checks...\n"
npm run build >/dev/null

echo "1) Run: npm run test:demo:gmail"
echo "2) Follow: /Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md"
