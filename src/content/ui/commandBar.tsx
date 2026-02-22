import { createRoot, type Root } from "react-dom/client";
import type { ActionExecutionResult } from "../../shared/actions";
import type { UIState } from "../../shared/messages";
import { ShellApp, type CompletedTaskModel, type MenuOption, type ShellCallbacks, type ShellViewModel } from "./shell";

type SubmitHandler = (prompt: string) => Promise<void>;
declare const __NWA_ELEVENLABS_API_KEY__: string;
declare const __NWA_ELEVENLABS_VOICE_ID__: string;
declare const __NWA_ELEVENLABS_SPEECH_PROFILE__: string;

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: {
    transcript?: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionInstanceLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtorLike = new () => SpeechRecognitionInstanceLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtorLike;
  webkitSpeechRecognition?: SpeechRecognitionCtorLike;
};

const HOST_ID = "nwa-shell-host";
const MAX_COMPLETED_TASKS = 8;

const STATUS_LABEL: Record<UIState, string> = {
  idle: "Ready",
  planning: "Planning",
  executing: "Executing",
  summarizing: "Summarizing",
  done: "Completed",
  error: "Error"
};

const MENU_OPTIONS: MenuOption[] = [
  { label: "Auto", value: "auto" },
  { label: "Max", value: "max" },
  { label: "Search", value: "search" },
  { label: "Plan", value: "plan" }
];

export class CommandBar {
  private readonly host: HTMLDivElement;
  private readonly root: Root;
  private readonly onSubmit: SubmitHandler;

  private isOpen = false;
  private state: UIState = "idle";
  private promptDraft = "";
  private rawOutput = "";
  private summary: string | null = null;
  private findings: string[] = [];
  private traceResults: ActionExecutionResult[] = [];
  private completedTasks: CompletedTaskModel[] = [];
  private activePrompt: string | null = null;
  private lastSubmittedPrompt = "";
  private pinned = false;
  private collapsed = false;
  private position: { left?: number; bottom?: number } = {};
  private readonly micSupported: boolean;
  private readonly ttsSupported: boolean;
  private readonly elevenlabsApiKey: string;
  private readonly elevenlabsVoiceId: string;
  private readonly elevenlabsSpeechProfile: string;
  private micActive = false;
  private micBusy = false;
  private ttsActive = false;
  private ttsBusy = false;
  private speechRecognition: SpeechRecognitionInstanceLike | null = null;
  private speechBasePrompt = "";
  private ttsAudio: HTMLAudioElement | null = null;
  private ttsAudioUrl: string | null = null;
  private ttsAbortController: AbortController | null = null;
  private ttsRequestId = 0;

  constructor(onSubmit: SubmitHandler) {
    this.onSubmit = onSubmit;
    this.micSupported = Boolean(this.getSpeechRecognitionCtor());
    this.elevenlabsApiKey = __NWA_ELEVENLABS_API_KEY__ ?? "";
    this.elevenlabsVoiceId = __NWA_ELEVENLABS_VOICE_ID__ ?? "";
    this.elevenlabsSpeechProfile = __NWA_ELEVENLABS_SPEECH_PROFILE__ ?? "eleven_multilingual_v2";
    this.ttsSupported = this.elevenlabsApiKey.trim().length > 0 && this.elevenlabsVoiceId.trim().length > 0;

    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.host.style.position = "fixed";
    this.host.style.inset = "0";
    this.host.style.zIndex = "2147483646";
    this.host.style.pointerEvents = "none";

    const shadow = this.host.attachShadow({ mode: "open" });
    const mountNode = document.createElement("div");
    mountNode.style.pointerEvents = "auto";
    shadow.appendChild(mountNode);

    document.documentElement.appendChild(this.host);
    this.root = createRoot(mountNode);

    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (!this.isOpen || event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      this.close();
    });

