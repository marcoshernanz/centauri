import {
  DEFAULT_EXECUTION_LIMITS,
  type ActionExecutionResult,
  type AgentAction,
  type ListedItem
} from "../shared/actions";
import type {
  ExecuteActionsMessage,
  ExecuteActionsResponse,
  RuntimeMessage,
  SubmitTaskMessage,
  SubmitTaskResponse
} from "../shared/messages";

const TOGGLE_COMMAND = "toggle-command-bar";
const NO_RECEIVER_ERROR_FRAGMENT = "Receiving end does not exist";
const DEFAULT_TARGET_COUNT = 5;
const MAX_TARGET_COUNT = 5;

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

  const targetCount = parseRequestedCount(trimmedPrompt);

  if (isHackerNewsTask(trimmedPrompt, message.payload.pageUrl)) {
    return runHackerNewsFlow(tabId, trimmedPrompt, targetCount);
  }

  if (isGmailTask(trimmedPrompt, message.payload.pageUrl)) {
    return runGmailFlow(tabId, trimmedPrompt, targetCount);
  }

  return runGenericFlow(tabId, trimmedPrompt, message.payload.pageTitle, message.payload.pageUrl);
}

async function runHackerNewsFlow(tabId: number, prompt: string, targetCount: number): Promise<SubmitTaskResponse> {
  const allResults: ActionExecutionResult[] = [];

  const ensured = await ensureTabOnUrl(tabId, "news.ycombinator.com", "https://news.ycombinator.com/");
  if (!ensured) {
    return toError("Failed to open Hacker News");
  }

  const listOutcome = await executeActionBatch(tabId, [
    {
      id: "wait-hn-list",
      type: "WAIT_FOR",
      target: { selectors: [".athing .titleline > a"] },
      params: { timeoutMs: 2200 }
    },
    {
      id: "list-hn-items",
      type: "LIST_ITEMS",
      target: { selectors: [".athing .titleline > a"] },
      params: { limit: targetCount }
    }
  ]);

  allResults.push(...listOutcome.payload.results);

  if (!listOutcome.ok) {
    return toError(listOutcome.payload.error ?? "Could not read Hacker News list", allResults);
  }

  const listedItems = getListedItems(listOutcome.payload.results).filter((item) => Boolean(item.href)).slice(0, targetCount);
  if (listedItems.length === 0) {
    return toError("No Hacker News links found", allResults);
  }

  const articleSummaries: Array<{ title: string; url: string; preview: string; ok: boolean }> = [];

  for (const item of listedItems) {
    const url = item.href;
    if (!url) {
      continue;
    }

    const navigated = await navigateTab(tabId, url);
    if (!navigated) {
      articleSummaries.push({
        title: item.text,
        url,
        preview: "Navigation failed",
        ok: false
      });
      continue;
    }

    const extractOutcome = await executeActionBatch(tabId, [
      {
        id: `wait-article-${createRunId()}`,
        type: "WAIT_FOR",
        target: { selectors: ["article", "main", "[role='main']", "body"] },
        params: { timeoutMs: 2500 }
      },
      {
        id: `extract-article-${createRunId()}`,
        type: "EXTRACT_TEXT",
        target: { selectors: ["article", "main", "[role='main']", "body"] },
        params: { maxChars: 3800 }
      }
    ]);

    allResults.push(...extractOutcome.payload.results);

    const extractedText = getExtractedText(extractOutcome.payload.results);
    articleSummaries.push({
      title: item.text,
      url,
      preview: summarizeSnippet(extractedText, 220),
      ok: extractOutcome.ok && extractedText.length > 0
    });

    await goBack(tabId);
    await executeActionBatch(tabId, [
      {
        id: "wait-return-hn",
        type: "WAIT_FOR",
        target: { selectors: [".athing .titleline > a", "body"] },
        params: { timeoutMs: 1800 }
      }
    ]);
  }

  const summary = buildHackerNewsSummary(prompt, articleSummaries, allResults);
  return {
    ok: true,
    payload: {
      state: "done",
      summary,
      results: allResults
    }
  };
}

