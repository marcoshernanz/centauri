import {
  DEFAULT_EXECUTION_LIMITS,
  parseActionBatch,
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
import { callClaude, loadAgentConfig, loadClaudeConfig, type AgentConfig, type ClaudeConfig } from "../agent/claude";
import {
  buildGmailSummaryPrompt,
  buildGenericSummaryPrompt,
  buildHackerNewsSummaryPrompt,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  buildSummarySystemPrompt
} from "../agent/prompts";

const TOGGLE_COMMAND = "toggle-command-bar";
const NO_RECEIVER_ERROR_FRAGMENT = "Receiving end does not exist";
const DEFAULT_TARGET_COUNT = 5;
const MAX_TARGET_COUNT = 5;
const HN_HOME_URL = "https://news.ycombinator.com/";
const GMAIL_INBOX_URL = "https://mail.google.com/mail/u/0/#inbox";
const GMAIL_UNREAD_WAIT_SELECTORS = [
  "tr.zA.zE",
  "tr.zE",
  "div[role='main'] tr.zA.zE",
  "div[role='main'] tr.zE",
  "table[role='grid'] tr.zA.zE",
  "table[role='grid'] tr.zE",
  "tr[aria-label*='Unread']",
  "tr[aria-label*='unread']"
] as const;
const GMAIL_UNREAD_CLICK_SELECTORS = [
  "tr.zA.zE span.bog",
  "tr.zE span.bog",
  "div[role='main'] tr.zA.zE span.bog",
  "div[role='main'] tr.zE span.bog",
  "table[role='grid'] tr.zA.zE span.bog",
  "tr[aria-label*='Unread'] span.bog",
  "tr[aria-label*='unread'] span.bog",
  "tr.zA.zE",
  "tr.zE"
] as const;
const GMAIL_THREAD_WAIT_SELECTORS = [
  "div[data-message-id]",
  "div.a3s",
  "[role='main'] .a3s",
  "h2.hP",
  "[role='main']"
] as const;
const GMAIL_THREAD_EXTRACT_SELECTORS = [
  "div.a3s.aiL",
  "div.a3s",
  "[role='main'] div.a3s",
  "[role='listitem'] div.a3s",
  "div[data-message-id]",
  "[role='main']"
] as const;
const GMAIL_INBOX_RETURN_WAIT_SELECTORS = [
  "tr.zA",
  "div[role='main'] tr.zA",
  "table[role='grid'] tr.zA",
  "[role='main'] table tr",
  "[role='main']"
] as const;

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
    return toError("Prompt cannot be empty");
  }

  const tabId = sender.tab?.id;
  if (!tabId) {
    return toError("Cannot identify active tab");
  }

  const targetCount = parseRequestedCount(trimmedPrompt);
  const agentConfig = await loadAgentConfig();
  const claudeConfig = await loadClaudeConfig();

  if (isHackerNewsTask(trimmedPrompt, message.payload.pageUrl)) {
    return runHackerNewsFlow(tabId, trimmedPrompt, targetCount, claudeConfig, agentConfig);
  }

  if (isGmailTask(trimmedPrompt, message.payload.pageUrl)) {
    return runGmailFlow(tabId, trimmedPrompt, targetCount, claudeConfig, agentConfig);
  }

  return runGenericFlow(tabId, trimmedPrompt, message.payload.pageTitle, message.payload.pageUrl, claudeConfig, agentConfig);
}

