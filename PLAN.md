# PLAN.md

## 0) How To Use This Plan
- This is the single source of truth for implementation progress.
- Status values:
  - `TODO`: not started
  - `IN_PROGRESS`: currently being worked on
  - `DONE`: implemented and verified
  - `BLOCKED`: waiting on dependency or decision
- Mandatory rule: after any code or doc change, update:
  - relevant task statuses in Section 4
  - the progress snapshot in Section 10
  - the work log in Section 11

## 1) Project Snapshot
- Goal: Chrome extension that executes natural-language web tasks with visible, human-like, very fast actions.
- Demo-critical flows:
  - Hacker News: summarize top 5 articles.
  - Gmail: summarize last 5 unread emails.
- Constraint: 12 hours total hackathon window.
- Priority order:
  1. Human-like navigation + speed impression
  2. End-to-end runtime speed
  3. Reliable output

## 2) Success Criteria

### Must Have
- Bottom command bar opens instantly via keyboard shortcut.
- End-to-end completion for Hacker News demo prompt.
- End-to-end completion for Gmail demo prompt.
- Final output is concise, grounded, and clearly structured.
- Agent actions are visible and understandable (cursor/click animation).

### Nice To Have
- “Show steps” execution trace panel.
- Partial-result handling with explicit warnings.
- Basic caching and latency optimizations.

## 3) Implementation Principles
- Optimize for deterministic behavior in demo domains, not broad generalization.
- Keep model outputs constrained through strict JSON action schema.
- Use resilient selectors with fallback chains on dynamic pages.
- Prefer direct DOM + event execution for speed.
- Timebox aggressively and keep a runnable end-to-end path at all times.

## 4) Detailed Task Plan

### Legend
- Priority: `P0` critical for demo, `P1` important, `P2` optional.

| ID | Priority | Status | Task | Estimate | Dependencies | Definition of Done |
|---|---|---|---|---|---|---|
| T01 | P0 | DONE | Bootstrap extension (MV3, TS build, folder structure) | 30m | None | Extension loads in Chrome, content + background scripts active |
| T02 | P0 | DONE | Implement keyboard shortcut + command bar toggle | 30m | T01 | `Cmd/Ctrl+Shift+K` opens/closes bottom bar on supported pages |
| T03 | P0 | DONE | Build command bar UI states (`idle/planning/executing/summarizing/done/error`) | 45m | T02 | UI renders state transitions and response panel |
| T04 | P0 | DONE | Define shared types and strict action schema | 45m | T01 | Typed schema for all actions + runtime validation |
| T05 | P0 | DONE | Implement core executor actions (`CLICK`, `WAIT_FOR`, `BACK`, `SCROLL`) | 1h | T04 | Actions execute with success/error result payloads |
| T06 | P0 | DONE | Implement extraction action (`EXTRACT_TEXT`) with fallback strategy | 45m | T05 | Extracts meaningful text from current page with truncation |
| T07 | P0 | DONE | Implement visible cursor + click pulse overlay animation | 45m | T05 | User can see fast human-like movement and clicks |
| T08 | P0 | DONE | Add retry/timeout guardrails and hard execution caps | 45m | T05,T06 | Failed actions retry once; loop exits safely with explicit error |
| T09 | P0 | TODO | Implement Claude client (background worker) with env config | 45m | T01 | Claude API call works and returns parsed payload |
| T10 | P0 | TODO | Implement planner prompt contract (strict JSON only) | 45m | T09,T04 | Planner returns valid constrained action list |
| T11 | P0 | TODO | Implement iterative plan-execute loop across background/content | 1h | T10,T05,T06 | Loop runs until `DONE` or hard limit |
| T12 | P0 | TODO | Implement final summarizer pass + response rendering | 45m | T11 | Final answer shown with structure and source list |
| T13 | P0 | IN_PROGRESS | Build Hacker News adapter: list top stories + article extraction flow | 1h | T11 | Prompt completes for top 5 stories on HN |
| T14 | P0 | IN_PROGRESS | Build Gmail adapter: unread list + thread extraction flow | 1h 30m | T11 | Prompt completes for last 5 unread threads |
| T15 | P0 | TODO | Harden Gmail selectors with fallback chains | 45m | T14 | Works across minor DOM variation in mailbox view |
| T16 | P1 | TODO | Add compact context builder (URL/title/candidates/snippets only) | 45m | T11 | Token usage reduced; loop remains stable |
| T17 | P1 | TODO | Add execution trace panel (“show steps”) | 45m | T03,T11 | User can inspect steps after run |
| T18 | P1 | TODO | Add partial success UX and clear fallback messaging | 30m | T08,T12 | Partial outputs clearly labeled and useful |
| T19 | P1 | TODO | Performance pass (wait tuning, extraction caps, context trimming) | 1h | T13,T14,T16 | End-to-end runtime materially reduced |
| T20 | P1 | TODO | Reliability pass (invalid JSON repair + retry policy) | 45m | T10,T11 | Parser failures recovered in most cases |
| T21 | P0 | TODO | End-to-end test script for Hacker News demo | 30m | T13,T12 | Reproducible green run with expected output quality |
| T22 | P0 | TODO | End-to-end test script for Gmail demo | 45m | T14,T12 | Reproducible green run with expected output quality |
| T23 | P0 | TODO | Demo mode polish (copy, loading states, readable summary formatting) | 45m | T21,T22 | Demo looks intentional and understandable |
| T24 | P0 | TODO | Final rehearsal checklist + backup prompts | 30m | T23 | One-click runbook ready for live presentation |

