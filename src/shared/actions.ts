export const ACTION_TYPES = [
  "LIST_ITEMS",
  "CLICK",
  "OPEN_IN_SAME_TAB",
  "WAIT_FOR",
  "EXTRACT_TEXT",
  "BACK",
  "SCROLL",
  "DONE"
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type TargetSpec = {
  selectors?: string[];
  textIncludes?: string;
  index?: number;
  url?: string;
};

export type ActionBase = {
  id: string;
  type: ActionType;
  reason?: string;
  target?: TargetSpec;
};

export type ListItemsAction = ActionBase & {
  type: "LIST_ITEMS";
  params?: {
    limit?: number;
  };
};

export type ClickAction = ActionBase & {
  type: "CLICK";
};

export type OpenInSameTabAction = ActionBase & {
  type: "OPEN_IN_SAME_TAB";
};

export type WaitForAction = ActionBase & {
  type: "WAIT_FOR";
  params?: {
    timeoutMs?: number;
  };
};

export type ExtractTextAction = ActionBase & {
  type: "EXTRACT_TEXT";
  params?: {
    maxChars?: number;
  };
};

export type BackAction = ActionBase & {
  type: "BACK";
  params?: {
    waitMs?: number;
  };
};

export type ScrollAction = ActionBase & {
  type: "SCROLL";
  params?: {
    top?: number;
    left?: number;
    behavior?: ScrollBehavior;
  };
};

export type DoneAction = ActionBase & {
  type: "DONE";
  params?: {
    message?: string;
  };
};

export type AgentAction =
  | ListItemsAction
  | ClickAction
  | OpenInSameTabAction
  | WaitForAction
  | ExtractTextAction
  | BackAction
  | ScrollAction
  | DoneAction;

export type ListedItem = {
  text: string;
  href?: string;
};

export type ActionExecutionResult = {
  actionId: string;
  type: ActionType;
  ok: boolean;
  attempts: number;
  durationMs: number;
  data?: {
    text?: string;
    items?: ListedItem[];
    selectorUsed?: string;
    url?: string;
    pageTitle?: string;
    headings?: string[];
    candidates?: string[];
  };
  error?: string;
};

export type ExecutionLimits = {
  maxActionsPerBatch: number;
  maxActionTimeoutMs: number;
  maxWaitForMs: number;
  maxExtractChars: number;
  maxRetriesPerAction: number;
};

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxActionsPerBatch: 8,
  maxActionTimeoutMs: 2500,
  maxWaitForMs: 3000,
  maxExtractChars: 9000,
  maxRetriesPerAction: 1
};

type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export function parseActionBatch(input: unknown, maxActions = DEFAULT_EXECUTION_LIMITS.maxActionsPerBatch): ValidationResult<AgentAction[]> {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Action batch must be an array" };
  }

  if (input.length === 0) {
    return { ok: false, error: "Action batch cannot be empty" };
  }

  if (input.length > maxActions) {
    return { ok: false, error: `Action batch exceeds max actions (${maxActions})` };
  }

  const parsed: AgentAction[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const validation = parseAction(input[index], index);
    if (!validation.ok) {
      return validation;
    }

    parsed.push(validation.value);
  }

  return {
    ok: true,
    value: parsed
  };
}

function parseAction(input: unknown, index: number): ValidationResult<AgentAction> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: `Action at index ${index} must be an object`
    };
  }

  if (typeof input.id !== "string" || input.id.length === 0) {
    return {
      ok: false,
      error: `Action at index ${index} has invalid id`
    };
  }

  if (typeof input.type !== "string" || !ACTION_TYPES.includes(input.type as ActionType)) {
    return {
      ok: false,
      error: `Action ${input.id} has unsupported type`
    };
  }

  const actionType = input.type as ActionType;

  if (input.target !== undefined) {
    const targetValidation = parseTargetSpec(input.target, input.id);
    if (!targetValidation.ok) {
      return targetValidation;
    }
  }

  return {
    ok: true,
    value: input as AgentAction
  };
}

function parseTargetSpec(input: unknown, actionId: string): ValidationResult<TargetSpec> {
  if (!isRecord(input)) {
    return { ok: false, error: `Action ${actionId} target must be an object` };
  }

  if (input.selectors !== undefined) {
    if (!Array.isArray(input.selectors) || input.selectors.some((item) => typeof item !== "string" || item.length === 0)) {
      return { ok: false, error: `Action ${actionId} target.selectors must be a string array` };
    }
  }

  if (input.textIncludes !== undefined && typeof input.textIncludes !== "string") {
    return { ok: false, error: `Action ${actionId} target.textIncludes must be a string` };
  }

  if (input.index !== undefined && (typeof input.index !== "number" || !Number.isInteger(input.index) || input.index < 0)) {
    return { ok: false, error: `Action ${actionId} target.index must be a non-negative integer` };
  }

  if (input.url !== undefined && typeof input.url !== "string") {
    return { ok: false, error: `Action ${actionId} target.url must be a string` };
  }

  return {
    ok: true,
    value: input as TargetSpec
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
