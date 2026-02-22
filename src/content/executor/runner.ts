import {
  DEFAULT_EXECUTION_LIMITS,
  type ActionExecutionResult,
  type AgentAction,
  type ExecutionLimits,
  type ListedItem,
  type TargetSpec
} from "../../shared/actions";
import { getVisualCursor } from "../dom/visualCursor";

const NON_RETRYABLE_ACTIONS = new Set<AgentAction["type"]>(["OPEN_IN_SAME_TAB", "BACK", "DONE"]);

export async function executeActions(
  actions: AgentAction[],
  customLimits?: Partial<ExecutionLimits>
): Promise<ActionExecutionResult[]> {
  const limits = mergeLimits(customLimits);
  const cappedActions = actions.slice(0, limits.maxActionsPerBatch);

  if (actions.length > limits.maxActionsPerBatch) {
    return [
      {
        actionId: "__batch__",
        type: "DONE",
        ok: false,
        attempts: 1,
        durationMs: 0,
        error: `Action batch exceeded cap (${limits.maxActionsPerBatch})`
      }
    ];
  }

  const results: ActionExecutionResult[] = [];

  for (const action of cappedActions) {
    const result = await runActionWithGuardrails(action, limits);
    results.push(result);

    if (!result.ok && NON_RETRYABLE_ACTIONS.has(action.type)) {
      break;
    }

    if (action.type === "DONE") {
      break;
    }
  }

  return results;
}

async function runActionWithGuardrails(action: AgentAction, limits: ExecutionLimits): Promise<ActionExecutionResult> {
  const startedAt = Date.now();
  const maxAttempts = NON_RETRYABLE_ACTIONS.has(action.type) ? 1 : limits.maxRetriesPerAction + 1;

  let lastError = "Unknown executor error";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const rawData = await runWithTimeout(executeAction(action, limits), limits.maxActionTimeoutMs);
      const data = attachPageMetadata(rawData);
      return {
        actionId: action.id,
        type: action.type,
        ok: true,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        data
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts) {
        await sleep(80);
      }
    }
  }

  return {
    actionId: action.id,
    type: action.type,
    ok: false,
    attempts: maxAttempts,
    durationMs: Date.now() - startedAt,
    error: lastError
  };
}

function attachPageMetadata(data: ActionExecutionResult["data"]): ActionExecutionResult["data"] {
  const snapshot = capturePageSignals();
  return {
    ...(data ?? {}),
    url: data?.url ?? window.location.href,
    pageTitle: snapshot.pageTitle,
    headings: snapshot.headings,
    candidates: snapshot.candidates
  };
}

function capturePageSignals(): { pageTitle: string; headings: string[]; candidates: string[] } {
  return {
    pageTitle: normalizeText(document.title).slice(0, 140),
    headings: collectVisibleUniqueText(["h1", "h2", "h3"], 5),
    candidates: collectVisibleUniqueText(["main a[href]", "[role='main'] a[href]", "a[href]", "button"], 8)
  };
}

function collectVisibleUniqueText(selectors: string[], limit: number): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const element of elements) {
      if (values.length >= limit) {
        return values;
      }

      if (!isVisibleElement(element)) {
        continue;
      }

      const text = normalizeText(getElementText(element)).slice(0, 120);
      if (!text || seen.has(text)) {
        continue;
      }

      seen.add(text);
      values.push(text);
    }
  }

  return values;
}

function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.offsetParent === null && element.getClientRects().length === 0) {
    return false;
  }

  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

