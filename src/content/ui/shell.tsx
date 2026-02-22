import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import { TextShimmer } from "../components/prompt-kit/text-shimmer";
import { CENTURI_LOGO } from "./centuri-logo";

export type MenuOption = { label: string; value: string };

export type ChainStepModel = {
  id: string;
  title: string;
  phase: "plan" | "act" | "verify" | "replan" | "complete" | "error";
  items: string[];
};

export type SourceModel = {
  id: string;
  label: string;
  title: string;
  url?: string;
};

export type CompletedTaskModel = {
  prompt: string;
  summary: string | null;
};

export type ShellViewModel = {
  prompt: string;
  promptPlaceholder: string;
  promptDisabled: boolean;
  micActive: boolean;
  micBusy: boolean;
  micDisabled: boolean;
  ttsActive: boolean;
  ttsBusy: boolean;
  ttsDisabled: boolean;
  statusText: string;
  canCancel: boolean;
  canRetry: boolean;
  showThinking: boolean;
  thinkingText: string;
  chainSteps: ChainStepModel[];
  summary: string | null;
  recommendation: string | null;
  findings: string[];
  sources: SourceModel[];
  menuOptions: MenuOption[];
  completedTasks: CompletedTaskModel[];
  hiding: boolean;
  collapsed: boolean;
  pinned: boolean;
  initialLeft?: number;
  initialBottom?: number;
};

export type ShellCallbacks = {
  onPromptChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onMicToggle: () => void;
  onTtsToggle: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPositionChange: (left: number, bottom: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
  onTogglePin: () => void;
};

type ShellAppProps = {
  view: ShellViewModel;
  callbacks: ShellCallbacks;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const isActiveState = (s: string) =>
  s.startsWith("Planning") || s.startsWith("Executing") || s.startsWith("Replanning");

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const StopIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="3" />
  </svg>
);

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" />
    <path d="M18 11a1 1 0 1 1 2 0 8 8 0 1 1-16 0 1 1 0 0 1 2 0 6 6 0 1 0 12 0Z" />
    <path d="M11 21a1 1 0 0 1 2 0v2h-2v-2Z" />
  </svg>
);

const SpeakerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M14.5 4.5a1 1 0 0 1 1.7.7v13.6a1 1 0 0 1-1.7.7L9.5 15H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3.5l5-4.5Z" />
    <path d="M19.7 8.3a1 1 0 0 1 1.4 0 5.2 5.2 0 0 1 0 7.4 1 1 0 0 1-1.4-1.4 3.2 3.2 0 0 0 0-4.6 1 1 0 0 1 0-1.4Z" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
  </svg>
);

const PinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16 9V4l1-1V2H7v1l1 1v5l-3 3v1h6v7l1-1 1 1v-7h6v-1l-3-3Z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

// ── Smooth drag — always bottom-anchored so content grows upward ─────────────
const useDrag = (
  elRef: React.RefObject<HTMLElement | null>,
  onPositionChange: (left: number, bottom: number) => void,
  locked: boolean,
) => {
  const DRAG_MOVE_THRESHOLD_PX = 4;

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (locked) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.tagName === "TEXTAREA" ||
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT"
    ) return;
    e.preventDefault();

    const el = elRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const startLeft   = rect.left + rect.width / 2;
    const startBottom = window.innerHeight - rect.bottom;
    const startX = e.clientX;
    const startY = e.clientY;

    el.style.top       = "auto";
    el.style.bottom    = `${startBottom}px`;
    el.style.left      = `${startLeft}px`;
    el.style.transform = "translateX(-50%)";
    el.style.animation = "none"; // disable CSS animation while dragging

    let hasMoved = false;
    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (!hasMoved && Math.hypot(dx, dy) >= DRAG_MOVE_THRESHOLD_PX) {
        hasMoved = true;
      }
      if (!hasMoved) return;
      el.style.left   = `${startLeft  + dx}px`;
      el.style.bottom = `${startBottom - dy}px`;
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!hasMoved) return;
      // Persist final position
      const finalLeft   = parseFloat(el.style.left);
      const finalBottom = parseFloat(el.style.bottom);
      if (!isNaN(finalLeft) && !isNaN(finalBottom)) {
        onPositionChange(finalLeft, finalBottom);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [elRef, onPositionChange, locked]);

  return { onDragStart };
};

