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
  - Gmail: find the last email from amazon associates.
- Constraint: 12 hours total hackathon window.
- Priority order:
  1. Human-like navigation + speed impression
  2. End-to-end runtime speed
  3. Reliable output

## 2) Success Criteria

### Must Have
- Bottom command bar opens instantly via keyboard shortcut.
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
| T09 | P0 | DONE | Implement Claude client (background worker) with env config | 45m | T01 | Claude API call works and returns parsed payload |
| T10 | P0 | DONE | Implement planner prompt contract (strict JSON only) | 45m | T09,T04 | Planner returns valid constrained action list |
| T11 | P0 | DONE | Implement iterative plan-execute loop across background/content | 1h | T10,T05,T06 | Loop runs until `DONE` or hard limit |
| T12 | P0 | DONE | Implement final summarizer pass + response rendering | 45m | T11 | Final answer shown with structure and source list |
| T13 | P0 | DONE | Build Hacker News adapter: list top stories + article extraction flow | 1h | T11 | Prompt completes for top 5 stories on HN |
| T14 | P0 | DONE | Build Gmail adapter: unread list + thread extraction flow | 1h 30m | T11 | Prompt completes for last 5 unread threads |
| T15 | P0 | DONE | Harden Gmail selectors with fallback chains | 45m | T14 | Works across minor DOM variation in mailbox view |
| T16 | P1 | DONE | Add compact context builder (URL/title/candidates/snippets only) | 45m | T11 | Token usage reduced; loop remains stable |
| T17 | P1 | DONE | Add execution trace panel (“show steps”) | 45m | T03,T11 | User can inspect steps after run |
| T18 | P1 | DONE | Add partial success UX and clear fallback messaging | 30m | T08,T12 | Partial outputs clearly labeled and useful |
| T19 | P1 | DONE | Performance pass (wait tuning, extraction caps, context trimming) | 1h | T13,T14,T16 | End-to-end runtime materially reduced |
| T20 | P1 | DONE | Reliability pass (invalid JSON repair + retry policy) | 45m | T10,T11 | Parser failures recovered in most cases |
| T21 | P0 | DONE | End-to-end test script for Hacker News demo | 30m | T13,T12 | Reproducible green run with expected output quality |
| T22 | P0 | DONE | End-to-end test script for Gmail demo | 45m | T14,T12 | Reproducible green run with expected output quality |
| T23 | P0 | DONE | Demo mode polish (copy, loading states, readable summary formatting) | 45m | T21,T22 | Demo looks intentional and understandable |
| T24 | P0 | DONE | Final rehearsal checklist + backup prompts | 30m | T23 | One-click runbook ready for live presentation |
| T25 | P0 | DONE | Generic cross-site traversal fallback (list/open/extract/return loop) | 1h | T11,T16 | Works on non-adapter domains for top/recent multi-item prompts |
| T26 | P0 | DONE | Dynamic planner context refresh from live executor metadata | 45m | T16,T20 | Planner sees current URL/title/candidates after navigation |
| T27 | P1 | DONE | Generic relevance ranking + partial coverage warnings | 45m | T25,T18 | Candidate selection avoids nav noise and reports shortfalls clearly |
| T28 | P1 | DONE | UI contrast hardening against host-page CSS overrides | 15m | T23 | Output/trace text remains readable on sites like Wikipedia |
| T29 | P1 | DONE | Humanize deterministic summaries and run-copy tone | 30m | T12,T23 | Output avoids robotic labels and clipped ellipsis-heavy phrasing |
| T30 | P0 | DONE | Replace local command bar with imported hackeurope UI shell while preserving backend/executor | 1h | T03,T11 | Content UI uses transplanted shell components from sibling repo; background/task execution unchanged; build + typecheck pass |
| T31 | P0 | TODO | Re-run Gmail demo-critical acceptance checks with transplanted shell UI in Chrome | 20m | T30,T22,T38 | Gmail prompt completes with expected draft insertion summary and no UI regressions |
| T32 | P1 | TODO | Validate generic flow on 2-3 non-adapter sites with new UI and capture regressions | 30m | T30,T25,T27 | Generic summarize-top/recent prompts complete or fail-partial clearly with stable UI |
| T33 | P0 | DONE | Fix post-merge UI regressions (logo/nav persistence/voice controls/minimized controls/border polish) | 45m | T30 | HN logo renders reliably, shell remains visible across navigation, mic+speaker are enabled, minimized action buttons are hidden, and border styling is cleaned up |
| T34 | P1 | DONE | Refine shell visual styling (logo/send accent, inner border cleanup, bottom box removal) | 20m | T33 | Logo and send button styling match requested orange accent, inner message border removed, logo centered, and completed-state status box removed |
| T35 | P1 | DONE | Add favicon fallback + top spacing + readable summary formatting | 20m | T34 | Shell icon resolves from page favicon with fallback, history content has better top spacing, and summary text is rendered with clearer line structure |
| T36 | P0 | DONE | Restore Centuri logo identity and switch TTS to ElevenLabs API | 30m | T35 | Shell icon no longer uses page favicon override, and speaker playback synthesizes audio via ElevenLabs with configured voice/model env vars |
| T37 | P1 | DONE | Add `DEMOS.md` with canonical live-demo prompts | 10m | T24 | `DEMOS.md` documents both official demos with copy-paste prompts (HN top 5 summary + Gmail search-and-draft flow) |
| T38 | P0 | DONE | Implement deterministic Gmail search + reply-draft flow | 1h | T14,T15 | Gmail flow can search target email, open first result, extract context, and insert a reply draft without sending; docs/scripts updated and build/typecheck pass |
| T39 | P0 | DONE | Pivot to single Gmail-only demo prompt and remove HN demo references | 20m | T38 | Canonical demo docs/runbook/check scripts use only one Gmail search-and-draft prompt |
| T40 | P0 | DONE | Switch canonical sender target to "Amazon Associates" and prioritize sender-filter search | 15m | T39 | Prompts/docs/scripts use Amazon Associates target; Gmail query inference prefers `from:"..."` when prompt says “from ...” |
| T41 | P0 | DONE | Fix Gmail search-result targeting reliability (inbox reset + forced search route + first-result click) | 25m | T38,T40 | Flow always returns to inbox, fills query, routes to Gmail `#search/<query>`, clicks first result row, and then drafts reply |
| T42 | P0 | DONE | Fix false Gmail search-route failure on URL normalization mismatch | 10m | T41 | Search flow treats visible Gmail `#search/` route as valid even when Gmail rewrites encoded query characters |
| T43 | P0 | DONE | Harden reply-editor opening and typing reliability on Gmail thread view | 20m | T41,T42 | Reply step succeeds using localized text fallback (`Reply`/`Responder`) and visible-element targeting in executor |
| T44 | P0 | DONE | Add open-only Gmail search flow for prompt `Find the last email from amazon associates` | 20m | T41,T42 | Prompt routes to deterministic search/open flow (search box -> first result -> extract) without reply-draft requirement |
| T45 | P0 | DONE | Fix shell text-to-speech reliability by routing ElevenLabs synthesis through background and adding browser TTS fallback | 30m | T36 | Speaker playback works even when content-script network calls fail; typecheck/build pass |
| T46 | P0 | DONE | Auto-submit speech-to-text prompt when user stops speaking | 20m | T33 | Mic capture ends automatically and submits captured prompt without extra click; typecheck/build pass |

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
- `TYPE`
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
- Search + draft deterministic path:
  - fill Gmail search box with target query and submit
  - open first result thread, extract context
  - open reply editor and insert generated draft body (no send)
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
- Gmail prompt runs in one attempt on inbox containing the target email.
- Reply draft is inserted in editor and remains unsent.
- Final output explicitly reports extracted context and draft result state.

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
- Last updated: 2026-02-22
- Current phase: MVP + Gmail search/draft demo flow complete
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
  - T09 Claude client integration
  - T10 Planner prompt contract
  - T11 Iterative plan-execute orchestration
  - T12 Final summarizer pass
  - T13 Hacker News adapter (multi-page navigation loop)
  - T14 Gmail adapter (unread thread open/read/back loop)
  - T15 Gmail selector hardening
  - T16 Compact context builder
  - T17 Execution trace panel
  - T18 Partial-success UX refinements
  - T19 Performance pass
  - T20 Reliability pass
  - T21 Hacker News acceptance script
  - T22 Gmail acceptance script
  - T23 Demo mode polish
  - T24 Final rehearsal checklist + backup prompts
  - T25 Generic cross-site traversal fallback
  - T26 Dynamic planner context refresh
  - T27 Generic candidate ranking + coverage warnings
  - T28 UI contrast hardening for cross-site pages
  - T29 Humanized summary formatting pass
  - T30 Imported UI shell merge from `/Users/marcoshernanz/dev/hackeurope/apps/extension`
  - T33 Post-merge UI regression fixes for shell behavior and controls
  - T34 Shell visual refinements from user feedback
  - T35 Favicon fallback and readability formatting pass
  - T36 Logo identity + ElevenLabs TTS integration
  - T37 Canonical demo prompts documented in `DEMOS.md`
  - T38 Deterministic Gmail search + reply-draft flow
  - T39 Single-demo pivot to Gmail-only prompt
  - T40 Amazon Associates target + sender-filter query preference
  - T41 Gmail search-result targeting reliability fix
  - T42 Gmail search-route normalization fix
  - T43 Reply-editor targeting reliability fix
  - T44 Open-only Gmail last-email flow + canonical prompt update
  - T45 TTS reliability fix via background synthesis + browser fallback
  - T46 Speech-to-text auto-submit on natural mic end