async function runGmailFlow(tabId: number, prompt: string, targetCount: number): Promise<SubmitTaskResponse> {
  const allResults: ActionExecutionResult[] = [];

  const ensured = await ensureTabOnUrl(tabId, "mail.google.com", "https://mail.google.com/mail/u/0/#inbox");
  if (!ensured) {
    return toError("Failed to open Gmail", allResults);
  }

  const emailSummaries: Array<{ index: number; preview: string; ok: boolean }> = [];

  for (let index = 0; index < targetCount; index += 1) {
    const outcome = await executeActionBatch(tabId, [
      {
        id: `wait-unread-${index}`,
        type: "WAIT_FOR",
        target: { selectors: ["tr.zE", "div[role='main'] tr.zE", "[role='main']"] },
        params: { timeoutMs: 2200 }
      },
      {
        id: `open-unread-${index}`,
        type: "CLICK",
        target: { selectors: ["tr.zE", "div[role='main'] tr.zE"], index: 0 }
      },
      {
        id: `wait-thread-${index}`,
        type: "WAIT_FOR",
        target: { selectors: ["div[data-message-id]", "div.a3s", "[role='main']"] },
        params: { timeoutMs: 2200 }
      },
      {
        id: `extract-thread-${index}`,
        type: "EXTRACT_TEXT",
        target: { selectors: ["div.a3s", "div[data-message-id]", "[role='main']", "body"] },
        params: { maxChars: 2600 }
      },
      {
        id: `back-inbox-${index}`,
        type: "BACK",
        params: { waitMs: 320 }
      }
    ]);

    allResults.push(...outcome.payload.results);

    if (!outcome.ok) {
      break;
    }

    const extractedText = getExtractedText(outcome.payload.results);
    emailSummaries.push({
      index: index + 1,
      preview: summarizeSnippet(extractedText, 210),
      ok: extractedText.length > 0
    });
  }

  if (emailSummaries.length === 0) {
    return toError("Could not read unread emails. Ensure inbox has unread messages and stays in standard list view.", allResults);
  }

  const summary = buildGmailSummary(prompt, emailSummaries, allResults, targetCount);
  return {
    ok: true,
    payload: {
      state: "done",
      summary,
      results: allResults
    }
  };
}

async function runGenericFlow(
  tabId: number,
  prompt: string,
  pageTitle: string,
  pageUrl: string
): Promise<SubmitTaskResponse> {
  const outcome = await executeActionBatch(tabId, [
    {
      id: "wait-generic",
      type: "WAIT_FOR",
      target: { selectors: ["body"] },
      params: { timeoutMs: 1200 }
    },
    {
      id: "extract-generic",
      type: "EXTRACT_TEXT",
      target: { selectors: ["article", "main", "[role='main']", "body"] },
      params: { maxChars: 2000 }
    }
  ]);

  if (!outcome.ok) {
    return toError(outcome.payload.error ?? "Generic extraction failed", outcome.payload.results);
  }

  const text = getExtractedText(outcome.payload.results);
  const summary = [
    `Task: ${prompt}`,
    `Page: ${pageTitle} (${pageUrl})`,
    "",
    "Extracted context:",
    summarizeSnippet(text, 520),
    "",
    `Execution: ${countOk(outcome.payload.results)}/${outcome.payload.results.length} actions OK`
  ].join("\n");

  return {
    ok: true,
    payload: {
      state: "done",
      summary,
      results: outcome.payload.results
    }
  };
}

async function executeActionBatch(tabId: number, actions: AgentAction[]): Promise<ExecuteActionsResponse> {
  const message: ExecuteActionsMessage = {
    type: "executor/execute-actions",
    payload: {
      runId: createRunId(),
      actions,
      limits: {
        ...DEFAULT_EXECUTION_LIMITS,
        maxActionsPerBatch: 8,
        maxActionTimeoutMs: 3200,
        maxWaitForMs: 3200
      }
    }
  };

  const firstAttempt = await sendExecuteRequest(tabId, message);
  if (firstAttempt.ok) {
    return firstAttempt;
  }

  return firstAttempt;
}

async function sendExecuteRequest(tabId: number, message: ExecuteActionsMessage): Promise<ExecuteActionsResponse> {
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
    if (!isNoReceiverError(error)) {
      return {
        ok: false,
        payload: {
          results: [],
          error: error instanceof Error ? error.message : "Failed to communicate with content script"
        }
      };
    }

    const injected = await injectContentScript(tabId);
    if (!injected) {
      return {
        ok: false,
        payload: {
          results: [],
          error: "Content script unavailable for this tab"
        }
      };
    }

    try {
      const retryResponse = await chrome.tabs.sendMessage<ExecuteActionsMessage, ExecuteActionsResponse>(tabId, message);
      if (!retryResponse) {
        return {
          ok: false,
          payload: {
            results: [],
            error: "No response from executor after reinjection"
          }
        };
      }

      return retryResponse;
    } catch (retryError: unknown) {
      return {
        ok: false,
        payload: {
          results: [],
          error: retryError instanceof Error ? retryError.message : "Failed to communicate after reinjection"
        }
      };
    }
  }
}

