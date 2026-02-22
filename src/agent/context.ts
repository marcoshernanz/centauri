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
  const compactResults = input.previousResults.slice(-6).map((result) => ({
    type: result.type,
    ok: result.ok,
    error: result.error,
    text: result.data?.text ? summarize(result.data.text, 180) : undefined,
    item: result.data?.items?.[0]?.text ? summarize(result.data.items[0].text, 90) : undefined
  }));

  return {
    url: input.pageUrl,
    title: summarize(input.pageTitle, 120),
    path: input.pageContext.urlPath,
    iteration: input.iteration,
    headings: input.pageContext.headings.slice(0, 6).map((entry) => summarize(entry, 100)),
    candidates: input.pageContext.candidates.slice(0, 10).map((entry) => summarize(entry, 80)),
    latestExtract: summarize(input.latestExtract, 260),
    recentResults: compactResults
  };
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
