// Čistá normalizácia Sherlock JSON analýzy. Žiadne importy z Convex runtime,
// aby modul mohol použiť bežný unit test aj akcia `analyze`.
//
// Zdrojová odpoveď modelu nie je spoľahlivá: v poliach sa občas objavia
// stray čísla/reťazce a metadata môžu prísť so slovenskými kľúčmi
// (napr. `nazov_dokumentu` namiesto `document_name`). Tento modul ich
// čistí na stabilný kontrakt pre frontend a každé vynechanie započíta.

export type Provenance = {
  document: string | null;
  page: number | null;
  section: string | null;
  excerpt: string | null;
  method: string | null;
  verified: boolean;
};

export type FindingKind = "observation" | "hypothesis";

export type NormalizeContextSource = {
  document: string;
  method: string;
  pages: number | null;
  sha256: string | null;
};

export type NormalizeContext = {
  sources?: NormalizeContextSource[];
  verifyExcerpt?: (
    excerpt: string,
    document: string | null,
  ) => { verified: boolean; page: number | null };
};

export type NormalizedAnalysis = {
  metadata: Record<string, unknown>;
  persons: Array<{
    id: string;
    name: string;
    role?: string;
    description?: string;
    provenance: Provenance;
    kind: FindingKind;
  }>;
  evidence: Array<{
    id: string;
    type?: string;
    content?: string;
    source?: string;
    relevance_score?: number;
    provenance: Provenance;
    kind: FindingKind;
  }>;
  relationships: Array<{
    person1_id?: string;
    person2_id?: string;
    type?: string;
    description?: string;
    evidence_supporting?: string[];
    provenance: Provenance;
    kind: FindingKind;
  }>;
  timeline: Array<{
    id: string;
    timestamp: string | null;
    title?: string;
    description?: string;
    location?: string;
    persons_involved?: string[];
    evidence_links?: string[];
    tags?: string[];
    source_text?: string;
    confidence?: number;
    approximate?: boolean;
    provenance: Provenance;
    kind: FindingKind;
  }>;
  sources: Array<NormalizeContextSource & { integrityNote: string }>;
  quality: {
    partial: boolean;
    materiallyValid: boolean;
    droppedItems: number;
    warnings: string[];
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Polia filtruje na čisté objekty; všetko iné (čísla, reťazce, null...) zahodí.
function objectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject);
}

// Reťazcové pole filtruje na neprázdne reťazce (použitie v timeline/vzťahoch).
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(nonEmptyString);
}

/**
 * Convex povoľuje iba ASCII názvy polí, model však vracia kľúče s diakritikou
 * (napr. `dátum_nahrania`). Kľúč preto zbavíme diakritiky a nepovolených znakov.
 */
function asciiKey(key: string): string {
  const withoutDiacritics = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Riadiace a mimo-ASCII znaky nahradíme podčiarkovníkom; Convex nepovoľuje
  // ani úvodné podčiarkovníky (rezervovaný priestor systémových polí).
  const cleaned = withoutDiacritics
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[^0-9A-Za-z_]/g, "_")
    .replace(/^_+/, "");
  return cleaned.trim() || "field";
}

function lowerAsciiKey(key: string): string {
  return asciiKey(key).toLowerCase();
}

/** Rekurzívne premenuje kľúče objektov na ASCII-bezpečné názvy polí. */
function sanitizeKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeKeysDeep(item));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const safeKey = asciiKey(key);
      // Pri kolízii po normalizácii ponecháme prvý výskyt.
      if (safeKey in out) continue;
      out[safeKey] = sanitizeKeysDeep(nested);
    }
    return out;
  }
  return value;
}

// ID z entity, inak fallback P001/E001/T001 podľa indexu.
function fallbackId(rawId: unknown, prefix: string, index: number): string {
  if (nonEmptyString(rawId)) return rawId.trim();
  return `${prefix}${String(index + 1).padStart(3, "0")}`;
}