// ── CloseIcon ─────────────────────────────────────────────────────────────────
const CollapseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13H5v-2h14v2z" />
  </svg>
);

// ── Shell component ────────────────────────────────────────────────────────────
export const ShellApp = ({ view, callbacks }: ShellAppProps) => {
  const active = isActiveState(view.statusText);
  const showStatus = active;

  const [localValue, setLocalValue] = useState(view.prompt);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pinnedDocPosRef = useRef<{ left: number; top: number } | null>(null);
  const pendingPinDocPosRef = useRef<{ left: number; top: number } | null>(null);
  const hasPinSyncInitializedRef = useRef(false);
  const onPositionChangeRef = useRef(callbacks.onPositionChange);

  useEffect(() => {
    onPositionChangeRef.current = callbacks.onPositionChange;
  }, [callbacks.onPositionChange]);

  const { onDragStart } = useDrag(
    containerRef,
    (left, bottom) => {
      onPositionChangeRef.current(left, bottom);
    },
    view.pinned,
  );

  useEffect(() => { setLocalValue(view.prompt); }, [view.prompt]);
  useEffect(() => {
    if (view.pinned || view.promptDisabled) {
      return;
    }

    const focusId = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });

    return () => {
      window.cancelAnimationFrame(focusId);
    };
  }, [view.pinned, view.promptDisabled, view.collapsed]);

  const applyPinnedViewportPosition = useCallback(() => {
    if (!view.pinned || !containerRef.current || !pinnedDocPosRef.current) {
      return;
    }
    const el = containerRef.current;
    const docPos = pinnedDocPosRef.current;
    const nextLeft = docPos.left - window.scrollX;
    const nextTop = docPos.top - window.scrollY;
    el.style.position = "fixed";
    el.style.left = `${nextLeft}px`;
    el.style.top = `${nextTop}px`;
    el.style.bottom = "auto";
    el.style.transform = "none";
    el.style.animation = "none";
  }, [view.pinned]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!hasPinSyncInitializedRef.current) {
      hasPinSyncInitializedRef.current = true;
      return;
    }

    if (view.pinned) {
      if (pendingPinDocPosRef.current) {
        pinnedDocPosRef.current = pendingPinDocPosRef.current;
        pendingPinDocPosRef.current = null;
      } else {
        const rect = el.getBoundingClientRect();
        pinnedDocPosRef.current = {
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
        };
      }
      applyPinnedViewportPosition();
      window.addEventListener("scroll", applyPinnedViewportPosition, { passive: true });
      window.addEventListener("resize", applyPinnedViewportPosition);
      return () => {
        window.removeEventListener("scroll", applyPinnedViewportPosition);
        window.removeEventListener("resize", applyPinnedViewportPosition);
      };
    }

    pinnedDocPosRef.current = null;
    pendingPinDocPosRef.current = null;
    const rect = el.getBoundingClientRect();
    const nextLeft = rect.left + rect.width / 2;
    const nextBottom = Math.max(0, window.innerHeight - rect.bottom);
    el.style.position = "fixed";
    el.style.left = `${nextLeft}px`;
    el.style.top = "auto";
    el.style.bottom = `${nextBottom}px`;
    el.style.transform = "translateX(-50%)";
    el.style.animation = "none";
    onPositionChangeRef.current(nextLeft, nextBottom);
    return undefined;
  }, [view.pinned, applyPinnedViewportPosition]);

  // Restore persisted drag position before first paint (no flicker).
  // fullyHideShell always clears savedPos, so this only activates if the
  // shell was soft-collapsed (button) and then the page navigated/remounted.
  useLayoutEffect(() => {
    const { initialLeft, initialBottom } = view;
    if (initialLeft != null && initialBottom != null && containerRef.current) {
      const el = containerRef.current;
      el.style.top       = "auto";
      el.style.left      = `${initialLeft}px`;
      el.style.bottom    = `${initialBottom}px`;
      el.style.transform = "translateX(-50%)";
      el.style.animation = "none";
    }
  }, []); // intentionally only on mount

