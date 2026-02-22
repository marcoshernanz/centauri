import { parseActionBatch } from "../shared/actions";
import type {
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
};

function initializeContentScript(): void {
  const registry: ShellRegistry = {
    bars: new Map<string, CommandBar>(),
    order: [],
    runTargetId: null,
    zIndexCursor: BASE_SHELL_Z_INDEX
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

  const getLatestVisibleBar = (): CommandBar | null => {
    for (let index = registry.order.length - 1; index >= 0; index -= 1) {
      const bar = registry.bars.get(registry.order[index]);
      if (bar?.isOpenAndVisible()) {
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
      onSubmit: async (prompt: string) => {
        registry.runTargetId = barId;
        await handleSubmitTask(bar, prompt);
      },
      onActivate: (id: string) => {
        bringToFront(id);
      },
      onClose: (id: string) => {
        removeBar(id);
      }
    });

    registry.bars.set(barId, bar);
    registry.order.push(barId);
    bringToFront(barId);
    bar.open();

    if (registry.order.length > MAX_OPEN_SHELLS) {
      const oldestId = registry.order[0];
      if (oldestId && oldestId !== barId) {
        const oldestBar = registry.bars.get(oldestId);
        oldestBar?.close();
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
    const latestBar = getLatestVisibleBar();
    if (!latestBar) {
      createBar();
      return;
    }

    if (latestBar.isPristineForHotkeyToggle()) {
      latestBar.close();
      return;
    }

    createBar();
  };

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    const latestBar = getLatestVisibleBar();
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

async function handleSubmitTask(commandBar: CommandBar, prompt: string): Promise<void> {
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

function formatFinalOutput(response: SubmitTaskResponse, startedAt: number): string {
  const elapsedMs = Date.now() - startedAt;
  const results = response.payload.results ?? [];
  const okCount = results.filter((result) => result.ok).length;
  const failCount = results.length - okCount;
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const warnings = response.payload.warnings ?? [];
  const partial = response.payload.partial ?? false;

  const lines: string[] = [];
  if (partial) {
    lines.push("Status: Partial result");
  }
  lines.push(`Run: ${elapsedSeconds}s | Actions: ${okCount}/${results.length} completed${failCount > 0 ? ` (${failCount} failed)` : ""}`);
  if (warnings.length > 0) {
    warnings.forEach((warning) => {
      lines.push(`Warning: ${warning}`);
    });
  }
  lines.push("");
  lines.push(response.payload.summary ?? "No summary returned.");
  return lines.join("\n");
}

function formatUiResultMessage(message: ShowResultMessage): string {
  const elapsedMs = message.payload.elapsedMs ?? 0;
  const results = message.payload.results ?? [];
  const okCount = results.filter((result) => result.ok).length;
  const failCount = results.length - okCount;
  const elapsedSeconds = elapsedMs > 0 ? (elapsedMs / 1000).toFixed(1) : "n/a";
  const warnings = message.payload.warnings ?? [];
  const partial = message.payload.partial ?? false;

  const lines: string[] = [];
  if (partial) {
    lines.push("Status: Partial result");
  }
  lines.push(`Run: ${elapsedSeconds}s | Actions: ${okCount}/${results.length} completed${failCount > 0 ? ` (${failCount} failed)` : ""}`);
  if (warnings.length > 0) {
    warnings.forEach((warning) => {
      lines.push(`Warning: ${warning}`);
    });
  }
  lines.push("");
  lines.push(message.payload.summary ?? "No summary returned.");
  return lines.join("\n");
}

function collectPageContext(): PageContextSnapshot {
  const headings = collectUniqueText(["h1", "h2", "h3"], 8);
  const candidates = collectUniqueText(["a", "button", "[role='button']", "input[type='submit']"], 14);
  const urlPath = `${window.location.pathname}${window.location.search}` || "/";

  return {
    urlPath,
    headings,
    candidates
  };
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
