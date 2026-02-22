declare const __NWA_OPENAI_API_KEY__: string | undefined;
declare const __NWA_OPENAI_MODEL__: string | undefined;
declare const __NWA_OPENAI_MAX_TOKENS__: string | undefined;

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_PLANNER_MAX_ITERATIONS = 4;
const DEFAULT_PLANNER_MAX_ACTIONS = 4;
const DEFAULT_PLANNER_MAX_TOKENS = 700;
const DEFAULT_SUMMARY_MAX_TOKENS = 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 2600;
const DEFAULT_WAIT_TIMEOUT_MS = 2400;
const DEFAULT_TAB_READY_TIMEOUT_MS = 4500;
const DEFAULT_TAB_POLL_INTERVAL_MS = 90;
const DEFAULT_EXECUTOR_RETRY_ATTEMPTS = 1;
const DEFAULT_PLANNER_REPAIR_ATTEMPTS = 1;

const OPENAI_CHAT_COMPLETIONS_ENDPOINT = "https://api.openai.com/v1/chat/completions";

type RawAgentConfig = {
  claude?: {
    model?: unknown;
    temperature?: unknown;
    plannerMaxIterations?: unknown;
    plannerMaxActions?: unknown;
    plannerMaxTokens?: unknown;
    summaryMaxTokens?: unknown;
  };
  runtime?: {
    actionTimeoutMs?: unknown;
    waitTimeoutMs?: unknown;
    tabReadyTimeoutMs?: unknown;
    tabPollIntervalMs?: unknown;
    executorRetryAttempts?: unknown;
  };
  reliability?: {
    plannerRepairAttempts?: unknown;
  };
};

export type AgentConfig = {
  claude: {
    model: string;
    temperature: number;
    plannerMaxIterations: number;
    plannerMaxActions: number;
    plannerMaxTokens: number;
    summaryMaxTokens: number;
  };
  runtime: {
    actionTimeoutMs: number;
    waitTimeoutMs: number;
    tabReadyTimeoutMs: number;
    tabPollIntervalMs: number;
    executorRetryAttempts: number;
  };
  reliability: {
    plannerRepairAttempts: number;
  };
};

export type ClaudeConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokensCap: number | null;
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string } | null> | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

class OpenAIRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAIRequestError";
    this.status = status;
  }
}

let cachedAgentConfigPromise: Promise<AgentConfig> | null = null;

export async function loadAgentConfig(): Promise<AgentConfig> {
  if (!cachedAgentConfigPromise) {
    cachedAgentConfigPromise = fetchAgentConfig();
  }

  return cachedAgentConfigPromise;
}

export async function loadClaudeConfig(): Promise<ClaudeConfig | null> {
  const apiKey = (__NWA_OPENAI_API_KEY__ ?? "").trim();
  if (!apiKey) {
    return null;
  }

  const agentConfig = await loadAgentConfig();
  const envModel = (__NWA_OPENAI_MODEL__ ?? "").trim();
  const resolvedModel = resolveOpenAIModel(envModel, agentConfig.claude.model);

  return {
    apiKey,
    model: resolvedModel,
    temperature: agentConfig.claude.temperature,
    maxTokensCap: parseOptionalPositiveInt(__NWA_OPENAI_MAX_TOKENS__)
  };
}

// Kept for compatibility with the rest of the codebase (planner/summarizer/chat callers).
export async function callClaude(config: ClaudeConfig, system: string, user: string, maxTokens = 900): Promise<string> {
  const effectiveMaxTokens = applyMaxTokenCap(maxTokens, config.maxTokensCap);

  try {
    return await callOpenAIWithModel(config, config.model, system, user, effectiveMaxTokens);
  } catch (error: unknown) {
    // If a custom model fails (deprecated/invalid), retry once with a safe default.
    if (config.model !== DEFAULT_MODEL) {
      return callOpenAIWithModel(config, DEFAULT_MODEL, system, user, effectiveMaxTokens);
    }

    throw error;
  }
}

async function callOpenAIWithModel(
  config: ClaudeConfig,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const variants: Array<{ tokenField: "max_tokens" | "max_completion_tokens"; includeTemperature: boolean }> = [
    { tokenField: "max_tokens", includeTemperature: true },
    { tokenField: "max_completion_tokens", includeTemperature: true },
    { tokenField: "max_tokens", includeTemperature: false },
    { tokenField: "max_completion_tokens", includeTemperature: false }
  ];

  let lastError: unknown = null;

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];

    try {
      return await requestOpenAIChatCompletion(config, model, system, user, maxTokens, variant);
    } catch (error: unknown) {
      lastError = error;

      if (index === variants.length - 1) {
        throw error;
      }

      if (!shouldTryParameterVariantFallback(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenAI request failed");
}

async function requestOpenAIChatCompletion(
  config: ClaudeConfig,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  variant: { tokenField: "max_tokens" | "max_completion_tokens"; includeTemperature: boolean }
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };

  body[variant.tokenField] = Math.max(1, Math.round(maxTokens));

  if (variant.includeTemperature) {
    body.temperature = config.temperature;
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const payload = (await parseJsonSafely(response)) as OpenAIChatCompletionResponse | null;

  if (!response.ok) {
    const message = payload?.error?.message?.trim() || `OpenAI API request failed (${response.status})`;
    throw new OpenAIRequestError(message, response.status);
  }

  const text = extractOpenAIResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned empty content");
  }

  return text;
}

function extractOpenAIResponseText(payload: OpenAIChatCompletionResponse | null): string {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .filter(Boolean)
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
    return joined;
  }

  return "";
}

