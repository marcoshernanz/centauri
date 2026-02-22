import type { ActionExecutionResult } from "../shared/actions";

export function buildPlannerSystemPrompt(maxActions = 4): string {
  return [
    "You are a browser automation planner.",
    "Return ONLY valid JSON with this exact shape:",
    '{"actions":[{"id":"string","type":"LIST_ITEMS|CLICK|OPEN_IN_SAME_TAB|WAIT_FOR|EXTRACT_TEXT|BACK|SCROLL|DONE","target":{"selectors":["string"],"textIncludes":"string","index":0,"url":"string"},"params":{},"reason":"string"}]}',
    "Rules:",
    "- Use only allowed action types.",
    `- Use 1 to ${maxActions} actions per response.`,
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
}): string {
  const compactResults = input.previousResults.slice(-8).map((result) => ({
    actionId: result.actionId,
    type: result.type,
    ok: result.ok,
    error: result.error,
    textPreview: result.data?.text ? summarize(result.data.text, 180) : undefined,
    itemsPreview: result.data?.items?.slice(0, 3)
  }));

  return [
    `Task: ${input.task}`,
    `Page title: ${input.pageTitle}`,
    `Page url: ${input.pageUrl}`,
    `Iteration: ${input.iteration}`,
    `Latest extracted preview: ${summarize(input.latestExtract, 280)}`,
    "Previous execution results:",
    JSON.stringify(compactResults),
    "Return next JSON action batch."
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

function summarize(value: string | undefined, maxChars: number): string {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 3)}...`;
}