    this.render();
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
    this.render();
  }

  close(): void {
    this.stopMicCapture();
    this.stopSpeechOutput();
    this.isOpen = false;
    this.pinned = false;
    this.collapsed = false;
    this.render();
  }

  setState(state: UIState): void {
    this.state = state;
    this.render();
  }

  setOutput(text: string): void {
    if (this.ttsActive || this.ttsBusy) {
      this.stopSpeechOutput();
    }
    this.rawOutput = text;
    this.recomputeOutputPresentation();
    this.render();
  }

  clearOutput(): void {
    if (this.ttsActive || this.ttsBusy) {
      this.stopSpeechOutput();
    }
    this.rawOutput = "";
    this.summary = null;
    this.findings = [];
    this.render();
  }

  setTrace(results: ActionExecutionResult[]): void {
    this.traceResults = results;
    this.recomputeOutputPresentation();
    this.render();
  }

  clearTrace(): void {
    this.traceResults = [];
    this.recomputeOutputPresentation();
    this.render();
  }

  private recomputeOutputPresentation(): void {
    const normalized = this.rawOutput.trim();
    if (!normalized) {
      this.summary = null;
      this.findings = this.buildTraceFindingLines(this.traceResults);
      return;
    }

    const lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const summaryLines: string[] = [];
    const warnings: string[] = [];

    for (const line of lines) {
      if (line.startsWith("Warning:")) {
        warnings.push(line.replace(/^Warning:\s*/, ""));
        continue;
      }

      if (line.startsWith("Status:")) {
        if (line.toLowerCase().includes("partial")) {
          warnings.push("Partial result");
        }
        continue;
      }

      if (line.startsWith("Run:")) {
        continue;
      }

      summaryLines.push(line);
    }

    this.summary = this.prettifySummaryText(summaryLines.join("\n").trim() || normalized);

    const traceFindings = this.buildTraceFindingLines(this.traceResults);
    this.findings = [...warnings, ...traceFindings];
  }

  private buildTraceFindingLines(results: ActionExecutionResult[]): string[] {
    if (results.length === 0) {
      return [];
    }

    const okCount = results.filter((result) => result.ok).length;
    const failCount = results.length - okCount;
    const traceSummary = `Actions: ${okCount}/${results.length} completed${failCount > 0 ? ` (${failCount} failed)` : ""}`;
    return [traceSummary];
  }

  private prettifySummaryText(value: string): string {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) {
      return value;
    }

    return compact
      .replace(/\s+(\d+\.\s+)/g, "\n$1")
      .replace(/\s+(Source:\s+https?:\/\/)/gi, "\n$1")
      .replace(/\s+(Execution:\s+)/gi, "\n\n$1")
      .replace(/\s+(Run Stats:\s+)/gi, "\n\n$1")
      .replace(/\s+(Suggested Next Actions)/gi, "\n\n$1")
      .replace(/\s+(Priority Emails)/gi, "\n\n$1")
      .trim();
  }

  private getShellViewModel(): ShellViewModel {
    const statusText = STATUS_LABEL[this.state];
    const showThinking = this.state === "planning" || this.state === "executing" || this.state === "summarizing";
    const promptDisabled = showThinking;

    return {
      prompt: this.promptDraft,
      promptPlaceholder: "Ask Centauri",
      promptDisabled,
      micActive: this.micActive,
      micBusy: this.micBusy,
      micDisabled: !this.micSupported,
      ttsActive: this.ttsActive,
      ttsBusy: this.ttsBusy,
      ttsDisabled: !this.ttsSupported || (!this.summary && !this.rawOutput),
      statusText,
      canCancel: showThinking,
      canRetry: Boolean(this.lastSubmittedPrompt) && !showThinking,
      showThinking,
      thinkingText: statusText,
      chainSteps: [],
      summary: this.summary,
      recommendation: null,
      findings: this.findings,
      sources: [],
      menuOptions: MENU_OPTIONS,
      completedTasks: this.completedTasks,
      hiding: false,
      collapsed: this.collapsed,
      pinned: this.pinned,
      initialLeft: this.position.left,
      initialBottom: this.position.bottom
    };
  }

  private getShellCallbacks(): ShellCallbacks {
    return {
      onPromptChange: (value: string) => {
        this.promptDraft = value;
      },
      onSubmit: (value: string) => {
        void this.handleSubmit(value);
      },
      onMicToggle: () => {
        this.toggleMicCapture();
      },
      onTtsToggle: () => {
        this.toggleSpeechOutput();
      },
      onCancel: () => {
        this.setState("error");
        this.setOutput("Run cancelled.");
      },
      onClose: () => {
        this.close();
      },
      onRetry: () => {
        const retryPrompt = this.lastSubmittedPrompt;
        if (!retryPrompt) {
          return;
        }

        void this.handleSubmit(retryPrompt);
      },
      onPositionChange: (left: number, bottom: number) => {
        this.position = { left, bottom };
      },
      onCollapse: () => {
        this.collapsed = true;
        this.render();
      },
      onExpand: () => {
        this.collapsed = false;
        this.render();
      },
      onTogglePin: () => {
        this.pinned = !this.pinned;
        this.render();
      }
    };
  }

  private async handleSubmit(value: string): Promise<void> {
    const prompt = value.trim();
    if (!prompt) {
      this.setState("error");
      this.setOutput("Prompt cannot be empty.");
      return;
    }

    if (this.micActive || this.micBusy) {
      this.stopMicCapture();
    }

    if (this.activePrompt && this.summary) {
      this.completedTasks = [...this.completedTasks, { prompt: this.activePrompt, summary: this.summary }].slice(-MAX_COMPLETED_TASKS);
    }

    this.activePrompt = prompt;
    this.lastSubmittedPrompt = prompt;
    this.promptDraft = prompt;
    this.rawOutput = "";
    this.summary = null;
    this.findings = [];
    this.traceResults = [];
    this.collapsed = false;
    this.open();
    this.render();

    await this.onSubmit(prompt);
  }

  private getSpeechRecognitionCtor(): SpeechRecognitionCtorLike | null {
    const speechWindow = window as SpeechRecognitionWindow;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }

  private toggleMicCapture(): void {
    if (!this.micSupported) {
      return;
    }

    if (this.micActive) {
      this.stopMicCapture();
      return;
    }

    const ctor = this.getSpeechRecognitionCtor();
    if (!ctor) {
      return;
    }

    const recognition = new ctor();
    this.speechBasePrompt = this.promptDraft;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.micActive = true;
      this.micBusy = false;
      this.render();
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interimTranscript += `${transcript} `;
        }
      }

      const spoken = `${finalTranscript}${interimTranscript}`.trim();
      if (!spoken) {
        return;
      }

      const nextPrompt = [this.speechBasePrompt, spoken].filter(Boolean).join(" ").trim();
      this.promptDraft = nextPrompt;
      this.render();
    };

    recognition.onerror = () => {
      this.micActive = false;
      this.micBusy = false;
      this.speechRecognition = null;
      this.render();
    };

    recognition.onend = () => {
      this.micActive = false;
      this.micBusy = false;
      this.speechRecognition = null;
      this.render();
    };

    this.speechRecognition = recognition;
    this.micBusy = true;
    this.render();

    try {
      recognition.start();
    } catch {
      this.micBusy = false;
      this.speechRecognition = null;
      this.render();
    }
  }

  private stopMicCapture(): void {
    if (!this.speechRecognition) {
      this.micActive = false;
      this.micBusy = false;
      return;
    }

    try {
      this.speechRecognition.stop();
    } catch {
      // ignore stop errors
    }

    this.speechRecognition = null;
    this.micActive = false;
    this.micBusy = false;
    this.render();
  }

  private toggleSpeechOutput(): void {
    if (!this.ttsSupported) {
      return;
    }

    if (this.ttsActive || this.ttsBusy) {
      this.stopSpeechOutput();
      return;
    }

    const text = (this.summary ?? this.rawOutput).trim();
    if (!text) {
      return;
    }

    void this.playElevenLabsAudio(text);
  }

  private stopSpeechOutput(): void {
    this.ttsRequestId += 1;
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }

    if (this.ttsAudio) {
      try {
        this.ttsAudio.pause();
      } catch {
        // Ignore pause errors from detached audio elements.
      }
      this.ttsAudio.src = "";
      this.ttsAudio = null;
    }

    this.clearTtsAudioUrl();
    this.ttsBusy = false;
    this.ttsActive = false;
    this.render();
  }

  private async playElevenLabsAudio(text: string): Promise<void> {
    const requestId = this.ttsRequestId + 1;
    this.stopSpeechOutput();
    this.ttsRequestId = requestId;
    this.ttsBusy = true;
    this.render();

    const normalized = text.replace(/\s+/g, " ").trim().slice(0, 2800);
    const abortController = new AbortController();
    this.ttsAbortController = abortController;

    try {
      const audioBlob = await this.synthesizeElevenLabs(normalized, abortController.signal);
      if (requestId !== this.ttsRequestId) {
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.preload = "auto";

      const cleanup = (): void => {
        if (this.ttsAudio === audio) {
          this.ttsAudio = null;
        }
        if (this.ttsAudioUrl === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          this.ttsAudioUrl = null;
        }
        if (this.ttsRequestId === requestId) {
          this.ttsActive = false;
          this.ttsBusy = false;
          this.render();
        }
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;

      this.ttsAudio = audio;
      this.ttsAudioUrl = audioUrl;
      this.ttsBusy = false;
      this.ttsActive = true;
      this.render();

      await audio.play();
    } catch (error: unknown) {
      if (abortController.signal.aborted || requestId !== this.ttsRequestId) {
        return;
      }

      this.ttsBusy = false;
      this.ttsActive = false;
      this.clearTtsAudioUrl();
      const reason = error instanceof Error ? error.message : "ElevenLabs TTS failed";
      console.error("ElevenLabs TTS failed:", reason);
      this.render();
    } finally {
      if (this.ttsAbortController === abortController) {
        this.ttsAbortController = null;
      }
    }
  }

  private async synthesizeElevenLabs(text: string, signal: AbortSignal): Promise<Blob> {
    if (!this.elevenlabsApiKey || !this.elevenlabsVoiceId) {
      throw new Error("Missing ElevenLabs configuration.");
    }

    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.elevenlabsVoiceId)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "audio/mpeg",
        "xi-api-key": this.elevenlabsApiKey
      },
      body: JSON.stringify({
        text,
        model_id: this.elevenlabsSpeechProfile || "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75
        }
      }),
      signal
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const raw = await response.text();
        if (raw.trim()) {
          detail = raw.slice(0, 220);
        }
      } catch {
        // Keep default status detail.
      }
      throw new Error(`ElevenLabs TTS request failed: ${detail}`);
    }

    const audioBlob = await response.blob();
    if (audioBlob.size === 0) {
      throw new Error("ElevenLabs TTS returned empty audio.");
    }

    return audioBlob;
  }

  private clearTtsAudioUrl(): void {
    if (!this.ttsAudioUrl) {
      return;
    }

    URL.revokeObjectURL(this.ttsAudioUrl);
    this.ttsAudioUrl = null;
  }

  private render(): void {
    if (!this.isOpen) {
      this.root.render(null);
      return;
    }

    this.root.render(<ShellApp view={this.getShellViewModel()} callbacks={this.getShellCallbacks()} />);
  }
}
