import { parseActionBatch } from "../shared/actions";
import type {
  AgentRunMode,
  ExecuteActionsMessage,
  ExecuteActionsResponse,
  PageContextSnapshot,
  RuntimeMessage,
  ShowResultMessage,
  SubmitTaskMessage,
  SubmitTaskResponse
} from "../shared/messages";
import { executeActions } from "./executor/runner";
import { CommandBar } from "./ui/commandBar";
import type { SelectedImageInput } from "./ui/shell";

declare global {
  interface Window {
    __nwaInitialized?: boolean;
  }
}

const MAX_OPEN_SHELLS = 6;
const BASE_SHELL_Z_INDEX = 2147483200;

if (!window.__nwaInitialized) {
  window.__nwaInitialized = true;
  initializeContentScript();
}

type ShellRegistry = {
  bars: Map<string, CommandBar>;
  order: string[];
  runTargetId: string | null;
  zIndexCursor: number;
  defaultAgentMode: AgentRunMode;
};

function initializeContentScript(): void {
  const registry: ShellRegistry = {
    bars: new Map<string, CommandBar>(),
    order: [],
    runTargetId: null,
    zIndexCursor: BASE_SHELL_Z_INDEX,
    defaultAgentMode: "agentic"
  };

  const removeBar = (barId: string): void => {
    registry.bars.delete(barId);
    registry.order = registry.order.filter((id) => id !== barId);
    if (registry.runTargetId === barId) {
      registry.runTargetId = null;
    }
  };

  const bringToFront = (barId: string): void => {
    const bar = registry.bars.get(barId);
    if (!bar) {
      return;
    }

    registry.zIndexCursor += 1;
    bar.setZIndex(registry.zIndexCursor);
    registry.order = [...registry.order.filter((id) => id !== barId), barId];
  };

  const getLatestVisibleBar = (opts?: { skipPinned?: boolean }): CommandBar | null => {
    for (let index = registry.order.length - 1; index >= 0; index -= 1) {
      const bar = registry.bars.get(registry.order[index]);
      if (bar?.isOpenAndVisible()) {
        if (opts?.skipPinned && bar.isPinned()) {
          continue;
        }
        return bar;
      }
    }
    return null;
  };

  const createBar = (): CommandBar => {
    const barId = createShellId();
    const bar = new CommandBar({
      id: barId,
      zIndex: registry.zIndexCursor + 1,
      initialAgentMode: registry.defaultAgentMode,
      onSubmit: async (payload) => {
        registry.runTargetId = barId;
        await handleSubmitTask(bar, payload.prompt, payload.selectedImage, payload.agentMode);
      },
      onActivate: (id: string) => {
        bringToFront(id);
      },
      onClose: (id: string) => {
        removeBar(id);
      },
      onAgentModeChange: (mode) => {
        registry.defaultAgentMode = mode;
      }
    });

    registry.bars.set(barId, bar);
    registry.order.push(barId);
    bringToFront(barId);
    bar.open();

    if (registry.order.length > MAX_OPEN_SHELLS) {
      for (const candidateId of registry.order) {
        if (candidateId === barId) continue;
        const candidateBar = registry.bars.get(candidateId);
        if (candidateBar && !candidateBar.isPinned()) {
          candidateBar.close();
          break;
        }
      }
    }

    return bar;
  };

  const resolveRunTargetBar = (): CommandBar => {
    if (registry.runTargetId) {
      const runTarget = registry.bars.get(registry.runTargetId);
      if (runTarget) {
        return runTarget;
      }
      registry.runTargetId = null;
    }

    const latest = getLatestVisibleBar();
    if (latest) {
      return latest;
    }

    return createBar();
  };

  const handleHotkeyToggle = (): void => {
    const latestBar = getLatestVisibleBar({ skipPinned: true });
    if (!latestBar) {
      createBar();
      return;
    }

    latestBar.close();
  };

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    const latestBar = getLatestVisibleBar({ skipPinned: true });
    if (!latestBar) {
      return;
    }

    event.preventDefault();
    latestBar.close();
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "ui/toggle-command-bar") {
      handleHotkeyToggle();
      return;
    }

    if (message.type === "ui/open-command-bar") {
      const bar = resolveRunTargetBar();
      bar.open();
      return;
    }

    if (message.type === "ui/set-command-state") {
      const bar = resolveRunTargetBar();
      bar.open();
      bar.setState(message.payload.state);
      return;
    }

    if (message.type === "ui/show-result") {
      const bar = resolveRunTargetBar();
      bar.open();

      if (!message.payload.ok) {
        bar.setState("error");
        bar.setTrace(message.payload.results ?? []);
        bar.setOutput(message.payload.error ?? "Task failed.");
        return;
      }

      bar.setState("done");
      bar.setTrace(message.payload.results ?? []);
      bar.setOutput(formatUiResultMessage(message));
      return;
    }

    if (message.type !== "executor/execute-actions") {
      return;
    }

    void handleExecuteActionsMessage(message)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          payload: {
            results: [],
            error: error instanceof Error ? error.message : "Executor crashed"
          }
        });
      });

    return true;
  });
}

