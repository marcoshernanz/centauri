import type { ActionExecutionResult, AgentAction, ExecutionLimits } from "./actions";

export type UIState = "idle" | "planning" | "executing" | "summarizing" | "done" | "error";
export type InteractionMode = "agent" | "chat";

export type PageContextSnapshot = {
  urlPath: string;
  headings: string[];
  candidates: string[];
};

export type ToggleCommandBarMessage = {
  type: "ui/toggle-command-bar";
};

export type OpenCommandBarMessage = {
  type: "ui/open-command-bar";
};

export type SetCommandStateMessage = {
  type: "ui/set-command-state";
  payload: {
    state: UIState;
  };
};

export type ShowResultMessage = {
  type: "ui/show-result";
  payload: {
    ok: boolean;
    mode?: InteractionMode;
    summary?: string;
    error?: string;
    results?: ActionExecutionResult[];
    elapsedMs?: number;
    partial?: boolean;
    warnings?: string[];
  };
};

export type SubmitTaskMessage = {
  type: "agent/submit-task";
  payload: {
    prompt: string;
    agentMode?: boolean;
    pageUrl: string;
    pageTitle: string;
    pageContext: PageContextSnapshot;
  };
};

export type SubmitTaskResponse = {
  ok: boolean;
  payload: {
    state: UIState;
    mode?: InteractionMode;
    summary?: string;
    error?: string;
    results?: ActionExecutionResult[];
    partial?: boolean;
    warnings?: string[];
  };
};

export type ExecuteActionsMessage = {
  type: "executor/execute-actions";
  payload: {
    runId: string;
    actions: AgentAction[];
    limits?: Partial<ExecutionLimits>;
  };
};

export type ExecuteActionsResponse = {
  ok: boolean;
  payload: {
    results: ActionExecutionResult[];
    error?: string;
  };
};

export type RuntimeMessage =
  | ToggleCommandBarMessage
  | OpenCommandBarMessage
  | SetCommandStateMessage
  | ShowResultMessage
  | SubmitTaskMessage
  | ExecuteActionsMessage;
