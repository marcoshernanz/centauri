import { CommandBar } from "./ui/commandBar";
import type { RuntimeMessage, SubmitTaskMessage, SubmitTaskResponse } from "../shared/messages";

const commandBar = new CommandBar(handleSubmitTask);

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type !== "ui/toggle-command-bar") {
    return;
  }

  commandBar.toggle();
});

async function handleSubmitTask(prompt: string): Promise<void> {
  commandBar.setState("planning");

  const planningDelay = sleep(150);
  await planningDelay;

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
  await sleep(150);

  if (!response?.ok) {
    commandBar.setState("error");
    commandBar.setOutput(response?.payload.error ?? "Task failed.");
    return;
  }

  commandBar.setState("done");
  commandBar.setOutput(response.payload.summary ?? "No summary returned.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