async function runHackerNewsFlow(
  tabId: number,
  prompt: string,
  targetCount: number,
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse> {
  const allResults: ActionExecutionResult[] = [];

  const ensured = await ensureTabOnUrl(tabId, "news.ycombinator.com", HN_HOME_URL);
  if (!ensured) {
    return toError("Failed to open Hacker News", allResults);
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

  const listedItems = getListedItems(listOutcome.payload.results)
    .filter((item) => Boolean(item.href))
    .slice(0, targetCount);

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
      articleSummaries.push({ title: item.text, url, preview: "Navigation failed", ok: false });
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

    const returned = await navigateTab(tabId, HN_HOME_URL);
    if (!returned) {
      articleSummaries.push({
        title: item.text,
        url,
        preview: "Failed to return to Hacker News list",
        ok: false
      });
      break;
    }

    const returnOutcome = await executeActionBatch(tabId, [
      {
        id: `wait-return-hn-${createRunId()}`,
        type: "WAIT_FOR",
        target: { selectors: [".athing .titleline > a", "body"] },
        params: { timeoutMs: 1500 }
      }
    ]);
    allResults.push(...returnOutcome.payload.results);
  }

  const deterministicSummary = buildHackerNewsSummary(prompt, articleSummaries, allResults);
  const claudeSummary = claudeConfig
    ? await maybeClaudeSummarize(
        claudeConfig,
        buildHackerNewsSummaryPrompt(
          prompt,
          articleSummaries.map((item) => ({
            title: item.title,
            url: item.url,
            preview: item.preview
          }))
        ),
        agentConfig.claude.summaryMaxTokens
      )
    : null;

  return {
    ok: true,
    payload: {
      state: "done",
      summary: claudeSummary ?? deterministicSummary,
      results: allResults
    }
  };
}

async function runGmailFlow(
  tabId: number,
  prompt: string,
  targetCount: number,
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse> {
  const allResults: ActionExecutionResult[] = [];

  const ensured = await ensureTabOnUrl(tabId, "mail.google.com", GMAIL_INBOX_URL);
  if (!ensured) {
    return toError("Failed to open Gmail", allResults);
  }

  const emailSummaries: Array<{ index: number; preview: string; ok: boolean }> = [];

  for (let index = 0; index < targetCount; index += 1) {
    const outcome = await executeActionBatch(tabId, [
      {
        id: `wait-unread-${index}`,
        type: "WAIT_FOR",
        target: { selectors: [...GMAIL_UNREAD_WAIT_SELECTORS] },
        params: { timeoutMs: 2400 }
      },
      {
        id: `open-unread-${index}`,
        type: "CLICK",
        target: { selectors: [...GMAIL_UNREAD_CLICK_SELECTORS], index: 0 }
      },
      {
        id: `wait-thread-${index}`,
        type: "WAIT_FOR",
        target: { selectors: [...GMAIL_THREAD_WAIT_SELECTORS] },
        params: { timeoutMs: 2600 }
      },
      {
        id: `extract-thread-${index}`,
        type: "EXTRACT_TEXT",
        target: { selectors: [...GMAIL_THREAD_EXTRACT_SELECTORS] },
        params: { maxChars: 3000 }
      },
      {
        id: `back-inbox-${index}`,
        type: "BACK",
        params: { waitMs: 280 }
      },
      {
        id: `wait-inbox-return-${index}`,
        type: "WAIT_FOR",
        target: { selectors: [...GMAIL_INBOX_RETURN_WAIT_SELECTORS] },
        params: { timeoutMs: 2200 }
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
    return toError("Could not read unread emails. Ensure inbox has unread messages and remains in list view.", allResults);
  }

  const deterministicSummary = buildGmailSummary(prompt, emailSummaries, allResults, targetCount);
  const claudeSummary = claudeConfig
    ? await maybeClaudeSummarize(
        claudeConfig,
        buildGmailSummaryPrompt(
          prompt,
          emailSummaries.map((item) => ({ index: item.index, preview: item.preview }))
        ),
        agentConfig.claude.summaryMaxTokens
      )
    : null;

  return {
    ok: true,
    payload: {
      state: "done",
      summary: claudeSummary ?? deterministicSummary,
      results: allResults
    }
  };
}

async function runGenericFlow(
  tabId: number,
  prompt: string,
  pageTitle: string,
  pageUrl: string,
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse> {
  if (claudeConfig) {
    const planned = await runClaudePlannerLoop(tabId, prompt, pageTitle, pageUrl, claudeConfig, agentConfig);
    if (planned) {
      return planned;
    }
  }

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

  const deterministicSummary = buildGenericSummary(prompt, pageTitle, pageUrl, outcome.payload.results);
  const claudeSummary = claudeConfig
    ? await maybeClaudeSummarize(
        claudeConfig,
        buildGenericSummaryPrompt({
          task: prompt,
          pageTitle,
          pageUrl,
          results: outcome.payload.results
        }),
        agentConfig.claude.summaryMaxTokens
      )
    : null;

  return {
    ok: true,
    payload: {
      state: "done",
      summary: claudeSummary ?? deterministicSummary,
      results: outcome.payload.results
    }
  };
}

async function runClaudePlannerLoop(
  tabId: number,
  prompt: string,
  pageTitle: string,
  pageUrl: string,
  claudeConfig: ClaudeConfig,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse | null> {
  const allResults: ActionExecutionResult[] = [];
  let latestExtract = "";

  for (let iteration = 1; iteration <= agentConfig.claude.plannerMaxIterations; iteration += 1) {
    const plannedActions = await planActionsWithClaude({
      config: claudeConfig,
      task: prompt,
      pageTitle,
      pageUrl,
      iteration,
      latestExtract,
      previousResults: allResults,
      maxActions: agentConfig.claude.plannerMaxActions,
      maxTokens: agentConfig.claude.plannerMaxTokens
    });

    if (!plannedActions || plannedActions.length === 0) {
      break;
    }

    const outcome = await executeActionBatch(tabId, plannedActions);
    allResults.push(...outcome.payload.results);

    const extractedText = getExtractedText(outcome.payload.results);
    if (extractedText) {
      latestExtract = extractedText;
    }

    if (!outcome.ok || plannedActions.some((action) => action.type === "DONE")) {
      break;
    }
  }

  if (allResults.length === 0) {
    return null;
  }

  const summary =
    (await maybeClaudeSummarize(
      claudeConfig,
      buildGenericSummaryPrompt({
        task: prompt,
        pageTitle,
        pageUrl,
        results: allResults
      }),
      agentConfig.claude.summaryMaxTokens
    )) ?? buildGenericSummary(prompt, pageTitle, pageUrl, allResults);

  return {
    ok: true,
    payload: {
      state: "done",
      summary,
      results: allResults
    }
  };
}

async function planActionsWithClaude(input: {
  config: ClaudeConfig;
  task: string;
  pageTitle: string;
  pageUrl: string;
  iteration: number;
  latestExtract: string;
  previousResults: ActionExecutionResult[];
  maxActions: number;
  maxTokens: number;
}): Promise<AgentAction[] | null> {
  try {
    const rawResponse = await callClaude(
      input.config,
      buildPlannerSystemPrompt(),
      buildPlannerUserPrompt({
        task: input.task,
        pageTitle: input.pageTitle,
        pageUrl: input.pageUrl,
        iteration: input.iteration,
        latestExtract: input.latestExtract,
        previousResults: input.previousResults
      }),
      input.maxTokens
    );

    const parsed = parsePlannerResponse(rawResponse);
    if (!parsed) {
      return null;
    }

    const validation = parseActionBatch(parsed, input.maxActions);
    if (!validation.ok) {
      return null;
    }

    return validation.value;
  } catch {
    return null;
  }
}

function parsePlannerResponse(raw: string): unknown[] | null {
  const parsed = extractJsonValue(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.actions)) {
    return null;
  }

  return record.actions as unknown[];
}

async function maybeClaudeSummarize(config: ClaudeConfig, userPrompt: string, maxTokens: number): Promise<string | null> {
  try {
    const summary = await callClaude(config, buildSummarySystemPrompt(), userPrompt, maxTokens);
    return summary.trim();
  } catch {
    return null;
  }
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

  return sendExecuteRequest(tabId, message);
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
          error: retryError instanceof Error ? retryError.message : "Failed after reinjection"
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
    return waitForTabReady(tabId, 5500, url);
  } catch {
    return false;
  }
}

async function waitForTabReady(tabId: number, timeoutMs: number, expectedUrl?: string): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const statusReady = tab.status === "complete";
      const urlReady = !expectedUrl || normalizeUrl(tab.url) === normalizeUrl(expectedUrl);

      if (statusReady && urlReady) {
        return true;
      }
    } catch {
      return false;
    }

    await sleep(120);
  }

  return false;
}

function getListedItems(results: ActionExecutionResult[]): ListedItem[] {
  return results.flatMap((result) => result.data?.items ?? []);
}

function getExtractedText(results: ActionExecutionResult[]): string {
  return results.find((result) => result.type === "EXTRACT_TEXT" && result.ok)?.data?.text ?? "";
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

function buildGenericSummary(
  prompt: string,
  pageTitle: string,
  pageUrl: string,
  results: ActionExecutionResult[]
): string {
  const text = getExtractedText(results);

  return [
    `Task: ${prompt}`,
    `Page: ${pageTitle} (${pageUrl})`,
    "",
    "Extracted context:",
    summarizeSnippet(text, 520),
    "",
    `Execution: ${countOk(results)}/${results.length} actions OK`
  ].join("\n");
}

function countOk(results: ActionExecutionResult[]): number {
  return results.filter((result) => result.ok).length;
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

function extractJsonValue(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fencedMatch ? [fencedMatch[1], trimmed] : [trimmed];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue.
    }
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const slice = trimmed.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // Continue.
    }
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const slice = trimmed.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // Continue.
    }
  }

  return null;
}

function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