async function executeAction(
  action: AgentAction,
  limits: ExecutionLimits
): Promise<ActionExecutionResult["data"]> {
  switch (action.type) {
    case "WAIT_FOR": {
      const timeoutMs = clampNumber(action.params?.timeoutMs ?? 900, 100, limits.maxWaitForMs);
      await waitForTarget(action.target, timeoutMs);
      return {};
    }

    case "LIST_ITEMS": {
      const selectors = action.target?.selectors ?? ["a"];
      const limit = clampNumber(action.params?.limit ?? 5, 1, 20);
      const items: ListedItem[] = listItems(selectors, action.target, limit);

      if (items.length === 0) {
        throw new Error("No list items found");
      }

      const previewTarget = findTargetElement(action.target);
      if (previewTarget) {
        await animateHumanInspect(previewTarget);
      }

      return {
        items,
        selectorUsed: selectors[0]
      };
    }

    case "CLICK": {
      const element = findTargetElement(action.target);
      if (!element) {
        throw new Error("Clickable target not found");
      }

      scrollIntoViewIfNeeded(element);
      await animateHumanClick(element);
      triggerClick(element);
      await sleep(randomBetween(60, 120));

      return {
        selectorUsed: action.target?.selectors?.[0]
      };
    }

    case "OPEN_IN_SAME_TAB": {
      const targetElement = findTargetElement(action.target);
      const targetUrl = action.target?.url ?? getAnchorHref(targetElement);
      if (!targetUrl) {
        throw new Error("Open target URL not found");
      }

      if (targetElement) {
        scrollIntoViewIfNeeded(targetElement);
        await animateHumanClick(targetElement);
      }

      window.location.href = targetUrl;
      return {
        url: targetUrl
      };
    }

    case "BACK": {
      history.back();
      await sleep(clampNumber(action.params?.waitMs ?? 250, 100, 1000));
      return {
        url: window.location.href
      };
    }

    case "SCROLL": {
      window.scrollBy({
        top: action.params?.top ?? 500,
        left: action.params?.left ?? 0,
        behavior: action.params?.behavior ?? "smooth"
      });
      await sleep(120);
      return {
        url: window.location.href
      };
    }

    case "EXTRACT_TEXT": {
      const previewTarget = findTargetElement(action.target);
      if (previewTarget) {
        await animateHumanInspect(previewTarget);
      }

      const maxChars = clampNumber(action.params?.maxChars ?? 2000, 200, limits.maxExtractChars);
      const text = extractText(action.target, maxChars);
      if (!text) {
        throw new Error("Text extraction returned empty content");
      }

      return {
        text,
        selectorUsed: action.target?.selectors?.[0]
      };
    }

    case "DONE": {
      return {
        text: action.params?.message
      };
    }

    default:
      throw new Error(`Unsupported action type ${(action as AgentAction).type}`);
  }
}

function listItems(selectors: string[], target: TargetSpec | undefined, limit: number): ListedItem[] {
  const elements = queryCandidates(selectors);

  const items: ListedItem[] = [];

  for (const element of elements) {
    const elementText = getElementText(element);

    if (target?.textIncludes && !elementText.toLowerCase().includes(target.textIncludes.toLowerCase())) {
      continue;
    }

    const text = normalizeText(elementText || element.textContent || "");
    if (!text) {
      continue;
    }

    const href = getAnchorHref(element);
    items.push({ text, href });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function extractText(target: TargetSpec | undefined, maxChars: number): string {
  const selectors = target?.selectors ?? ["article", "main", "[role='main']", "body"];
  const candidates = queryCandidates(selectors);

  const preferred = candidates.find((element) => normalizeText(getElementText(element) || element.textContent || "").length > 120);
  const fallback = candidates[0] ?? document.body;
  const selected = preferred ?? fallback;

  const text = normalizeText(getElementText(selected) || selected?.textContent || document.body.innerText || "");
  return text.slice(0, maxChars);
}

function findTargetElement(target: TargetSpec | undefined): Element | null {
  const selectors = target?.selectors ?? ["a", "button"];
  const candidates = queryCandidates(selectors);

  if (candidates.length === 0) {
    return null;
  }

  const filtered = target?.textIncludes
    ? candidates.filter((element) => getElementText(element).toLowerCase().includes(target.textIncludes!.toLowerCase()))
    : candidates;

  const index = target?.index ?? 0;
  return filtered[index] ?? null;
}

async function waitForTarget(target: TargetSpec | undefined, timeoutMs: number): Promise<void> {
  if (!target) {
    await sleep(timeoutMs);
    return;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (findTargetElement(target)) {
      return;
    }

    await sleep(70);
  }

  throw new Error("WAIT_FOR target not found before timeout");
}

function queryCandidates(selectors: string[]): Element[] {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length > 0) {
      return nodes;
    }
  }

  return [];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getElementText(element: Element | null | undefined): string {
  if (!element) {
    return "";
  }

  if (element instanceof HTMLElement) {
    return element.innerText;
  }

  return element.textContent ?? "";
}

function triggerClick(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
    return;
  }

  const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
  element.dispatchEvent(clickEvent);
}

function getAnchorHref(element: Element | null): string | undefined {
  if (!element) {
    return undefined;
  }

  if (element instanceof HTMLAnchorElement && element.href) {
    return element.href;
  }

  const anchor = element.closest("a[href]");
  if (anchor instanceof HTMLAnchorElement && anchor.href) {
    return anchor.href;
  }

  return undefined;
}

function scrollIntoViewIfNeeded(element: Element): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
}

function mergeLimits(customLimits?: Partial<ExecutionLimits>): ExecutionLimits {
  return {
    ...DEFAULT_EXECUTION_LIMITS,
    ...customLimits
  };
}

async function animateHumanClick(element: Element): Promise<void> {
  try {
    const cursor = getVisualCursor();
    await cursor.moveToElement(element);
    await cursor.pulse();
  } catch {
    // Animation failures should never block action execution.
  }
}

async function animateHumanInspect(element: Element): Promise<void> {
  try {
    const cursor = getVisualCursor();
    await cursor.moveToElement(element);
    await sleep(randomBetween(70, 150));
  } catch {
    // Animation failures should never block action execution.
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Action timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
