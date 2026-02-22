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

if (!window.__nwaInitialized) {
  window.__nwaInitialized = true;
  initializeContentScript();
}

function initializeContentScript(): void {
  let commandBar: CommandBar;
  commandBar = new CommandBar(async (prompt: string) => handleSubmitTask(commandBar, prompt));

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "ui/toggle-command-bar") {
      commandBar.toggle();
      return;
    }

    if (message.type === "ui/show-result") {
      commandBar.open();
      if (!message.payload.ok) {
      commandBar.setState("error");
      commandBar.setTrace(message.payload.results ?? []);
      commandBar.setOutput(message.payload.error ?? "Task failed.");
      return;
    }

    commandBar.setState("done");
    commandBar.setTrace(message.payload.results ?? []);
    commandBar.setOutput(formatUiResultMessage(message));
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
