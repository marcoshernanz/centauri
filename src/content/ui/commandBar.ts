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
  private readonly output: HTMLPreElement;
  private readonly form: HTMLFormElement;
  private isOpen = false;
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

    this.output = document.createElement("pre");
    this.output.className = "nwa-output";
    this.output.textContent = "";

    this.form.appendChild(this.input);
    this.form.appendChild(this.status);
    this.root.appendChild(this.form);
    this.root.appendChild(this.output);

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSubmit();
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
  }

  setOutput(text: string): void {
    this.output.textContent = text;
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
}
