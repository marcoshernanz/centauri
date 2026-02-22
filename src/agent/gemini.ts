declare const __NWA_GEMINI_API_KEY__: string | undefined;
declare const __NWA_GEMINI_MODEL__: string | undefined;

const DEFAULT_GEMINI_MODEL = "gemini-3.0-flash";
const DEFAULT_GEMINI_TEMPERATURE = 0.2;

type GeminiPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
};

export type GeminiConfig = {
  apiKey: string;
  model: string;
  temperature: number;
};

export async function loadGeminiConfig(): Promise<GeminiConfig | null> {
  const apiKey = (__NWA_GEMINI_API_KEY__ ?? "").trim();
  if (!apiKey) {
    return null;
  }

  const model = (__NWA_GEMINI_MODEL__ ?? "").trim() || DEFAULT_GEMINI_MODEL;
  return {
    apiKey,
    model,
    temperature: DEFAULT_GEMINI_TEMPERATURE
  };
}

export async function callGeminiImageSummary(input: {
  config: GeminiConfig;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.config.model)}:generateContent?key=${encodeURIComponent(input.config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: input.prompt },
            {
              inline_data: {
                mime_type: input.mimeType,
                data: input.imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: input.config.temperature,
        maxOutputTokens: input.maxOutputTokens ?? 800
      }
    })
  });

  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini API request failed (${response.status})`);
  }

  const text = (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned empty content");
  }

  return text;
}
