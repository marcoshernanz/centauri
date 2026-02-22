import {
  DEFAULT_EXECUTION_LIMITS,
  parseActionBatch,
  type ActionExecutionResult,
  type AgentAction,
  type ListedItem
} from "../shared/actions";
import type {
  AgentRunMode,
  ExecuteActionsMessage,
  ExecuteActionsResponse,
  RuntimeMessage,
  ShowResultMessage,
  SubmitTaskMessage,
  SubmitTaskResponse,
  TtsSynthesizeMessage,
  TtsSynthesizeResponse,
  UIState
} from "../shared/messages";
import { callClaude, callClaudeImageSummary, loadAgentConfig, loadClaudeConfig, type AgentConfig, type ClaudeConfig } from "../agent/claude";
import { callGeminiImageSummary, loadGeminiConfig } from "../agent/gemini";
import {
  buildGmailSummaryPrompt,
  buildGenericSummaryPrompt,
  buildGenericTraversalSummaryPrompt,
  buildHackerNewsSummaryPrompt,
  buildReadOnlyDomPrompt,
  buildReadOnlyDomSystemPrompt,
  buildPlannerRepairSystemPrompt,
  buildPlannerRepairUserPrompt,
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
const GENERIC_LIST_SELECTORS = [
  "main article a[href]",
  "main h2 a[href]",
  "main h3 a[href]",
  "[role='main'] article a[href]",
  "[role='main'] a[href]",
  "article a[href]",
  "main a[href]",
  "a[href]"
] as const;
const GENERIC_WAIT_SELECTORS = ["main", "[role='main']", "article", "body"] as const;
const GENERIC_EXTRACT_SELECTORS = ["article", "main", "[role='main']", "section", "body"] as const;
const GENERIC_NAV_BLOCKLIST = [
  "login",
  "sign-in",
  "signin",
  "signup",
  "register",
  "account",
  "settings",
  "privacy",
  "terms",
  "mailto:",
  "tel:",
  "javascript:"
] as const;
const TRANSIENT_EXECUTOR_ERROR_PATTERNS = [
  "No response from executor",
  "Failed to communicate with content script",
  "Failed after reinjection",
  "Action timed out"
] as const;
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

type SelectedImageInput = {
  src: string;
  alt: string | null;
};

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
    sendResponse: (response: SubmitTaskResponse | TtsSynthesizeResponse) => void
  ) => {
    if (message.type === "tts/synthesize") {
      void handleTtsSynthesize(message)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "TTS synthesis failed"
          });
        });
      return true;
    }

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

async function handleTtsSynthesize(message: TtsSynthesizeMessage): Promise<TtsSynthesizeResponse> {
  const { text, voiceId, modelId, apiKey } = message.payload;
  if (!apiKey || !voiceId) {
    return { ok: false, error: "Missing ElevenLabs configuration." };
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text,
      model_id: modelId || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const raw = await response.text();
      if (raw.trim()) {
        detail = raw.slice(0, 220);
      }
    } catch {
      // Keep default status detail.
    }
    return { ok: false, error: `ElevenLabs TTS request failed: ${detail}` };
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return { ok: false, error: "ElevenLabs TTS returned empty audio." };
  }

  // Convert to base64 for message passing
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);

  return { ok: true, audioBase64 };
}

async function handleSubmit(message: SubmitTaskMessage, sender: chrome.runtime.MessageSender): Promise<SubmitTaskResponse> {
  const runStartedAt = Date.now();
  const trimmedPrompt = message.payload.prompt.trim();
  const selectedImage = normalizeSelectedImageInput(message.payload.selectedImage);
  const agentMode = normalizeAgentRunMode(message.payload.agentMode);

  if (!trimmedPrompt && !selectedImage) {
    return toError("Prompt cannot be empty");
  }

  const tabId = sender.tab?.id;
  if (!tabId) {
    return toError("Cannot identify active tab");
  }

  if (selectedImage) {
    await showRunShellState(tabId, "executing");
    const imageResponse = await runGeminiImageFlow({
      prompt: trimmedPrompt,
      selectedImage,
      pageUrl: message.payload.pageUrl,
      pageTitle: message.payload.pageTitle
    });
    await pushUiResult(tabId, imageResponse, Date.now() - runStartedAt);
    return imageResponse;
  }

  const targetCount = parseRequestedCount(trimmedPrompt);
  const genericTargetCount = inferGenericTargetCount(trimmedPrompt);
  const agentConfig = await loadAgentConfig();
  const claudeConfig = await loadClaudeConfig();
  const hardcodedTask = detectHardcodedTask(trimmedPrompt, message.payload.pageUrl);

  await showRunShellState(tabId, "executing");

  if (hardcodedTask === "hackernews") {
    const response = await runHackerNewsFlow(tabId, trimmedPrompt, targetCount, claudeConfig, agentConfig);
    await pushUiResult(tabId, response, Date.now() - runStartedAt);
    return response;
  }

  if (hardcodedTask === "gmail") {
    const response = await runGmailFlow(tabId, trimmedPrompt, targetCount, claudeConfig, agentConfig);
    await pushUiResult(tabId, response, Date.now() - runStartedAt);
    return response;
  }

  if (agentMode === "chat") {
    const chatResponse = await runReadOnlyDomFlow({
      prompt: trimmedPrompt,
      pageTitle: message.payload.pageTitle,
      pageUrl: message.payload.pageUrl,
      pageContext: message.payload.pageContext,
      claudeConfig,
      summaryMaxTokens: agentConfig.claude.summaryMaxTokens
    });
    await pushUiResult(tabId, chatResponse, Date.now() - runStartedAt);
    return chatResponse;
  }

  let response: SubmitTaskResponse;

  response = await runGenericFlow(
    tabId,
    trimmedPrompt,
    genericTargetCount,
    message.payload.pageTitle,
    message.payload.pageUrl,
    message.payload.pageContext,
    claudeConfig,
    agentConfig
  );
  await pushUiResult(tabId, response, Date.now() - runStartedAt);
  return response;
}