async function parseJsonSafely(response: Response): Promise<unknown | null> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function shouldTryParameterVariantFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("unsupported parameter") ||
    message.includes("unknown parameter") ||
    message.includes("temperature") ||
    message.includes("max_tokens") ||
    message.includes("max_completion_tokens")
  );
}

function applyMaxTokenCap(requestedMaxTokens: number, cap: number | null): number {
  const requested = Math.max(1, Math.round(Number.isFinite(requestedMaxTokens) ? requestedMaxTokens : 1));
  if (cap == null) {
    return requested;
  }

  return Math.max(1, Math.min(requested, cap));
}

function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveOpenAIModel(envModel: string, configuredModel: string): string {
  if (envModel) {
    return envModel;
  }

  const normalizedConfigured = configuredModel.trim();
  if (!normalizedConfigured) {
    return DEFAULT_MODEL;
  }

  // Existing repos may still keep an Anthropic model id in agent.config.json.
  if (normalizedConfigured.toLowerCase().includes("claude")) {
    return DEFAULT_MODEL;
  }

  return normalizedConfigured;
}

async function fetchAgentConfig(): Promise<AgentConfig> {
  const defaults: AgentConfig = {
    claude: {
      model: DEFAULT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      plannerMaxIterations: DEFAULT_PLANNER_MAX_ITERATIONS,
      plannerMaxActions: DEFAULT_PLANNER_MAX_ACTIONS,
      plannerMaxTokens: DEFAULT_PLANNER_MAX_TOKENS,
      summaryMaxTokens: DEFAULT_SUMMARY_MAX_TOKENS
    },
    runtime: {
      actionTimeoutMs: DEFAULT_ACTION_TIMEOUT_MS,
      waitTimeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
      tabReadyTimeoutMs: DEFAULT_TAB_READY_TIMEOUT_MS,
      tabPollIntervalMs: DEFAULT_TAB_POLL_INTERVAL_MS,
      executorRetryAttempts: DEFAULT_EXECUTOR_RETRY_ATTEMPTS
    },
    reliability: {
      plannerRepairAttempts: DEFAULT_PLANNER_REPAIR_ATTEMPTS
    }
  };

  try {
    const response = await fetch(chrome.runtime.getURL("agent.config.json"));
    if (!response.ok) {
      return defaults;
    }

    const raw = (await response.json()) as RawAgentConfig;
    return mergeWithDefaults(raw, defaults);
  } catch {
    return defaults;
  }
}

function mergeWithDefaults(raw: RawAgentConfig, defaults: AgentConfig): AgentConfig {
  const configuredModel =
    typeof raw.claude?.model === "string" && raw.claude.model.trim() ? raw.claude.model.trim() : defaults.claude.model;

  return {
    claude: {
      model: configuredModel,
      temperature: sanitizeNumber(raw.claude?.temperature, defaults.claude.temperature, 0, 1),
      plannerMaxIterations: sanitizeInt(raw.claude?.plannerMaxIterations, defaults.claude.plannerMaxIterations, 1, 8),
      plannerMaxActions: sanitizeInt(raw.claude?.plannerMaxActions, defaults.claude.plannerMaxActions, 1, 8),
      plannerMaxTokens: sanitizeInt(raw.claude?.plannerMaxTokens, defaults.claude.plannerMaxTokens, 200, 2000),
      summaryMaxTokens: sanitizeInt(raw.claude?.summaryMaxTokens, defaults.claude.summaryMaxTokens, 200, 4000)
    },
    runtime: {
      actionTimeoutMs: sanitizeInt(raw.runtime?.actionTimeoutMs, defaults.runtime.actionTimeoutMs, 800, 6000),
      waitTimeoutMs: sanitizeInt(raw.runtime?.waitTimeoutMs, defaults.runtime.waitTimeoutMs, 800, 6000),
      tabReadyTimeoutMs: sanitizeInt(raw.runtime?.tabReadyTimeoutMs, defaults.runtime.tabReadyTimeoutMs, 1500, 9000),
      tabPollIntervalMs: sanitizeInt(raw.runtime?.tabPollIntervalMs, defaults.runtime.tabPollIntervalMs, 50, 350),
      executorRetryAttempts: sanitizeInt(raw.runtime?.executorRetryAttempts, defaults.runtime.executorRetryAttempts, 0, 3)
    },
    reliability: {
      plannerRepairAttempts: sanitizeInt(raw.reliability?.plannerRepairAttempts, defaults.reliability.plannerRepairAttempts, 0, 3)
    }
  };
}

function sanitizeInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}
