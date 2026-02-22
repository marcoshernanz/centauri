import { createRoot, type Root } from "react-dom/client";
import type { ActionExecutionResult } from "../../shared/actions";
import type { AgentRunMode, TtsSynthesizeMessage, TtsSynthesizeResponse, UIState } from "../../shared/messages";
import {
  ShellApp,
  type CompletedTaskModel,
  type MenuOption,
  type SelectedImageInput,
  type ShellCallbacks,
  type ShellViewModel
} from "./shell";

type SubmitPayload = {
  prompt: string;
  agentMode: AgentRunMode;
  selectedImage: SelectedImageInput | null;
};

type SubmitHandler = (payload: SubmitPayload) => Promise<void>;
type ActivateHandler = (id: string) => void;
type CloseHandler = (id: string) => void;
type AgentModeChangeHandler = (mode: AgentRunMode) => void;

type CommandBarOptions = {
  id: string;
  zIndex: number;
  initialAgentMode: AgentRunMode;
  onSubmit: SubmitHandler;
  onActivate: ActivateHandler;
  onClose: CloseHandler;
  onAgentModeChange: AgentModeChangeHandler;
};

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

const HOST_ID_PREFIX = "nwa-shell-host";
const CLOSE_ANIMATION_MS = 280;
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

const IMAGE_PICK_CLASS = "nwa-image-pick-target";
const IMAGE_PICK_MAX_TARGETS = 24;

type ImagePickCallbacks = {
  onPick: (selection: ImagePickSelection) => void;
  onActivate: () => void;
};

type ImagePickRegistration = {
  image: HTMLImageElement;
  clickListener: (event: MouseEvent) => void;
};

type ImagePickSelection = {
  previewSrc: string | null;
  previewAlt: string | null;
};

const imagePickState: {
  ownerId: string | null;
  registrations: ImagePickRegistration[];
} = {
  ownerId: null,
  registrations: []
};

function releaseImagePickTargets(): void {
  for (const registration of imagePickState.registrations) {
    registration.image.classList.remove(IMAGE_PICK_CLASS);
    registration.image.removeEventListener("click", registration.clickListener, true);
  }

  imagePickState.registrations = [];
}

function deactivateImagePickTargets(ownerId: string): void {
  if (imagePickState.ownerId !== ownerId) {
    return;
  }

  releaseImagePickTargets();
  imagePickState.ownerId = null;
}

function activateImagePickTargets(ownerId: string, callbacks: ImagePickCallbacks): void {
  if (imagePickState.ownerId === ownerId && imagePickState.registrations.length > 0) {
    return;
  }

  releaseImagePickTargets();
  imagePickState.ownerId = ownerId;

  const candidates = Array.from(document.querySelectorAll("img")).filter(isImagePickCandidate).slice(0, IMAGE_PICK_MAX_TARGETS);

  for (const image of candidates) {
    const clickListener = (event: MouseEvent): void => {
      if (imagePickState.ownerId !== ownerId) {
        return;
      }

      // Ignore synthetic clicks from the executor; only react to user interaction.
      if (!event.isTrusted) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      event.stopImmediatePropagation();

      callbacks.onActivate();
      callbacks.onPick(buildImageSelection(image));
    };

    image.classList.add(IMAGE_PICK_CLASS);
    image.addEventListener("click", clickListener, true);
    imagePickState.registrations.push({ image, clickListener });
  }
}

function isImagePickCandidate(image: HTMLImageElement): boolean {
  if (image.closest("[id^='nwa-shell-host-']")) {
    return false;
  }

  const rect = image.getBoundingClientRect();
  if (rect.width < 36 || rect.height < 36) {
    return false;
  }

  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
    return false;
  }

  const style = window.getComputedStyle(image);
  if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) <= 0.1) {
    return false;
  }

  return Boolean(image.currentSrc || image.src);
}

function buildImageSelection(image: HTMLImageElement): ImagePickSelection {
  const previewSrc = normalizeInlineText(image.currentSrc || image.src || "");
  const previewAlt = normalizeInlineText(
    image.alt || image.getAttribute("aria-label") || image.getAttribute("title") || ""
  );

  return {
    previewSrc: previewSrc || null,
    previewAlt: previewAlt || null
  };
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}


export class CommandBar {
  private readonly id: string;
  private readonly host: HTMLDivElement;
  private readonly root: Root;
  private readonly onSubmit: SubmitHandler;
  private readonly onActivate: ActivateHandler;
  private readonly onClose: CloseHandler;
  private readonly onAgentModeChange: AgentModeChangeHandler;
  private readonly hostMouseDownListener: () => void;
  private readonly defaultAgentMode: AgentRunMode;

