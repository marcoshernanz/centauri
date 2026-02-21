# AGENTS.md

## Mission
Build a demo-ready Chrome extension in 12 hours that lets users execute web tasks via natural language, with very fast human-like navigation and reliable summaries.

## Canonical Context Files
- Product definition: `/Users/marcoshernanz/dev/hackeurope2/PROJECT.md`
- Implementation roadmap and status: `/Users/marcoshernanz/dev/hackeurope2/PLAN.md`

Read these first at the start of every session.

## Demo-Critical Scenarios
1. Hacker News: “Summarize the top 5 hackernews articles.”
2. Gmail: “Give me a summary of my last 5 unread emails.”

All technical decisions should optimize these two flows for live demo performance and stability.

## Priorities (Strict Order)
1. Human-like but extremely fast navigation.
2. Overall agent speed.
3. Reliable and grounded output.

## Architecture Guardrails
- Chrome Extension MV3 with background orchestrator + content executor.
- Claude is mandatory model.
- Constrained action schema only; no unconstrained free-form execution.
- Deterministic selectors and domain adapters for HN/Gmail first.
- Tight timeouts, retries, and hard caps to avoid demo stalls.

## Operating Procedure For Agents
1. Open `PROJECT.md` and `PLAN.md`.
2. Pick highest-priority `TODO` task from `PLAN.md` Section 4.
3. Implement minimal viable slice that keeps end-to-end path runnable.
4. Verify with focused checks (unit/integration/manual as applicable).
5. Update `PLAN.md` before ending turn:
   - change task statuses (`TODO/IN_PROGRESS/DONE/BLOCKED`)
   - update Section 10 `Progress Snapshot`
   - append entry to Section 11 `Work Log`
6. Report what changed, what remains, and immediate next task IDs.

## Mandatory PLAN Maintenance Rule
After doing any changes (code, config, docs), `PLAN.md` must be updated in the same session to reflect:
- which parts are done
- which parts remain to do

No exceptions.

## Definition Of Done For Each Task
- Implementation complete for scoped behavior.
- Basic verification executed and results noted.
- Failure behavior handled (or explicitly documented).
- `PLAN.md` updated with status and log entry.

## Speed + Reliability Heuristics
- Keep model context compact (URL/title/candidates/snippets only).
- Prefer short action batches (3-5 steps).
- Use fallback selector chains for Gmail.
- Clip extraction text aggressively to reduce latency.
- Fail partial with explicit message instead of hanging.

## Demo Safety Rules
- Always preserve a fallback path (`top 3` variant).
- Keep a deterministic per-domain backup flow available if planner degrades.
- Before demo: run both critical scenarios end-to-end once.

## What To Avoid
- Broad “agent for all websites” scope creep.
- Heavy UI frameworks or complex refactors during hackathon window.
- Long unbounded loops, weak parsing, or hidden failures.

## Quick Start Checklist
- [ ] Review `PLAN.md` current top `TODO`s.
- [ ] Confirm environment and extension build/run command works.
- [ ] Execute next P0 task.
- [ ] Update `PLAN.md` status + work log.
