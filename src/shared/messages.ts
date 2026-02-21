import type { ActionExecutionResult, AgentAction, ExecutionLimits } from "./actions";

export type UIState = "idle" | "planning" | "executing" | "summarizing" | "done" | "error";

export type ToggleCommandBarMessage = {
  type: "ui/toggle-command-bar";
};

export type SubmitTaskMessage = {
  type: "agent/submit-task";
  payload: {
    prompt: string;
    pageUrl: string;
    pageTitle: string;
  };
};

export type SubmitTaskResponse = {
  ok: boolean;
  payload: {
    state: UIState;
    summary?: string;
    error?: string;
    results?: ActionExecutionResult[];
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

export type RuntimeMessage = ToggleCommandBarMessage | SubmitTaskMessage | ExecuteActionsMessage;