async function runGeminiImageFlow(input: {
  prompt: string;
  selectedImage: SelectedImageInput;
  pageUrl: string;
  pageTitle: string;
}): Promise<SubmitTaskResponse> {
  // Resolve the image payload once for both providers.
  let imagePayload: { mimeType: string; imageBase64: string };
  try {
    imagePayload = await resolveImagePayloadForGemini(input.selectedImage.src, input.pageUrl);
  } catch (error: unknown) {
    return toError(error instanceof Error ? error.message : "Failed to load selected image");
  }

  // Try Claude first (mandatory model, better contextual reasoning with vision).
  const claudeConfig = await loadClaudeConfig();
  if (claudeConfig) {
    try {
      const { system, user } = buildClaudeImagePrompt(input.prompt, input.selectedImage.alt, input.pageTitle, input.pageUrl);
      const summary = await callClaudeImageSummary({
        config: claudeConfig,
        system,
        prompt: user,
        imageBase64: imagePayload.imageBase64,
        mimeType: imagePayload.mimeType,
        maxTokens: 1200
      });
      return toSuccess(summary, []);
    } catch (claudeError: unknown) {
      console.warn("Claude image analysis failed, falling back to Gemini:", claudeError);
    }
  }

  // Fallback to Gemini.
  const geminiConfig = await loadGeminiConfig();
  if (!geminiConfig) {
    return toError("Neither Claude nor Gemini API key is configured for image analysis.");
  }

  try {
    const summary = await callGeminiImageSummary({
      config: geminiConfig,
      prompt: buildGeminiImagePrompt(input.prompt, input.selectedImage.alt, input.pageTitle, input.pageUrl),
      imageBase64: imagePayload.imageBase64,
      mimeType: imagePayload.mimeType,
      maxOutputTokens: 1200
    });

    return toSuccess(summary, []);
  } catch (error: unknown) {
    return toError(error instanceof Error ? error.message : "Image analysis failed on both Claude and Gemini");
  }
}

async function runReadOnlyDomFlow(input: {
  prompt: string;
  pageTitle: string;
  pageUrl: string;
  pageContext: SubmitTaskMessage["payload"]["pageContext"];
  claudeConfig: ClaudeConfig | null;
  summaryMaxTokens: number;
}): Promise<SubmitTaskResponse> {
  const warnings: string[] = [];
  if (!hasPageContextEvidence(input.pageContext)) {
    warnings.push("DOM context was limited on this page, so answer quality may be partial.");
  }

  if (input.claudeConfig) {
    try {
      const summary = await callClaude(
        input.claudeConfig,
        buildReadOnlyDomSystemPrompt(),
        buildReadOnlyDomPrompt({
          task: input.prompt,
          pageTitle: input.pageTitle,
          pageUrl: input.pageUrl,
          pageContext: input.pageContext
        }),
        Math.max(450, Math.min(1600, input.summaryMaxTokens))
      );
      return toSuccess(summary.trim(), [], warnings);
    } catch {
      warnings.push("Anthropic returned no content, so a deterministic DOM fallback was used.");
      return toSuccess(buildReadOnlyDomFallbackSummary(input.prompt, input.pageTitle, input.pageUrl, input.pageContext), [], warnings);
    }
  }

  warnings.push("Anthropic API key is missing, so a deterministic DOM fallback was used.");
  return toSuccess(buildReadOnlyDomFallbackSummary(input.prompt, input.pageTitle, input.pageUrl, input.pageContext), [], warnings);
}

async function runHackerNewsFlow(
  tabId: number,
  prompt: string,
  targetCount: number,
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse> {
  const allResults: ActionExecutionResult[] = [];

  const ensured = await ensureTabOnUrl(tabId, "news.ycombinator.com", HN_HOME_URL, agentConfig);
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
  ], agentConfig);

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

    const navigated = await navigateTab(tabId, url, agentConfig);
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
    ], agentConfig);

    allResults.push(...extractOutcome.payload.results);

    const extractedText = getExtractedText(extractOutcome.payload.results);
    articleSummaries.push({
      title: item.text,
      url,
      preview: buildReadableHighlight(extractedText, 30),
      ok: extractOutcome.ok && extractedText.length > 0
    });

    const returned = await navigateTab(tabId, HN_HOME_URL, agentConfig);
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
    ], agentConfig);
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

  const warnings: string[] = [];
  if (articleSummaries.length < targetCount) {
    warnings.push(`Only ${articleSummaries.length} of ${targetCount} requested articles were processed.`);
  }
  if (allResults.some((result) => !result.ok)) {
    warnings.push("Some navigation/extraction actions failed during article traversal.");
  }

  return toSuccess(claudeSummary ?? deterministicSummary, allResults, warnings);
}

async function runGmailFlow(
  tabId: number,
  prompt: string,
  targetCount: number,
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse> {
  const allResults: ActionExecutionResult[] = [];

  const ensured = await ensureTabOnUrl(tabId, "mail.google.com", GMAIL_INBOX_URL, agentConfig);
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
    ], agentConfig);

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

  const warnings: string[] = [];
  if (emailSummaries.length < targetCount) {
    warnings.push(`Only ${emailSummaries.length} of ${targetCount} requested unread emails were processed.`);
  }
  if (allResults.some((result) => !result.ok)) {
    warnings.push("Some inbox/thread actions failed; summary may be partial.");
  }

  return toSuccess(claudeSummary ?? deterministicSummary, allResults, warnings);
}

