declare const __NWA_ANTHROPIC_API_KEY__: string | undefined;

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";
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

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

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
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
  error?: {
    message?: string;
  };
};

let cachedAgentConfigPromise: Promise<AgentConfig> | null = null;

export async function loadAgentConfig(): Promise<AgentConfig> {
  if (!cachedAgentConfigPromise) {
    cachedAgentConfigPromise = fetchAgentConfig();
  }

  return cachedAgentConfigPromise;
}

export async function loadClaudeConfig(): Promise<ClaudeConfig | null> {
  const apiKey = (__NWA_ANTHROPIC_API_KEY__ ?? "").trim();
  if (!apiKey) {
    return null;
  }

  const agentConfig = await loadAgentConfig();

  return {
    apiKey,
    model: agentConfig.claude.model,
    temperature: agentConfig.claude.temperature
  };
}

export async function callClaude(config: ClaudeConfig, system: string, user: string, maxTokens = 900): Promise<string> {
  try {
    return await callClaudeWithModel(config, config.model, system, user, maxTokens);
  } catch (error: unknown) {
    // If a custom model fails (e.g. deprecated/invalid), retry once with a stable default.
    if (config.model !== DEFAULT_MODEL) {
      return callClaudeWithModel(config, DEFAULT_MODEL, system, user, maxTokens);
    }

    throw error;
  }
}

async function callClaudeWithModel(
  config: ClaudeConfig,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": config.apiKey
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: config.temperature,
      system,
      messages: [
        {
          role: "user",
          content: user
        }
      ]
    })
  });

  const payload = (await response.json()) as AnthropicResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Claude API request failed (${response.status})`);
  }

  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude returned empty content");
  }

  return text;
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
  const configuredModel = typeof raw.claude?.model === "string" && raw.claude.model.trim() ? raw.claude.model.trim() : defaults.claude.model;

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
