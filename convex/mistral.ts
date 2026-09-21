"use node";

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MODEL = "mistral-large-latest";

export type MistralMessage = {
  role: "system" | "user";
  content: string;
};

/** Reads the Mistral key, accepting either supported secret name. */
function mistralApiKey(): string {
  const value = process.env.MISTRAL_API_KEY || process.env.MISTRAL_KEY;
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      "Chýba Mistral API kľúč. Uložte MISTRAL_API_KEY alebo MISTRAL_KEY v Settings → Secrets.",
    );
  }
  return trimmed;
}

/** Calls Mistral from a Convex Node action and returns JSON-mode output only. */
export async function analyzeWithMistral(
  messages: MistralMessage[],
): Promise<string> {
  const response = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mistralApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || DEFAULT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    console.warn("[Mistral] Analysis request failed", { status: response.status });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Mistral AI odmietol prístup. Skontrolujte API kľúč v Secrets.");
    }
    if (response.status === 402) {
      throw new Error("Mistral AI nemá dostupný kredit pre analýzu. Doplňte kredit vo svojom Mistral účte a skúste to znova.");
    }
    if (response.status === 429) {
      throw new Error("Mistral AI je dočasne zaneprázdnený. Skúste analýzu znova neskôr.");
    }
    throw new Error("Mistral AI nedokončil analýzu dokumentu.");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Mistral AI vrátil prázdnu odpoveď.");
  }
  return content;
}