async function runGenericFlow(
  tabId: number,
  prompt: string,
  targetCount: number,
  pageTitle: string,
  pageUrl: string,
  pageContext: SubmitTaskMessage["payload"]["pageContext"],
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse> {
  if (claudeConfig) {
    const planned = await runClaudePlannerLoop(
      tabId,
      prompt,
      targetCount,
      pageTitle,
      pageUrl,
      pageContext,
      claudeConfig,
      agentConfig
    );
    if (planned && hasUsefulGenericPlannerOutcome(planned.payload.results ?? [], targetCount)) {
      return planned;
    }
  }

  if (shouldRunGenericTraversal(prompt, targetCount)) {
    const traversed = await runGenericTraversalFlow(tabId, prompt, targetCount, pageTitle, pageUrl, claudeConfig, agentConfig);
    if (traversed) {
      return traversed;
    }
  }

  const outcome = await executeActionBatch(tabId, [
    {
      id: "wait-generic",
      type: "WAIT_FOR",
      target: { selectors: [...GENERIC_WAIT_SELECTORS] },
      params: { timeoutMs: 1500 }
    },
    {
      id: "extract-generic",
      type: "EXTRACT_TEXT",
      target: { selectors: [...GENERIC_EXTRACT_SELECTORS] },
      params: { maxChars: 2400 }
    }
  ], agentConfig);

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

  const warnings = outcome.payload.results.some((result) => !result.ok)
    ? ["Some actions failed during extraction; summary may be partial."]
    : [];

  return toSuccess(claudeSummary ?? deterministicSummary, outcome.payload.results, warnings);
}

async function runGenericTraversalFlow(
  tabId: number,
  prompt: string,
  targetCount: number,
  originTitle: string,
  originUrl: string,
  claudeConfig: ClaudeConfig | null,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse | null> {
  const allResults: ActionExecutionResult[] = [];
  const currentTab = await chrome.tabs.get(tabId).catch(() => null);
  if (normalizeUrl(currentTab?.url) !== normalizeUrl(originUrl)) {
    const returnedToOrigin = await navigateTab(tabId, originUrl, agentConfig);
    if (!returnedToOrigin) {
      return null;
    }
  }

  const listOutcome = await executeActionBatch(tabId, [
    {
      id: "wait-generic-list",
      type: "WAIT_FOR",
      target: { selectors: [...GENERIC_WAIT_SELECTORS] },
      params: { timeoutMs: 1800 }
    },
    {
      id: "list-generic-items",
      type: "LIST_ITEMS",
      target: { selectors: [...GENERIC_LIST_SELECTORS] },
      params: { limit: Math.min(20, Math.max(6, targetCount * 4)) }
    }
  ], agentConfig);
  allResults.push(...listOutcome.payload.results);

  if (!listOutcome.ok) {
    return null;
  }

  const selectedItems = rankGenericCandidates(getListedItems(listOutcome.payload.results), prompt, originUrl).slice(0, targetCount);
  if (selectedItems.length === 0) {
    return null;
  }

  const visited: Array<{ title: string; url: string; preview: string; ok: boolean }> = [];

  for (const item of selectedItems) {
    if (!item.href) {
      continue;
    }

    const opened = await navigateTab(tabId, item.href, agentConfig);
    if (!opened) {
      visited.push({
        title: item.text,
        url: item.href,
        preview: "Navigation failed",
        ok: false
      });
      continue;
    }

    const extractOutcome = await executeActionBatch(tabId, [
      {
        id: `wait-generic-open-${createRunId()}`,
        type: "WAIT_FOR",
        target: { selectors: [...GENERIC_WAIT_SELECTORS] },
        params: { timeoutMs: 2200 }
      },
      {
        id: `extract-generic-open-${createRunId()}`,
        type: "EXTRACT_TEXT",
        target: { selectors: [...GENERIC_EXTRACT_SELECTORS] },
        params: { maxChars: 3500 }
      }
    ], agentConfig);
    allResults.push(...extractOutcome.payload.results);

    const extractedText = getExtractedText(extractOutcome.payload.results);
    visited.push({
      title: item.text,
      url: item.href,
      preview: buildReadableHighlight(extractedText, 32),
      ok: extractOutcome.ok && extractedText.length > 0
    });

    const returned = await navigateTab(tabId, originUrl, agentConfig);
    if (returned) {
      const returnOutcome = await executeActionBatch(tabId, [
        {
          id: `wait-generic-return-${createRunId()}`,
          type: "WAIT_FOR",
          target: { selectors: [...GENERIC_WAIT_SELECTORS] },
          params: { timeoutMs: 1400 }
        }
      ], agentConfig);
      allResults.push(...returnOutcome.payload.results);
      continue;
    }

    const backOutcome = await executeActionBatch(tabId, [
      {
        id: `back-generic-return-${createRunId()}`,
        type: "BACK",
        params: { waitMs: 320 }
      },
      {
        id: `wait-generic-return-back-${createRunId()}`,
        type: "WAIT_FOR",
        target: { selectors: [...GENERIC_WAIT_SELECTORS] },
        params: { timeoutMs: 1400 }
      }
    ], agentConfig);
    allResults.push(...backOutcome.payload.results);
  }

  if (visited.length === 0) {
    return null;
  }

  const deterministicSummary = buildGenericTraversalSummary(prompt, visited, allResults, targetCount);
  const claudeSummary = claudeConfig
    ? await maybeClaudeSummarize(
        claudeConfig,
        buildGenericTraversalSummaryPrompt({
          task: prompt,
          originTitle,
          originUrl,
          visited
        }),
        agentConfig.claude.summaryMaxTokens
      )
    : null;

  const warnings: string[] = [];
  if (visited.filter((item) => item.ok).length < targetCount) {
    warnings.push(`Only ${visited.filter((item) => item.ok).length} of ${targetCount} target pages were processed.`);
  }
  if (allResults.some((result) => !result.ok)) {
    warnings.push("Some navigation/extraction actions failed during cross-site traversal.");
  }

  return toSuccess(claudeSummary ?? deterministicSummary, allResults, warnings);
}

async function runClaudePlannerLoop(
  tabId: number,
  prompt: string,
  targetCount: number,
  pageTitle: string,
  pageUrl: string,
  pageContext: SubmitTaskMessage["payload"]["pageContext"],
  claudeConfig: ClaudeConfig,
  agentConfig: AgentConfig
): Promise<SubmitTaskResponse | null> {
  const allResults: ActionExecutionResult[] = [];
  let latestExtract = "";
  let previousActionSignature = "";
  let consecutiveBatchFailures = 0;
  let stagnantIterations = 0;

  for (let iteration = 1; iteration <= agentConfig.claude.plannerMaxIterations; iteration += 1) {
    const plannedActions = await planActionsWithClaude({
      config: claudeConfig,
      task: prompt,
      pageTitle,
      pageUrl,
      pageContext,
      iteration,
      latestExtract,
      previousResults: allResults,
      maxActions: agentConfig.claude.plannerMaxActions,
      maxTokens: agentConfig.claude.plannerMaxTokens,
      repairAttempts: agentConfig.reliability.plannerRepairAttempts
    });

    if (!plannedActions || plannedActions.length === 0) {
      break;
    }

    const actionSignature = plannedActions.map((action) => `${action.type}:${action.target?.selectors?.[0] ?? "-"}`).join("|");
    if (actionSignature === previousActionSignature && !latestExtract) {
      break;
    }
    previousActionSignature = actionSignature;

    const outcome = await executeActionBatch(tabId, plannedActions, agentConfig);
    allResults.push(...outcome.payload.results);

    const extractedText = getExtractedText(outcome.payload.results);
    if (extractedText) {
      latestExtract = extractedText;
    }

    const yieldedEvidence =
      Boolean(extractedText) ||
      outcome.payload.results.some((result) => (result.data?.items?.length ?? 0) > 0);
    stagnantIterations = yieldedEvidence ? 0 : stagnantIterations + 1;

    if (!outcome.ok) {
      consecutiveBatchFailures += 1;
    } else {
      consecutiveBatchFailures = 0;
    }

    const successfulExtracts = countSuccessfulExtracts(allResults);
    const reachedTarget = targetCount > 1 && successfulExtracts >= targetCount;
    if (
      consecutiveBatchFailures >= 2 ||
      stagnantIterations >= 2 ||
      reachedTarget ||
      plannedActions.some((action) => action.type === "DONE")
    ) {
      break;
    }
  }

  if (allResults.length === 0) {
    return null;
  }

  if (!hasUsefulGenericPlannerOutcome(allResults, targetCount)) {
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

  const warnings = allResults.some((result) => !result.ok)
    ? ["Planner loop completed with some failed actions."]
    : [];

  return toSuccess(summary, allResults, warnings);
}

async function planActionsWithClaude(input: {
  config: ClaudeConfig;
  task: string;
  pageTitle: string;
  pageUrl: string;
  pageContext: SubmitTaskMessage["payload"]["pageContext"];
  iteration: number;
  latestExtract: string;
  previousResults: ActionExecutionResult[];
  maxActions: number;
  maxTokens: number;
  repairAttempts: number;
}): Promise<AgentAction[] | null> {
  try {
    const rawResponse = await callClaude(
      input.config,
      buildPlannerSystemPrompt(input.maxActions),
      buildPlannerUserPrompt({
        task: input.task,
        pageTitle: input.pageTitle,
        pageUrl: input.pageUrl,
        pageContext: input.pageContext,
        iteration: input.iteration,
        latestExtract: input.latestExtract,
        previousResults: input.previousResults
      }),
      input.maxTokens
    );

    const parsed = parsePlannerResponse(rawResponse);
    if (!parsed) {
      const repaired = await repairPlannerJson(input.config, rawResponse, input.maxTokens, input.maxActions, input.repairAttempts);
      if (!repaired) {
        return null;
      }

      const repairedValidation = parseActionBatch(repaired, input.maxActions);
      return repairedValidation.ok ? repairedValidation.value : null;
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

async function repairPlannerJson(
  config: ClaudeConfig,
  rawPlannerOutput: string,
  maxTokens: number,
  maxActions: number,
  attempts: number
): Promise<AgentAction[] | null> {
  if (attempts <= 0) {
    return null;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const repairedRaw = await callClaude(
        config,
        buildPlannerRepairSystemPrompt(),
        buildPlannerRepairUserPrompt(rawPlannerOutput),
        Math.max(300, Math.min(maxTokens, 900))
      );

      const repairedParsed = parsePlannerResponse(repairedRaw);
      if (!repairedParsed) {
        continue;
      }

      const validation = parseActionBatch(repairedParsed, maxActions);
      if (!validation.ok) {
        continue;
      }

      return validation.value;
    } catch {
      // Continue to next repair attempt.
    }
  }

  return null;
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

async function executeActionBatch(tabId: number, actions: AgentAction[], agentConfig: AgentConfig): Promise<ExecuteActionsResponse> {
  const message: ExecuteActionsMessage = {
    type: "executor/execute-actions",
    payload: {
      runId: createRunId(),
      actions,
      limits: {
        ...DEFAULT_EXECUTION_LIMITS,
        maxActionsPerBatch: 8,
        maxActionTimeoutMs: agentConfig.runtime.actionTimeoutMs,
        maxWaitForMs: agentConfig.runtime.waitTimeoutMs
      }
    }
  };

  let response = await sendExecuteRequest(tabId, message);

  for (let attempt = 0; attempt < agentConfig.runtime.executorRetryAttempts; attempt += 1) {
    if (response.ok || !isTransientExecutorError(response.payload.error)) {
      break;
    }

    await sleep(90);
    response = await sendExecuteRequest(tabId, message);
  }

  return response;
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

async function ensureTabOnUrl(tabId: number, hostContains: string, fallbackUrl: string, agentConfig?: AgentConfig): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  const currentUrl = tab.url ?? "";

  if (currentUrl.includes(hostContains)) {
    return true;
  }

  return navigateTab(tabId, fallbackUrl, agentConfig);
}

async function navigateTab(tabId: number, url: string, agentConfig?: AgentConfig): Promise<boolean> {
  try {
    await chrome.tabs.update(tabId, { url });
    const runtimeConfig = agentConfig ?? (await loadAgentConfig());
    const ready = await waitForTabReady(
      tabId,
      runtimeConfig.runtime.tabReadyTimeoutMs,
      runtimeConfig.runtime.tabPollIntervalMs,
      url
    );

    if (ready) {
      await showRunShellState(tabId, "executing");
    }

    return ready;
  } catch {
    return false;
  }
}

async function waitForTabReady(tabId: number, timeoutMs: number, pollIntervalMs: number, expectedUrl?: string): Promise<boolean> {
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

    await sleep(pollIntervalMs);
  }

  return false;
}

function isTransientExecutorError(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }

  return TRANSIENT_EXECUTOR_ERROR_PATTERNS.some((pattern) => errorMessage.includes(pattern));
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
  const successCount = items.filter((item) => item.ok).length;
  const lines: string[] = [];
  lines.push("Top Stories Digest");
  lines.push(`I reviewed ${successCount} of ${items.length} selected stories for: "${prompt}".`);
  lines.push("");
  lines.push("Highlights");

  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`   ${item.preview}`);
    lines.push(`   Source: ${item.url}`);
  });

  lines.push("");
  lines.push(`Execution: ${countOk(results)}/${results.length} actions completed`);
  if (results.some((result) => !result.ok)) {
    lines.push("Coverage note: some navigation/extraction steps failed, so this digest may be incomplete.");
  }

  return lines.join("\n");
}

function buildGmailSummary(
  prompt: string,
  items: Array<{ index: number; preview: string; ok: boolean }>,
  results: ActionExecutionResult[],
  requestedCount: number
): string {
  const prioritized = items.map((item) => {
    const category = inferEmailCategory(item.preview);
    const priority = inferEmailPriority(category);
    const headline = synthesizeEmailSummary(item.preview, category);
    const action = inferEmailAction(category);

    return {
      index: item.index,
      category,
      priority,
      headline,
      action
    };
  });

  const high = prioritized.filter((item) => item.priority === "High");
  const medium = prioritized.filter((item) => item.priority === "Medium");
  const low = prioritized.filter((item) => item.priority === "Low");

  const lines: string[] = [];
  lines.push("Inbox Snapshot");
  lines.push(
    `I processed ${items.length} of ${requestedCount} requested unread emails and extracted the key context from each message.`
  );
  lines.push(`Main themes: ${buildThemeSummary(prioritized)}.`);
  lines.push("");
  lines.push("Priority Emails");
  appendPriorityGroup(lines, "High", high);
  appendPriorityGroup(lines, "Medium", medium);
  appendPriorityGroup(lines, "Low", low);

  lines.push("");
  lines.push("Suggested Next Actions");
  const topActions = prioritized
    .map((item) => item.action)
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .slice(0, 4);

  if (topActions.length === 0) {
    lines.push("1. Review high-priority unread emails first.");
  } else {
    topActions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action}`);
    });
  }

  lines.push("");
  lines.push(`Run Stats: ${countOk(results)}/${results.length} actions OK`);
  if (items.length < requestedCount) {
    lines.push(`Note: fewer unread emails were available than requested (${items.length}/${requestedCount}).`);
  }
  if (results.some((result) => !result.ok)) {
    lines.push("Note: some actions failed during execution; summary may be partial.");
  }

  return lines.join("\n");
}

function appendPriorityGroup(
  lines: string[],
  label: "High" | "Medium" | "Low",
  items: Array<{ index: number; headline: string; action: string }>
): void {
  if (items.length === 0) {
    return;
  }

  lines.push(`- ${label}:`);
  items.forEach((item) => {
    lines.push(`  - Email ${item.index}: ${item.headline}`);
  });
}

function synthesizeEmailSummary(preview: string, category: EmailCategory): string {
  const normalized = preview.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No readable subject/body content.";
  }

  const amount = extractAmount(normalized);
  const date = extractDate(normalized);

  if (category === "security") {
    return "Security alert about a recent account/device login; verify whether the activity was legitimate.";
  }
  if (category === "billing") {
    const amountPart = amount ? ` for ${amount}` : "";
    const datePart = date ? ` on ${date}` : "";
    return `Billing receipt/invoice notification${amountPart}${datePart}.`;
  }
  if (category === "subscription") {
    return "Subscription confirmation/update with renewal or plan details.";
  }
  if (category === "travel") {
    return "Travel itinerary/check-in reminder with timing and route details.";
  }
  if (category === "event") {
    return "Event logistics message with attendance/check-in instructions.";
  }

  return compactSentence(normalized, 18);
}

type EmailCategory = "security" | "billing" | "subscription" | "travel" | "event" | "general";

function inferEmailCategory(preview: string): EmailCategory {
  const value = preview.toLowerCase();

  const securitySignals = ["security", "login", "suspicious", "new device", "verification", "paypal"];
  if (securitySignals.some((signal) => value.includes(signal))) {
    return "security";
  }

  const billingSignals = ["invoice", "receipt", "payment", "paid", "anthropic"];
  if (billingSignals.some((signal) => value.includes(signal))) {
    return "billing";
  }

  const subscriptionSignals = ["subscription", "subscribed", "plus", "renew"];
  if (subscriptionSignals.some((signal) => value.includes(signal))) {
    return "subscription";
  }

  const travelSignals = ["flight", "reservation", "booking", "check in", "check-in", "ryanair", "reserva", "vuelo"];
  if (travelSignals.some((signal) => value.includes(signal))) {
    return "travel";
  }

  const eventSignals = ["event", "hackeurope", "qr code", "check in at the event", "check-in at the event"];
  if (eventSignals.some((signal) => value.includes(signal))) {
    return "event";
  }

  return "general";
}

function inferEmailPriority(category: EmailCategory): "High" | "Medium" | "Low" {
  if (category === "security" || category === "billing") {
    return "High";
  }
  if (category === "travel" || category === "event" || category === "subscription") {
    return "Medium";
  }

  return "Low";
}

function inferEmailAction(category: EmailCategory): string {
  if (category === "security") {
    return "Verify account security alerts and confirm whether the login activity is expected.";
  }
  if (category === "billing") {
    return "Review payment receipts/invoices and archive confirmed billing notifications.";
  }
  if (category === "travel") {
    return "Confirm travel details and complete check-in requirements if still pending.";
  }
  if (category === "subscription") {
    return "Review subscription status and cancel/adjust plans if needed.";
  }
  if (category === "event") {
    return "Save the event logistics email and keep required QR/check-in materials ready.";
  }

  return "Scan remaining unread messages and reply where follow-up is required.";
}

function buildThemeSummary(
  items: Array<{ category: EmailCategory }>
): string {
  const counts = new Map<EmailCategory, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const ordered: EmailCategory[] = ["security", "billing", "subscription", "travel", "event", "general"];
  const parts: string[] = [];

  for (const category of ordered) {
    const count = counts.get(category) ?? 0;
    if (count === 0) {
      continue;
    }

    parts.push(`${count} ${category}`);
  }

  return parts.length > 0 ? parts.join(", ") : "no strong theme detected";
}

function extractAmount(value: string): string | null {
  const match = value.match(/\$\s?\d+(?:\.\d{2})?/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function extractDate(value: string): string | null {
  const monthDate = value.match(
    /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2},?\s+\d{4}\b/i
  );
  if (monthDate) {
    return monthDate[0];
  }

  const isoLike = value.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/);
  return isoLike ? isoLike[0] : null;
}

function compactSentence(value: string, maxWords: number): string {
  const firstSentence = value.split(/[.!?]/)[0]?.trim() ?? value;
  const sanitized = firstSentence
    .replace(/\b(download invoice|download receipt|view online|ver online)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = sanitized.split(" ").filter(Boolean);
  const compact = words.slice(0, maxWords).join(" ");
  if (!compact) {
    return "Unread email content was captured, but key details were limited.";
  }

  return compact.endsWith(".") ? compact : `${compact}.`;
}

function buildGenericSummary(
  prompt: string,
  pageTitle: string,
  pageUrl: string,
  results: ActionExecutionResult[]
): string {
  const text = getExtractedText(results);
  const summary = buildReadableHighlight(text, 80);
  if (!summary) {
    return `I could not extract enough readable content to answer "${prompt}" reliably.`;
  }

  return summary;
}

function buildReadOnlyDomFallbackSummary(
  prompt: string,
  pageTitle: string,
  pageUrl: string,
  pageContext: SubmitTaskMessage["payload"]["pageContext"]
): string {
  const bodySnippet = (pageContext.bodyTextSnippet ?? "").trim();
  if (!bodySnippet) {
    return `I couldn't find enough readable text on this page to answer "${prompt}" reliably yet.`;
  }

  return buildReadableHighlight(bodySnippet, 90);
}