async function ensureTabOnUrl(tabId: number, hostContains: string, fallbackUrl: string): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  const currentUrl = tab.url ?? "";

  if (currentUrl.includes(hostContains)) {
    return true;
  }

  return navigateTab(tabId, fallbackUrl);
}

async function navigateTab(tabId: number, url: string): Promise<boolean> {
  try {
    await chrome.tabs.update(tabId, { url });
    return waitForTabComplete(tabId, 7000);
  } catch {
    return false;
  }
}

async function goBack(tabId: number): Promise<void> {
  try {
    await chrome.tabs.goBack(tabId);
    await waitForTabComplete(tabId, 6000);
  } catch {
    await sleep(220);
  }
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<boolean> {
  const existingTab = await chrome.tabs.get(tabId);
  if (existingTab.status === "complete") {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let done = false;

    const timerId = setTimeout(() => {
      if (done) {
        return;
      }

      done = true;
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      resolve(false);
    }, timeoutMs);

    const handleUpdated = (updatedTabId: number, changeInfo: { status?: string }): void => {
      if (done || updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }

      done = true;
      clearTimeout(timerId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      resolve(true);
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
}

function getListedItems(results: ActionExecutionResult[]): ListedItem[] {
  return results.flatMap((result) => result.data?.items ?? []);
}

function getExtractedText(results: ActionExecutionResult[]): string {
  return results.find((result) => result.type === "EXTRACT_TEXT" && result.ok)?.data?.text ?? "";
}

function summarizeSnippet(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(No text extracted)";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 3)}...`;
}

function buildHackerNewsSummary(
  prompt: string,
  items: Array<{ title: string; url: string; preview: string; ok: boolean }>,
  results: ActionExecutionResult[]
): string {
  const lines: string[] = [];
  lines.push(`Task: ${prompt}`);
  lines.push(`Visited ${items.length} article(s).`);
  lines.push("");

  items.forEach((item, index) => {
    const status = item.ok ? "OK" : "PARTIAL";
    lines.push(`${index + 1}. [${status}] ${item.title}`);
    lines.push(`   ${item.url}`);
    lines.push(`   ${item.preview}`);
  });

  lines.push("");
  lines.push(`Execution: ${countOk(results)}/${results.length} actions OK`);
  if (results.some((result) => !result.ok)) {
    lines.push("Warning: partial execution, some actions failed.");
  }

  return lines.join("\n");
}

function buildGmailSummary(
  prompt: string,
  items: Array<{ index: number; preview: string; ok: boolean }>,
  results: ActionExecutionResult[],
  requestedCount: number
): string {
  const lines: string[] = [];
  lines.push(`Task: ${prompt}`);
  lines.push(`Processed ${items.length}/${requestedCount} unread email(s).`);
  lines.push("");

  items.forEach((item) => {
    const status = item.ok ? "OK" : "PARTIAL";
    lines.push(`${item.index}. [${status}] ${item.preview}`);
  });

  lines.push("");
  lines.push(`Execution: ${countOk(results)}/${results.length} actions OK`);
  if (items.length < requestedCount) {
    lines.push("Warning: fewer unread emails found than requested.");
  }
  if (results.some((result) => !result.ok)) {
    lines.push("Warning: some actions failed during execution.");
  }

  return lines.join("\n");
}

function countOk(results: ActionExecutionResult[]): number {
  return results.filter((result) => result.ok).length;
}

function toError(error: string, results: ActionExecutionResult[] = []): SubmitTaskResponse {
  return {
    ok: false,
    payload: {
      state: "error",
      error,
      results
    }
  };
}

function parseRequestedCount(prompt: string): number {
  const match = prompt.match(/(\d+)/);
  if (!match) {
    return DEFAULT_TARGET_COUNT;
  }

  const numeric = Number.parseInt(match[1], 10);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TARGET_COUNT;
  }

  return Math.max(1, Math.min(MAX_TARGET_COUNT, numeric));
}

function isHackerNewsTask(prompt: string, pageUrl: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  return (
    pageUrl.includes("news.ycombinator.com") ||
    lowerPrompt.includes("hacker news") ||
    lowerPrompt.includes("hackernews")
  );
}

function isGmailTask(prompt: string, pageUrl: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  return (
    pageUrl.includes("mail.google.com") ||
    lowerPrompt.includes("gmail") ||
    lowerPrompt.includes("unread email") ||
    lowerPrompt.includes("unread mails")
  );
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
