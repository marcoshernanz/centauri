# Project: Interact with the Web Through Natural Language

## 1. Demo-First Goal
Build a **Chrome extension** that opens a bottom command bar with a keyboard shortcut, accepts a natural-language instruction, and executes it on the current website through fast, human-like browser actions.

This is a **hackathon MVP** optimized for a live demo in 12 hours.

Primary demo scenario:
1. **Gmail**: “Find the last email from amazon associates.”

Priority order:
1. Human-like but extremely fast navigation (most important for demo wow factor)
2. Agent speed
3. Reliable output

---

## 2. Product Experience

### Trigger
- Keyboard shortcut (default): `Cmd/Ctrl + Shift + K`
- Opens a bottom floating command bar (Spotlight-style).

### User flow
1. User types prompt in command bar.
2. Extension shows immediate state: `Planning...` -> `Executing...` -> `Summarizing...`.
3. Agent performs visible browser actions (click/open/back/scroll/read).
4. Final answer appears in the command bar panel with:
   - concise summary
   - sources visited (titles/links)
   - optional “show steps” toggle

### UX principle
- Fast enough to feel magical.
- Human-like motion so actions feel understandable and trustworthy.

---

## 3. Scope (MVP vs Not Now)

### In scope (must ship)
- Bottom command bar UI in content script.
- Keyboard shortcut to toggle UI.
- Task execution loop for `mail.google.com` (demo-critical).
- Claude-based planner + step generator.
- Deterministic action executor (click, type, open, back, extract text).
- Final summarization response.
- Basic guardrails + timeout + retry.

### Out of scope (skip for hackathon)
- General autonomous browsing across all websites.
- Multi-tab orchestration beyond what is needed for demo.
- Long-term memory, user profiles, auth vaults.
- Complex computer vision interaction.

---

## 4. High-Level Architecture

### Components
1. **Content Script**
   - Renders bottom command bar UI.
   - Captures page state and DOM candidates.
   - Runs action executor directly in page context.

2. **Background Service Worker (MV3)**
   - Orchestrates workflow state.
   - Calls Claude API.
   - Handles message passing with content script.

3. **Claude Agent Layer**
   - Produces strict JSON plans/actions.
   - Uses a small action vocabulary for reliability.

4. **Summarizer**
   - Claude pass over collected text chunks.
   - Returns concise final output.

### Why this architecture
- Keeps execution local in content script for speed.
- Keeps model calls centralized for simpler control.
- Restricts model output format for robust execution.

---

## 5. Action System (Reliability + Speed)

Use a constrained action schema instead of free-form instructions.

### Supported actions
- `LIST_ITEMS` (find candidate list rows with selector hints)
- `CLICK`
- `TYPE` (fill inputs/editors, optional submit)
- `OPEN_IN_SAME_TAB`
- `BACK`
- `WAIT_FOR`
- `EXTRACT_TEXT` (main article/email body)
- `SCROLL`
- `DONE`

### Execution contract
- Claude outputs valid JSON only.
- Executor validates each step before running.
- On failure:
  - quick fallback selector attempt
  - one retry
  - if still failing, return partial result with explicit warning

### Human-like fast navigation
- Use “micro-animated cursor” overlay:
  - very short curved movement to click target
  - 80–180ms move + 40ms click pulse
- Real action still executes through direct DOM events for speed.
- Tiny randomized delays (20–80ms) to avoid robotic feel while staying fast.

---

## 6. Domain Strategy for Demo

### Gmail strategy
Prompt example: “Find the last email from amazon associates.”

Plan:
1. Ensure on `mail.google.com`.
2. Fill search input with target query and submit.
3. Open first matching thread.
4. Extract visible thread context.
5. Open reply editor and insert a generated Spanish draft.
6. Return a concise run summary confirming draft insertion and that nothing was sent.

Gmail reliability notes:
- Prefer robust selectors based on roles/aria-labels over fragile class names.
- Keep extraction tolerant to Gmail DOM changes by using multiple fallback selectors.

---

## 7. Claude Integration Design

### Model usage
- Use Claude for:
  1. planning next actions
  2. final summarization