## 5) Architecture Implementation Details

### 5.1 Extension Structure
- `manifest.json`: MV3 permissions, host permissions, background worker, command shortcut.
- `src/background/index.ts`: workflow orchestrator, Claude calls, run state.
- `src/content/index.ts`: UI mounting, command capture, action execution bridge.
- `src/content/ui/*`: command bar and results panel.
- `src/content/executor/*`: action execution engine.
- `src/content/dom/*`: element matching, extraction, animation overlay.
- `src/agent/*`: prompt builders, schema validation, parser.
- `src/shared/*`: typed messages, actions, statuses, limits.

### 5.2 Runtime Loop
1. User submits prompt from command bar.
2. Content script sends task + page snapshot to background.
3. Background asks Claude for next action batch.
4. Content script executes batch and returns structured results.
5. Repeat until `DONE` or timeout/max-steps.
6. Background asks Claude to summarize collected extracts.
7. Content script renders summary and optional step trace.

### 5.3 Action Schema (v1)
- `LIST_ITEMS`
- `CLICK`
- `OPEN_IN_SAME_TAB`
- `WAIT_FOR`
- `EXTRACT_TEXT`
- `BACK`
- `SCROLL`
- `DONE`

Each action payload includes:
- `id`: unique action id
- `type`: one of allowed enums
- `target`: selector/text/url hints
- `params`: typed action options
- `reason`: one-line rationale

## 6) Domain Implementation Design

### 6.1 Hacker News Adapter
- Candidate detection:
  - rank rows via `.athing` and title link anchors.
- For each top N article:
  - open article
  - wait for readable container (`article`, `main`, or fallback to body)
  - extract clipped text chunk
  - back to HN list
- Record metadata:
  - title
  - URL
  - extracted snippet

### 6.2 Gmail Adapter
- Candidate detection:
  - unread rows by robust role/aria selectors and unread indicators.
- For each top N unread thread:
  - open thread
  - extract sender + subject + message body text
  - back to inbox
- Robustness:
  - selector fallback chain
  - stale-element guard
  - index-based revisit if list rerenders

## 7) Prompt Contracts

### 7.1 Planner Prompt Constraints
- Return JSON only, no prose.
- Use only approved action types.
- Max actions per batch: 3 to 5.
- If uncertain, request extraction before decision.
- Never fabricate content or success states.

### 7.2 Summarizer Prompt Constraints
- Generate concise structured output.
- Separate each article/email clearly.
- Include confidence and gaps if extraction is partial.
- Never include unsupported claims.

## 8) Verification Plan

### 8.1 Unit-Level Checks
- Schema parser accepts valid action JSON and rejects invalid payloads.
- Executor action handlers return normalized success/error structures.
- Extractors apply truncation and fallback consistently.

### 8.2 Integration Checks
- Content/background message contract stable.
- Planner-executor loop halts correctly on `DONE`, timeout, max-step, and fatal error.
- UI state transitions always terminate in `done` or `error`.

### 8.3 Demo Acceptance Tests
- Hacker News prompt runs in one attempt.
- Gmail prompt runs in one attempt on inbox with unread messages.
- Summaries include 5 items (or explicit partial count with reason).

## 9) Timeboxed Execution Schedule (12 Hours)

| Time Block | Goal | Target Tasks |
|---|---|---|
| 00:00-01:00 | Foundation | T01-T03 |
| 01:00-03:00 | Executor core | T04-T08 |
| 03:00-05:00 | Claude orchestration | T09-T12 |
| 05:00-07:00 | Hacker News vertical slice | T13,T21 |
| 07:00-09:00 | Gmail vertical slice | T14,T15,T22 |
| 09:00-10:30 | Performance + reliability | T16,T18,T19,T20 |
| 10:30-11:30 | Demo polish | T17,T23 |
| 11:30-12:00 | Rehearsal and backups | T24 |

## 10) Progress Snapshot
- Last updated: 2026-02-21
- Current phase: Domain adapters in progress (T13-T14)
- Completed:
  - `PROJECT.md` created
  - `PLAN.md` created
  - T01 Bootstrap extension scaffold
  - T02 Keyboard shortcut + command bar toggle
  - T03 Command bar UI states and mock submit flow
  - T04 Shared types + strict action schema
  - T05 Core executor actions
  - T06 Extraction action with fallback
  - T07 Visible cursor + click pulse animation
  - T08 Retry/timeout guardrails + action caps
