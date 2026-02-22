import { createRoot, type Root } from "react-dom/client";
import type { ActionExecutionResult } from "../../shared/actions";
import type { ChatHistoryTurn, UIState } from "../../shared/messages";
import {
  ShellApp,
  type CompletedTaskModel,
  type MenuOption,
  type ShellCallbacks,
  type ShellImageCandidateModel,
  type ShellViewModel
} from "./shell";

export type CommandBarSubmitRequest = {
  prompt: string;
  agentMode: boolean;
  chatHistory: ChatHistoryTurn[];
};

type SubmitHandler = (request: CommandBarSubmitRequest) => Promise<void>;
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
const MAX_VISIBLE_IMAGE_CANDIDATES = 18;
const MAX_IMAGE_CONTEXT_ITEMS = 8;
const MAX_CHAT_HISTORY_TURNS = 6;
const MAX_CHAT_HISTORY_CHARS_PER_SIDE = 900;

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

function normalizeInlineText(value: string, maxLength = 180): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function summarizeImageSource(src: string): string {
  try {
    const url = new URL(src);
    const path = url.pathname.split("/").filter(Boolean);
    const file = path[path.length - 1] ?? url.hostname;
    return clipText(`${url.hostname}/${file}`, 60);
  } catch {
    return clipText(src, 60);
  }
}

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
  private agentMode = true;
  private imagePickerOpen = false;
  private visibleImageCandidates: ShellImageCandidateModel[] = [];
  private readonly selectedImageCandidateIds = new Set<string>();
  private readonly selectedImageCandidatesById = new Map<string, ShellImageCandidateModel>();
  private viewportScanRafId: number | null = null;
  private imageSelectionViewportListenersBound = false;

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
      if (this.imagePickerOpen) {
        this.setImageSelectionMode(false);
        return;
      }
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
    this.setImageSelectionMode(false);
    this.isOpen = false;
    this.pinned = false;
    this.collapsed = false;
    this.visibleImageCandidates = [];
    this.selectedImageCandidateIds.clear();
    this.selectedImageCandidatesById.clear();
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
    const normalized = value
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!normalized) {
      return value;
    }

    // In chat mode there is no executor trace; preserve paragraph formatting.
    if (this.traceResults.length === 0) {
      return normalized;
    }

    const compact = normalized.replace(/\s+/g, " ").trim();
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
      agentMode: this.agentMode,
      imagePickerOpen: this.imagePickerOpen,
      imageCandidates: this.visibleImageCandidates,
      selectedImageIds: Array.from(this.selectedImageCandidateIds),
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
        if (this.pinned) {
          this.setImageSelectionMode(false);
        }
        this.render();
      },
      onToggleAgentMode: () => {
        this.agentMode = !this.agentMode;
        this.render();
      },
      onImagePickerTrigger: () => {
        if (this.imagePickerOpen) {
          this.setImageSelectionMode(false);
          this.render();
          return;
        }

        this.setImageSelectionMode(true);
        this.scanVisibleImages();
      },
      onImagePickerClose: () => {
        this.setImageSelectionMode(false);
        this.render();
      },
      onRefreshImages: () => {
        if (!this.imagePickerOpen) {
          return;
        }
        this.scanVisibleImages();
      },
      onToggleImageSelection: (id: string) => {
        const visibleCandidate = this.visibleImageCandidates.find((candidate) => candidate.id === id) ?? null;
        if (this.selectedImageCandidateIds.has(id)) {
          this.selectedImageCandidateIds.delete(id);
          this.selectedImageCandidatesById.delete(id);
        } else {
          this.selectedImageCandidateIds.add(id);
          if (visibleCandidate) {
            this.selectedImageCandidatesById.set(id, visibleCandidate);
          }
        }
        this.render();
      },
      onClearSelectedImages: () => {
        this.selectedImageCandidateIds.clear();
        this.selectedImageCandidatesById.clear();
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
    this.setImageSelectionMode(false);
    this.open();
    this.render();

    await this.onSubmit({
      prompt: this.buildPromptWithSelectedImageContext(prompt),
      agentMode: this.agentMode,
      chatHistory: this.buildChatHistorySnapshot()
    });
  }

  private readonly handleViewportChange = (): void => {
    if (!this.imagePickerOpen) {
      return;
    }

    if (this.viewportScanRafId !== null) {
      return;
    }

    this.viewportScanRafId = window.requestAnimationFrame(() => {
      this.viewportScanRafId = null;
      if (!this.imagePickerOpen) {
        return;
      }

      this.scanVisibleImages();
    });
  };

  private setImageSelectionMode(open: boolean): void {
    this.imagePickerOpen = open;

    if (!open) {
      this.visibleImageCandidates = [];
    }

    this.syncImageSelectionViewportListeners();
  }

  private syncImageSelectionViewportListeners(): void {
    const shouldBind = this.imagePickerOpen;
    if (shouldBind === this.imageSelectionViewportListenersBound) {
      if (!shouldBind && this.viewportScanRafId !== null) {
        window.cancelAnimationFrame(this.viewportScanRafId);
        this.viewportScanRafId = null;
      }
      return;
    }

    if (shouldBind) {
      window.addEventListener("scroll", this.handleViewportChange, { capture: true, passive: true });
      window.addEventListener("resize", this.handleViewportChange, { passive: true });
      this.imageSelectionViewportListenersBound = true;
      return;
    }

    window.removeEventListener("scroll", this.handleViewportChange, true);
    window.removeEventListener("resize", this.handleViewportChange);
    this.imageSelectionViewportListenersBound = false;
    if (this.viewportScanRafId !== null) {
      window.cancelAnimationFrame(this.viewportScanRafId);
      this.viewportScanRafId = null;
    }
  }

  private scanVisibleImages(): void {
    const candidates = this.collectVisibleImageCandidates();
    this.visibleImageCandidates = candidates;

    // Refresh metadata for already-selected items that are visible again.
    for (const candidate of candidates) {
      if (this.selectedImageCandidateIds.has(candidate.id)) {
        this.selectedImageCandidatesById.set(candidate.id, candidate);
      }
    }

    this.imagePickerOpen = true;
    this.syncImageSelectionViewportListeners();
    this.render();
  }

  private collectVisibleImageCandidates(): ShellImageCandidateModel[] {
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const seen = new Set<string>();
    const candidates: ShellImageCandidateModel[] = [];

    for (const img of Array.from(document.images)) {
      const src = (img.currentSrc || img.src || "").trim();
      if (!src) {
        continue;
      }

      const rect = img.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
        continue;
      }

      if (rect.width < 36 || rect.height < 36) {
        continue;
      }

      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewportHeight || rect.left >= viewportWidth) {
        continue;
      }

      const style = getComputedStyle(img);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }

      const opacity = Number.parseFloat(style.opacity || "1");
      if (!Number.isNaN(opacity) && opacity <= 0.05) {
        continue;
      }

      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      if (visibleWidth * visibleHeight < 900) {
        continue;
      }

      const displayWidth = Math.max(1, Math.round(rect.width));
      const displayHeight = Math.max(1, Math.round(rect.height));
      const viewportLeft = Math.round(rect.left);
      const viewportTop = Math.round(rect.top);
      const id = `${src}|${viewportLeft}|${viewportTop}|${displayWidth}x${displayHeight}`;

      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      const figure = img.closest("figure");
      const figcaption = figure?.querySelector("figcaption");
      const linkEl = img.closest("a");
      const linkUrl = linkEl instanceof HTMLAnchorElement ? linkEl.href : null;

      const alt = normalizeInlineText(img.alt ?? "", 180) || null;
      const title = normalizeInlineText(img.title ?? "", 180) || null;
      const caption = normalizeInlineText(figcaption?.textContent ?? "", 180) || null;

      candidates.push({
        id,
        src,
        label: summarizeImageSource(src),
        alt,
        title,
        caption,
        linkUrl,
        viewportTop,
        viewportLeft,
        displayWidth,
        displayHeight,
        naturalWidth: Math.max(0, Math.round(img.naturalWidth || 0)),
        naturalHeight: Math.max(0, Math.round(img.naturalHeight || 0))
      });
    }

    candidates.sort((a, b) => {
      if (a.viewportTop !== b.viewportTop) {
        return a.viewportTop - b.viewportTop;
      }

      if (a.viewportLeft !== b.viewportLeft) {
        return a.viewportLeft - b.viewportLeft;
      }

      return (b.displayWidth * b.displayHeight) - (a.displayWidth * a.displayHeight);
    });

    return candidates.slice(0, MAX_VISIBLE_IMAGE_CANDIDATES);
  }

  private buildChatHistorySnapshot(): ChatHistoryTurn[] {
    return this.completedTasks
      .filter((task) => Boolean(task.prompt.trim()) && Boolean(task.summary?.trim()))
      .slice(-MAX_CHAT_HISTORY_TURNS)
      .map((task) => ({
        user: clipText(task.prompt.trim(), MAX_CHAT_HISTORY_CHARS_PER_SIDE),
        assistant: clipText((task.summary ?? "").trim(), MAX_CHAT_HISTORY_CHARS_PER_SIDE)
      }));
  }

  private buildPromptWithSelectedImageContext(prompt: string): string {
    const selected = Array.from(this.selectedImageCandidatesById.values());
    if (selected.length === 0) {
      return prompt;
    }

    const included = selected.slice(0, MAX_IMAGE_CONTEXT_ITEMS);
    const lines: string[] = [prompt, "", "Selected visible images (user-selected page context):"];

    included.forEach((image, index) => {
      lines.push(`${index + 1}. src: ${clipText(image.src, 500)}`);

      if (image.alt) {
        lines.push(`   alt: ${clipText(image.alt, 220)}`);
      }
      if (image.caption) {
        lines.push(`   caption: ${clipText(image.caption, 220)}`);
      }
      if (image.title) {
        lines.push(`   title: ${clipText(image.title, 220)}`);
      }
      if (image.linkUrl) {
        lines.push(`   link: ${clipText(image.linkUrl, 500)}`);
      }

      const naturalWidth = image.naturalWidth > 0 ? String(image.naturalWidth) : "?";
      const naturalHeight = image.naturalHeight > 0 ? String(image.naturalHeight) : "?";
      lines.push(
        `   displayed: ${image.displayWidth}x${image.displayHeight}px | natural: ${naturalWidth}x${naturalHeight}px | viewport: (${image.viewportLeft}, ${image.viewportTop})`
      );
    });

    if (selected.length > included.length) {
      lines.push(`... ${selected.length - included.length} more selected image(s) omitted.`);
    }

    lines.push("Use this metadata as additional context for the request.");
    return lines.join("\n");
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