function buildGenericTraversalSummary(
  prompt: string,
  visited: Array<{ title: string; url: string; preview: string; ok: boolean }>,
  results: ActionExecutionResult[],
  requestedCount: number
): string {
  const completed = visited.filter((item) => item.ok).length;
  const lines: string[] = [];
  lines.push(`I reviewed ${completed} of ${requestedCount} pages for "${prompt}".`);
  lines.push("");

  visited.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`   ${item.preview}`);
    lines.push(`   Source: ${item.url}`);
  });

  if (results.some((result) => !result.ok)) {
    lines.push("");
    lines.push("Some pages could not be fully processed, so coverage may be partial.");
  }

  return lines.join("\n");
}

function hasUsefulGenericPlannerOutcome(results: ActionExecutionResult[], targetCount: number): boolean {
  const successfulExtracts = countSuccessfulExtracts(results);
  if (successfulExtracts === 0) {
    return false;
  }

  if (targetCount <= 1) {
    return true;
  }

  const minimumExtracts = targetCount >= 3 ? 2 : 1;
  return successfulExtracts >= minimumExtracts;
}

function countSuccessfulExtracts(results: ActionExecutionResult[]): number {
  return results.filter((result) => result.type === "EXTRACT_TEXT" && result.ok && Boolean(result.data?.text)).length;
}