async function handleSubmitTask(
  commandBar: CommandBar,
  prompt: string,
  selectedImage: SelectedImageInput | null,
  agentMode: AgentRunMode
): Promise<void> {
  const startedAt = Date.now();
  commandBar.clearOutput();
  commandBar.clearTrace();
  commandBar.setState("planning");
  await sleep(120);

  commandBar.setState("executing");

  let response: SubmitTaskResponse | undefined;

  try {
    response = await chrome.runtime.sendMessage<SubmitTaskMessage, SubmitTaskResponse>({
      type: "agent/submit-task",
      payload: {
        prompt,
        agentMode,
        selectedImage,
        pageUrl: window.location.href,
        pageTitle: document.title,
        pageContext: collectPageContext()
      }
    });
  } catch {
    // During navigation the originating content script may be torn down.
    // The background will push the final output to the active page via ui/show-result.
    return;
  }

  commandBar.setState("summarizing");
  await sleep(100);

  if (!response?.ok) {
    commandBar.setState("error");
    commandBar.setTrace(response?.payload.results ?? []);
    commandBar.setOutput(response?.payload.error ?? "Task failed.");
    return;
  }

  commandBar.setState("done");
  commandBar.setTrace(response.payload.results ?? []);
  commandBar.setOutput(formatFinalOutput(response, startedAt));
}

async function handleExecuteActionsMessage(message: ExecuteActionsMessage): Promise<ExecuteActionsResponse> {
  const validation = parseActionBatch(message.payload.actions, message.payload.limits?.maxActionsPerBatch);
  if (!validation.ok) {
    return {
      ok: false,
      payload: {
        results: [],
        error: validation.error
      }
    };
  }

  const results = await executeActions(validation.value, message.payload.limits);
  return {
    ok: true,
    payload: {
      results
    }
  };
}

function createShellId(): string {
  return `shell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatFinalOutput(response: SubmitTaskResponse, _startedAt: number): string {
  return (response.payload.summary ?? "No summary returned.").trim();
}

function formatUiResultMessage(message: ShowResultMessage): string {
  return (message.payload.summary ?? "No summary returned.").trim();
}

function collectPageContext(): PageContextSnapshot {
  const headings = collectUniqueText(["h1", "h2", "h3"], 8);
  const candidates = collectUniqueText(["a", "button", "[role='button']", "input[type='submit']"], 14);
  const urlPath = `${window.location.pathname}${window.location.search}` || "/";
  const bodyTextSnippet = collectBodyTextSnippet(2200);

  return {
    urlPath,
    headings,
    candidates,
    bodyTextSnippet
  };
}

function collectBodyTextSnippet(maxChars: number): string {
  const preferredRoots = ["main", "article", "[role='main']", "body"];

  for (const selector of preferredRoots) {
    const root = document.querySelector(selector);
    if (!(root instanceof HTMLElement) || !isVisibleElement(root)) {
      continue;
    }

    const text = normalizeLongText(root.innerText || root.textContent || "");
    if (text.length >= 140) {
      return text.slice(0, maxChars);
    }
  }

  return normalizeLongText(document.body?.innerText || document.body?.textContent || "").slice(0, maxChars);
}

function collectUniqueText(selectors: string[], limit: number): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const element of elements) {
      if (values.length >= limit) {
        return values;
      }

      if (!isVisibleElement(element)) {
        continue;
      }

      const text = normalizeText(element.textContent ?? "");
      if (!text || seen.has(text)) {
        continue;
      }

      seen.add(text);
      values.push(text);
    }
  }

  return values;
}

function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.offsetParent === null && element.getClientRects().length === 0) {
    return false;
  }

  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}

function normalizeLongText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
