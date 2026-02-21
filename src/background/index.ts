import type { RuntimeMessage, SubmitTaskMessage, SubmitTaskResponse } from "../shared/messages";

const TOGGLE_COMMAND = "toggle-command-bar";

chrome.commands.onCommand.addListener(async (command: string) => {
  if (command !== TOGGLE_COMMAND) {
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: "ui/toggle-command-bar" });
  } catch (error) {
    console.error("Failed to send toggle message to content script", error);
  }
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response: SubmitTaskResponse) => void) => {
    if (message.type !== "agent/submit-task") {
      return;
    }

    void handleSubmit(message)
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

async function handleSubmit(message: SubmitTaskMessage): Promise<SubmitTaskResponse> {
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

  // Temporary mocked state sequence for T03.
  await sleep(300);
  await sleep(350);
  await sleep(300);

  return {
    ok: true,
    payload: {
      state: "done",
      summary: [
        "Mock run completed.",
        `Prompt: ${trimmedPrompt}`,
        `Page: ${message.payload.pageTitle} (${message.payload.pageUrl})`
      ].join("\n")
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