function rankGenericCandidates(items: ListedItem[], prompt: string, originUrl: string): ListedItem[] {
  const promptKeywords = extractPromptKeywords(prompt);
  const seen = new Set<string>();

  const scored = items
    .filter((item) => Boolean(item.href))
    .filter((item) => isLikelyNavigableUrl(item.href!, originUrl))
    .filter((item) => item.text.trim().length >= 8)
    .map((item) => {
      const href = item.href!;
      const text = item.text.trim();
      const dedupeKey = `${href}::${text.toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        return null;
      }
      seen.add(dedupeKey);

      return {
        ...item,
        score: scoreGenericCandidate(text, href, originUrl, promptKeywords)
      };
    })
    .filter((item): item is ListedItem & { score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score);

  return scored.map(({ score: _score, ...item }) => item);
}

function scoreGenericCandidate(text: string, href: string, originUrl: string, promptKeywords: string[]): number {
  const lowerText = text.toLowerCase();
  const lowerHref = href.toLowerCase();
  let score = 0;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  score += Math.min(wordCount, 12);

  for (const keyword of promptKeywords) {
    if (lowerText.includes(keyword)) {
      score += 4;
    }
    if (lowerHref.includes(keyword)) {
      score += 2;
    }
  }

  if (GENERIC_NAV_BLOCKLIST.some((pattern) => lowerText.includes(pattern) || lowerHref.includes(pattern))) {
    score -= 12;
  }

  try {
    const target = new URL(href);
    const origin = new URL(originUrl);
    if (target.hostname === origin.hostname) {
      score += 3;
    } else {
      score -= 1;
    }
  } catch {
    // Keep default score when URL parsing fails.
  }

  return score;
}

function isLikelyNavigableUrl(href: string, originUrl: string): boolean {
  const normalized = href.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (GENERIC_NAV_BLOCKLIST.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  if (normalized.startsWith("#")) {
    return false;
  }

  try {
    const target = new URL(href);
    const origin = new URL(originUrl);
    if (!["http:", "https:"].includes(target.protocol)) {
      return false;
    }

    if (target.href === origin.href) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function extractPromptKeywords(prompt: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "to",
    "of",
    "and",
    "on",
    "for",
    "with",
    "please",
    "summarize",
    "summary",
    "top",
    "recent",
    "latest",
    "last",
    "show",
    "me",
    "my"
  ]);

  const words = prompt.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return Array.from(new Set(words.filter((word) => word.length >= 3 && !stopWords.has(word)))).slice(0, 8);
}

function countOk(results: ActionExecutionResult[]): number {
  return results.filter((result) => result.ok).length;
}

function summarizeSnippet(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(No text extracted)";
  }

  return buildReadableHighlight(normalized, Math.max(20, Math.floor(maxChars / 8)));
}

function buildReadableHighlight(value: string, maxWords: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No readable text was extracted.";
  }

  const cleaned = normalized
    .replace(/\b(subscribe|sign in|log in|cookie policy|terms of use|privacy policy)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() ?? cleaned;
  const words = firstSentence.split(" ").filter(Boolean).slice(0, maxWords);
  const compact = words.join(" ").trim();

  if (!compact) {
    return "Readable text was extracted, but key details were limited.";
  }

  return compact.endsWith(".") ? compact : `${compact}.`;
}

function hasPageContextEvidence(pageContext: SubmitTaskMessage["payload"]["pageContext"]): boolean {
  return Boolean(
    pageContext.headings.length > 0 ||
      pageContext.candidates.length > 0 ||
      (pageContext.bodyTextSnippet ?? "").trim().length >= 80
  );
}

function normalizeAgentRunMode(rawMode: SubmitTaskMessage["payload"]["agentMode"]): AgentRunMode {
  return rawMode === "chat" ? "chat" : "agentic";
}

function normalizeSelectedImageInput(raw: SubmitTaskMessage["payload"]["selectedImage"]): SelectedImageInput | null {
  if (!raw || typeof raw.src !== "string") {
    return null;
  }

  const src = raw.src.trim();
  if (!src) {
    return null;
  }

  const alt = typeof raw.alt === "string" ? raw.alt.trim() : "";
  return { src, alt: alt || null };
}

function buildGeminiImagePrompt(userPrompt: string, altText: string | null, pageTitle: string, pageUrl: string): string {
  const trimmedPrompt = userPrompt.trim();
  const lines: string[] = [];
  lines.push("You are an expert visual analyst helping a user understand an image from a webpage.");
  lines.push(trimmedPrompt ? `User request: ${trimmedPrompt}` : "User request: Describe and analyze this image.");
  lines.push(`Page title: ${pageTitle}`);
  lines.push(`Page URL: ${pageUrl}`);
  if (altText) {
    lines.push(`Image alt text: ${altText}`);
  }
  lines.push("");
  lines.push("Instructions:");
  lines.push("- Focus exclusively on the meaningful visual content of the image (diagrams, photos, charts, illustrations, etc.).");
  lines.push("- NEVER reproduce or list website UI elements visible in the image such as navigation bars, menus, sidebars, language selectors, tabs, breadcrumbs, font-size controls, theme toggles, or table-of-contents listings.");
  lines.push("- If the image is a screenshot that includes browser or website chrome, ignore all UI/navigation elements and analyze only the primary content area.");
  lines.push("- Use the page title, URL, and alt text as strong contextual clues to identify people, events, or topics in the image.");
  lines.push("- Cross-reference visual details (clothing, setting, era, logos, text) with the page context to give an informed, specific answer.");
  lines.push("- Answer the user's specific question directly. Do not just describe the image generically.");
  lines.push("- Start directly with the answer in plain natural language.");
  lines.push("- Default format: 2-3 focused paragraphs.");
  lines.push("- If the user explicitly asks for bullets/table/JSON, follow that requested format.");
  lines.push("- Avoid template openers like 'Here is information about ...' or 'The image shows ...'.");
  lines.push("- If you cannot identify something with certainty, state your best inference based on context and note the uncertainty briefly.");
  return lines.join("\n");
}

function buildClaudeImagePrompt(userPrompt: string, altText: string | null, pageTitle: string, pageUrl: string): { system: string; user: string } {
  const trimmedPrompt = userPrompt.trim();

  const system = [
    "You are an expert visual analyst embedded in a browser extension.",
    "The user has selected an image on a webpage and is asking about it.",
    "You have access to the page context (title, URL, alt text) — use these as strong contextual signals to identify people, events, locations, and topics depicted in the image.",
    "Cross-reference visual details (clothing, setting, era, logos, visible text, body language) with the page context to produce specific, informed answers.",
    "CRITICAL: Focus exclusively on the meaningful visual content of the image (diagrams, photos, charts, illustrations, etc.).",
    "NEVER reproduce or list website UI elements visible in the image such as navigation bars, menus, sidebars, language selectors, tabs, breadcrumbs, font-size controls, theme toggles, or table-of-contents listings.",
    "If the image is a screenshot that includes browser or website chrome, completely ignore all UI/navigation elements and analyze only the primary content area.",
    "Do NOT give generic image descriptions. Connect what you see to the page's subject matter.",
    "Be direct and specific. Start with the answer, not a preamble.",
    "Default to 2-3 focused paragraphs. Use bullets/table/JSON only if the user asks for it.",
    "If unsure about a specific detail, state your best inference from context and note uncertainty in one short phrase."
  ].join("\n");

  const userLines: string[] = [];
  userLines.push(trimmedPrompt ? trimmedPrompt : "Analyze and explain this image in detail.");
  userLines.push("");
  userLines.push("Page context:");
  userLines.push(`- Title: ${pageTitle}`);
  userLines.push(`- URL: ${pageUrl}`);
  if (altText) {
    userLines.push(`- Image alt text: ${altText}`);
  }

  return { system, user: userLines.join("\n") };
}

async function resolveImagePayloadForGemini(
  imageSrc: string,
  pageUrl: string
): Promise<{ mimeType: string; imageBase64: string }> {
  const DATA_URL_REGEX = /^data:([^;,]+);base64,(.+)$/i;
  const MAX_IMAGE_BYTES = 7_500_000;

  const dataUrlMatch = imageSrc.match(DATA_URL_REGEX);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1].trim() || "image/png";
    const imageBase64 = dataUrlMatch[2].replace(/\s+/g, "");
    const estimatedBytes = Math.floor((imageBase64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      throw new Error("Selected image is too large for Gemini processing.");
    }
    return { mimeType, imageBase64 };
  }

  const imageUrl = toAbsoluteUrl(imageSrc, pageUrl);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch selected image (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("Selected image is empty.");
  }
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Selected image is too large for Gemini processing.");
  }

  const mimeType =
    normalizeImageMimeType(response.headers.get("content-type")) ??
    inferImageMimeTypeFromUrl(imageUrl) ??
    "image/jpeg";

  return {
    mimeType,
    imageBase64: arrayBufferToBase64(arrayBuffer)
  };
}

function toAbsoluteUrl(resourceUrl: string, baseUrl: string): string {
  try {
    return new URL(resourceUrl, baseUrl).toString();
  } catch {
    return resourceUrl;
  }
}

function normalizeImageMimeType(rawContentType: string | null): string | null {
  if (!rawContentType) {
    return null;
  }

  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase();
  if (!mimeType || !mimeType.startsWith("image/")) {
    return null;
  }

  return mimeType;
}

function inferImageMimeTypeFromUrl(imageUrl: string): string | null {
  const lower = imageUrl.toLowerCase();
  if (lower.includes(".png")) {
    return "image/png";
  }
  if (lower.includes(".webp")) {
    return "image/webp";
  }
  if (lower.includes(".gif")) {
    return "image/gif";
  }
  if (lower.includes(".svg")) {
    return "image/svg+xml";
  }
  if (lower.includes(".bmp")) {
    return "image/bmp";
  }
  if (lower.includes(".avif")) {
    return "image/avif";
  }
  if (lower.includes(".jpg") || lower.includes(".jpeg")) {
    return "image/jpeg";
  }

  return null;
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function parseRequestedCount(prompt: string): number {
  const match = parseExplicitCount(prompt);
  if (!match) {
    return DEFAULT_TARGET_COUNT;
  }

  return Math.max(1, Math.min(MAX_TARGET_COUNT, match));
}

function inferGenericTargetCount(prompt: string): number {
  const lower = prompt.toLowerCase();
  const listTaskHints = [
    "top ",
    "latest ",
    "recent ",
    "last ",
    "first ",
    "articles",
    "article",
    "posts",
    "post",
    "emails",
    "email",
    "links",
    "link",
    "threads",
    "thread",
    "stories",
    "story",
    "news"
  ];
  const isListTask = listTaskHints.some((hint) => lower.includes(hint));

  const explicitCount = parseExplicitCount(prompt);
  if (explicitCount && isListTask) {
    return Math.max(1, Math.min(MAX_TARGET_COUNT, explicitCount));
  }

  if (isListTask) {
    return DEFAULT_TARGET_COUNT;
  }

  return 1;
}

function shouldRunGenericTraversal(prompt: string, targetCount: number): boolean {
  if (targetCount > 1) {
    return true;
  }

  const lower = prompt.toLowerCase();
  const traversalHints = ["summarize top", "summarize recent", "summarize latest", "summarize first", "summarize last"];
  return traversalHints.some((hint) => lower.includes(hint));
}

function parseExplicitCount(prompt: string): number | null {
  const match = prompt.match(/(\d+)/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isHackerNewsTask(prompt: string, pageUrl: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  return (
    pageUrl.includes("news.ycombinator.com") ||
    lowerPrompt.includes("hacker news") ||
    lowerPrompt.includes("hackernews") ||
    lowerPrompt.includes("hack news") ||
    /\bhn\b/.test(lowerPrompt)
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

function detectHardcodedTask(prompt: string, pageUrl: string): "hackernews" | "gmail" | null {
  if (isHackerNewsTask(prompt, pageUrl)) {
    return "hackernews";
  }

  if (isGmailTask(prompt, pageUrl)) {
    return "gmail";
  }

  return null;
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
  const warnings = results.some((result) => !result.ok) ? ["Execution ended with failures."] : [];
  return {
    ok: false,
    payload: {
      state: "error",
      error,
      results,
      partial: results.length > 0,
      warnings
    }
  };
}

function toSuccess(summary: string, results: ActionExecutionResult[], warnings: string[] = []): SubmitTaskResponse {
  const runtimeWarnings = [...warnings];
  if (results.some((result) => !result.ok) && !runtimeWarnings.some((warning) => warning.includes("failed"))) {
    runtimeWarnings.push("Some actions failed.");
  }

  return {
    ok: true,
    payload: {
      state: "done",
      summary,
      results,
      partial: runtimeWarnings.length > 0,
      warnings: unique(runtimeWarnings)
    }
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pushUiResult(tabId: number, response: SubmitTaskResponse, elapsedMs: number): Promise<void> {
  const message: ShowResultMessage = {
    type: "ui/show-result",
    payload: {
      ok: response.ok,
      summary: response.payload.summary,
      error: response.payload.error,
      results: response.payload.results ?? [],
      elapsedMs,
      partial: response.payload.partial,
      warnings: response.payload.warnings
    }
  };

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return;
  } catch (error: unknown) {
    if (!isNoReceiverError(error)) {
      return;
    }
  }

  const injected = await injectContentScript(tabId);
  if (!injected) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Best effort only.
  }
}

async function showRunShellState(tabId: number, state: UIState): Promise<void> {
  await sendUiControlMessage(tabId, { type: "ui/open-command-bar" });
  await sendUiControlMessage(tabId, {
    type: "ui/set-command-state",
    payload: { state }
  });
}

async function sendUiControlMessage(
  tabId: number,
  message: Extract<RuntimeMessage, { type: "ui/open-command-bar" | "ui/set-command-state" }>
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return;
  } catch (error: unknown) {
    if (!isNoReceiverError(error)) {
      return;
    }
  }

  const injected = await injectContentScript(tabId);
  if (!injected) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Best effort only.
  }
}