### Prompting pattern
System instruction should enforce:
- output strict JSON with allowed actions only
- max steps per iteration (e.g., 3–5)
- never invent data
- if unsure, request additional extraction step

### Iterative loop
1. Send task + compact page context + current progress.
2. Receive next action block.
3. Execute actions.
4. Feed execution results back.
5. Repeat until `DONE`.
6. Run final summarize pass.

### Performance controls
- Keep context compact:
  - page title
  - URL
  - top candidate elements
  - extracted text snippets only
- Hard limits:
  - max pages (5 for demo)
  - max extraction chars per page
  - max loops + hard timeout

---

## 8. Technical Stack

- **Extension**: Chrome Extension Manifest V3
- **Language**: TypeScript
- **UI**: Lightweight HTML/CSS + minimal animation (no heavy framework needed)
- **LLM**: Claude API (Anthropic)
- **Build**: Vite (or simple esbuild) for fast iteration

Recommended file layout:
- `src/background.ts`
- `src/content/ui.ts`
- `src/content/executor.ts`
- `src/content/extractors/hackernews.ts`
- `src/content/extractors/gmail.ts`
- `src/agent/claude.ts`
- `src/agent/schema.ts`
- `src/shared/types.ts`

---

## 9. 12-Hour Build Plan (Demo Optimized)

### Hour 0–1: Skeleton
- Set up MV3 extension with background + content script.
- Add keyboard shortcut and bottom bar shell.
- Basic message passing.

### Hour 1–3: Executor Core
- Implement action schema + validator.
- Implement click/open/back/wait/extract primitives.
- Add visible cursor animation layer.

### Hour 3–5: Hacker News Vertical Slice
- Implement HN selectors/extraction.
- End-to-end run for top 5 summaries.
- Handle failures + retries.

### Hour 5–7: Gmail Vertical Slice
- Implement unread thread navigation and extraction.
- Add selector fallbacks.
- Stabilize back-navigation and thread indexing.

### Hour 7–9: Claude Loop + Summarizer
- Integrate Claude calls.
- Build iterative plan/execute loop.
- Add strict JSON parsing and recovery.

### Hour 9–10: Speed Pass
- Reduce waits/timeouts.
- Parallelize where safe (pre-fetch lightweight metadata only).
- Cache prompt scaffolding.

### Hour 10–11: Reliability Pass
- Add hard limits, timeout messaging, partial-success response.
- Test both demo scenarios repeatedly.

### Hour 11–12: Demo Polish
- Refine UI copy/status transitions.
- Add “show steps” panel.
- Prepare fixed demo script and backup prompts.

---

## 10. Demo Script (What to Show Judges)

### Demo: Gmail
1. Open Gmail inbox.
2. Press shortcut, type: “Find the last email from amazon associates.”
3. Agent searches Gmail, opens first result, and extracts context.
4. Show concise summary + confirmation of opened matching email.

Backup prompt options:
- “Search Gmail for "Amazon Associates" and open the first result.”

---

## 11. Risk Register + Mitigations

1. **Gmail DOM instability**
- Mitigation: multi-selector fallback, role/aria-first strategy, partial result mode.

2. **LLM outputs invalid JSON**
- Mitigation: schema validation + repair pass + retry with strict correction prompt.

3. **Slow run time**
- Mitigation: hard cap on extracted text, short waits, limited loops, optimized selector queries.

4. **Navigation errors during live demo**
- Mitigation: pre-demo smoke test checklist + rerun the same prompt after Gmail refresh.

---

## 12. Success Criteria for Hackathon

Must-have to win the demo:
1. Command bar opens instantly with shortcut.
2. Gmail search-and-draft task completes end-to-end in a single run.
3. Agent movement looks human but feels very fast.
4. Final output is clear, structured, and grounded in extracted content.

Nice-to-have:
- Step replay panel.
- “Why this summary?” trace with snippet references.

---

## 13. Build Philosophy (for the next 12h)

- Optimize for a **stable, impressive demo**, not for full generalization.
- Prefer deterministic selectors + constrained agent actions over open-ended autonomy.
- If a tradeoff appears, choose what improves:
  1. perceived speed
  2. visible competence
  3. reliability on the two scripted scenarios
