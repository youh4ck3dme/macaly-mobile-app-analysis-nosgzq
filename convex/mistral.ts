"use node";

// Klient na Mistral AI: chat completion pre analýzu a OCR pre skeny/obrázky.
// Obe volania majú obmedzené opakovanie pre prechodné chyby (429, 5xx, sieť),
// úspešné odpovede sa nikdy neopakujú a klienti (401/402/400) vôbec.

const CHAT_API_URL = "https://api.mistral.ai/v1/chat/completions";
const OCR_API_URL = "https://api.mistral.ai/v1/ocr";
const DEFAULT_MODEL = "mistral-large-latest";
const DEFAULT_OCR_MODEL = "mistral-ocr-latest";

// Max. 3 pokusy, oneskorenie 1 s a 3 s. Nikdy neopakujeme úspešné volania.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000];

const CHAT_TIMEOUT_MS = 120_000;
const OCR_TIMEOUT_MS = 180_000;

export type MistralMessage = {
  role: "system" | "user";
  content: string;
};

export type OcrPage = { index: number; markdown: string };

/** Chyba prechodného charakteru (429/5xx/sieť) - umožňuje volajúcemu jeden opakovaný pokus. */
export class TransientMistralError extends Error {}

function mistralApiKey(): string {
  const apiKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_KEY;
  if (!apiKey) {
    throw new Error("Mistral AI kľúč nie je nakonfigurovaný.");
  }
  return apiKey;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Odošle POST na Mistral API s obmedzeným opakovaním (max. 3 pokusy,
 * oneskorenie 1 s a 3 s) iba pri prechodných chybách (429, 5xx, sieť/timeout).
 * Úspešná odpoveď sa nikdy neopakuje; 401/403/402/4xx sa vracajú volajúcemu
 * bez opakovania. Logujeme len stavové kódy, nikdy obsah ani kľúč.
 */
async function postWithRetry(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${mistralApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok && isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
        console.warn("[Mistral] Prechodná chyba volania, pokus sa opakuje.", {
          status: response.status,
          attempt,
        });
        await delay(RETRY_DELAYS_MS[attempt - 1] ?? 3_000);
        continue;
      }
      return response;
    } catch (error) {
      // Sieťová chyba alebo vypršaný čas na odpoveď (AbortSignal) sú prechodné.
      if (error instanceof TransientMistralError) {
        lastError = error;
      } else if (error instanceof Error) {
        lastError = new TransientMistralError(error.message);
      } else {
        lastError = new TransientMistralError("Napojenie na Mistral AI zlyhalo.");
      }
      console.warn("[Mistral] Sieťová chyba alebo vypršal čas na odpoveď.", { attempt });
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAYS_MS[attempt - 1] ?? 3_000);
        continue;
      }
    }
  }
  throw lastError ?? new TransientMistralError("Napojenie na Mistral AI zlyhalo.");
}

/** Zavolá Mistral chat completion a vráti text odpovede. */
export async function analyzeWithMistral(messages: MistralMessage[]): Promise<string> {
  const response = await postWithRetry(
    CHAT_API_URL,
    {
      model: process.env.MISTRAL_MODEL || DEFAULT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    },
    CHAT_TIMEOUT_MS,
  );

  if (!response.ok) {
    console.warn("[Mistral] Analysis request failed", { status: response.status });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Mistral AI odmietol prístup. Skontrolujte API kľúč v Secrets.");
    }
    if (response.status === 402) {
      throw new Error(
        "Mistral AI nemá dostupný kredit. Doplňte kredit vo svojom Mistral účte a skúste to znova.",
      );
    }
    if (response.status === 429) {
      throw new Error("Mistral AI je dočasne zaneprázdnený. Skúste to znova neskôr.");
    }
    throw new Error("Mistral AI nedokončil analýzu dokumentu.");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Mistral AI nevrátil žiadnu odpoveď.");
  }
  return content;
}

/**
 * Rozpozná text z obrázka (kind "image") alebo dokumentu/PDF (kind "document")
 * cez Mistral OCR. Očakáva vstup ako base64 data URI. Vráti strany zoradené
 * podľa indexu (chýbajúci markdown sa mapuje na prázdny reťazec). Hodí chybu,
 * keď odpoveď neobsahuje žiadne strany.
 */
export async function ocrWithMistral(input: {
  dataUri: string;
  kind: "image" | "document";
}): Promise<OcrPage[]> {
  const document =
    input.kind === "image"
      ? { type: "image_url", image_url: input.dataUri }
      : { type: "document_url", document_url: input.dataUri };

  const response = await postWithRetry(
    OCR_API_URL,
    {
      model: process.env.MISTRAL_OCR_MODEL || DEFAULT_OCR_MODEL,
      document,
    },
    OCR_TIMEOUT_MS,
  );

  if (!response.ok) {
    console.warn("[Mistral] OCR request failed", { status: response.status });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Mistral OCR odmietol prístup. Skontrolujte API kľúč v Secrets.");
    }
    if (response.status === 402) {
      throw new Error(
        "Mistral AI nemá dostupný kredit pre rozpoznávanie textu. Doplňte kredit vo svojom Mistral účte a skúste to znova.",
      );
    }
    if (response.status === 429) {
      throw new Error(
        "Mistral AI je dočasne zaneprázdnený pri rozpoznávaní textu. Skúste to znova neskôr.",
      );
    }
    throw new Error("Mistral nedokončil rozpoznávanie textu.");
  }

  const payload = (await response.json()) as { pages?: Array<{ index?: unknown; markdown?: unknown }> };
  const rawPages = payload?.pages;
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    throw new Error("Mistral OCR nevrátil žiadny rozpoznaný text.");
  }

  const pages: OcrPage[] = rawPages.map((page, position) => ({
    index: typeof page?.index === "number" ? page.index : position,
    markdown: typeof page?.markdown === "string" ? page.markdown : "",
  }));
  pages.sort((a, b) => a.index - b.index);
  console.info("[Mistral] OCR dokončený.", { pages: pages.length, kind: input.kind });
  return pages;
}