// When collapsing or expanding do nothing to the position — soft-collapse
  // keeps the current drag position. Full hide + reopen resets to CSS default
  // (bottom:20px / left:50%) handled by content.tsx clearing savedPos.
  // We only need to suppress the entrance animation when the panel re-opens.
  const prevCollapsed = useRef(view.collapsed);
  useEffect(() => {
    if (prevCollapsed.current !== view.collapsed) {
      prevCollapsed.current = view.collapsed;
      if (containerRef.current && !view.collapsed) {
        // Snap off any in-progress animation so the max-height transition
        // plays cleanly without the container jumping.
        containerRef.current.style.animation = "none";
      }
    }
  }, [view.collapsed]);

  // Auto-scroll the history panel to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [view.completedTasks, view.summary, view.findings]);

  const hasResult = !!view.summary || view.findings.length > 0;
  const hasCompleted = view.completedTasks.length > 0;
  const hasHistory = hasCompleted || hasResult || showStatus;
  const inputBarVisible = !view.pinned;
  const showPinButton = !view.collapsed && (view.pinned || view.showThinking || hasHistory);
  // Only offer to collapse once the task is fully done (not while planning/executing)
  const canCollapse = inputBarVisible && !active && !view.showThinking && (hasCompleted || hasResult);
  const showHistoryHeader = hasHistory && !view.collapsed && (canCollapse || view.pinned);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    callbacks.onPromptChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (localValue.trim() && !view.promptDisabled) {
        callbacks.onSubmit(localValue);
      }
    }
  };

  const handleSend = () => {
    if (localValue.trim() && !view.promptDisabled) {
      callbacks.onSubmit(localValue);
    }
  };

  const micBlocked = view.micDisabled && !view.micActive;
  const ttsBlocked = view.ttsDisabled && !view.ttsActive && !view.ttsBusy;
  const logoSrc = CENTURI_LOGO.startsWith("data:") ? CENTURI_LOGO : `data:image/png;base64,${CENTURI_LOGO}`;

  return (
    <>
      <style>{SHELL_CSS}</style>
      <div
        ref={containerRef}
        className={`sp-shell${view.hiding ? " sp-hiding" : ""}${view.collapsed ? " sp-collapsed" : ""}${view.pinned ? " sp-pinned" : ""}`}
      >
        {showPinButton && (
          <div className="sp-shell-actions">
            <button
              className={`sp-pin-btn${view.pinned ? " sp-pin-btn--active" : ""}`}
              type="button"
              onClick={() => {
                if (!view.pinned && containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  pendingPinDocPosRef.current = {
                    left: rect.left + window.scrollX,
                    top: rect.top + window.scrollY,
                  };
                }
                callbacks.onTogglePin();
              }}
              title={view.pinned ? "Unpin shell" : "Pin shell"}
              aria-label={view.pinned ? "Unpin shell" : "Pin shell"}
            >
              <PinIcon />
            </button>
            <button
              className="sp-close-btn"
              type="button"
              onClick={callbacks.onClose}
              title="Close response"
              aria-label="Close response"
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {/* Static header strip with minimize button — sits above scroll area, never scrolls away */}
        {showHistoryHeader && (
          <div className="sp-history-header" onMouseDown={onDragStart}>
            <button
              className={`sp-collapse-btn${canCollapse ? "" : " sp-collapse-btn--hidden"}`}
              type="button"
              onClick={canCollapse ? callbacks.onCollapse : undefined}
              title={canCollapse ? "Minimise response" : ""}
              aria-hidden={!canCollapse}
              tabIndex={canCollapse ? 0 : -1}
              disabled={!canCollapse}
            >
              <CollapseIcon />
            </button>
          </div>
        )}

        {/* Scrollable history panel — grows upward, input stays pinned at bottom */}
        {hasHistory && (
          <div
            ref={scrollRef}
            className={`sp-history${view.collapsed ? " sp-history--hidden" : ""}`}
            onMouseDown={onDragStart}
          >
            {/* Past completed tasks as message bubbles */}
            {view.completedTasks.map((task, i) => (
              <div key={i} className="sp-msg-group">
                <div className="sp-msg-user">{task.prompt}</div>
                {task.summary && (
                  <div className="sp-msg-ai">{task.summary}</div>
                )}
              </div>
            ))}

            {/* Current result */}
            {hasResult && (
              <div className="sp-msg-group">
                {view.summary && (
                  <div className="sp-msg-ai sp-msg-ai--current">
                    {view.summary}
                    {view.findings.length > 0 && (
                      <ul className="sp-findings">
                        {view.findings.map((f, idx) => (
                          <li key={idx}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {!view.summary && view.findings.length > 0 && (
                  <div className="sp-msg-ai sp-msg-ai--current">
                    <ul className="sp-findings">
                      {view.findings.map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Live status */}
            {showStatus && (
              <div className="sp-status-pill">
                {active
                  ? <TextShimmer className="sp-shimmer">{view.statusText}</TextShimmer>
                  : <span className="sp-status-done">{view.statusText}</span>
                }
              </div>
            )}
          </div>
        )}

        {/* Divider when history is shown and not collapsed */}
        {hasHistory && !view.collapsed && <div className="sp-divider" />}

        <div className={`sp-bar${view.pinned ? " sp-bar--hidden" : ""}`} onMouseDown={onDragStart}>
            <img
            className="sp-logo"
            src={logoSrc}
            alt="Centuri"
            draggable={false}
          />

            {/* Expand button — visible only when soft-collapsed and there's history to show */}
            {view.collapsed && hasHistory && (
              <button
                className="sp-expand-btn"
                type="button"
                onClick={callbacks.onExpand}
                title="Expand conversation"
              >
                <ExpandIcon />
              </button>
            )}

            <div className="sp-input-row">
              <textarea
                ref={inputRef}
                className="sp-input"
                rows={1}
                value={localValue}
                placeholder={view.promptPlaceholder}
                disabled={view.promptDisabled}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
              />
              <button
                className={`sp-mic-btn${view.micActive ? " sp-mic-active" : ""}${view.micBusy ? " sp-mic-busy" : ""}`}
                type="button"
                onClick={callbacks.onMicToggle}
                disabled={micBlocked}
                title={view.micActive ? "Stop recording" : "Use microphone"}
              >
                <MicIcon />
              </button>
              <button
              className={`sp-tts-btn${view.ttsActive ? " sp-tts-active" : ""}${view.ttsBusy ? " sp-tts-busy" : ""}`}
              type="button"
              onClick={callbacks.onTtsToggle}
              disabled={ttsBlocked}
              title={view.ttsBusy ? "Generating speech" : view.ttsActive ? "Stop speech" : "Read output aloud"}
            >
              <SpeakerIcon />
            </button>
            {view.showThinking ? (
                <button
                  className="sp-send-btn sp-stop"
                  type="button"
                  onClick={callbacks.onCancel}
                  title="Stop"
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  className={`sp-send-btn${(!localValue.trim() || view.promptDisabled) ? " sp-send-off" : ""}`}
                  type="button"
                  onClick={handleSend}
                  disabled={!localValue.trim() || view.promptDisabled}
                  title="Send"
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </div>
      </div>
    </>
  );
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const SHELL_CSS = `
:host {
  --sp-slate-950: hsl(222.2 84% 4.9%);
  --sp-slate-900: hsl(222.2 47.4% 11.2%);
  --sp-slate-800: hsl(215.4 31.8% 16.9%);
  --sp-slate-700: hsl(215.3 19.3% 34.5%);
  --sp-accent: hsl(24.6 95% 53.1%);
  --sp-accent-hover: hsl(21.8 90% 48%);
  --sp-text: hsl(210 40% 96%);
  --sp-text-dim: hsl(215 20.2% 65.1%);
}

@keyframes sp-shimmer {
  0%   { background-position: 200% 0 }
  100% { background-position: -200% 0 }
}
@keyframes sp-in {
  from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.985); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes sp-out {
  from { opacity: 1; }
  to   { opacity: 0; transform: translateX(-50%) translateY(8px); }
}
@keyframes sp-msg-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.sp-shell {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 24px));
  z-index: 2;
  pointer-events: auto;
  font-family: Inter, "Segoe UI", system-ui, sans-serif !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  text-shadow: none !important;
  background: var(--sp-slate-950);
  border: 1px solid hsl(215.4 31.8% 16.9% / 0.9);
  border-radius: 18px;
  opacity: 0.96;
  box-shadow:
    0 12px 28px hsl(222.2 84% 4.9% / 0.55),
    0 3px 10px hsl(222.2 84% 4.9% / 0.38);
  overflow: hidden;
  animation: sp-in 340ms cubic-bezier(.22,1,.36,1) both;
  transition: opacity 160ms ease, box-shadow 180ms ease;
  user-select: none;
}
.sp-shell.sp-pinned {
  opacity: 1;
  box-shadow: none;
}
.sp-hiding {
  animation: sp-out 220ms ease forwards;
}

.sp-shell-actions {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

/* ── History panel ─────────────────────────────────────── */

.sp-msg-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: sp-msg-in 180ms ease both;
}

/* User bubble — right aligned */
.sp-msg-user {
  align-self: flex-end;
  max-width: 85%;
  background: var(--sp-slate-950);
  border: none;
  border-radius: 12px 12px 3px 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--sp-text);
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-line;
}

/* AI bubble — left aligned */
.sp-msg-ai {
  align-self: flex-start;
  max-width: 92%;
  background: var(--sp-slate-950);
  border: none;
  border-radius: 3px 12px 12px 12px;
  padding: 10px 13px;
  font-size: 13px;
  color: hsl(210 40% 90%);
  line-height: 1.62;
  word-break: break-word;
  white-space: pre-line;
}
.sp-msg-ai--current {
  color: var(--sp-text);
}

.sp-findings {
  margin: 6px 0 0 0;
  padding: 0 0 0 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-findings li {
  font-size: 13px;
  color: var(--sp-text-dim);
  line-height: 1.5;
}

/* Status pill */
.sp-status-pill {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--sp-slate-950);
  border: 1px solid hsl(215.4 31.8% 16.9% / 0.9);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.sp-status-done { color: var(--sp-text-dim); }
.sp-shimmer {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.9) 0%,
    rgba(255,255,255,0.4) 30%,
    rgba(255,255,255,0.95) 55%,
    rgba(255,255,255,0.4) 75%,
    rgba(255,255,255,0.9) 100%
  );
  background-size: 200% 100%;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  animation: sp-shimmer 2s linear infinite;
}

/* Divider between history and input */
.sp-divider {
  height: 1px;
  background: hsl(215.4 31.8% 16.9% / 0.9);
  flex-shrink: 0;
}

/* ── History header (static, never scrolls) ───────────────── */
.sp-history-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 10px 0;
  flex-shrink: 0;
  cursor: grab;
}
.sp-history-header:active { cursor: grabbing; }

/* ── Collapse button ──────────────────────────────────────── */
.sp-collapse-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: hsl(215.4 31.8% 16.9% / 0.92);
  color: var(--sp-text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.11s ease, color 0.11s ease;
  flex-shrink: 0;
  pointer-events: auto;
}
.sp-collapse-btn:hover {
  background: hsl(215.3 19.3% 34.5% / 0.5);
  color: var(--sp-text);
}
.sp-collapse-btn--hidden {
  visibility: hidden;
  pointer-events: none;
}

/* ── Pin button ─────────────────────────────────────────────── */
.sp-pin-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.11s ease, color 0.11s ease, transform 0.11s ease;
}
.sp-pin-btn:hover {
  background: rgba(255,255,255,0.13);
  color: rgba(255,255,255,0.78);
}
.sp-pin-btn--active {
  background: rgba(96, 165, 250, 0.3);
  color: rgba(191, 219, 254, 0.95);
  transform: scale(1.03);
}

.sp-close-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: rgba(248, 113, 113, 0.2);
  color: rgba(254, 202, 202, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.11s ease, color 0.11s ease, transform 0.11s ease;
}
.sp-close-btn:hover {
  background: rgba(248, 113, 113, 0.34);
  color: rgba(254, 226, 226, 0.98);
  transform: scale(1.03);
}

/* ── Expand button (shown in input bar when soft-collapsed) ── */
.sp-expand-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: hsl(215.4 31.8% 16.9% / 0.92);
  color: var(--sp-text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.11s ease, color 0.11s ease;
  pointer-events: auto;
}
.sp-expand-btn:hover {
  background: hsl(215.3 19.3% 34.5% / 0.5);
  color: var(--sp-text);
}

/* ── History panel ──────────────────────────────────────────── */
.sp-history {
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: grab;
  scrollbar-width: thin;
  scrollbar-color: hsl(215.4 31.8% 16.9% / 0.9) transparent;
  transition: max-height 0.22s cubic-bezier(.16,1,.3,1), opacity 0.18s ease, padding 0.18s ease;
}
.sp-history:active { cursor: grabbing; }
.sp-history::-webkit-scrollbar { width: 4px; }
.sp-history::-webkit-scrollbar-track { background: transparent; }
.sp-history::-webkit-scrollbar-thumb { background: hsl(215.4 31.8% 16.9% / 0.9); border-radius: 4px; }
.sp-history--hidden {
  max-height: 0 !important;
  opacity: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  overflow: hidden !important;
  pointer-events: none;
}
.sp-collapsed .sp-divider { display: none; }

/* ── Input bar ──────────────────────────────────────────── */
.sp-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  cursor: grab;
}
.sp-bar:active { cursor: grabbing; }
.sp-bar--hidden {
  visibility: hidden;
  pointer-events: none;
}

.sp-logo {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  object-fit: contain;
  background: transparent;
  align-self: center;
  display: block;
  flex-shrink: 0;
  opacity: 1;
}

.sp-input-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  background: var(--sp-slate-950);
  border: none;
  border-radius: 11px;
  transition: background 0.12s ease;
}

.sp-input-row:focus-within {
  background: var(--sp-slate-950);
}

.sp-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  color: var(--sp-text);
  border: none;
  outline: none;
  padding: 8px 10px;
  font-size: 13.5px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  display: block;
}
.sp-input::placeholder { color: var(--sp-text-dim); }
.sp-input:disabled     { opacity: 0.35; cursor: not-allowed; }

.sp-mic-btn {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  color: var(--sp-text-dim);
  transition: background 0.11s ease, color 0.11s ease;
}
.sp-mic-btn:hover:not(:disabled) {
  background: hsl(215.4 31.8% 16.9% / 0.95);
  color: var(--sp-text);
}
.sp-mic-btn:disabled {
  color: rgba(255,255,255,0.22);
  cursor: not-allowed;
}
.sp-mic-active {
  background: rgba(239,68,68,0.25) !important;
  color: rgba(255,120,120,1) !important;
}
.sp-mic-busy {
  color: rgba(255,255,255,0.96) !important;
}

.sp-tts-btn {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  color: var(--sp-text-dim);
  transition: background 0.11s ease, color 0.11s ease;
}
.sp-tts-btn:hover:not(:disabled) {
  background: hsl(215.4 31.8% 16.9% / 0.95);
  color: var(--sp-text);
}
.sp-tts-btn:disabled {
  color: rgba(255,255,255,0.22);
  cursor: not-allowed;
}
.sp-tts-active {
  background: rgba(16,185,129,0.24) !important;
  color: rgba(74,222,128,1) !important;
}
.sp-tts-busy {
  color: rgba(255,255,255,0.96) !important;
}

.sp-send-btn {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  margin-right: 3px;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--sp-accent);
  color: #fff;
  transition: background 0.11s ease;
}
.sp-send-btn:hover:not(:disabled):not(.sp-send-off) {
  background: var(--sp-accent-hover);
}
.sp-send-off {
  background: hsl(24.6 95% 53.1% / 0.48) !important;
  color: rgba(255, 255, 255, 0.84) !important;
  cursor: not-allowed;
}
.sp-stop {
  background: var(--sp-accent) !important;
  color: #fff !important;
}
.sp-stop:hover {
  background: var(--sp-accent-hover) !important;
}

.sp-pinned .sp-history-header,
.sp-pinned .sp-history,
.sp-pinned .sp-bar {
  cursor: default;
}
.sp-pinned .sp-history:active,
.sp-pinned .sp-bar:active,
.sp-pinned .sp-history-header:active {
  cursor: default;
}
`;
