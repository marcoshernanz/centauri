import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import { TextShimmer } from "../components/prompt-kit/text-shimmer";
import type { AgentRunMode } from "../../shared/messages";
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

export type SelectedImageInput = {
  src: string;
  alt: string | null;
};

export type ShellViewModel = {
  prompt: string;
  promptPlaceholder: string;
  promptDisabled: boolean;
  canSubmit: boolean;
  agentMode: AgentRunMode;
  activePrompt: string | null;
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
  selectedImagePreviewSrc: string | null;
  selectedImagePreviewAlt: string | null;
  hiding: boolean;
  collapsed: boolean;
  pinned: boolean;
  initialLeft?: number;
  initialBottom?: number;
  initialWidth?: number;
  initialHeight?: number;
};

export type ShellCallbacks = {
  onPromptChange: (value: string) => void;
  onToggleAgentMode: () => void;
  onSubmit: (value: string) => void;
  onClearSelectedImage: () => void;
  onMicToggle: () => void;
  onTtsToggle: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPositionChange: (left: number, bottom: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
  onTogglePin: () => void;
  onActivate: () => void;
};

type ShellAppProps = {
  view: ShellViewModel;
  callbacks: ShellCallbacks;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const isActiveState = (s: string) =>
  s.startsWith("Planning") || s.startsWith("Executing") || s.startsWith("Summarizing") || s.startsWith("Replanning");

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

type ResizeDirection = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const useResize = (
  elRef: React.RefObject<HTMLElement | null>,
  onPositionChange: (left: number, bottom: number) => void,
  onSizeChange: (width: number, height: number) => void,
  locked: boolean,
) => {
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 86;
  const MAX_WIDTH = 980;
  const MAX_HEIGHT = 760;
  const VIEWPORT_PADDING = 8;

  const onResizeStart = useCallback(
    (direction: ResizeDirection, e: React.MouseEvent) => {
      if (locked) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const el = elRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      const startWidth = rect.width;
      const startHeight = rect.height;

      // Freeze into absolute fixed coordinates before resizing.
      el.style.position = "fixed";
      el.style.left = `${startLeft}px`;
      el.style.top = `${startTop}px`;
      el.style.bottom = "auto";
      el.style.transform = "none";
      el.style.width = `${startWidth}px`;
      el.style.height = `${startHeight}px`;
      el.style.animation = "none";

      const onMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        let nextLeft = startLeft;
        let nextTop = startTop;
        let nextWidth = startWidth;
        let nextHeight = startHeight;

        if (direction.includes("e")) {
          nextWidth = startWidth + deltaX;
        }
        if (direction.includes("s")) {
          nextHeight = startHeight + deltaY;
        }
        if (direction.includes("w")) {
          nextWidth = startWidth - deltaX;
          nextLeft = startLeft + deltaX;
        }
        if (direction.includes("n")) {
          nextHeight = startHeight - deltaY;
          nextTop = startTop + deltaY;
        }

        const viewportMaxWidth = window.innerWidth - VIEWPORT_PADDING * 2;
        const viewportMaxHeight = window.innerHeight - VIEWPORT_PADDING * 2;
        const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewportMaxWidth));
        const maxHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, viewportMaxHeight));
        nextWidth = clamp(nextWidth, MIN_WIDTH, maxWidth);
        nextHeight = clamp(nextHeight, MIN_HEIGHT, maxHeight);

        if (direction.includes("w")) {
          nextLeft = startLeft + (startWidth - nextWidth);
        }
        if (direction.includes("n")) {
          nextTop = startTop + (startHeight - nextHeight);
        }

        nextLeft = clamp(nextLeft, VIEWPORT_PADDING, window.innerWidth - nextWidth - VIEWPORT_PADDING);
        nextTop = clamp(nextTop, VIEWPORT_PADDING, window.innerHeight - nextHeight - VIEWPORT_PADDING);

        el.style.left = `${nextLeft}px`;
        el.style.top = `${nextTop}px`;
        el.style.width = `${nextWidth}px`;
        el.style.height = `${nextHeight}px`;
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const finalRect = el.getBoundingClientRect();
        const finalLeft = finalRect.left + finalRect.width / 2;
        const finalBottom = Math.max(0, window.innerHeight - finalRect.bottom);
        onPositionChange(finalLeft, finalBottom);
        onSizeChange(finalRect.width, finalRect.height);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [elRef, locked, onPositionChange, onSizeChange],
  );

  return { onResizeStart };
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
  const onSizeChangeRef = useRef(callbacks.onSizeChange);
  const canResize = view.summary !== null || view.findings.length > 0 || view.completedTasks.length > 0;

  useEffect(() => {
    onPositionChangeRef.current = callbacks.onPositionChange;
  }, [callbacks.onPositionChange]);
  useEffect(() => {
    onSizeChangeRef.current = callbacks.onSizeChange;
  }, [callbacks.onSizeChange]);

  const { onDragStart } = useDrag(
    containerRef,
    (left, bottom) => {
      onPositionChangeRef.current(left, bottom);
    },
    view.pinned,
  );
  const { onResizeStart } = useResize(
    containerRef,
    (left, bottom) => {
      onPositionChangeRef.current(left, bottom);
    },
    (width, height) => {
      onSizeChangeRef.current(width, height);
    },
    !canResize,
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
    const { initialLeft, initialBottom, initialWidth, initialHeight } = view;
    const el = containerRef.current;
    if (!el) {
      return;
    }

    if (initialLeft != null && initialBottom != null) {
      el.style.top = "auto";
      el.style.left = `${initialLeft}px`;
      el.style.bottom = `${initialBottom}px`;
      el.style.transform = "translateX(-50%)";
      el.style.animation = "none";
    }

    if (initialWidth != null) {
      el.style.width = `${initialWidth}px`;
    }
    if (initialHeight != null) {
      el.style.height = `${initialHeight}px`;
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
  const showActivePromptBubble = Boolean(view.activePrompt) && (view.showThinking || hasResult);
  const inputBarVisible = !view.pinned;
  const showPinButton = !view.collapsed && (view.pinned || view.showThinking || hasHistory);
  // Only offer to collapse once the task is fully done (not while planning/executing)
  const canCollapse = inputBarVisible && !active && !view.showThinking && (hasCompleted || hasResult);
  const showHistoryHeader = hasHistory && !view.collapsed && (canCollapse || view.pinned);
  const canSubmitNow = !view.promptDisabled && (localValue.trim().length > 0 || Boolean(view.selectedImagePreviewSrc));
  const agentModeLabel = view.agentMode === "agentic" ? "Agentic mode enabled" : "Chat mode enabled";

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    callbacks.onPromptChange(e.target.value);
  };

  const submitCurrentInput = () => {
    if (!canSubmitNow) {
      return;
    }

    const valueToSubmit = localValue;
    setLocalValue("");
    callbacks.onPromptChange("");
    callbacks.onSubmit(valueToSubmit);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitCurrentInput();
    }
  };

  const handleSend = () => {
    submitCurrentInput();
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
        onMouseDown={callbacks.onActivate}
      >
        <div className="sp-top-grab" onMouseDown={onDragStart} />
        {canResize && (
          <>
            <div className="sp-resize-handle sp-resize-handle--n" onMouseDown={(event) => onResizeStart("n", event)} />
            <div className="sp-resize-handle sp-resize-handle--e" onMouseDown={(event) => onResizeStart("e", event)} />
            <div className="sp-resize-handle sp-resize-handle--s" onMouseDown={(event) => onResizeStart("s", event)} />
            <div className="sp-resize-handle sp-resize-handle--w" onMouseDown={(event) => onResizeStart("w", event)} />
            <div className="sp-resize-handle sp-resize-handle--ne" onMouseDown={(event) => onResizeStart("ne", event)} />
            <div className="sp-resize-handle sp-resize-handle--nw" onMouseDown={(event) => onResizeStart("nw", event)} />
            <div className="sp-resize-handle sp-resize-handle--se" onMouseDown={(event) => onResizeStart("se", event)} />
            <div className="sp-resize-handle sp-resize-handle--sw" onMouseDown={(event) => onResizeStart("sw", event)} />
          </>
        )}

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
          <div className="sp-history-header">
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

            {showActivePromptBubble && (
              <div className="sp-msg-group">
                <div className="sp-msg-user">{view.activePrompt}</div>
              </div>
            )}

            {/* Current result */}
            {hasResult && (
              <div className="sp-msg-group">
                {view.summary && (
                  <div className="sp-msg-ai sp-msg-ai--current">
                    <div className="sp-response-tools">
                      <button
                        className={`sp-response-tts-btn${view.ttsActive ? " sp-response-tts-btn--active" : ""}${view.ttsBusy ? " sp-response-tts-btn--busy" : ""}`}
                        type="button"
                        onClick={callbacks.onTtsToggle}
                        disabled={ttsBlocked}
                        title={view.ttsBusy ? "Generating speech" : view.ttsActive ? "Stop speech" : "Read response aloud"}
                      >
                        <SpeakerIcon />
                      </button>
                    </div>
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

        <div className={`sp-bar${view.pinned ? " sp-bar--hidden" : ""}`}>
          <button
            className={`sp-logo-btn${view.agentMode === "agentic" ? " sp-logo-btn--agentic" : " sp-logo-btn--chat"}`}
            type="button"
            onClick={callbacks.onToggleAgentMode}
            title={`${agentModeLabel}. Click to switch.`}
            aria-label={`${agentModeLabel}. Click to switch.`}
          >
            <img
              className="sp-logo"
              src={logoSrc}
              alt="Centuri"
              draggable={false}
            />
            <span className="sp-logo-mode">{view.agentMode === "agentic" ? "A" : "C"}</span>
          </button>

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
              {view.selectedImagePreviewSrc && (
                <div className="sp-input-image-wrap" title={view.selectedImagePreviewAlt ?? "Selected image"}>
                  <img
                    className="sp-input-image"
                    src={view.selectedImagePreviewSrc}
                    alt={view.selectedImagePreviewAlt ?? "Selected image"}
                    draggable={false}
                  />
                  <button
                    className="sp-input-image-clear"
                    type="button"
                    onClick={callbacks.onClearSelectedImage}
                    title="Remove selected image"
                    aria-label="Remove selected image"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
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
                  className={`sp-send-btn${!canSubmitNow ? " sp-send-off" : ""}`}
                  type="button"
                  onClick={handleSend}
                  disabled={!canSubmitNow}
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
  from { opacity: 0; transform: translateX(-50%) translateY(34px) scale(0.982); filter: blur(2px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); filter: blur(0); }
}
@keyframes sp-out {
  from { opacity: 1; filter: blur(0); }
  to   { opacity: 0; filter: blur(2.5px); }
}
@keyframes sp-accent-in {
  from {
    box-shadow:
      0 0 0 1px hsl(24.6 95% 53.1% / 0.6),
      0 0 16px hsl(24.6 95% 53.1% / 0.38),
      0 12px 28px hsl(222.2 84% 4.9% / 0.55),
      0 3px 10px hsl(222.2 84% 4.9% / 0.38);
  }
  to {
    box-shadow:
      0 0 0 1px hsl(24.6 95% 53.1% / 0.34),
      0 0 8px hsl(24.6 95% 53.1% / 0.2),
      0 12px 28px hsl(222.2 84% 4.9% / 0.55),
      0 3px 10px hsl(222.2 84% 4.9% / 0.38);
  }
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
  min-width: 360px;
  min-height: 72px;
  max-width: min(980px, calc(100vw - 16px));
  max-height: min(82vh, 760px);
  z-index: 2;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  font-family: Inter, "Segoe UI", system-ui, sans-serif !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  text-shadow: none !important;
  background: var(--sp-slate-950);
  border: 1px solid hsl(24.6 95% 53.1% / 0.34);
  border-radius: 18px;
  opacity: 0.975;
  box-shadow:
    0 0 0 1px hsl(24.6 95% 53.1% / 0.34),
    0 0 8px hsl(24.6 95% 53.1% / 0.2),
    0 12px 28px hsl(222.2 84% 4.9% / 0.55),
    0 3px 10px hsl(222.2 84% 4.9% / 0.38);
  overflow: hidden;
  animation: sp-in 520ms cubic-bezier(.16,.95,.21,1) both, sp-accent-in 360ms ease-out both;
  transition: opacity 200ms ease, box-shadow 200ms ease, filter 220ms ease, border-color 200ms ease;
  user-select: none;
}
.sp-shell:hover {
  opacity: 0.99;
  border-color: hsl(24.6 95% 53.1% / 0.46);
}
.sp-shell.sp-pinned {
  opacity: 1;
  box-shadow: none;
}
.sp-hiding {
  animation: sp-out 280ms ease forwards;
}

.sp-shell-actions {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.sp-top-grab {
  position: absolute;
  top: 0;
  left: 10px;
  right: 66px;
  height: 16px;
  z-index: 7;
  cursor: grab;
}
.sp-top-grab:active {
  cursor: grabbing;
}

.sp-resize-handle {
  position: absolute;
  z-index: 8;
  background: transparent;
}
.sp-resize-handle--n,
.sp-resize-handle--s {
  left: 12px;
  right: 12px;
  height: 8px;
}
.sp-resize-handle--n {
  top: 0;
  cursor: ns-resize;
}
.sp-resize-handle--s {
  bottom: 0;
  cursor: ns-resize;
}
.sp-resize-handle--e,
.sp-resize-handle--w {
  top: 12px;
  bottom: 12px;
  width: 8px;
}
.sp-resize-handle--e {
  right: 0;
  cursor: ew-resize;
}
.sp-resize-handle--w {
  left: 0;
  cursor: ew-resize;
}
.sp-resize-handle--ne,
.sp-resize-handle--nw,
.sp-resize-handle--se,
.sp-resize-handle--sw {
  width: 12px;
  height: 12px;
}
.sp-resize-handle--ne {
  right: 0;
  top: 0;
  cursor: nesw-resize;
}
.sp-resize-handle--nw {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}
.sp-resize-handle--se {
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
}
.sp-resize-handle--sw {
  left: 0;
  bottom: 0;
  cursor: nesw-resize;
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
  user-select: text;
  -webkit-user-select: text;
}
.sp-msg-ai--current {
  color: var(--sp-text);
}
.sp-msg-user {
  user-select: text;
  -webkit-user-select: text;
}

.sp-response-tools {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.sp-response-tts-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: hsl(215.4 31.8% 16.9% / 0.9);
  color: var(--sp-text-dim);
  transition: background 0.11s ease, color 0.11s ease;
}
.sp-response-tts-btn:hover:not(:disabled) {
  background: hsl(215.3 19.3% 34.5% / 0.6);
  color: var(--sp-text);
}
.sp-response-tts-btn:disabled {
  color: rgba(255,255,255,0.26);
  cursor: not-allowed;
}
.sp-response-tts-btn--active {
  background: rgba(16,185,129,0.24) !important;
  color: rgba(74,222,128,1) !important;
}
.sp-response-tts-btn--busy {
  color: rgba(255,255,255,0.96) !important;
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
}

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
  flex: 1 1 auto;
  min-height: 0;
  max-height: min(60vh, 560px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: hsl(215.4 31.8% 16.9% / 0.9) transparent;
  transition: max-height 0.22s cubic-bezier(.16,1,.3,1), opacity 0.18s ease, padding 0.18s ease;
}
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
}
.sp-bar--hidden {
  visibility: hidden;
  pointer-events: none;
}

.sp-logo-btn {
  width: 24px;
  height: 24px;
  border: none;
  padding: 0;
  border-radius: 7px;
  background: transparent;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
}
.sp-logo-btn--agentic {
  box-shadow: 0 0 0 1px hsl(24.6 95% 53.1% / 0.34);
}
.sp-logo-btn--chat {
  box-shadow: 0 0 0 1px hsl(215.3 19.3% 34.5% / 0.68);
}
.sp-logo-btn:hover {
  transform: scale(1.03);
}

.sp-logo {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  object-fit: contain;
  background: transparent;
  display: block;
  opacity: 1;
}

.sp-logo-mode {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  line-height: 1;
  font-weight: 700;
  border: 1px solid hsl(222.2 84% 4.9% / 0.85);
  color: #fff;
  background: hsl(24.6 95% 53.1% / 0.95);
}
.sp-logo-btn--chat .sp-logo-mode {
  background: hsl(215.3 19.3% 34.5% / 0.95);
}

.sp-input-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--sp-slate-950);
  border: none;
  border-radius: 11px;
  transition: background 0.12s ease;
}

.sp-input-row:focus-within {
  background: var(--sp-slate-950);
}

.sp-input-image-wrap {
  position: relative;
  width: 28px;
  height: 28px;
  margin-left: 6px;
  border-radius: 7px;
  border: 1px solid hsl(24.6 95% 53.1% / 0.66);
  box-shadow:
    0 0 0 1px hsl(24.6 95% 53.1% / 0.26),
    0 0 8px hsl(24.6 95% 53.1% / 0.26);
  overflow: hidden;
  flex-shrink: 0;
}

.sp-input-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sp-input-image-clear {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.94);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.sp-input-image-clear svg {
  width: 9px;
  height: 9px;
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
