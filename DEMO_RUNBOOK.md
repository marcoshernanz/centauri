# DEMO_RUNBOOK.md

## 1) Pre-Demo (5 minutes)
1. Build latest extension:
   - `npm run build`
2. Reload extension in `chrome://extensions`.
3. Confirm Claude config:
   - `.env` has valid `ANTHROPIC_API_KEY`
   - `agent.config.json` model is correct
4. Run acceptance checks:
   - `npm run test:demo:hn`
   - `npm run test:demo:gmail`

## 2) Live Demo Sequence
1. Open Hacker News (`https://news.ycombinator.com/`).
2. Use shortcut (`Cmd/Ctrl+Shift+K`) and run:
   - `Summarize the top 5 hackernews articles`
3. Explain while it runs:
   - visible human-like pointer
   - fast multi-step web navigation
   - grounded summary from extracted pages
4. Open Gmail inbox (`https://mail.google.com/mail/u/0/#inbox`).
5. Run:
   - `Give me a summary of my last 5 unread emails`
6. Highlight:
   - unread-thread traversal
   - inbox return loop
   - concise prioritized output

## 3) Backup Prompts
- Hacker News:
  - `Summarize the top 3 hackernews articles`
  - `Summarize only AI-related top hackernews articles`
- Gmail:
  - `Summarize my last 3 unread emails`
  - `Summarize unread emails and list only urgent follow-ups`

## 4) Fast Recovery Playbook
- If cursor does not appear:
  - Reload extension and refresh tab.
- If action loop stalls:
  - Retry with top 3 prompt variant.
- If Gmail selectors fail temporarily:
  - Refresh inbox and rerun prompt.
- If Claude API fails:
  - keep demo running with deterministic fallback output (agent still executes and summarizes deterministically).

## 5) Final Checklist Before Going On Stage
- [ ] Shortcut opens command bar on both demo tabs
- [ ] Cursor animation visible
- [ ] HN flow completes with multi-page traversal
- [ ] Gmail flow completes with unread-thread loop
- [ ] No blocking errors in extension page
