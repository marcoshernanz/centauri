# DEMO_RUNBOOK.md

## 1) Pre-Demo (5 minutes)
1. Build latest extension:
   - `npm run build`
2. Reload extension in `chrome://extensions`.
3. Confirm Claude config:
   - `.env` has valid `ANTHROPIC_API_KEY`
   - `agent.config.json` model is correct
4. Run acceptance checks:
   - `npm run test:demo:gmail`

## 2) Live Demo Sequence
1. Open Gmail inbox (`https://mail.google.com/mail/u/0/#inbox`).
2. Run:
   - `Find the last email from amazon associates`
3. Highlight:
   - deterministic Gmail search + first-result open
   - latest matching thread opens directly
   - extracted context shown in final summary

## 3) Backup Prompt
- `Search Gmail for "Amazon Associates" and open the first result.`

## 4) Fast Recovery Playbook
- If cursor does not appear:
  - Reload extension and refresh tab.
- If action loop stalls:
  - Re-run the same prompt once after refreshing Gmail.
- If Gmail selectors fail temporarily:
  - Refresh inbox and rerun prompt.
- If Claude API fails:
  - keep demo running with deterministic fallback output (agent still executes and summarizes deterministically).

## 5) Final Checklist Before Going On Stage
- [ ] Shortcut opens command bar on Gmail tab
- [ ] Cursor animation visible
- [ ] Gmail flow completes with search + first-result open loop
- [ ] No blocking errors in extension page
