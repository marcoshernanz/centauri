import type { ActionExecutionResult } from "../shared/actions";
import type { PageContextSnapshot } from "../shared/messages";

type PlannerContextInput = {
  pageTitle: string;
  pageUrl: string;
  iteration: number;
  latestExtract: string;
  previousResults: ActionExecutionResult[];
  pageContext: PageContextSnapshot;
};

export function buildPlannerCompactContext(input: PlannerContextInput): Record<string, unknown> {
  const latestPageUrl = getLatestResultValue(input.previousResults, (result) => result.data?.url) ?? input.pageUrl;
  const latestPageTitle = getLatestResultValue(input.previousResults, (result) => result.data?.pageTitle) ?? input.pageTitle;
  const latestHeadings = getLatestResultValue(input.previousResults, (result) => result.data?.headings) ?? [];
  const latestCandidates = getLatestResultValue(input.previousResults, (result) => result.data?.candidates) ?? [];

  const compactResults = input.previousResults.slice(-6).map((result) => ({
    type: result.type,
    ok: result.ok,
    error: result.error,
    text: result.data?.text ? summarize(result.data.text, 150) : undefined,
    firstItem: result.data?.items?.[0]?.text ? summarize(result.data.items[0].text, 90) : undefined,
    url: result.data?.url ? summarize(result.data.url, 120) : undefined
  }));

  const discoveredItems = unique(
    input.previousResults
      .flatMap((result) => result.data?.items ?? [])
      .map((item) => item.text)
      .filter(Boolean)
      .map((value) => summarize(value, 90))
  ).slice(0, 10);

  const recentExtracts = input.previousResults
    .filter((result) => result.type === "EXTRACT_TEXT" && result.ok && typeof result.data?.text === "string")
    .slice(-3)
    .map((result) => summarize(result.data?.text, 180));

  const mergedHeadings = unique([...latestHeadings, ...input.pageContext.headings]).map((value) => summarize(value, 100));
  const mergedCandidates = unique([...latestCandidates, ...discoveredItems, ...input.pageContext.candidates]).map((value) =>
    summarize(value, 80)
  );

  return {
    url: latestPageUrl,
    title: summarize(latestPageTitle, 120),
    startUrl: input.pageUrl,
    path: input.pageContext.urlPath,
    iteration: input.iteration,
    headings: mergedHeadings.slice(0, 6),
    candidates: mergedCandidates.slice(0, 12),
    discoveredItems,
    latestExtract: summarize(input.latestExtract, 260),
    recentExtracts,
    recentResults: compactResults
  };
}

function getLatestResultValue<T>(results: ActionExecutionResult[], selector: (result: ActionExecutionResult) => T | undefined): T | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const value = selector(results[index]);
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (typeof value === "string" && !value.trim()) {
      continue;
    }

    return value;
  }

  return undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
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
