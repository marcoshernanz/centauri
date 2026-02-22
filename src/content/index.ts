import { parseActionBatch } from "../shared/actions";
import type {
  ExecuteActionsMessage,
  ExecuteActionsResponse,
  RuntimeMessage,
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
  commandBar.setState("planning");
  await sleep(120);

  commandBar.setState("executing");

  const response = await chrome.runtime.sendMessage<SubmitTaskMessage, SubmitTaskResponse>({
    type: "agent/submit-task",
    payload: {
      prompt,
      pageUrl: window.location.href,
      pageTitle: document.title
    }
  });

  commandBar.setState("summarizing");
  await sleep(100);

  if (!response?.ok) {
    commandBar.setState("error");
    commandBar.setOutput(response?.payload.error ?? "Task failed.");
    return;
  }

  commandBar.setState("done");
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

  const lines: string[] = [];
  lines.push(`Run: ${elapsedSeconds}s | Actions: ${okCount}/${results.length} OK${failCount > 0 ? ` (${failCount} failed)` : ""}`);
  lines.push("");
  lines.push(response.payload.summary ?? "No summary returned.");
  return lines.join("\n");
}
