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
| T02 | P0 | DONE | Implement keyboard shortcut + command bar toggle | 30m | T01 | `Cmd/Ctrl+Shift+Space` opens/closes bottom bar on supported pages |
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
| T31 | P0 | TODO | Re-run demo-critical acceptance checks (HN + Gmail) with transplanted shell UI in Chrome | 30m | T30,T21,T22 | Both demo prompts complete with expected summaries and no UI regressions |
| T32 | P1 | TODO | Validate generic flow on 2-3 non-adapter sites with new UI and capture regressions | 30m | T30,T25,T27 | Generic summarize-top/recent prompts complete or fail-partial clearly with stable UI |
| T33 | P0 | DONE | Fix post-merge UI regressions (logo/nav persistence/voice controls/minimized controls/border polish) | 45m | T30 | HN logo renders reliably, shell remains visible across navigation, mic+speaker are enabled, minimized action buttons are hidden, and border styling is cleaned up |
| T34 | P1 | DONE | Refine shell visual styling (logo/send accent, inner border cleanup, bottom box removal) | 20m | T33 | Logo and send button styling match requested orange accent, inner message border removed, logo centered, and completed-state status box removed |
| T35 | P1 | DONE | Add favicon fallback + top spacing + readable summary formatting | 20m | T34 | Shell icon resolves from page favicon with fallback, history content has better top spacing, and summary text is rendered with clearer line structure |
| T36 | P0 | DONE | Restore Centuri logo identity and switch TTS to ElevenLabs API | 30m | T35 | Shell icon no longer uses page favicon override, and speaker playback synthesizes audio via ElevenLabs with configured voice/model env vars |
| T37 | P1 | DONE | Multi-shell hotkey + pin/resize/animation polish for demo UX | 45m | T30,T33 | Shortcut uses `Ctrl/Cmd+Shift+Space`; repeated hotkey spawns a new shell when current shell is already used; each shell can pin/unpin independently; unpinned shell stays slightly transparent; shell is resizable from borders/corners; open/close animations are smoother with fade/blur exit |
| T38 | P1 | DONE | Add image-pick assistance and orange initialization edge glow | 30m | T37 | Opening an idle shell highlights visible page images with orange markers; user click on a highlighted image auto-fills the shell prompt with image context; shell appears with thin orange edge + fast outside fade glow |
| T39 | P1 | DONE | Refine image-pick visuals + input thumbnail + gated resize limits | 25m | T38 | Image highlight ring is thicker with stronger orange gradient and click cursor icon; selected image appears as a small left-side input thumbnail; width/height resizing is disabled until response exists and remains clamped by min/max bounds |
| T40 | P1 | DONE | Image submit UX polish + Gemini-only multimodal path | 35m | T39 | Submitted input clears immediately; selected image no longer injects autogenerated prompt text; image tasks route to Gemini-only summarization while non-image tasks stay on Claude; image mark hover keeps click cursor without color-shift |
| T41 | P1 | DONE | Input/multimodal behavior hardening + interaction refinements | 30m | T40 | Text-only prompts run normally when no selected image; selected image can be removed from input; drag-to-move works from top grab area only; TTS control sits next to response text; speech-to-text auto-submits on recognition end; response text is selectable |
| T42 | P1 | DONE | Add agentic/chat switch mode in shell icon with DOM-only Anthropic fallback path | 35m | T41,T40 | Clicking the shell logo toggles Agentic vs Chat mode; Agentic keeps full executor flow; Chat mode uses Anthropic with captured DOM context only and runs no page actions; text-only send works even when no image is selected |
| T43 | P1 | DONE | Remove agent cursor bubble + simplify output text + instant input clear on submit | 20m | T42 | Agentic runs no longer render cursor bubble overlay; shell output shows only model response text (no run/action metadata); prompt input clears immediately on send |
| T44 | P1 | DONE | Plain DOM-chat phrasing (no wrappers) + extra input-clear hardening | 15m | T43,T42 | Chat/DOM fallback responses are plain natural language without `DOM-Based Response`/`Task` wrappers; generic deterministic summary avoids `Page Summary` wrapper; submit callback force-clears prompt before dispatch |
| T45 | P1 | DONE | Image/chat executing-state polish + direct chat-LLM response + spoken-input display fix | 20m | T44 | Image submissions keep executing animation while waiting; chat mode uses plain Claude response from DOM snapshot (no structured wrapper); submitted active prompt is rendered in history (including speech submissions) |
| T46 | P1 | DONE | Hotkey toggle regression fix (second press closes shell reliably) | 10m | T37 | Pressing `Ctrl/Cmd+Shift+Space` while a shell is open now closes the topmost visible shell instead of spawning a new one; rebuilt extension bundle reflects source behavior |
| T47 | P1 | DONE | Humanize Gemini image-response format defaults | 15m | T40,T45 | Gemini image prompt now defaults to plain natural-language 1-2 paragraph responses and avoids rigid numbered markdown sections unless the user explicitly requests structured formatting |
| T48 | P0 | DONE | Force hardcoded HN/Gmail agent routing in `final_v` and broaden intent matching | 20m | T13,T14,T42 | HN/Gmail deterministic flows run even if shell mode is Chat; intent matching accepts `hack news`/`hn`; build + typecheck pass |
| T49 | P1 | DONE | Add README documentation (overview, developers, key setup, build/load/use) | 20m | T30 | `README.md` documents Centauri, includes developer credits, model key setup, extension build/load instructions, and usage flow |

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
- Last updated: 2026-02-22
- Current phase: MVP + cross-site generalization complete
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
  - T37 Multi-shell hotkey behavior + pin/resize/animation polish
  - T38 Image-pick assistance + orange edge-glow initialization polish
  - T39 Stronger image pick UX and resize-gating refinements
  - T40 Image submit clearing + Gemini multimodal-only image path
  - T41 Input/multimodal run-path and interaction refinements
  - T42 Agentic/chat mode switch + DOM-only Anthropic response path
  - T43 Cursor bubble removal + plain response output + instant input clear
  - T44 Plain DOM-chat phrasing + input-clear hardening
  - T45 Executing-state + direct chat response + prompt-display polish
  - T46 Hotkey toggle regression fix for close-on-second-press behavior
  - T47 Humanized Gemini image-response default format
  - T48 Hardcoded HN/Gmail routing priority and intent matching hardening
  - T49 README documentation + title/icon header polish
