import { DEFAULT_EXECUTION_LIMITS, type ActionExecutionResult, type AgentAction } from "../shared/actions";
import type {
  ExecuteActionsMessage,
  ExecuteActionsResponse,
  RuntimeMessage,
  SubmitTaskMessage,
  SubmitTaskResponse
} from "../shared/messages";

const TOGGLE_COMMAND = "toggle-command-bar";
const NO_RECEIVER_ERROR_FRAGMENT = "Receiving end does not exist";

chrome.commands.onCommand.addListener(async (command: string) => {
  if (command !== TOGGLE_COMMAND) {
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return;
  }

  await toggleCommandBarForActiveTab(activeTab);
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SubmitTaskResponse) => void
  ) => {
    if (message.type !== "agent/submit-task") {
      return;
    }

    void handleSubmit(message, sender)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error: unknown) => {
        console.error("submit-task failed", error);
        sendResponse({
          ok: false,
          payload: {
            state: "error",
            error: "Unexpected background error"
          }
        });
      });

    return true;
  }
);

async function handleSubmit(message: SubmitTaskMessage, sender: chrome.runtime.MessageSender): Promise<SubmitTaskResponse> {
  const trimmedPrompt = message.payload.prompt.trim();

  if (!trimmedPrompt) {
    return {
      ok: false,
      payload: {
        state: "error",
        error: "Prompt cannot be empty"
      }
    };
  }

  const tabId = sender.tab?.id;
  if (!tabId) {
    return {
      ok: false,
      payload: {
        state: "error",
        error: "Cannot identify active tab"
      }
    };
  }

  const actions = buildDeterministicPlan(trimmedPrompt, message.payload.pageUrl);

  const executeResponse = await sendExecuteRequest(tabId, actions);
  if (!executeResponse.ok) {
    return {
      ok: false,
      payload: {
        state: "error",
        error: executeResponse.payload.error ?? "Executor failed"
      }
    };
  }

  const summary = buildSummary(trimmedPrompt, message.payload.pageTitle, message.payload.pageUrl, executeResponse.payload.results);

  return {
    ok: true,
    payload: {
      state: "done",
      summary,
      results: executeResponse.payload.results
    }
  };
}

async function sendExecuteRequest(tabId: number, actions: AgentAction[]): Promise<ExecuteActionsResponse> {
  const message: ExecuteActionsMessage = {
    type: "executor/execute-actions",
    payload: {
      runId: createRunId(),
      actions,
      limits: {
        ...DEFAULT_EXECUTION_LIMITS,
        maxActionsPerBatch: 6
      }
    }
  };

  try {
    const response = await chrome.tabs.sendMessage<ExecuteActionsMessage, ExecuteActionsResponse>(tabId, message);
    if (!response) {
      return {
        ok: false,
        payload: {
          results: [],
          error: "No response from executor"
        }
      };
    }

    return response;
  } catch (error: unknown) {
    return {
      ok: false,
      payload: {
        results: [],
        error: error instanceof Error ? error.message : "Failed to communicate with content script"
      }
    };
  }
}