- In progress:
  - T13 Hacker News adapter (multi-page navigation loop)
  - T14 Gmail adapter (unread thread open/read/back loop)
- Next up:
  - T09 Claude client integration
  - T10 Planner prompt contract
  - T11 Iterative plan-execute orchestration

## 11) Work Log
- 2026-02-21:
  - Created `/Users/marcoshernanz/dev/hackeurope2/PROJECT.md`.
  - Created `/Users/marcoshernanz/dev/hackeurope2/PLAN.md` with full implementation roadmap.
  - Created extension scaffold: `/Users/marcoshernanz/dev/hackeurope2/manifest.json`, `/Users/marcoshernanz/dev/hackeurope2/package.json`, `/Users/marcoshernanz/dev/hackeurope2/tsconfig.json`.
  - Implemented baseline runtime: `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`, `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`, `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.ts`.
  - Added command bar styling and extension build script: `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`, `/Users/marcoshernanz/dev/hackeurope2/scripts/build.mjs`.
  - Verified `npm run build` and generated loadable `/Users/marcoshernanz/dev/hackeurope2/dist`.
  - Added `/Users/marcoshernanz/dev/hackeurope2/.gitignore` for build/runtime artifacts.
  - Fixed runtime injection error by switching to bundled non-module output for content/background scripts and updating `/Users/marcoshernanz/dev/hackeurope2/manifest.json` background worker mode.
  - Re-verified with `npm run build` and `npm run typecheck`.
  - Added strict action schema and runtime batch validation in `/Users/marcoshernanz/dev/hackeurope2/src/shared/actions.ts`.
  - Expanded message contracts for background-content executor communication in `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts`.
  - Implemented deterministic action executor (click/wait/back/scroll/extract/list/done) with retries, per-action timeouts, and caps in `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts`.
  - Wired content script executor message handling in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`.
  - Replaced mock-only submit handler with background deterministic planning + execution summary in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
  - Re-verified all updates with `npm run typecheck` and `npm run build`.
  - Fixed shortcut toggle reliability for tabs without an active content receiver by adding scriptable URL guards, on-demand content injection, and silent handling of expected no-receiver cases in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
  - Added a singleton initialization guard in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts` to prevent duplicate command bar instances after reinjection/reload.
  - Re-verified stabilization updates with `npm run typecheck` and `npm run build`.
  - Implemented fast human-like cursor motion and click pulse overlay in `/Users/marcoshernanz/dev/hackeurope2/src/content/dom/visualCursor.ts`.
  - Integrated visual cursor animation into click/open executor actions in `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts`.
  - Added cursor/ripple styling for the injected overlay in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
  - Re-verified animation updates with `npm run typecheck` and `npm run build`.
  - Expanded cursor visibility by animating inspection movement on `LIST_ITEMS`/`EXTRACT_TEXT` actions so demo flows without click actions still show visible motion.
  - Increased cursor size/contrast in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css` for clearer live-demo visibility.
  - Re-verified cursor visibility updates with `npm run typecheck` and `npm run build`.
  - Fixed cursor visibility bug by positioning visual cursor/ripple at viewport origin (`left/top: 0`) so transform coordinates place the overlay onscreen.
  - Reworked `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` from single-batch mock behavior to deterministic multi-step flows:
    - Hacker News loop: list top links, navigate each article, extract text, return to list.
    - Gmail loop: wait unread row, click first unread, extract thread context, back to inbox.
  - Added robust execution retries across navigation boundaries by reinjecting content script on no-receiver message errors during action batch execution.
  - Re-verified flow upgrades with `npm run typecheck` and `npm run build`.

## 12) Risk & Fallback Matrix

| Risk | Impact | Likelihood | Mitigation | Fallback Demo Path |
|---|---|---|---|---|
| Gmail selectors break | High | Medium | Multi-selector chain + aria-first targeting | Reduce to top 3 unread + explicit partial mode |
| Model returns invalid JSON | High | Medium | Strict parser + auto-repair retry | Deterministic hardcoded per-domain flow mode |
| Execution too slow | High | Medium | Tight waits, text caps, fewer planner loops | Run top 3 instead of top 5 |
| Extraction quality low | Medium | Medium | Multiple extractors + fallback body text | Show sourced snippets + caveats |
| Live network/API issue | High | Low/Medium | Warm-up call pre-demo + retries | Local mocked summary from collected snippets |

## 13) Immediate Next Steps
1. Integrate Claude loop (T09-T12) and keep deterministic planner fallback active.
2. Validate and harden current HN/Gmail multi-step loops with manual runs and selector fallback tweaks.
3. Build demo acceptance scripts and run repeatability checks (T21-T24).