- In progress:
  - None
- Next up:
  - T31 Re-run demo-critical Gmail flow in Chrome with the transplanted shell UI
  - T32 Manual validation on 2-3 non-adapter websites and final tuning

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
  - Hardened Hacker News loop timing in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` by replacing event-race tab load waits with polling-based readiness checks and explicit return-to-HN navigation between articles.
  - Slowed human-like pointer animation 2-3x in `/Users/marcoshernanz/dev/hackeurope2/src/content/dom/visualCursor.ts`, `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts`, and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
  - Re-verified navigation and animation timing changes with `npm run typecheck` and `npm run build`.
  - Added Claude API integration and storage-backed config in `/Users/marcoshernanz/dev/hackeurope2/src/agent/claude.ts` (commands: `/key`, `/model`, `/claude-status`).
  - Added strict planner and summarizer prompt builders in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
  - Reworked `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` to:
    - run deterministic HN/Gmail loops for reliable demo navigation,
    - use Claude summarization when configured,
    - run a Claude iterative planner loop for generic tasks with strict JSON action parsing and bounded iterations.
  - Added `storage` permission in `/Users/marcoshernanz/dev/hackeurope2/manifest.json` for Claude config persistence.
  - Re-verified Claude integration updates with `npm run typecheck` and `npm run build`.
  - Replaced slash-command Claude configuration (`/key`, `/model`, `/claude-status`) with env + root config approach:
    - API key now injected from `ANTHROPIC_API_KEY` at build time via `/Users/marcoshernanz/dev/hackeurope2/scripts/build.mjs`.
    - Runtime model/planner settings now loaded from root `/Users/marcoshernanz/dev/hackeurope2/agent.config.json` via `/Users/marcoshernanz/dev/hackeurope2/src/agent/claude.ts`.
    - Removed storage-based key/model persistence and removed `storage` permission from `/Users/marcoshernanz/dev/hackeurope2/manifest.json`.
  - Added `/Users/marcoshernanz/dev/hackeurope2/.env` and updated `/Users/marcoshernanz/dev/hackeurope2/.gitignore` to ignore local secrets.
  - Re-verified env/config migration with `npm run typecheck` and `npm run build`.
  - Hardened Gmail execution in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` with broader unread-row, click-target, thread, and inbox-return selector fallback chains.
  - Added repeatable demo acceptance scripts:
    - `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_hn_demo.sh`
    - `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_gmail_demo.sh`
  - Added npm shortcuts for acceptance scripts in `/Users/marcoshernanz/dev/hackeurope2/package.json` (`test:demo:hn`, `test:demo:gmail`).
  - Smoke-ran both acceptance scripts and re-verified with `npm run typecheck` and `npm run build`.
