// Čisté (ne-Convex) pomocné funkcie pre extrakciu a overovanie pôvodu textu.
// Modul je zámerne bez importov, aby ho bolo možné testovať jednotkovo.

export type ExtractionMethod = "pdf-text" | "pdf-ocr" | "image-ocr" | "docx" | "plain";

export type ExtractedSource = {
  // Názov súboru (identifikátor zdroja v analýze).
  document: string;
  // Spôsob extrakcie textu.
  method: ExtractionMethod;
  // Počet strán (null, keď formát stránky nemá, napr. DOCX/TXT).
  pages: number | null;
  // Celý extrahovaný text.
  text: string;
  // Text po stranách, ak je dostupný, inak prázdne pole.
  pageTexts: string[];
  // Odtlačok súboru z úložiska, ak je dostupný.
  sha256: string | null;
};

/**
 * Rozhodne, či je text z PDF použiteľný, alebo ide o skenovaný dokument bez textovej vrstvy.
 * Neplatný je text s menej než 80 alfanumerickými znakmi celkovo alebo s priemerom
 * menej než 20 alfanumerických znakov na stranu.
 */
export function isTextLayerUsable(text: string, pageCount: number): boolean {
  const pattern = /[\p{L}\p{N}]/gu;
  let alphanumeric = 0;
  while (pattern.exec(text) !== null) alphanumeric++;
  if (alphanumeric < 80) return false;
  if (pageCount > 0 && alphanumeric / pageCount < 20) return false;
  return true;
}

/**
 * Normalizuje text pre porovnávanie citácií (malé písmená, zjednotené medzery,
 * bez diakritiky). Citát aj zdroj sa porovnávajú v tejto forme.
 */
export function normalizeForMatch(value: string): string {
  return value
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Nájde stranu, na ktorej sa úryvok nachádza. Vracia { verified, page }
 * (page je 1-based alebo null). Najprv hľadá v jednotlivých stranách, potom
 * v celom spojenom texte (citát cez hranicu strán). Príliš krátke úryvky
 * sa nikdy nepovažujú za overené, aby citáty neboli falošne potvrdené.
 */
export function locateExcerpt(
  excerpt: string,
  source: { text: string; pageTexts: string[] },
): { verified: boolean; page: number | null } {
  const needle = normalizeForMatch(excerpt);
  if (needle.length < 12) {
    return { verified: false, page: null };
  }
  for (let i = 0; i < source.pageTexts.length; i++) {
    if (normalizeForMatch(source.pageTexts[i]).includes(needle)) {
      return { verified: true, page: i + 1 };
    }
  }
  if (source.text && normalizeForMatch(source.text).includes(needle)) {
    return { verified: true, page: null };
  }
  return { verified: false, page: null };
}