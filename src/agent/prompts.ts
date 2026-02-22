import { buildPlannerCompactContext } from "./context";
import type { ActionExecutionResult } from "../shared/actions";
import type { PageContextSnapshot } from "../shared/messages";

export function buildPlannerSystemPrompt(maxActions = 4): string {
  return [
    "You are a browser automation planner.",
    "Return ONLY valid JSON with this exact shape:",
    '{"actions":[{"id":"string","type":"LIST_ITEMS|CLICK|OPEN_IN_SAME_TAB|WAIT_FOR|EXTRACT_TEXT|BACK|SCROLL|DONE","target":{"selectors":["string"],"textIncludes":"string","index":0,"url":"string"},"params":{},"reason":"string"}]}',
    "Rules:",
    "- Use only allowed action types.",
    `- Use 1 to ${maxActions} actions per response.`,
    "- For multi-item tasks (top/recent/last N), prefer loops: LIST_ITEMS -> OPEN_IN_SAME_TAB/CLICK -> WAIT_FOR -> EXTRACT_TEXT -> BACK.",
    "- Prefer selectors inside main content first, then broader fallbacks.",
    "- Avoid repeating the same failed selector/action pattern.",
    "- Include DONE when enough information is gathered.",
    "- Never invent extracted text or success.",
    "- No markdown, no explanation, JSON only."
  ].join("\n");
}

export function buildPlannerUserPrompt(input: {
  task: string;
  pageTitle: string;
  pageUrl: string;
  iteration: number;
  latestExtract: string;
  previousResults: ActionExecutionResult[];
  pageContext: PageContextSnapshot;
}): string {
  const compactContext = buildPlannerCompactContext({
    pageTitle: input.pageTitle,
    pageUrl: input.pageUrl,
    iteration: input.iteration,
    latestExtract: input.latestExtract,
    previousResults: input.previousResults,
    pageContext: input.pageContext
  });

  return [
    `Task: ${input.task}`,
    "Compact context JSON (URL/title/candidates/snippets):",
    JSON.stringify(compactContext),
    "Return next JSON action batch only. Stop with DONE when task objective is met or no better action is available."
  ].join("\n\n");
}

export function buildSummarySystemPrompt(): string {
  return [
    "You summarize extracted browser context for a live demo.",
    "Be concise, factual, and structured.",
    "If context is partial, explicitly say what is missing.",
    "Do not fabricate details."
  ].join("\n");
}

export function buildReadOnlyDomSystemPrompt(): string {
  return [
    "You are a helpful assistant answering from a browser DOM snapshot.",
    "Return only the final answer text in natural language.",
    "Do not use headings, labels, JSON, bullets, or markdown unless the user explicitly asks for a list.",
    "Do not mention tools, actions, clicks, navigation, or hidden processing.",
    "If context is insufficient, add one short uncertainty sentence."
  ].join("\n");
}

export function buildPlannerRepairSystemPrompt(): string {
  return [
    "You repair malformed browser-planner JSON.",
    "Return ONLY valid JSON with this shape:",
    '{"actions":[{"id":"string","type":"LIST_ITEMS|CLICK|OPEN_IN_SAME_TAB|WAIT_FOR|EXTRACT_TEXT|BACK|SCROLL|DONE","target":{"selectors":["string"],"textIncludes":"string","index":0,"url":"string"},"params":{},"reason":"string"}]}',
    "Rules:",
    "- Keep original intent, fix formatting/schema issues only.",
    "- Remove unsupported fields or unsupported action types.",
    "- No markdown, no explanation, JSON only."
  ].join("\n");
}

export function buildPlannerRepairUserPrompt(rawPlannerOutput: string): string {
  return [
    "Repair this planner output into valid JSON:",
    rawPlannerOutput
  ].join("\n\n");
}

export function buildHackerNewsSummaryPrompt(task: string, snippets: Array<{ title: string; url: string; preview: string }>): string {
  return [
    `Task: ${task}`,
    "Write a concise, human-readable summary with this structure:",
    "1) Top Takeaways (3 bullets)",
    "2) Article-by-Article Summary (one short bullet per article)",
    "3) Why it matters (2 bullets)",
    "Keep each bullet short. Do not dump raw snippets.",
    "Avoid robotic labels (e.g. [OK]) and avoid trailing ellipses.",
    JSON.stringify(snippets)
  ].join("\n\n");
}

export function buildGmailSummaryPrompt(task: string, snippets: Array<{ index: number; preview: string }>): string {
  return [
    `Task: ${task}`,
    "Write a concise inbox summary with this structure:",
    "1) Inbox Snapshot (1 short paragraph)",
    "2) Priority Emails (High/Medium/Low grouped bullets)",
    "3) Suggested Next Actions (numbered list)",
    "Use plain language and avoid copying raw snippets.",
    JSON.stringify(snippets)
  ].join("\n\n");
}

export function buildGenericSummaryPrompt(input: {
  task: string;
  pageTitle: string;
  pageUrl: string;
  results: ActionExecutionResult[];
}): string {
  const compactResults = input.results.slice(-12).map((result) => ({
    actionId: result.actionId,
    type: result.type,
    ok: result.ok,
    error: result.error,
    text: result.data?.text ? summarize(result.data.text, 320) : undefined,
    items: result.data?.items?.slice(0, 5)
  }));

  return [
    `Task: ${input.task}`,
    `Page: ${input.pageTitle} (${input.pageUrl})`,
    "Execution context:",
    JSON.stringify(compactResults),
    "Provide a concise final answer with: Summary, Key Points, Next Actions."
  ].join("\n\n");
}

export function buildGenericTraversalSummaryPrompt(input: {
  task: string;
  originTitle: string;
  originUrl: string;
  visited: Array<{ title: string; url: string; preview: string; ok: boolean }>;
}): string {
  const compactVisited = input.visited.slice(0, 8).map((item, index) => ({
    index: index + 1,
    title: summarize(item.title, 120),
    url: item.url,
    ok: item.ok,
    preview: summarize(item.preview, 320)
  }));

  return [
    `Task: ${input.task}`,
    `Origin page: ${input.originTitle} (${input.originUrl})`,
    "Visited page snippets:",
    JSON.stringify(compactVisited),
    "Write a concise answer with sections: Overall Summary, Item Highlights, Suggested Next Actions.",
    "Use the snippets as evidence and mention if coverage is partial.",
    "Avoid status labels like [OK] and avoid ellipsis-heavy phrasing."
  ].join("\n\n");
}

export function buildReadOnlyDomPrompt(input: {
  task: string;
  pageTitle: string;
  pageUrl: string;
  pageContext: PageContextSnapshot;
}): string {
  const compactContext = {
    path: input.pageContext.urlPath,
    headings: input.pageContext.headings.slice(0, 10).map((value) => summarize(value, 110)),
    candidates: input.pageContext.candidates.slice(0, 18).map((value) => summarize(value, 90)),
    bodyTextSnippet: summarize(input.pageContext.bodyTextSnippet, 2600)
  };

  return [
    `User request: ${input.task}`,
    `Current page: ${input.pageTitle} (${input.pageUrl})`,
    "DOM snapshot JSON (evidence only):",
    JSON.stringify(compactContext),
    "Write one direct natural-language response.",
    "Do not add headings, labels, metadata, or status sections.",
    "Do not mention tools, clicks, actions, navigation, or raw JSON.",
    "If details are missing, include one short uncertainty sentence at the end."
  ].join("\n\n");
}

function summarize(value: string | undefined, maxChars: number): string {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}`.trim();
}