// page_count zostáva číslo aj keď model pošle číslicu ako reťazec.
function coercePageCount(value: unknown): unknown {
  if (finiteNumber(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

// Slovenské aliasy -> kanonické kľúče metadát frontend kontraktu.
// Poradie je DEKLAROVANÉ a normála ho musí rešpektovať: prvý alias v
// poradí vyhráva, ďalšie zhody sa zahodia a zapíšu do varovania.
const METADATA_ALIASES: Array<{ aliases: string[]; canonical: string }> = [
  { aliases: ["nazov_dokumentu", "nazov_dokumentu_konsolidovany", "nazov"], canonical: "document_name" },
  { aliases: ["datum_nahrania", "datum"], canonical: "upload_date" },
  { aliases: ["pocet_stran", "strany"], canonical: "page_count" },
  { aliases: ["jazyk"], canonical: "language" },
];

/** Slovenský množný tvar pre vety typu „Vynechané N položiek…". */
function slovakItemWord(count: number): string {
  if (count === 1) return "1 neplatnú položku";
  if (count >= 2 && count <= 4) return `${count} neplatné položky`;
  return `${count} neplatných položiek`;
}

const INTEGRITY_NOTE =
  "SHA-256 potvrdzuje nemennosť bajtov súboru, nie pravosť ani pôvod dokumentu.";

type SectionName = "persons" | "evidence" | "relationships" | "timeline";

const SECTION_STRING_KEYS: Record<SectionName, string[]> = {
  persons: ["id", "role", "description", "source_document", "document", "section", "source_section"],
  evidence: ["id", "type", "content", "source", "source_document", "document", "section", "source_section"],
  relationships: ["person1_id", "person2_id", "type", "description", "source_document", "document", "section", "source_section"],
  timeline: ["id", "title", "description", "location", "source_text", "source_document", "document", "section", "source_section"],
};

/** Vráti trimnutú hodnotu, keď existuje ako neprázdny reťazec. */
function fieldString(entry: Record<string, unknown>, key: string): string | undefined {
  if (!(key in entry)) return undefined;
  const value = entry[key];
  return nonEmptyString(value) ? value.trim() : undefined;
}

function fieldNumber(entry: Record<string, unknown>, key: string): number | undefined {
  if (!(key in entry)) return undefined;
  const value = entry[key];
  return finiteNumber(value) ? value : undefined;
}

function fieldBoolean(entry: Record<string, unknown>, key: string): boolean | undefined {
  if (!(key in entry)) return undefined;
  const value = entry[key];
  return typeof value === "boolean" ? value : undefined;
}

function fieldStringArray(entry: Record<string, unknown>, key: string): string[] | undefined {
  if (!(key in entry)) return undefined;
  const value = entry[key];
  return Array.isArray(value) ? stringArray(value) : undefined;
}

/**
 * Počíta nevalidné vnorené polia v zistení: reťazcové kľúče musia byť
 * neprázdne reťazce, polia musia byť polia, čísla čísla a booleans.
 * „provenance" sa od modelu nikdy nepreberá; keď dorazí a nie je objekt,
 * ide o nevalidnú štruktúru, ktorú musíme započítať.
 */
function countInvalidFields(entry: Record<string, unknown>, section: SectionName): number {
  let invalid = 0;
  for (const key of SECTION_STRING_KEYS[section]) {
    if (key in entry && !nonEmptyString(entry[key])) invalid++;
  }
  if ("provenance" in entry && !isPlainObject(entry.provenance)) invalid++;
  if (section === "evidence" && "relevance_score" in entry && !finiteNumber(entry.relevance_score)) invalid++;
  if (section === "relationships" && "evidence_supporting" in entry && !Array.isArray(entry.evidence_supporting)) invalid++;
  if (section === "timeline") {
    // null je platná hodnota timestampu v kontrakte (neznámy čas).
    if ("timestamp" in entry && entry.timestamp !== null && !nonEmptyString(entry.timestamp)) invalid++;
    for (const key of ["persons_involved", "evidence_links", "tags"]) {
      if (key in entry && !Array.isArray(entry[key])) invalid++;
    }
    if ("confidence" in entry && !finiteNumber(entry.confidence)) invalid++;
    if ("approximate" in entry && typeof entry.approximate !== "boolean") invalid++;
  }
  return invalid;
}

function sectionObjects(
  value: unknown,
): { entries: Record<string, unknown>[]; dropped: number; total: number } {
  if (!Array.isArray(value)) {
    return { entries: [], dropped: 0, total: 0 };
  }
  const entries = objectArray(value);
  return {
    entries,
    dropped: value.length - entries.length,
    total: value.length,
  };
}

function resolveSources(
  context: NormalizeContext | undefined,
): { sources: NormalizeContextSource[]; dropped: number } {
  const raw = context && isPlainObject(context) ? context.sources : undefined;
  const sources: NormalizeContextSource[] = [];
  let dropped = 0;
  if (Array.isArray(raw)) {
    for (const entry of objectArray(raw)) {
      const document = fieldString(entry, "document");
      const method = fieldString(entry, "method");
      if (!document || !method) {
        dropped++;
        continue;
      }
      sources.push({
        document,
        method,
        pages: fieldNumber(entry, "pages") ?? null,
        sha256: fieldString(entry, "sha256") ?? null,
      });
    }
  }
  return { sources, dropped };
}

function matchSourceMethod(
  document: string | null,
  sources: NormalizeContextSource[],
): string | null {
  if (sources.length === 1) return sources[0].method;
  if (!document) return null;
  const found = sources.find((s) => s.document === document);
  return found ? found.method : null;
}

/**
 * Provenanciu stavia server a nikdy nedôveruje tvrdeniam modelu:
 * overiť ju vie iba `verifyExcerpt`; hypotéza (kind) sa odvodzuje
 * od overenia citácie, nie od hodnoty vymyslenej modelom.
 */
function buildProvenance(
  entry: Record<string, unknown>,
  isTimeline: boolean,
  sources: NormalizeContextSource[],
  verifyExcerpt: NormalizeContext["verifyExcerpt"] | undefined,
  claims: { unverified: number },
): Provenance {
  let excerpt: string | null = null;
  if (isTimeline) {
    excerpt = fieldString(entry, "source_text") ?? null;
  } else {
    const fromContent = fieldString(entry, "content");
    excerpt = (fromContent ?? fieldString(entry, "description")) ?? null;
  }

  const claimedDoc =
    fieldString(entry, "source_document") ?? fieldString(entry, "document");
  const document = claimedDoc ?? (sources.length === 1 ? sources[0].document : null);

  let page: number | null =
    fieldNumber(entry, "source_page") ?? fieldNumber(entry, "page") ?? null;

  const section =
    fieldString(entry, "section") ?? fieldString(entry, "source_section") ?? null;

  let verified = false;
  if (excerpt && verifyExcerpt) {
    try {
      const result = verifyExcerpt(excerpt, document);
      if (isPlainObject(result)) {
        verified = result.verified === true;
        if (finiteNumber(result.page)) {
          // Strana verifikátora vyhráva nad tvrdením modelu.
          page = result.page;
        }
      }
    } catch {
      verified = false;
    }
  }
  if (!verified) claims.unverified++;

  return {
    document: document ?? null,
    page,
    section,
    excerpt,
    method: matchSourceMethod(document, sources),
    verified,
  };
}

function kindOf(provenance: Provenance): FindingKind {
  return provenance.verified ? "observation" : "hypothesis";
}

const SECTION_ORDER: SectionName[] = ["persons", "evidence", "relationships", "timeline"];

/**
 * Normalizuje surovú AI odpoveď na bezpečný Sherlock kontrakt:
 * zahodí neobjektové prvky polí aj nevalidné vnorené polia, doplní
 * chýbajúce ID, premapuje slovenské metadata kľúče podľa deklarovaného
 * poradia a ku každému zisteniu pripojí server-side provenanciu.
 */
export function normalizeAnalysisData(
  raw: unknown,
  context?: NormalizeContext,
): NormalizedAnalysis {
  const source = isPlainObject(raw) ? raw : {};
  const verifyExcerpt =
    context && isPlainObject(context) && typeof context.verifyExcerpt === "function"
      ? context.verifyExcerpt
      : undefined;
  const { sources, dropped: droppedSources } = resolveSources(context);

  const warnings: string[] = [];
  const claims = { unverified: 0 };
  const sectionTotal: Record<SectionName, number> = { persons: 0, evidence: 0, relationships: 0, timeline: 0 };
  // sectionDrops = vynechané záznamy + nevalidné polia; entryDrops len záznamy
  // (pomer „vynechaná väčšina záznamov" sa rátia len zo záznamov).
  const sectionDrops: Record<SectionName, number> = { persons: 0, evidence: 0, relationships: 0, timeline: 0 };
  const sectionEntryDrops: Record<SectionName, number> = { persons: 0, evidence: 0, relationships: 0, timeline: 0 };
  const sectionWarnings = new Set<SectionName>();
  const noteEntryDrop = (section: SectionName) => {
    sectionDrops[section]++;
    sectionEntryDrops[section]++;
    sectionWarnings.add(section);
  };
  const noteInvalidFields = (section: SectionName, entry: Record<string, unknown>) => {
    const count = countInvalidFields(entry, section);
    if (count <= 0) return;
    sectionDrops[section] += count;
    sectionWarnings.add(section);
  };
  let droppedItems = 0;

  // Metadata: slovenské aliasy sa premapujú podľa deklarovaného poradia
  // (prvá zhoda vyhráva) a duplicitné aliasy sa vynechajú s varovaním.
  const metadata: Record<string, unknown> = isPlainObject(source.metadata)
    ? (sanitizeKeysDeep(source.metadata) as Record<string, unknown>)
    : {};
  for (const { aliases, canonical } of METADATA_ALIASES) {
    const matches = Object.keys(metadata).filter((key) =>
      aliases.includes(lowerAsciiKey(key)),
    );
    if (matches.length === 0) continue;
    let chosen: string | undefined;
    for (const alias of aliases) {
      const found = matches.find((key) => lowerAsciiKey(key) === alias);
      if (found) {
        chosen = found;
        break;
      }
    }
    const rest = matches.filter((key) => key !== chosen);
    const chosenValue = chosen !== undefined ? metadata[chosen] : undefined;
    for (const key of [chosen, ...rest]) {
      if (key !== undefined) delete metadata[key];
    }
    if (chosenValue === undefined || chosenValue === null || chosenValue === "") {
      droppedItems++;
      warnings.push(`Metadata: vynechaný prázdny alias pre ${canonical}.`);
      continue;
    }
    if (metadata[canonical] !== undefined) {
      // Kanonický kľúč existuje: hodnota aliasu sa neprepísala, ide o duplicitu.
      droppedItems += 1 + rest.length;
      warnings.push(`Metadata: duplicitný alias pre ${canonical} bol ignorovaný.`);
      continue;
    }
    if (rest.length > 0) {
      droppedItems += rest.length;
      warnings.push(`Metadata: duplicitný alias pre ${canonical} bol ignorovaný.`);
    }
    metadata[canonical] = canonical === "page_count" ? coercePageCount(chosenValue) : chosenValue;
  }
  if (droppedSources > 0) {
    droppedItems += droppedSources;
    warnings.push(`Metadata: ${slovakItemWord(droppedSources)} v zozname zdrojov sa preskočili.`);
  }

  const persons: NormalizedAnalysis["persons"] = [];
  const rawPersons = sectionObjects(source.persons);
  sectionTotal.persons = rawPersons.total;
  if (rawPersons.dropped > 0) {
    sectionDrops.persons += rawPersons.dropped;
    sectionEntryDrops.persons += rawPersons.dropped;
    sectionWarnings.add("persons");
  }
  rawPersons.entries.forEach((person, index) => {
    if (!nonEmptyString(person.name)) {
      noteEntryDrop("persons");
      return;
    }
    noteInvalidFields("persons", person);
    const provenance = buildProvenance(person, false, sources, verifyExcerpt, claims);
    const entry: NormalizedAnalysis["persons"][number] = {
      id: fallbackId(person.id, "P", index),
      name: String(person.name).trim(),
      provenance,
      kind: kindOf(provenance),
    };
    const role = fieldString(person, "role");
    if (role) entry.role = role;
    const description = fieldString(person, "description");
    if (description) entry.description = description;
    persons.push(entry);
  });

  const evidence: NormalizedAnalysis["evidence"] = [];
  const rawEvidence = sectionObjects(source.evidence);
  sectionTotal.evidence = rawEvidence.total;
  if (rawEvidence.dropped > 0) {
    sectionDrops.evidence += rawEvidence.dropped;
    sectionEntryDrops.evidence += rawEvidence.dropped;
    sectionWarnings.add("evidence");
  }
  rawEvidence.entries.forEach((item, index) => {
    // Prvok bez obsahu, zdroja aj typu nemá čo zobraziť.
    if (
      !nonEmptyString(item.content) &&
      !nonEmptyString(item.source) &&
      !nonEmptyString(item.type)
    ) {
      noteEntryDrop("evidence");
      return;
    }
    noteInvalidFields("evidence", item);
    const provenance = buildProvenance(item, false, sources, verifyExcerpt, claims);
    const entry: NormalizedAnalysis["evidence"][number] = {
      id: fallbackId(item.id, "E", index),
      provenance,
      kind: kindOf(provenance),
    };
    const type = fieldString(item, "type");
    if (type) entry.type = type;
    const content = fieldString(item, "content");
    if (content) entry.content = content;
    const itemSource = fieldString(item, "source");
    if (itemSource) entry.source = itemSource;
    const relevance = fieldNumber(item, "relevance_score");
    if (relevance !== undefined) entry.relevance_score = relevance;
    evidence.push(entry);
  });

  const relationships: NormalizedAnalysis["relationships"] = [];
  const rawRelationships = sectionObjects(source.relationships);
  sectionTotal.relationships = rawRelationships.total;
  if (rawRelationships.dropped > 0) {
    sectionDrops.relationships += rawRelationships.dropped;
    sectionEntryDrops.relationships += rawRelationships.dropped;
    sectionWarnings.add("relationships");
  }
  rawRelationships.entries.forEach((rel, index) => {
    const p1 = fieldString(rel, "person1_id");
    const p2 = fieldString(rel, "person2_id");
    if (!p1 && !p2) {
      noteEntryDrop("relationships");
      return;
    }
    noteInvalidFields("relationships", rel);
    const provenance = buildProvenance(rel, false, sources, verifyExcerpt, claims);
    const entry: NormalizedAnalysis["relationships"][number] = {
      provenance,
      kind: kindOf(provenance),
    };
    if (p1) entry.person1_id = p1;
    if (p2) entry.person2_id = p2;
    const type = fieldString(rel, "type");
    if (type) entry.type = type;
    const description = fieldString(rel, "description");
    if (description) entry.description = description;
    const supporting = fieldStringArray(rel, "evidence_supporting");
    if (supporting && supporting.length > 0) entry.evidence_supporting = supporting;
    relationships.push(entry);
  });

  const timeline: NormalizedAnalysis["timeline"] = [];
  const rawTimeline = sectionObjects(source.timeline);
  sectionTotal.timeline = rawTimeline.total;
  if (rawTimeline.dropped > 0) {
    sectionDrops.timeline += rawTimeline.dropped;
    sectionEntryDrops.timeline += rawTimeline.dropped;
    sectionWarnings.add("timeline");
  }
  rawTimeline.entries.forEach((event, index) => {
    // Udalosť bez názvu, popisu aj zdrojového textu je nepoužiteľná.
    if (
      !nonEmptyString(event.title) &&
      !nonEmptyString(event.description) &&
      !nonEmptyString(event.source_text)
    ) {
      noteEntryDrop("timeline");
      return;
    }
    noteInvalidFields("timeline", event);
    const provenance = buildProvenance(event, true, sources, verifyExcerpt, claims);
    const entry: NormalizedAnalysis["timeline"][number] = {
      id: fallbackId(event.id, "T", index),
      timestamp: fieldString(event, "timestamp") ?? null,
      provenance,
      kind: kindOf(provenance),
    };
    const title = fieldString(event, "title");
    if (title) entry.title = title;
    const description = fieldString(event, "description");
    if (description) entry.description = description;
    const location = fieldString(event, "location");
    if (location) entry.location = location;
    const sourceText = fieldString(event, "source_text");
    if (sourceText) entry.source_text = sourceText;
    for (const key of ["persons_involved", "evidence_links", "tags"] as const) {
      const list = fieldStringArray(event, key);
      if (list && list.length > 0) entry[key] = list;
    }
    const confidence = fieldNumber(event, "confidence");
    if (confidence !== undefined) entry.confidence = confidence;
    const approximate = fieldBoolean(event, "approximate");
    if (approximate !== undefined) entry.approximate = approximate;
    timeline.push(entry);
  });

  // Varovania hlásime po sekciách a agregovane; nikdy neobsahujú obsah dokumentu.
  for (const section of SECTION_ORDER) {
    if (!sectionWarnings.has(section)) continue;
    warnings.push(`Vynechané ${slovakItemWord(sectionDrops[section])} v sekcii ${section}.`);
  }
  if (claims.unverified > 0) {
    warnings.push(`${claims.unverified} zistení nemá overiteľnú citáciu.`);
  }

  for (const section of SECTION_ORDER) {
    droppedItems += sectionDrops[section];
  }
  const kept =
    persons.length + evidence.length + relationships.length + timeline.length;
  const total = SECTION_ORDER.reduce((sum, section) => sum + sectionTotal[section], 0);
  const droppedEntries = SECTION_ORDER.reduce((sum, s) => sum + sectionEntryDrops[s], 0);
  const allEmpty = kept === 0;
  // Viac ako polovica všetkých vstupných záznamov vynechaná -> nespoliehlivý výsledok.
  const majorityDropped = total > 0 && droppedEntries >= Math.floor(total / 2) + 1;
  const materiallyValid = !allEmpty && !majorityDropped;
  const partial = droppedItems > 0 || warnings.length > 0;

  return {
    metadata,
    persons,
    evidence,
    relationships,
    timeline,
    sources: sources.map((s) => ({ ...s, integrityNote: INTEGRITY_NOTE })),
    quality: { partial, materiallyValid, droppedItems, warnings },
  };
}

const ANALYSIS_ERROR_FALLBACK = "Analýza zlyhala.";

/**
 * Text uložený do `errorMessage` a zobrazený vo fronte.
 * Jedna veta, bez stacku a bez hodnôt kľúčov.
 */
export function safeAnalysisErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const line = raw.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!line || line.length > 500) return ANALYSIS_ERROR_FALLBACK;
  if (/bearer\s+\S+/i.test(line)) return ANALYSIS_ERROR_FALLBACK;
  if (/\bsk-[A-Za-z0-9_-]{8,}/.test(line)) return ANALYSIS_ERROR_FALLBACK;
  if (/MISTRAL_(API_)?KEY|SECRET_KEY|OTP_ENDPOINT|CONVEX_DEPLOY_KEY/i.test(line)) {
    return ANALYSIS_ERROR_FALLBACK;
  }
  if (/\bat\s+.+\(.+:\d+:\d+\)/.test(line)) return ANALYSIS_ERROR_FALLBACK;
  return line;
}
