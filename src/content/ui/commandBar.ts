import type { ActionExecutionResult } from "../../shared/actions";
import type { UIState } from "../../shared/messages";

type SubmitHandler = (prompt: string) => Promise<void>;

const STATE_LABEL: Record<UIState, string> = {
  idle: "Ready",
  planning: "Planning...",
  executing: "Executing...",
  summarizing: "Summarizing...",
  done: "Done",
  error: "Error"
};

export class CommandBar {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly status: HTMLSpanElement;
  private readonly hint: HTMLSpanElement;
  private readonly progress: HTMLDivElement;
  private readonly output: HTMLPreElement;
  private readonly traceToggle: HTMLButtonElement;
  private readonly trace: HTMLPreElement;
  private readonly form: HTMLFormElement;
  private isOpen = false;
  private traceVisible = false;
  private onSubmit: SubmitHandler;

  constructor(onSubmit: SubmitHandler) {
    this.onSubmit = onSubmit;

    this.root = document.createElement("div");
    this.root.className = "nwa-root nwa-hidden";

    this.form = document.createElement("form");
    this.form.className = "nwa-form";

    this.input = document.createElement("input");
    this.input.className = "nwa-input";
    this.input.placeholder = "Describe a task...";
    this.input.autocomplete = "off";

    this.status = document.createElement("span");
    this.status.className = "nwa-status";
    this.status.textContent = STATE_LABEL.idle;

    this.hint = document.createElement("span");
    this.hint.className = "nwa-hint";
    this.hint.textContent = "Enter to run | Esc to close";

    const progressTrack = document.createElement("div");
    progressTrack.className = "nwa-progress-track";
    this.progress = document.createElement("div");
    this.progress.className = "nwa-progress";
    progressTrack.appendChild(this.progress);

    this.output = document.createElement("pre");
    this.output.className = "nwa-output";
    this.output.textContent = "";

    this.traceToggle = document.createElement("button");
    this.traceToggle.type = "button";
    this.traceToggle.className = "nwa-trace-toggle nwa-hidden";
    this.traceToggle.textContent = "Show Steps";
    this.traceToggle.addEventListener("click", () => {
      this.traceVisible = !this.traceVisible;
      this.trace.classList.toggle("nwa-hidden", !this.traceVisible);
      this.traceToggle.textContent = this.traceVisible ? "Hide Steps" : "Show Steps";
    });

    this.trace = document.createElement("pre");
    this.trace.className = "nwa-trace nwa-hidden";
    this.trace.textContent = "";

    this.form.appendChild(this.input);
    this.form.appendChild(this.status);
    this.root.appendChild(this.form);
    this.root.appendChild(progressTrack);
    this.root.appendChild(this.output);
    this.root.appendChild(this.traceToggle);
    this.root.appendChild(this.trace);
    this.root.appendChild(this.hint);

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSubmit();
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    document.documentElement.appendChild(this.root);
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }

    this.open();
  }

  open(): void {
    this.isOpen = true;
    this.root.classList.remove("nwa-hidden");
    this.input.focus();
    this.input.select();
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.add("nwa-hidden");
  }

  setState(state: UIState): void {
    this.status.textContent = STATE_LABEL[state];
    this.root.dataset.state = state;
    this.progress.style.width = `${this.getProgressPercent(state)}%`;
  }

  setOutput(text: string): void {
    this.output.textContent = text;
  }

  clearOutput(): void {
    this.output.textContent = "";
  }

  clearTrace(): void {
    this.trace.textContent = "";
    this.traceVisible = false;
    this.trace.classList.add("nwa-hidden");
    this.traceToggle.classList.add("nwa-hidden");
    this.traceToggle.textContent = "Show Steps";
  }

  setTrace(results: ActionExecutionResult[]): void {
    if (results.length === 0) {
      this.clearTrace();
      return;
    }

    const lines = results.map((result, index) => {
      const status = result.ok ? "OK" : "FAIL";
      const selector = result.data?.selectorUsed ? ` | selector=${result.data.selectorUsed}` : "";
      const error = result.error ? ` | error=${result.error}` : "";
      return `${index + 1}. ${result.type} -> ${status} (${result.durationMs}ms, attempts=${result.attempts})${selector}${error}`;
    });

    this.trace.textContent = lines.join("\n");
    this.traceToggle.classList.remove("nwa-hidden");
  }

  private async handleSubmit(): Promise<void> {
    const prompt = this.input.value.trim();
    if (!prompt) {
      this.setState("error");
      this.setOutput("Prompt cannot be empty.");
      return;
    }

    await this.onSubmit(prompt);
  }

  private getProgressPercent(state: UIState): number {
    switch (state) {
      case "idle":
        return 0;
      case "planning":
        return 24;
      case "executing":
        return 68;
      case "summarizing":
        return 88;
      case "done":
        return 100;
      case "error":
        return 100;
      default:
        return 0;
    }
  }
}