function buildDeterministicPlan(prompt: string, pageUrl: string): AgentAction[] {
  const lowerPrompt = prompt.toLowerCase();

  if (pageUrl.includes("news.ycombinator.com") && lowerPrompt.includes("top") && lowerPrompt.includes("hacker")) {
    return [
      {
        id: "wait-hn",
        type: "WAIT_FOR",
        target: { selectors: [".athing .titleline > a"] },
        reason: "Wait for story rows",
        params: { timeoutMs: 1500 }
      },
      {
        id: "list-hn",
        type: "LIST_ITEMS",
        target: { selectors: [".athing .titleline > a"] },
        reason: "Collect top stories",
        params: { limit: 5 }
      },
      {
        id: "extract-hn-page",
        type: "EXTRACT_TEXT",
        target: { selectors: ["body"] },
        reason: "Capture visible page context",
        params: { maxChars: 2200 }
      },
      {
        id: "done-hn",
        type: "DONE",
        params: { message: "HN scan complete" }
      }
    ];
  }

  if (pageUrl.includes("mail.google.com") && (lowerPrompt.includes("unread") || lowerPrompt.includes("email"))) {
    return [
      {
        id: "wait-gmail",
        type: "WAIT_FOR",
        target: { selectors: ["tr.zE", "div[role='main'] tr.zE", "[role='main']"] },
        reason: "Wait for inbox rows",
        params: { timeoutMs: 1800 }
      },
      {
        id: "list-gmail-unread",
        type: "LIST_ITEMS",
        target: { selectors: ["tr.zE", "div[role='main'] tr.zE"] },
        reason: "Collect unread threads",
        params: { limit: 5 }
      },
      {
        id: "extract-gmail-main",
        type: "EXTRACT_TEXT",
        target: { selectors: ["[role='main']", "main", "body"] },
        reason: "Capture inbox context",
        params: { maxChars: 2200 }
      },
      {
        id: "done-gmail",
        type: "DONE",
        params: { message: "Gmail scan complete" }
      }
    ];
  }

  return [
    {
      id: "wait-generic",
      type: "WAIT_FOR",
      target: { selectors: ["body"] },
      reason: "Wait for the page body",
      params: { timeoutMs: 1200 }
    },
    {
      id: "extract-generic",
      type: "EXTRACT_TEXT",
      target: { selectors: ["article", "main", "[role='main']", "body"] },
      reason: "Extract page text",
      params: { maxChars: 1800 }
    },
    {
      id: "done-generic",
      type: "DONE",
      params: { message: "Generic extraction complete" }
    }
  ];
}

function buildSummary(prompt: string, pageTitle: string, pageUrl: string, results: ActionExecutionResult[]): string {
  const failures = results.filter((result) => !result.ok);
  const listedItems = results.flatMap((result) => result.data?.items ?? []);
  const extractedText = results.find((result) => result.type === "EXTRACT_TEXT" && result.ok)?.data?.text ?? "";

  const lines: string[] = [];
  lines.push(`Task: ${prompt}`);
  lines.push(`Page: ${pageTitle} (${pageUrl})`);
  lines.push("");

  if (listedItems.length > 0) {
    lines.push(`Collected ${listedItems.length} item(s):`);
    listedItems.forEach((item, index) => {
      const truncated = truncate(item.text, 95);
      const suffix = item.href ? ` -> ${item.href}` : "";
      lines.push(`${index + 1}. ${truncated}${suffix}`);
    });
    lines.push("");
  }

  if (extractedText) {
    lines.push("Extracted context preview:");
    lines.push(truncate(extractedText, 500));
    lines.push("");
  }

  lines.push("Execution results:");
  for (const result of results) {
    const status = result.ok ? "OK" : "FAIL";
    const extra = result.error ? ` (${result.error})` : "";
    lines.push(`- ${result.type}: ${status} [attempts=${result.attempts}]${extra}`);
  }

  if (failures.length > 0) {
    lines.push("");
    lines.push("Warning: partial execution. See failed steps above.");
  }

  return lines.join("\n");
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars - 3)}...`;
}

function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function toggleCommandBarForActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !isScriptablePageUrl(tab.url)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ui/toggle-command-bar" });
    return;
  } catch (error: unknown) {
    if (!isNoReceiverError(error)) {
      console.error("Failed to send toggle message to content script", error);
      return;
    }
  }

  const injected = await injectContentScript(tab.id);
  if (!injected) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ui/toggle-command-bar" });
  } catch (error: unknown) {
    if (!isNoReceiverError(error)) {
      console.error("Failed to send toggle message after script injection", error);
    }
  }
}

function isScriptablePageUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return (
    !url.startsWith("chrome://") &&
    !url.startsWith("chrome-extension://") &&
    !url.startsWith("edge://") &&
    !url.startsWith("about:") &&
    !url.startsWith("devtools://") &&
    !url.startsWith("view-source:")
  );
}

function isNoReceiverError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(NO_RECEIVER_ERROR_FRAGMENT);
}

async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/ui/styles.css"]
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/index.js"]
    });

    return true;
  } catch (error: unknown) {
    if (!isNoReceiverError(error)) {
      console.error("Failed to inject content script", error);
    }

    return false;
  }
}
