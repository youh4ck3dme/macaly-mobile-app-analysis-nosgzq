// Čistá normalizácia Sherlock JSON analýzy. Žiadne importy z Convex runtime,
// aby modul mohol použiť bežný unit test aj akcia `analyze`.
//
// Zdrojová odpoveď modelu nie je spoľahlivá: v poliach sa občas objavia
// stray čísla/reťazce a metadata môžu prísť so slovenskými kľúčmi
// (napr. `nazov_dokumentu` namiesto `document_name`). Tento modul ich
// čistí na stabilný kontrakt pre frontend.

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

export type NormalizedAnalysis = {
  metadata: Record<string, unknown>;
  persons: Array<{ id: string; name: string; role?: string; description?: string }>;
  evidence: Array<{ id: string; type?: string; content?: string; source?: string; relevance_score?: number }>;
  relationships: Array<{ person1_id?: string; person2_id?: string; type?: string; description?: string; evidence_supporting?: string[] }>;
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
  }>;
};

// Slovenské aliasy -> kanonické kľúče metadát frontend kontraktu.
const METADATA_ALIASES: Array<{ aliases: string[]; canonical: string }> = [
  { aliases: ["nazov_dokumentu", "nazov_dokumentu_konsolidovany", "nazov"], canonical: "document_name" },
  { aliases: ["datum_nahrania", "datum"], canonical: "upload_date" },
  { aliases: ["pocet_stran", "strany"], canonical: "page_count" },
  { aliases: ["jazyk"], canonical: "language" },
];

/**
 * Normalizuje surovú AI odpoveď na bezpečný Sherlock kontrakt:
 * zahodí neobjektové prvky polí, doplní chýbajúce ID a premapuje
 * slovenské metadata kľúče na kanonické názvy.
 */
export function normalizeAnalysisData(raw: unknown): NormalizedAnalysis {
  const source = isPlainObject(raw) ? raw : {};

  // Metadata: slovenské aliasy sa premapujú (bez prepísania existujúceho
  // kanonického kľúča) a aliasy sa odstránia; ďalšie kľúče zostanú nedotknuté.
  const metadata: Record<string, unknown> = isPlainObject(source.metadata)
    ? (sanitizeKeysDeep(source.metadata) as Record<string, unknown>)
    : {};
  for (const { aliases, canonical } of METADATA_ALIASES) {
    for (const key of Object.keys(metadata)) {
      if (!aliases.includes(key.toLowerCase())) continue;
      const value = metadata[key];
      delete metadata[key];
      if (value === null || value === undefined || value === "") continue;
      if (metadata[canonical] !== undefined) continue;
      metadata[canonical] = canonical === "page_count"
        ? coercePageCount(value)
        : value;
    }
  }

  const persons: NormalizedAnalysis["persons"] = [];
  objectArray(source.persons).forEach((person, index) => {
    if (!nonEmptyString(person.name)) return;
    const entry: NormalizedAnalysis["persons"][number] = {
      id: fallbackId(person.id, "P", index),
      name: person.name.trim(),
    };
    if (nonEmptyString(person.role)) entry.role = person.role.trim();
    if (nonEmptyString(person.description)) entry.description = person.description.trim();
    persons.push(entry);
  });

  const evidence: NormalizedAnalysis["evidence"] = [];
  objectArray(source.evidence).forEach((item, index) => {
    // Prvok bez obsahu, zdroja aj typu nemá čo zobraziť.
    if (
      !nonEmptyString(item.content) &&
      !nonEmptyString(item.source) &&
      !nonEmptyString(item.type)
    ) {
      return;
    }
    const entry: NormalizedAnalysis["evidence"][number] = {
      id: fallbackId(item.id, "E", index),
    };
    if (nonEmptyString(item.type)) entry.type = item.type.trim();
    if (nonEmptyString(item.content)) entry.content = item.content.trim();
    if (nonEmptyString(item.source)) entry.source = item.source.trim();
    if (finiteNumber(item.relevance_score)) entry.relevance_score = item.relevance_score;
    evidence.push(entry);
  });

  const relationships: NormalizedAnalysis["relationships"] = [];
  objectArray(source.relationships).forEach((rel) => {
    const p1 = nonEmptyString(rel.person1_id) ? rel.person1_id.trim() : undefined;
    const p2 = nonEmptyString(rel.person2_id) ? rel.person2_id.trim() : undefined;
    if (!p1 && !p2) return;
    const entry: NormalizedAnalysis["relationships"][number] = {};
    if (p1) entry.person1_id = p1;
    if (p2) entry.person2_id = p2;
    if (nonEmptyString(rel.type)) entry.type = rel.type.trim();
    if (nonEmptyString(rel.description)) entry.description = rel.description.trim();
    const supporting = stringArray(rel.evidence_supporting);
    if (supporting.length > 0) entry.evidence_supporting = supporting;
    relationships.push(entry);
  });

  const timeline: NormalizedAnalysis["timeline"] = [];
  objectArray(source.timeline).forEach((event, index) => {
    // Udalosť bez názvu, popisu aj zdrojového textu je nepoužiteľná.
    if (
      !nonEmptyString(event.title) &&
      !nonEmptyString(event.description) &&
      !nonEmptyString(event.source_text)
    ) {
      return;
    }
    const entry: NormalizedAnalysis["timeline"][number] = {
      id: fallbackId(event.id, "T", index),
      timestamp: nonEmptyString(event.timestamp) ? event.timestamp.trim() : null,
    };
    if (nonEmptyString(event.title)) entry.title = event.title.trim();
    if (nonEmptyString(event.description)) entry.description = event.description.trim();
    if (nonEmptyString(event.location)) entry.location = event.location.trim();
    if (nonEmptyString(event.source_text)) entry.source_text = event.source_text.trim();
    const personsInvolved = stringArray(event.persons_involved);
    if (personsInvolved.length > 0) entry.persons_involved = personsInvolved;
    const evidenceLinks = stringArray(event.evidence_links);
    if (evidenceLinks.length > 0) entry.evidence_links = evidenceLinks;
    const tags = stringArray(event.tags);
    if (tags.length > 0) entry.tags = tags;
    if (finiteNumber(event.confidence)) entry.confidence = event.confidence;
    if (typeof event.approximate === "boolean") entry.approximate = event.approximate;
    timeline.push(entry);
  });

  return { metadata, persons, evidence, relationships, timeline };
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