  private isOpen = false;
  private disposed = false;
  private hiding = false;
  private closeTimerId: number | null = null;
  private state: UIState = "idle";
  private promptDraft = "";
  private rawOutput = "";
  private summary: string | null = null;
  private findings: string[] = [];
  private traceResults: ActionExecutionResult[] = [];
  private completedTasks: CompletedTaskModel[] = [];
  private selectedImagePreviewSrc: string | null = null;
  private selectedImagePreviewAlt: string | null = null;
  private activePrompt: string | null = null;
  private promptEdited = false;
  private lastSubmittedPrompt = "";
  private pinned = false;
  private collapsed = false;
  private moved = false;
  private resized = false;
  private position: { left?: number; bottom?: number } = {};
  private size: { width?: number; height?: number } = {};
  private agentMode: AgentRunMode;
  private readonly micSupported: boolean;
  private readonly ttsSupported: boolean;
  private readonly elevenlabsApiKey: string;
  private readonly elevenlabsVoiceId: string;
  private readonly elevenlabsSpeechProfile: string;
  private micActive = false;
  private micBusy = false;
  private micShouldAutoSubmit = false;
  private micCapturedText = false;
  private submittedViaMic = false;
  private ttsActive = false;
  private ttsBusy = false;
  private speechRecognition: SpeechRecognitionInstanceLike | null = null;
  private speechBasePrompt = "";
  private ttsAudio: HTMLAudioElement | null = null;
  private ttsAudioUrl: string | null = null;
  private ttsAbortController: AbortController | null = null;
  private ttsRequestId = 0;

  constructor(options: CommandBarOptions) {
    this.id = options.id;
    this.onSubmit = options.onSubmit;
    this.onActivate = options.onActivate;
    this.onClose = options.onClose;
    this.onAgentModeChange = options.onAgentModeChange;
    this.defaultAgentMode = options.initialAgentMode;
    this.agentMode = options.initialAgentMode;
    this.micSupported = Boolean(this.getSpeechRecognitionCtor());
    this.elevenlabsApiKey = __NWA_ELEVENLABS_API_KEY__ ?? "";
    this.elevenlabsVoiceId = __NWA_ELEVENLABS_VOICE_ID__ ?? "";
    this.elevenlabsSpeechProfile = __NWA_ELEVENLABS_SPEECH_PROFILE__ ?? "eleven_multilingual_v2";
    this.ttsSupported = this.elevenlabsApiKey.trim().length > 0 && this.elevenlabsVoiceId.trim().length > 0;

    this.host = document.createElement("div");
    this.host.id = `${HOST_ID_PREFIX}-${this.id}`;
    this.host.style.position = "fixed";
    this.host.style.inset = "0";
    this.host.style.zIndex = String(options.zIndex);
    this.host.style.pointerEvents = "none";

    const shadow = this.host.attachShadow({ mode: "open" });
    const mountNode = document.createElement("div");
    mountNode.style.pointerEvents = "auto";
    shadow.appendChild(mountNode);

    document.documentElement.appendChild(this.host);
    this.root = createRoot(mountNode);
    this.hostMouseDownListener = () => {
      this.activateShell();
    };
    this.host.addEventListener("mousedown", this.hostMouseDownListener);

    this.render();
  }

  getId(): string {
    return this.id;
  }

  setZIndex(zIndex: number): void {
    this.host.style.zIndex = String(zIndex);
  }

  isOpenAndVisible(): boolean {
    return this.isOpen && !this.hiding;
  }

  isPinned(): boolean {
    return this.pinned;
  }

  toggle(): void {
    if (this.disposed) {
      return;
    }

    if (this.isOpenAndVisible()) {
      this.close();
      return;
    }

    this.open();
  }

  open(): void {
    if (this.disposed) {
      return;
    }

    if (this.closeTimerId !== null) {
      window.clearTimeout(this.closeTimerId);
      this.closeTimerId = null;
    }
    this.isOpen = true;
    this.hiding = false;
    this.activateShell();
    this.render();
  }

  close(): void {
    if (this.disposed) {
      return;
    }

    if (this.hiding) {
      return;
    }

    this.stopMicCapture();
    this.stopSpeechOutput();
    deactivateImagePickTargets(this.id);
    this.pinned = false;
    this.collapsed = false;
    this.submittedViaMic = false;
    this.hiding = true;
    this.isOpen = true;
    this.render();

    if (this.closeTimerId !== null) {
      window.clearTimeout(this.closeTimerId);
    }

    this.closeTimerId = window.setTimeout(() => {
      this.closeTimerId = null;
      this.hiding = false;
      this.isOpen = false;
      this.dispose();
      this.onClose(this.id);
    }, CLOSE_ANIMATION_MS);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.closeTimerId !== null) {
      window.clearTimeout(this.closeTimerId);
      this.closeTimerId = null;
    }

