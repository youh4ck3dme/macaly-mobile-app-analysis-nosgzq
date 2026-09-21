"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { analyzeWithMistral } from "./mistral";

// Forenzný systémový prompt podľa špecifikácie Sherlock AI Analyzer.
const SYSTEM_PROMPT = `Si ForenzDetectiv Sherlock AI – expertný analytický systém na spracovanie právnych, vyšetrovacích a forenzných dokumentov.
Tvoja úloha je extrahovať, triediť a vizualizovať dôležité informácie z nahraných textov.

### Pravidlá analýzy:
1. Vstup: Používateľ nahral 1 veľký PDF dokument alebo viacero malých dokumentov.
2. Výstup: Struktúrované JSON s nasledujúcimi sekciami:
   - metadata (názov dokumentu, dátum nahrania, počet strán, jazyk)
   - persons (zoznam osôb s identifikátorom, rolou, popisom)
   - evidence (zoznam dôkazov: dokumenty, fotky, výpovedi, atď.)
   - relationships (vzťahy medzi osobami: "zná", "spolupracoval", "konflikt", atď.)
   - timeline (HLAVNÁ SEKCIA: chronologický zoznam udalostí zoradený od najstaršej po najnovšiu)

3. Časové pásma (timeline):
   - Každá udalosť MUSÍ mať: id (unikatné), timestamp (ISO 8601: YYYY-MM-DDTHH:MM:SSZ alebo DD.MM.YYYY HH:MM ak nie je presný čas), title (krátky názov), description (detailný popis), location (miesto, ak je dostupné), persons_involved (ID osôb z persons), evidence_links (ID dôkazov z evidence), tags (kategórie: ["vražda", "krádež", "alibi", "svedectvo", ...])
   - Formát: Zoradené od najstaršej po najnovšiu (ascending)
   - Ak chýba čas: Použi null a umiestni na koniec timeline

4. Dôkazy (evidence): id, type ("document", "photo", "testimony", "video", ...), content (textový výťah alebo odkaz), source (zdroj: str. 5, PDF: "dokument_1.pdf", atď.), relevance_score (1-10)

5. Vzťahy (relationships): person1_id, person2_id, type ("spolupracoval", "rodinný", "nepriateľ", ...), description (kontext), evidence_supporting (ID dôkazov)

6. Osoby (persons): id (unikatné, napr. "P001"), name (celé meno), role ("obvinený", "svedok", "obete", "polícia", ...), description (krátky popis)

7. Formátovanie času:
   - Ak je čas napísaný ako "15. mája 2023 o 14:30", preveď na "2023-05-15T14:30:00Z".
   - Ak je len dátum ("15.5.2023"), použij "2023-05-15T00:00:00Z".
   - Ak je len rok ("2023"), použij "2023-01-01T00:00:00Z".
   - Ak je v texte časové pásmo (napr. "14:30 SEČ"), konvertuj na UTC.

8. Vyhľadávanie v timeline: Každá udalosť v timeline MUSÍ obsahovať pôvodný textový výťah z dokumentu v poli source_text. Toto slúži na full-text search v aplikácii.

9. Jazyk: Analyzuj text v pôvodnom jazyku (SK/CZ/EN) a výstup vráť v tom istom jazyku.

10. Validácia:
    - Ak nájdeš nejasný čas (napr. "okolo poludnia"), použij approximate: true.
    - Ak je udalosť neistá, pridať confidence: 0-1 (1 = isté, 0 = neisté).

### Čo NEROBÍŠ:
- Neinventuj údaje, ktoré nie sú v texte.
- Nepreskakuj udalosti, aj keby sa ti zdali nedôležité.
- Nezlučuj udalosti, ktoré sa stali v rôzny čas.
- Nepoužívaj odhady, ak nie sú podložené textom.

Odpovedaj LEN validným JSON bez akýchkoľvek úvodov, vysvetlení alebo omlúv.`;

// Stručný prompt pre analýzu jedného segmentu: extrakcia samotných faktov,
// aby výstup zostal zvládnuteľný aj pre veľké dokumenty.
const CHUNK_PROMPT = `Analyzuj nasledujúci výňatok forenzného dokumentu a extrahuj IBA overiteľné fakty, ktoré sa nachádzajú priamo vo výňatku. Vráť len validné JSON v tvare:
{"persons":[{"id":"P001","name":"celé meno","role":"rola","description":"popis"}],"evidence":[{"id":"E001","type":"document","content":"výťah","source":"zdroj","relevance_score":5}],"relationships":[{"person1_id":"P001","person2_id":"P002","type":"vzťah","description":"kontext"}],"timeline":[{"timestamp":"ISO 8601 alebo null","title":"krátky názov","description":"popis","location":null,"persons_involved":[],"tags":[],"source_text":"pôvodný výňatok z textu"}]}
Použi výhradne fakty z tohto výňatku, nič nevymýšľaj. Ak výňatok neobsahuje relevantné fakty, vráť prázdne polia. Žiadne úvody ani vysvetlenia.`;