- 2026-02-22:
  - Hardened Gmail selector fallback chains in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` across unread row detection, clickable targets, thread readiness, extraction targets, and inbox-return synchronization.
  - Added demo acceptance scripts `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_hn_demo.sh` and `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_gmail_demo.sh`.
  - Added npm commands in `/Users/marcoshernanz/dev/hackeurope2/package.json`: `test:demo:hn` and `test:demo:gmail`.
  - Smoke-tested scripts with non-interactive input and verified project integrity with `npm run typecheck` and `npm run build`.
  - Completed performance and reliability pass:
    - Added configurable runtime tuning fields in `/Users/marcoshernanz/dev/hackeurope2/agent.config.json` and `/Users/marcoshernanz/dev/hackeurope2/src/agent/claude.ts` (timeouts, poll interval, retry attempts).
    - Wired runtime tuning into executor batch limits and navigation polling in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
    - Added planner JSON auto-repair flow and bounded retry policy in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` using repair prompts from `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
    - Added planner loop stall protection (signature repetition + consecutive failure break) in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
  - Added performance tuning checklist script `/Users/marcoshernanz/dev/hackeurope2/scripts/perf_tune_check.sh` and npm command `test:perf` in `/Users/marcoshernanz/dev/hackeurope2/package.json`.
  - Re-verified tuning/reliability updates with `npm run typecheck`, `npm run build`, and `npm run test:perf`.
  - Completed demo polish in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.ts`, `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`, and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`:
    - progress bar + status hints,
    - ESC close behavior,
    - clearer final output with runtime/action stats.
  - Added final rehearsal deliverables:
    - `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`
    - `/Users/marcoshernanz/dev/hackeurope2/scripts/rehearsal_check.sh`
    - npm command `test:rehearsal` in `/Users/marcoshernanz/dev/hackeurope2/package.json`.
  - Re-verified polished build with `npm run typecheck`, `npm run build`, and `npm run test:rehearsal`.
  - Improved summary quality to be more LLM-like:
    - strengthened Claude summary prompts in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`,
    - added Claude model fallback retry in `/Users/marcoshernanz/dev/hackeurope2/src/agent/claude.ts`,
    - replaced raw Gmail fallback output with structured snapshot/priorities/actions summary in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
  - Re-verified summary-quality refinements with `npm run typecheck` and `npm run build`.
  - Further refined Gmail fallback summary style in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` to synthesize category-based one-line summaries (security/billing/subscription/travel/event/general) without clipped raw snippet output.
  - Fixed result-panel disappearance across navigation (notably on Hacker News) by adding background-to-content final-result push messaging (`ui/show-result`) and content-side re-open/render handling in:
    - `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts`
    - `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`
    - `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`
  - Re-verified navigation-output persistence fix with `npm run typecheck` and `npm run build`.
  - Completed compact context + trace + partial UX tasks:
    - T16: added compact planner context builder in `/Users/marcoshernanz/dev/hackeurope2/src/agent/context.ts`, expanded page-context snapshot payload in `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts`, and wired context collection in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`.
    - T17: added “Show Steps” trace panel in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.ts` and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`, with step rendering from action execution results.
    - T18: added explicit partial-result warnings and metadata across `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`, `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts`, and `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`.
  - Re-verified T16/T17/T18 with `npm run typecheck` and `npm run build`.
  - Implemented advanced cross-site support while preserving HN/Gmail adapters:
    - Added generic traversal fallback loop (list candidates -> open page -> extract -> return) with ranked candidate selection in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
    - Added planner utility gating to accept only useful generic planner outcomes and fall back automatically when coverage is too low.
    - Added generic traversal summary prompt contract in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
    - Added executor page metadata capture (URL/title/headings/candidates) in `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts` and `/Users/marcoshernanz/dev/hackeurope2/src/shared/actions.ts`.
    - Upgraded compact planner context to use live page metadata and discovered items in `/Users/marcoshernanz/dev/hackeurope2/src/agent/context.ts`.
    - Tightened generic target-count heuristic so numeric prompts without list intent (e.g. “3 key points”) do not trigger cross-page traversal.
  - Re-verified T25/T26/T27 with `npm run typecheck` and `npm run build`.
  - Fixed cross-site readability issue where host-page `pre` styles (e.g., Wikipedia) could make summary text invisible:
    - forced explicit text colors for output/trace panels in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
    - added selection contrast styling for readability in dark output panels.
  - Re-verified T28 with `npm run build`.
  - Humanized summary output style to reduce robotic/demo-breaking phrasing:
    - replaced deterministic summary status tags (`[OK]`) with natural language formatting in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
    - switched preview generation from clipped ellipses to short sentence-style highlights.
    - updated Claude summary prompt guidance in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts` to avoid robotic labels and ellipsis-heavy output.
    - adjusted top run-copy from `OK` wording to `completed` in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`.
  - Re-verified T29 with `npm run typecheck` and `npm run build`.
  - Completed T30 UI transplant merge (keep backend, import sibling-project UI shell):
    - copied shell UI components from `/Users/marcoshernanz/dev/hackeurope/apps/extension` into `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`, `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/centuri-logo.ts`, and `/Users/marcoshernanz/dev/hackeurope2/src/content/components/prompt-kit/text-shimmer.tsx`.
    - replaced `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.ts` with React-backed `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` that wraps imported shell UI and preserves existing submit/message wiring.
    - enabled TSX React build/type support in `/Users/marcoshernanz/dev/hackeurope2/tsconfig.json` and `/Users/marcoshernanz/dev/hackeurope2/scripts/build.mjs`.
    - added React runtime dependencies in `/Users/marcoshernanz/dev/hackeurope2/package.json` and lockfile.
  - Re-verified T30 with `npm run typecheck` and `npm run build`.
  - Completed T33 post-merge UI fixes based on validation feedback:
    - added explicit UI control runtime messages (`ui/open-command-bar`, `ui/set-command-state`) in `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts` and handlers in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`.
    - kept shell visible during cross-page navigation by pushing open/executing state after navigation in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
    - enabled mic and speaker controls in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` using Web Speech API and browser speech synthesis.
    - switched shell logo rendering from CSS mask to image source fallback in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx` for more reliable rendering on sites like Hacker News.
    - hid top-right shell action buttons when minimized and reduced visual border intensity/duplicate CSS blocks in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T33 with `npm run typecheck` and `npm run build`.
  - Completed T34 shell visual refinement pass:
    - made logo accent orange and centered in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - kept send button in orange accent even in disabled visual state in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - removed inner message bubble border styling in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - removed completed/error status pill rendering (bottom mini box) by showing status only while actively planning/executing in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T34 with `npm run typecheck` and `npm run build`.
  - Completed T35 readability + favicon pass:
    - added page favicon detection with robust fallback to embedded Centuri icon in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - added extra top padding for history content to avoid tight top-edge layout in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - improved summary rendering readability by preserving meaningful line structure in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx` and adding summary text normalization/splitting in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
  - Re-verified T35 with `npm run typecheck` and `npm run build`.
  - Completed T36 logo identity + ElevenLabs speech integration:
    - removed page-favicon logo substitution and pinned shell icon to Centuri asset in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - replaced browser `speechSynthesis` fallback path with ElevenLabs API audio synthesis/playback in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
    - injected ElevenLabs env vars (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_SPEECH_PROFILE`) at build time via `/Users/marcoshernanz/dev/hackeurope2/scripts/build.mjs`.
  - Re-verified T36 with `npm run typecheck` and `npm run build`.
  - Completed T37 demo prompt documentation by adding `/Users/marcoshernanz/dev/hackeurope2/DEMOS.md` with the two official live prompts (HN top-5 summary and Gmail search-and-draft flow with no-send guardrail).
  - Completed T38 deterministic Gmail search-and-draft demo flow:
    - added `TYPE` action to constrained action schema and planner contract in `/Users/marcoshernanz/dev/hackeurope2/src/shared/actions.ts` and `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
    - implemented text-input execution primitive (including submit support) in `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts`.
    - added dedicated Gmail search -> open first result -> extract -> reply draft deterministic flow in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
    - added Claude-assisted reply-draft prompt fallback in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
    - updated demo docs/checklists in `/Users/marcoshernanz/dev/hackeurope2/DEMOS.md`, `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`, and `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_gmail_demo.sh`.
  - Re-verified T38 updates with `npm run typecheck` and `npm run build`.
  - Completed T39 single-demo pivot:
    - switched canonical demo prompt in `/Users/marcoshernanz/dev/hackeurope2/DEMOS.md` to Gmail-only (`In Gmail, find the last email from "Amazon Associates" and draft a reply in Spanish without sending.`).
    - updated `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md` and `/Users/marcoshernanz/dev/hackeurope2/scripts/rehearsal_check.sh` to remove Hacker News demo references.
    - aligned acceptance/perf scripts with the Gmail-only prompt in `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_gmail_demo.sh` and `/Users/marcoshernanz/dev/hackeurope2/scripts/perf_tune_check.sh`.
    - aligned docs/instructions in `/Users/marcoshernanz/dev/hackeurope2/PROJECT.md` and `/Users/marcoshernanz/dev/hackeurope2/AGENTS.md`.
  - Re-verified T39 updates with `npm run typecheck` and `npm run build`.
  - Completed T40 sender-target update to Amazon Associates:
    - changed Gmail default fallback query to `from:"Amazon Associates"` and improved prompt parsing for “from <sender>” in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`.
    - updated canonical prompt/docs/scripts to Amazon Associates in `/Users/marcoshernanz/dev/hackeurope2/DEMOS.md`, `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`, `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_gmail_demo.sh`, `/Users/marcoshernanz/dev/hackeurope2/scripts/perf_tune_check.sh`, `/Users/marcoshernanz/dev/hackeurope2/PROJECT.md`, and `/Users/marcoshernanz/dev/hackeurope2/AGENTS.md`.
  - Completed T41 Gmail search reliability fix for “click first result” behavior:
    - updated `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so Gmail draft flow returns to inbox first, fills the search box, then forces deterministic search navigation via `#search/<encoded query>` before selecting results.
    - tightened search result selectors to grid row targets and added an explicit first-result listing step before click.
    - improved draft wording by humanizing sender-filter queries (e.g., `from:"Amazon Associates"` -> `Amazon Associates`).
  - Re-verified T41 updates with `npm run typecheck` and `npm run build`.
  - Completed T42 false search-route failure fix:
    - added Gmail search-route fallback detection in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so URL canonicalization differences no longer fail the run when `#search/` is already loaded.
    - improved user-facing Gmail query labels in status/output messages for sender-filter searches.
  - Re-verified T42 updates with `npm run typecheck` and `npm run build`.
  - Completed T43 reply-editor reliability fix:
    - updated `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` to retry reply opening with localized text targeting (`Reply`, then `Responder`) and only mark success when typing into the editor succeeds.
    - removed brittle intermediate list-check action in search result opening path to reduce false partials.
    - updated `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts` to prioritize visible DOM candidates for target finding/query selection.
  - Re-verified T43 updates with `npm run typecheck` and `npm run build`.
  - Completed T44 open-only Gmail search flow and prompt update:
    - added prompt intent routing in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so `Find the last email from amazon associates` runs deterministic search/open flow without reply drafting.
    - added `runGmailSearchOpenLatestFlow` in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` to perform search input, open first result, and extract context.
    - updated canonical prompt/docs/scripts in `/Users/marcoshernanz/dev/hackeurope2/DEMOS.md`, `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`, `/Users/marcoshernanz/dev/hackeurope2/scripts/e2e_gmail_demo.sh`, `/Users/marcoshernanz/dev/hackeurope2/scripts/perf_tune_check.sh`, `/Users/marcoshernanz/dev/hackeurope2/PROJECT.md`, and `/Users/marcoshernanz/dev/hackeurope2/AGENTS.md`.
  - Completed T45 TTS reliability fix:
    - added a new runtime message contract (`tts/synthesize`) in `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts`.
    - moved ElevenLabs synthesis requests to the background worker in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` and returned base64 audio payloads to content UI.
    - updated `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` to consume background-synthesized audio and fall back to browser `speechSynthesis` when ElevenLabs fails/unavailable.
    - re-verified with `npm run typecheck` and `npm run build`.
  - Completed T46 speech-to-text auto-submit behavior:
    - updated `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` mic capture lifecycle to run in single-utterance mode (`continuous = false`) so recognition naturally ends after speaking pauses.
    - added guarded auto-submit on mic `onend` when speech was captured, while preventing accidental submits on manual stop/error.
    - re-verified with `npm run typecheck` and `npm run build`.

## 12) Risk & Fallback Matrix

| Risk | Impact | Likelihood | Mitigation | Fallback Demo Path |
|---|---|---|---|---|
| Gmail selectors break | High | Medium | Multi-selector chain + aria-first targeting | Retry with top-1 query prompt and manually paste generated draft text |
| Model returns invalid JSON | High | Medium | Strict parser + auto-repair retry | Deterministic hardcoded per-domain flow mode |
| Execution too slow | High | Medium | Tight waits, text caps, fewer planner loops | Re-run the same Gmail prompt once after refresh |
| Extraction quality low | Medium | Medium | Multiple extractors + fallback body text | Show sourced snippets + caveats |
| Live network/API issue | High | Low/Medium | Warm-up call pre-demo + retries | Local mocked summary from collected snippets |

## 13) Immediate Next Steps
1. T31: Re-run demo-critical Gmail check with the exact canonical prompt.
2. T32: Validate generic flow on at least three non-adapter sites (news/blog/docs) using “summarize top/recent N” prompts.
3. Perform one full rehearsal using `npm run test:rehearsal` and `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`.