    this.stopMicCapture();
    this.stopSpeechOutput();
    deactivateImagePickTargets(this.id);
    this.host.removeEventListener("mousedown", this.hostMouseDownListener);
    this.root.unmount();
    this.host.remove();
  }

  setState(state: UIState): void {
    this.state = state;
    this.syncImagePickTargets();
    this.render();
  }

  setOutput(text: string): void {
    if (this.ttsActive || this.ttsBusy) {
      this.stopSpeechOutput();
    }
    this.rawOutput = text;
    this.recomputeOutputPresentation();
    this.render();

    // Auto-play TTS when the output was triggered by a voice (mic) submission
    // and we have a successful result (state will be set to "done" before setOutput).
    if (this.submittedViaMic && this.ttsSupported && this.summary && this.state === "done") {
      this.submittedViaMic = false;
      void this.playElevenLabsAudio(this.summary);
    }
  }

  clearOutput(): void {
    if (this.ttsActive || this.ttsBusy) {
      this.stopSpeechOutput();
    }
    this.rawOutput = "";
    this.summary = null;
    this.findings = [];
    this.selectedImagePreviewSrc = null;
    this.selectedImagePreviewAlt = null;
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

  private isPromptLocked(): boolean {
    return this.state === "planning" || this.state === "executing" || this.state === "summarizing";
  }

  private activateShell(): void {
    this.onActivate(this.id);
    this.syncImagePickTargets();
  }

  private syncImagePickTargets(): void {
    if (this.disposed || !this.isOpen || this.hiding || this.state !== "idle") {
      deactivateImagePickTargets(this.id);
      return;
    }

    activateImagePickTargets(this.id, {
      onActivate: () => {
        this.onActivate(this.id);
      },
      onPick: (selection: ImagePickSelection) => {
        this.applyImagePrompt(selection);
      }
    });
  }

  private applyImagePrompt(selection: ImagePickSelection): void {
    if (this.disposed) {
      return;
    }

    this.activateShell();
    this.promptEdited = true;
    this.collapsed = false;
    this.selectedImagePreviewSrc = selection.previewSrc;
    this.selectedImagePreviewAlt = selection.previewAlt;
    this.render();
  }

  private getShellViewModel(): ShellViewModel {
    const statusText = STATUS_LABEL[this.state];
    const showThinking = this.isPromptLocked();
    const promptDisabled = showThinking;
    const hasSelectedImage = Boolean(this.selectedImagePreviewSrc);
    const canSubmit = !promptDisabled && (this.promptDraft.trim().length > 0 || hasSelectedImage);

    return {
      prompt: this.promptDraft,
      promptPlaceholder: "Ask Centauri",
      promptDisabled,
      canSubmit,
      agentMode: this.agentMode,
      activePrompt: this.activePrompt,
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
      selectedImagePreviewSrc: this.selectedImagePreviewSrc,
      selectedImagePreviewAlt: this.selectedImagePreviewAlt,
      hiding: this.hiding,
      collapsed: this.collapsed,
      pinned: this.pinned,
      initialLeft: this.position.left,
      initialBottom: this.position.bottom,
      initialWidth: this.size.width,
      initialHeight: this.size.height
    };
  }

  private getShellCallbacks(): ShellCallbacks {
    return {
      onPromptChange: (value: string) => {
        this.promptEdited = true;
        this.promptDraft = value;
        this.activateShell();
      },
      onToggleAgentMode: () => {
        this.activateShell();
        this.agentMode = this.agentMode === "agentic" ? "chat" : "agentic";
        this.promptEdited = true;
        this.onAgentModeChange(this.agentMode);
        this.render();
      },
      onSubmit: (value: string) => {
        this.activateShell();
        this.promptDraft = "";
        this.submittedViaMic = false;
        this.render();
        void this.handleSubmit(value);
      },
      onClearSelectedImage: () => {
        this.activateShell();
        this.selectedImagePreviewSrc = null;
        this.selectedImagePreviewAlt = null;
        this.render();
      },
      onMicToggle: () => {
        this.activateShell();
        this.toggleMicCapture();
      },
      onTtsToggle: () => {
        this.activateShell();
        this.toggleSpeechOutput();
      },
      onCancel: () => {
        this.activateShell();
        this.setState("error");
        this.setOutput("Run cancelled.");
      },
      onClose: () => {
        this.activateShell();
        this.close();
      },
      onRetry: () => {
        this.activateShell();
        const retryPrompt = this.lastSubmittedPrompt;
        if (!retryPrompt) {
          return;
        }

        void this.handleSubmit(retryPrompt);
      },
      onPositionChange: (left: number, bottom: number) => {
        this.position = { left, bottom };
        this.moved = true;
      },
      onSizeChange: (width: number, height: number) => {
        this.size = { width, height };
        this.resized = true;
      },
      onCollapse: () => {
        this.activateShell();
        this.collapsed = true;
        this.render();
      },
      onExpand: () => {
        this.activateShell();
        this.collapsed = false;
        this.render();
      },
      onTogglePin: () => {
        this.activateShell();
        this.pinned = !this.pinned;
        this.render();
      },
      onActivate: () => {
        this.activateShell();
      }
    };
  }

  private async handleSubmit(value: string): Promise<void> {
    const prompt = value.trim();
    const selectedImage: SelectedImageInput | null = this.selectedImagePreviewSrc
      ? {
          src: this.selectedImagePreviewSrc,
          alt: this.selectedImagePreviewAlt ?? null
        }
      : null;

    if (!prompt && !selectedImage) {
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

    this.activePrompt = prompt || "[Selected image]";
    this.promptEdited = true;
    this.lastSubmittedPrompt = prompt;
    // submittedViaMic is set by the STT onend auto-submit path; preserve it here.
    this.promptDraft = "";
    this.selectedImagePreviewSrc = null;
    this.selectedImagePreviewAlt = null;
    this.rawOutput = "";
    this.summary = null;
    this.findings = [];
    this.traceResults = [];
    this.collapsed = false;
    this.open();
    this.render();

    await this.onSubmit({
      prompt,
      agentMode: this.agentMode,
      selectedImage
    });
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
    this.micShouldAutoSubmit = true;
    this.micCapturedText = false;
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
      this.micCapturedText = true;
      this.render();
    };

    recognition.onerror = () => {
      this.micActive = false;
      this.micBusy = false;
      this.speechRecognition = null;
      this.micShouldAutoSubmit = false;
      this.micCapturedText = false;
      this.render();
    };

    recognition.onend = () => {
      const shouldAutoSubmit = this.micShouldAutoSubmit && this.micCapturedText && !this.isPromptLocked();
      this.micActive = false;
      this.micBusy = false;
      this.speechRecognition = null;
      this.micShouldAutoSubmit = false;
      this.micCapturedText = false;
      this.render();

      if (shouldAutoSubmit && this.promptDraft.trim()) {
        this.submittedViaMic = true;
        void this.handleSubmit(this.promptDraft);
      }
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
      this.micShouldAutoSubmit = false;
      this.micCapturedText = false;
      return;
    }

    // Keep micShouldAutoSubmit and micCapturedText intact so that the
    // asynchronous recognition.onend handler can still trigger auto-submit.
    // Those flags are reset inside onend after the submit decision is made.
    const recognition = this.speechRecognition;
    this.speechRecognition = null;

    try {
      recognition.stop();
    } catch {
      // ignore stop errors – fall through to reset state
      this.micActive = false;
      this.micBusy = false;
      this.micShouldAutoSubmit = false;
      this.micCapturedText = false;
      this.render();
    }
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

    const message: TtsSynthesizeMessage = {
      type: "tts/synthesize",
      payload: {
        text,
        voiceId: this.elevenlabsVoiceId,
        modelId: this.elevenlabsSpeechProfile || "eleven_multilingual_v2",
        apiKey: this.elevenlabsApiKey
      }
    };

    return new Promise<Blob>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const onAbort = () => {
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });

      chrome.runtime.sendMessage(message, (response: TtsSynthesizeResponse) => {
        signal.removeEventListener("abort", onAbort);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? "TTS message failed"));
          return;
        }

        if (!response || !response.ok || !response.audioBase64) {
          reject(new Error(response?.error ?? "TTS synthesis failed"));
          return;
        }

        // Decode base64 to blob
        const binaryString = atob(response.audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        resolve(new Blob([bytes], { type: "audio/mpeg" }));
      });
    });
  }

  private clearTtsAudioUrl(): void {
    if (!this.ttsAudioUrl) {
      return;
    }

    URL.revokeObjectURL(this.ttsAudioUrl);
    this.ttsAudioUrl = null;
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    if (!this.isOpen) {
      this.root.render(null);
      return;
    }

    this.root.render(<ShellApp view={this.getShellViewModel()} callbacks={this.getShellCallbacks()} />);
  }
}