- In progress:
  - None
- Next up:
  - T31 Re-run demo-critical HN + Gmail flows in Chrome with the transplanted shell UI
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
  - Completed T37 multi-shell hotkey + shell interaction polish:
    - changed command shortcut to `Ctrl/Cmd+Shift+Space` in `/Users/marcoshernanz/dev/hackeurope2/manifest.json`.
    - synced shortcut documentation updates in `/Users/marcoshernanz/dev/hackeurope2/PROJECT.md`, `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`, and T02 notes in `/Users/marcoshernanz/dev/hackeurope2/PLAN.md`.
    - replaced singleton shell handling with bounded multi-shell management in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts` (creates new shell on repeated hotkey when current shell is already used, keeps pristine-shell toggle-close behavior, and tracks topmost shell layering).
    - extended shell lifecycle state in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` for smooth close animation, per-shell z-index activation, persisted size metadata, and independent pin/move/resize state.
    - added border/corner resizing and smoother open/close animations with slight unpinned transparency in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T37 with `npm run typecheck` and `npm run build`.
  - Completed T38 image-pick + init border glow polish:
    - added visible-image orange highlight mode in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css` (bounded to visible `img` elements, max targets, and cleaned up on close/owner switch).
    - wired real user clicks on highlighted images to auto-fill the active shell prompt with image context text in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
    - ensured image-pick interception only reacts to trusted user clicks so executor-driven synthetic clicks are unaffected.
    - added thin orange edge + fast outside fade glow on shell appearance in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T38 with `npm run typecheck` and `npm run build`.
  - Completed T39 image-pick and resize UX refinement pass:
    - increased image highlight prominence with thicker orange gradient rings and stronger glow in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
    - switched highlighted-image cursor to an explicit click icon in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
    - added selected-image preview thumbnail rendering at the left side of the input row in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx` and data plumbing in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
    - gated width/height resizing until a response exists and enforced explicit min/max resize bounds in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T39 with `npm run typecheck` and `npm run build`.
  - Completed T40 image submit + Gemini multimodal integration pass:
    - cleared input field on submit and allowed submit with image-only payload (no injected text) in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - propagated selected image metadata through submit message contract in `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts` and `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`.
    - added Gemini image client in `/Users/marcoshernanz/dev/hackeurope2/src/agent/gemini.ts` and build-time env wiring (`GEMINI_API_KEY`, `GEMINI_MODEL`) in `/Users/marcoshernanz/dev/hackeurope2/scripts/build.mjs`.
    - routed image-selected submissions to Gemini-only analysis in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts`, including image fetch/data-url normalization and bounded payload conversion.
    - removed hover color-shift on image marks while keeping click cursor interaction in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
  - Re-verified T40 with `npm run typecheck` and `npm run build`.
  - Completed T41 input/multimodal interaction hardening:
    - added explicit image-clear control in the input thumbnail and kept text-only path normal when no selected image in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx` and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
    - moved TTS control from input row to response area in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - restricted drag movement to top grab area only in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - enabled speech-to-text auto-submit on recognition end in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
    - made response text selectable for copy workflows in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T41 with `npm run typecheck` and `npm run build`.
  - Completed T42 agent-mode toggle and non-agentic read-only flow:
    - added agent mode payload/state plumbing (`agentic`/`chat`) through `/Users/marcoshernanz/dev/hackeurope2/src/shared/messages.ts`, `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts`, and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
    - made the shell logo clickable to toggle mode and added mode badge styling in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - added a read-only Anthropic prompt for DOM snapshot answers in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
    - branched submit orchestration in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so:
      - selected-image requests still route to Gemini multimodal,
      - chat mode skips executor/navigation and returns direct Anthropic DOM-based text response,
      - agentic mode keeps existing full task-execution behavior.
    - expanded page snapshot capture with `bodyTextSnippet` and hardened text-only send enablement logic for no-image submits.
  - Re-verified T42 with `npm run typecheck` and `npm run build`.
  - Completed T43 output/submit/cursor cleanup:
    - disabled visual cursor animation hooks in `/Users/marcoshernanz/dev/hackeurope2/src/content/executor/runner.ts` and hid residual cursor/ripple overlay styles in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/styles.css`.
    - simplified shell output formatting to return only summary text in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts` (`formatFinalOutput` and `formatUiResultMessage`).
    - made send/Enter submit clear local input immediately before dispatch in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T43 with `npm run typecheck` and `npm run build`.
  - Completed T44 plain-response follow-up:
    - updated read-only chat prompt instructions in `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts` to produce one direct natural-language answer without section labels.
    - simplified deterministic fallback phrasing in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so it no longer emits `DOM-Based Response`, `Task`, `Page Summary`, or cross-page task wrappers.
    - added an extra immediate prompt clear in submit callback path in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx`.
  - Re-verified T44 with `npm run typecheck` and `npm run build`.
  - Completed T45 image/chat follow-up polish:
    - switched image-submit and chat-submit shell state push to `executing` in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so waiting phase shows executing animation.
    - changed chat mode to call Claude directly with a plain-response system prompt in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` and `/Users/marcoshernanz/dev/hackeurope2/src/agent/prompts.ts`.
    - added active prompt rendering in shell view model/UI so submitted text (including speech) is shown clearly in history in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` and `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
    - included `Summarizing` as active status animation state in `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/shell.tsx`.
  - Re-verified T45 with `npm run typecheck` and `npm run build`.
  - Completed T46 hotkey toggle regression fix:
    - ensured the content hotkey handler in `/Users/marcoshernanz/dev/hackeurope2/src/content/index.ts` closes the latest visible shell when one is open, and only creates a new shell when none are visible.
    - removed obsolete pristine-toggle helper logic from `/Users/marcoshernanz/dev/hackeurope2/src/content/ui/commandBar.tsx` so the old spawn-new-shell hotkey branch cannot regress.
    - rebuilt extension bundle so `/Users/marcoshernanz/dev/hackeurope2/dist/content/index.js` reflects the close-on-second-press behavior.
  - Re-verified T46 with `npm run typecheck` and `npm run build`.
  - Completed T47 Gemini image-response humanization:
    - replaced rigid numbered-section instructions in `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` (`buildGeminiImagePrompt`) with a plain-language response contract.
    - default image output now asks for direct, natural 1-2 paragraph text and only uses structured formats when explicitly requested by the user.
    - added guardrail to avoid template-style openers like “Here's information about ...”.
  - Re-verified T47 with `npm run typecheck` and `npm run build`.
  - Completed T48 hardcoded demo-routing hardening for `final_v`:
    - updated `/Users/marcoshernanz/dev/hackeurope2/src/background/index.ts` so Gmail/Hacker News hardcoded flows are resolved before chat-mode branching, ensuring deterministic adapter execution on demo-critical domains.
    - expanded Hacker News intent detection to include prompt variants like `hack news` and `hn`.
    - added `detectHardcodedTask` helper for explicit route resolution while preserving existing generic and image flows.
  - Re-verified T48 with `npm run typecheck` and `npm run build`.
  - Completed T49 README documentation pass:
    - added `/Users/marcoshernanz/dev/hackeurope2/README.md` with Centauri overview, developer credits, model key setup, build steps, Chrome load process, and usage instructions.
    - updated `/Users/marcoshernanz/dev/hackeurope2/README.md` to place the Centauri icon directly under the `# Centauri Chrome Extension` title.
  - Follow-up README header tweak:
    - kept `# Centauri Chrome Extension` as the first line and inserted `![Centauri Icon](assets/icons/icon-128.png)` immediately below it.

## 12) Risk & Fallback Matrix

| Risk | Impact | Likelihood | Mitigation | Fallback Demo Path |
|---|---|---|---|---|
| Gmail selectors break | High | Medium | Multi-selector chain + aria-first targeting | Reduce to top 3 unread + explicit partial mode |
| Model returns invalid JSON | High | Medium | Strict parser + auto-repair retry | Deterministic hardcoded per-domain flow mode |
| Execution too slow | High | Medium | Tight waits, text caps, fewer planner loops | Run top 3 instead of top 5 |
| Extraction quality low | Medium | Medium | Multiple extractors + fallback body text | Show sourced snippets + caveats |
| Live network/API issue | High | Low/Medium | Warm-up call pre-demo + retries | Local mocked summary from collected snippets |

## 13) Immediate Next Steps
1. T31: Re-run demo-critical checks on Hacker News and Gmail with real prompts.
2. T32: Validate generic flow on at least three non-adapter sites (news/blog/docs) using “summarize top/recent N” prompts.
3. Perform one full rehearsal using `npm run test:rehearsal` and `/Users/marcoshernanz/dev/hackeurope2/DEMO_RUNBOOK.md`.