type AnalyzeResult =
  | { ok: true; analysisId: string }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID"; message: string };

// Limity spracovania. Súbory > 60 MiB sa delia na dve rodičovské dávky,
// každá rodičovská dávka sa potom seká na konzervatívne malé segmenty.
const LARGE_FILE_BYTES = 60 * 1024 * 1024;
const MAX_CHARS_PER_CHUNK = 45_000;
const MAX_CHUNK_RESULT_CHARS = 8_000;
const MAX_TOTAL_CHUNKS = 80;
const MAX_CONSOLIDATION_CHARS = 220_000;

type SourceBatch = { filename: string; text: string; parentIndex: number };

// Overí, či odpoveď LLM obsahuje všetky povinné kľúče a je validné JSON.
function parseAnalysisResponse(response: string): Record<string, unknown> | null {
  try {
    const json = JSON.parse(response);
    const requiredKeys = [
      "metadata",
      "persons",
      "evidence",
      "relationships",
      "timeline",
    ];
    if (typeof json !== "object" || json === null) return null;
    for (const key of requiredKeys) {
      if (!(key in json)) return null;
    }
    return json as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Odvodí normalizovaný formát z uloženého formátu alebo prípony názvu súboru.
 */
function resolveFormat(file: { format?: string; filename: string }): string | null {
  if (file.format) return file.format.toLowerCase();
  const lowered = file.filename.toLowerCase();
  const dot = lowered.lastIndexOf(".");
  if (dot <= 0) return null;
  const map: Record<string, string> = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "txt",
    ".md": "md",
    ".csv": "csv",
    ".json": "json",
  };
  return map[lowered.slice(dot)] ?? null;
}

/**
 * Rozdelí dlhý text na dve rodičovské dávky pri prirodzenej hranici
 * (prázdny riadok / odsek) čo najbližšie k polovici textu.
 */
function splitIntoParentBatches(text: string): [string, string] {
  if (text.length < 2) return [text, ""];
  const mid = Math.floor(text.length / 2);
  const window = 60_000;
  let cut = -1;
  for (let offset = 0; offset < window; offset++) {
    const back = text.lastIndexOf("\n\n", mid - offset);
    if (back !== -1 && mid - offset - back <= window && back > 0) {
      cut = back + 2;
      break;
    }
    const forward = text.indexOf("\n\n", mid + offset);
    if (forward !== -1 && forward - (mid + offset) <= window) {
      cut = forward + 2;
      break;
    }
  }
  if (cut === -1) cut = mid;
  return [text.slice(0, cut), text.slice(cut)];
}

/**
 * Rozsekuje text na segmenty maximálne maxChars znakov, vždy na prirodzenej
 * hranici (odsek, veta) a nikdy nespája neobmedzené množstvo textu.
 */
function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  const paragraphs = text.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const pieces: string[] = [];
    if (paragraph.length > maxChars) {
      // Dlhý odsek: režeme po vetách.
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let piece = "";
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          if (piece) {
            pieces.push(piece);
            piece = "";
          }
          pieces.push(sentence.slice(0, maxChars));
          continue;
        }
        if (piece.length + sentence.length + 1 > maxChars) {
          pieces.push(piece);
          piece = sentence;
        } else {
          piece = piece ? `${piece} ${sentence}` : sentence;
        }
      }
      if (piece) pieces.push(piece);
    } else {
      pieces.push(paragraph);
    }
    for (const piece of pieces) {
      if (!piece.trim()) continue;
      if (current.length + piece.length + 2 > maxChars && current) {
        chunks.push(current);
        current = piece;
      } else {
        current = current ? `${current}\n\n${piece}` : piece;
      }
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

/**
 * Hlavná analýza: overí vlastníctvo súborov, stiahne súbory, extrahuje text,
 * rozdelí veľké dokumenty na rodičovské dávky a segmenty, zavolá Mistral
 * pre každý segment a konsoliduje výsledky do Sherlock JSON kontraktu.
 */
export const analyze = action({
  args: { fileIds: v.array(v.id("files")) },
  handler: async (ctx, args): Promise<AnalyzeResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    if (!args.fileIds || args.fileIds.length === 0) {
      return {
        ok: false,
        code: "INVALID",
        message: "Vyberte aspoň jeden súbor na analýzu.",
      };
    }

    // Overenie vlastníctva všetkých súborov.
    const ownedFiles = await ctx.runQuery(internal.files.getFilesForOwner, {
      fileIds: args.fileIds,
      ownerId: userId,
    });
    if (ownedFiles.length !== args.fileIds.length) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "K niektorému súboru nemáte prístup.",
      };
    }

    const name = `Analýza ${new Date().toLocaleDateString("sk-SK")}`;
    const insertResult = await ctx.runMutation(internal.analyses.insertAnalysis, {
      ownerId: userId,
      fileIds: args.fileIds,
      name,
      data: null,
      status: "analyzing",
    });

    try {
      let pageCount = 0;
      let pagesKnown = false;
      const sourceBatches: SourceBatch[] = [];

      // Stiahnuť a extrahovať text zo všetkých súborov podľa formátu.
      for (let i = 0; i < ownedFiles.length; i++) {
        const file = ownedFiles[i];
        const base = 5 + (i / ownedFiles.length) * 10;
        await ctx.runMutation(internal.analyses.updateAnalysisProgress, {
          analysisId: insertResult.analysisId,
          progress: Math.round(base),
          progressLabel: `Spracúva sa súbor ${i + 1} z ${ownedFiles.length}`,
        });
        const format = resolveFormat(file);
        if (!format) {
          throw new Error(
            `Nepodporovaný formát súboru "${file.filename}". Povolené sú PDF, DOCX, TXT, MD, CSV a JSON.`,
          );
        }
        const blob = await ctx.storage.get(file.storageId);
        if (!blob) {
          throw new Error(`Súbor "${file.filename}" nie je dostupný.`);
        }
        const buffer = await blob.arrayBuffer();
        const { text, pages } = await extractText(buffer, format, file.filename);
        pageCount += pages;
        if (pages > 0) pagesKnown = true;

        // Binárne formáty sa nedeľia po bajtoch. Delí sa až extrahovaný text:
        // veľký zdrojový súbor vytvorí dve rodičovské analytické dávky.
        const parents = file.size > LARGE_FILE_BYTES
          ? splitIntoParentBatches(text)
          : [text];
        parents.forEach((parentText, parentIndex) => {
          if (parentText.trim()) {
            sourceBatches.push({ filename: file.filename, text: parentText, parentIndex });
          }
        });
      }

      if (!sourceBatches.length || sourceBatches.every((b) => !b.text.trim())) {
        throw new Error("Zo súborov sa nepodarilo extrahovať žiadny text.");
      }

      // Segmentácia na malé, kontextovo bezpečné časti.
      const chunks: string[] = [];
      for (const batch of sourceBatches) {
        chunks.push(...splitTextIntoChunks(batch.text, MAX_CHARS_PER_CHUNK));
      }
      if (chunks.length === 0) {
        throw new Error("Zo súborov sa nepodarilo extrahovať žiadny text.");
      }
      if (chunks.length > MAX_TOTAL_CHUNKS) {
        throw new Error(
          `Dokumenty sú príliš rozsiahle na jednorazovú analýzu. Spracovateľný limit je ${MAX_TOTAL_CHUNKS} segmentov po ${MAX_CHARS_PER_CHUNK} znakoch, tento dokument vyžaduje ${chunks.length}. Rozdeľte prosím dokument na menšie časti.`,
        );
      }

      // Analýza každého segmentu pomocou stručnej extrakcie faktov.
      const chunkOutputs: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const progress = 20 + (i / chunks.length) * 60;
        await ctx.runMutation(internal.analyses.updateAnalysisProgress, {
          analysisId: insertResult.analysisId,
          progress: Math.round(progress),
          progressLabel: `Analyzuje sa časť ${i + 1} z ${chunks.length}`,
        });
        const raw = await analyzeWithMistral([
          { role: "system", content: CHUNK_PROMPT },
          { role: "user", content: chunks[i] },
        ]);
        const trimmed = raw.length > MAX_CHUNK_RESULT_CHARS
          ? raw.slice(0, MAX_CHUNK_RESULT_CHARS)
          : raw;
        chunkOutputs.push(trimmed);
      }

      // Konsolidácia výstupov segmentov do finálneho Sherlock JSON.
      await ctx.runMutation(internal.analyses.updateAnalysisProgress, {
        analysisId: insertResult.analysisId,
        progress: 85,
        progressLabel: "Konsolidujú sa výsledky analýzy",
      });
      let consolidated = "";
      for (const output of chunkOutputs) {
        if (consolidated.length + output.length + 20 > MAX_CONSOLIDATION_CHARS) {
          consolidated += "\n\n[Poznámka: časť čiastkových výsledkov bola vynechaná kvôli limitu veľkosti.]";
          break;
        }
        consolidated += (consolidated ? "\n\n---\n\n" : "") + output;
      }
      const rawText = await analyzeWithMistral([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Nasledujú čiastkové JSON výsledky extrakcie faktov z jednotlivých segmentov dokumentov. Konsoliduj ich do jediného finálneho JSON podľa špecifikácie zo systémového promptu: zjednoť osoby a dôkazy, prenumberuj ID, odstráň duplicity a zoradi timeline od najstaršej po najnovšiu udalosť. Nepíš žiadne úvody, len JSON.\n\n---\n${consolidated}\n---`,
        },
      ]);
      const data = parseAnalysisResponse(rawText);
      if (!data) {
        throw new Error("AI odpoveď nebola vo validnom formáte.");
      }

      // Doplníme stránky do metadát, ak ich LLM nevrátil.
      const metadata = (data.metadata as Record<string, unknown>) ?? {};
      if (typeof metadata.page_count !== "number" && pagesKnown) {
        metadata.page_count = pageCount;
      }
      data.metadata = metadata;

      await ctx.runMutation(internal.analyses.updateAnalysis, {
        analysisId: insertResult.analysisId,
        data,
        status: "ready",
        progress: 100,
        progressLabel: "Analýza dokončená",
      });

      return { ok: true, analysisId: insertResult.analysisId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analýza zlyhala.";
      await ctx.runMutation(internal.analyses.updateAnalysis, {
        analysisId: insertResult.analysisId,
        data: null,
        status: "error",
        errorMessage: message,
        progress: 100,
        progressLabel: "Analýza zlyhala",
      });
      return {
        ok: false,
        code: "INVALID",
        message,
      };
    }
  },
});

class PdfTextDomMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(values?: number[]) {
    if (values?.length === 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = values;
    }
  }
}

class PdfTextPath2D {
  constructor(_path?: unknown) {}
}

function ensurePdfTextExtractionGlobals() {
  if (!globalThis.DOMMatrix) {
    Object.assign(globalThis, { DOMMatrix: PdfTextDomMatrix });
  }
  if (!globalThis.Path2D) {
    Object.assign(globalThis, { Path2D: PdfTextPath2D });
  }
}

/**
 * Extrahuje text z PDF bufferu pomocou pdfjs-dist (Node kompatibilné).
 */
async function extractTextFromPdf(
  pdfBuffer: ArrayBuffer,
): Promise<{ text: string; pages: number }> {
  ensurePdfTextExtractionGlobals();
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    useWorkerFetch: false,
    useSystemFonts: true,
  } as Parameters<typeof getDocument>[0]);
  const pdf = await task.promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => (item as { str?: string }).str ?? "").join(" ") + "\n";
  }
  const pages = pdf.numPages;
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return { text, pages };
}

/**
 * Extrahuje surový text z DOCX pomocou mammoth (čisté JS, bez natívnych modulov).
 */
async function extractTextFromDocx(
  buffer: ArrayBuffer,
): Promise<{ text: string; pages: number }> {
  const mammothModule = await import("mammoth");
  // Convex môže CJS balík vystaviť iba cez `default`, kým Node poskytuje aj named export.
  const mammothApi = mammothModule as unknown as {
    extractRawText?: typeof mammothModule.extractRawText;
    default?: { extractRawText?: typeof mammothModule.extractRawText };
  };
  const extractRawText = mammothApi.extractRawText ?? mammothApi.default?.extractRawText;
  if (!extractRawText) {
    throw new Error("Pre DOCX nie je dostupný extraktor textu.");
  }
  const result = await extractRawText({ buffer: Buffer.from(buffer) });
  return { text: result.value, pages: 0 };
}

/**
 * Bezpečne dekóduje textové formáty (TXT, MD, CSV, JSON) s TextDecoder.
 * Validné JSON pekne naformátuje pre lepšiu čitateľnosť pre model.
 */
function extractTextFromPlain(buffer: ArrayBuffer, format: string): string {
  const decoded = new TextDecoder("utf-8").decode(buffer);
  const text = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
  if (format === "json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Nevalidné JSON spracujeme ako obyčajný text.
    }
  }
  return text;
}

/**
 * Extrahuje text podľa uloženého formátu alebo prípony súboru.
 */
async function extractText(
  buffer: ArrayBuffer,
  format: string,
  filename: string,
): Promise<{ text: string; pages: number }> {
  if (format === "pdf") {
    return extractTextFromPdf(buffer);
  }
  if (format === "docx") {
    return extractTextFromDocx(buffer);
  }
  if (format === "txt" || format === "md" || format === "csv" || format === "json") {
    return { text: extractTextFromPlain(buffer, format), pages: 0 };
  }
  throw new Error(`Nepodporovaný formát súboru "${filename}".`);
}
