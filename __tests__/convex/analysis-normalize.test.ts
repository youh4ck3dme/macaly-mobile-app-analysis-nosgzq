import { describe, it, expect } from "vitest";

import {
  normalizeAnalysisData,
  safeAnalysisErrorMessage,
  type NormalizeContext,
} from "../../convex/analysisNormalize";

describe("normalizeAnalysisData", () => {
  it("odstráni stray čísla z persons a evidence a validné záznamy ponechá", () => {
    const result = normalizeAnalysisData({
      persons: [0, { id: "P001", name: "Jan Novak", role: "obvinený" }, true],
      evidence: [0, { id: "E001", type: "photo", content: "fotka", relevance_score: 7 }],
      relationships: [],
      timeline: [],
    });

    expect(result.persons).toHaveLength(1);
    expect(result.persons[0]).toMatchObject({ id: "P001", name: "Jan Novak", role: "obvinený" });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({ id: "E001", type: "photo", content: "fotka", relevance_score: 7 });
  });

  it("premapuje slovenské metadata kľúče a kanonické kľúče neprepíše", () => {
    const result = normalizeAnalysisData({
      metadata: {
        nazov_dokumentu: "Stanovy spolku",
        datum_nahrania: "2024-05-01",
        pocet_stran: "12",
        jazyk: "sk",
      },
    });

    expect(result.metadata).toEqual({
      document_name: "Stanovy spolku",
      upload_date: "2024-05-01",
      page_count: 12,
      language: "sk",
    });
  });

  it("premení kľúče s diakritikou na ASCII názvy polí, ktoré Convex prijme", () => {
    const result = normalizeAnalysisData({
      metadata: {
        "dátum_nahrania": "2026-03-12",
        "názov dokumentu": "Spis č. 5",
        "počet_strán": 3,
        "vlastné pole": { "kľúč s medzerou": "hodnota" },
      },
    });

    const keys = Object.keys(result.metadata);
    for (const key of keys) {
      expect(key).toMatch(/^[0-9A-Za-z][0-9A-Za-z_]*$/);
    }
    expect(result.metadata.upload_date).toBe("2026-03-12");
    expect(result.metadata.document_name).toBe("Spis č. 5");
    expect(result.metadata.page_count).toBe(3);
    expect(result.metadata.vlastne_pole).toEqual({ kluc_s_medzerou: "hodnota" });
  });

  it("alias nechá pole, keď kanonický kľúč už existuje a má hodnotu", () => {
    const result = normalizeAnalysisData({
      metadata: {
        document_name: "Kanonický názov",
        nazov_dokumentu: "Alias názov",
        page_count: 5,
        pocet_stran: 9,
      },
    });

    expect(result.metadata.document_name).toBe("Kanonický názov");
    expect(result.metadata.page_count).toBe(5);
    expect("nazov_dokumentu" in result.metadata).toBe(false);
    expect("pocet_stran" in result.metadata).toBe(false);
  });

  it("nevracia pole, keď sekcia nie je pole", () => {
    const result = normalizeAnalysisData({
      persons: "nie je pole",
      evidence: { strom: true },
      relationships: 3,
      timeline: null,
      metadata: null,
    });

    expect(result.persons).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.timeline).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it("vygeneruje fallback ID, keď ich model neposlal", () => {
    const result = normalizeAnalysisData({
      persons: [{ name: "Jan Novak" }, { id: "", name: "Peter-mail" }],
      evidence: [{ content: "výťah" }, { id: "", content: "druhý" }],
      timeline: [{ title: "Udalosť" }, { id: "", description: "Druhá" }],
    });

    expect(result.persons.map((p) => p.id)).toEqual(["P001", "P002"]);
    expect(result.evidence.map((e) => e.id)).toEqual(["E001", "E002"]);
    expect(result.timeline.map((t) => t.id)).toEqual(["T001", "T002"]);
  });

  it("normalizuje timestamp na null a filtruje reťazcové polia", () => {
    const result = normalizeAnalysisData({
      timeline: [
        {
          title: "Rozhodnutie",
          timestamp: "",
          persons_involved: ["P001", 5, null, "P002"],
          evidence_links: [0, "E001", ""],
          tags: [undefined, "vražda"],
        },
        {
          title: "Bez času",
          timestamp: null,
          title2: undefined,
        },
      ],
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0].timestamp).toBeNull();
    expect(result.timeline[0].persons_involved).toEqual(["P001", "P002"]);
    expect(result.timeline[0].evidence_links).toEqual(["E001"]);
    expect(result.timeline[0].tags).toEqual(["vražda"]);
    expect(result.timeline[1].timestamp).toBeNull();
  });

  it("ignoruje úplne neplatný vstup (číslo, null, reťazec)", () => {
    expect(normalizeAnalysisData(0)).toEqual({
      metadata: {},
      persons: [],
      evidence: [],
      relationships: [],
      timeline: [],
      sources: [],
      quality: { partial: false, materiallyValid: false, droppedItems: 0, warnings: [] },
    });
    expect(normalizeAnalysisData(null).timeline).toEqual([]);
    expect(normalizeAnalysisData("text").persons).toEqual([]);
  });

  it("nevalidnú vnorenú provenanciu zahodí a nevalidné polia započíta", () => {
    const result = normalizeAnalysisData({
      persons: [{ id: "P001", name: "Ján Skriváň", role: "svedok" }],
      evidence: [
        { id: "E001", content: "fotka z bulletu", relevance_score: "vysoká" },
        { id: "E002", content: "útržok z bulletu", provenance: "nie je objekt" },
      ],
      relationships: [
        { person1_id: "P001", person2_id: "P002", evidence_supporting: 42 },
        { person1_id: "P001", person2_id: "P003", evidence_supporting: [7, "E001"] },
      ],
      timeline: [
        { title: "Stretnutie", timestamp: "2024-01-15", persons_involved: [7] },
        { title: "Oznámenie", timestamp: null, evidence_links: [0, "E001", ""] },
      ],
    });

    expect(result.evidence[0].relevance_score).toBeUndefined();
    expect(result.evidence[0].provenance.excerpt).toBe("fotka z bulletu");
    // Provenanciu z modelu nikdy nepreberáme: vstupná reťazcová provenancia
    // nemá žiadny vplyv, obohatenie stavia výlučne server.
    expect(result.evidence[1].provenance.excerpt).toBe("útržok z bulletu");
    expect(result.evidence[1].provenance.verified).toBe(false);
    expect(result.relationships[0].evidence_supporting).toBeUndefined();
    expect(result.relationships[1].evidence_supporting).toEqual(["E001"]);
    expect(result.timeline[0].persons_involved).toBeUndefined();
    expect(result.timeline[0].timestamp).toBe("2024-01-15");
    expect(result.timeline[1].evidence_links).toEqual(["E001"]);

    expect(result.quality.droppedItems).toBe(3);
    expect(result.quality.partial).toBe(true);
    expect(result.quality.materiallyValid).toBe(true);
    expect(result.quality.warnings).toEqual([
      "Vynechané 2 neplatné položky v sekcii evidence.",
      "Vynechané 1 neplatnú položku v sekcii relationships.",
      "7 zistení nemá overiteľnú citáciu.",
    ]);
  });

  it("deterministický alias: prvý deklarovaný alias vyhrá a duplicitný sa započíta", () => {
    const result = normalizeAnalysisData({
      metadata: {
        nazov: "Názov z aliasu nazov",
        nazov_dokumentu_konsolidovany: "Konsolidovaný názov",
        nazov_dokumentu: "Pôvodný názov",
      },
    });

    expect(result.metadata.document_name).toBe("Pôvodný názov");
    expect("nazov" in result.metadata).toBe(false);
    expect("nazov_dokumentu_konsolidovany" in result.metadata).toBe(false);
    expect(result.quality.droppedItems).toBe(2);
    expect(result.quality.partial).toBe(true);
    expect(result.quality.warnings).toContain(
      "Metadata: duplicitný alias pre document_name bol ignorovaný.",
    );
  });

  it("dropped položky započíta do droppedItems a varovanie podá po slovensky", () => {
    const result = normalizeAnalysisData({
      persons: [{ name: "A" }, 77, { name: "B" }],
    });

    expect(result.persons).toHaveLength(2);
    expect(result.quality.droppedItems).toBe(1);
    expect(result.quality.partial).toBe(true);
    expect(result.quality.warnings).toContain("Vynechané 1 neplatnú položku v sekcii persons.");
  });

  it("plne prázdny výsledok (bez zistení) nie je materiálne platný", () => {
    const result = normalizeAnalysisData({
      persons: [],
      evidence: [],
      relationships: [],
      timeline: [],
      metadata: { nazov_dokumentu: "Prázdny spis" },
    });

    expect(result.quality.materiallyValid).toBe(false);
    expect(result.quality.droppedItems).toBe(0);
  });

  it("pri väčšine vynechaných záznamoch nie je materiálne platný", () => {
    const result = normalizeAnalysisData({
      persons: [{ name: "A" }, 1, 2, 3, 4],
      evidence: [{ content: "vedľajší útržok" }],
    });

    expect(result.quality.materiallyValid).toBe(false);
    // Pomer vynechaných sa rátia zo záznamov: 4 z 6 vstupných záznamov padlo.
  });

  it("verifyExcerpt určuje verified/page — kind (pozorovanie/hypotéza)", () => {
    const context: NormalizeContext = {
      sources: [{ document: "Stanovy.pdf", method: "pdf-text", pages: 8, sha256: "abc123" }],
      verifyExcerpt: (excerpt) =>
        excerpt.includes("konsor")
          ? { verified: true, page: 9 }
          : { verified: false, page: null },
    };
    const result = normalizeAnalysisData(
      {
        persons: [
          { name: "A", description: "Strana deväť hovorí o konsorciu.", source_page: 3 },
          { name: "B", description: "iné tvrdenie" },
        ],
      },
      context,
    );

    // Odstránené pole — page verifikátora vyhráva nad tvrdením modelu.
    expect(result.persons[0].provenance).toEqual({
      document: "Stanovy.pdf",
      page: 9,
      section: null,
      excerpt: "Strana deväť hovorí o konsorciu.",
      method: "pdf-text",
      verified: true,
    });
    expect(result.persons[0].kind).toBe("observation");

    expect(result.persons[1].provenance.verified).toBe(false);
    expect(result.persons[1].provenance.page).toBeNull();
    expect(result.persons[1].provenance.document).toBe("Stanovy.pdf");
    expect(result.persons[1].provenance.method).toBe("pdf-text");
    expect(result.persons[1].kind).toBe("hypothesis");

    // Nepri vstupe bez callbacku sa dokáže overiť len hypotéza.
  });

  it("bez callback alebo bez výňatku je zistenie neoverená hypotéza", () => {
    const result = normalizeAnalysisData({
      persons: [{ name: "Ján" }],
    });
    expect(result.persons[0].provenance).toEqual({
      document: null,
      page: null,
      section: null,
      excerpt: null,
      method: null,
      verified: false,
    });
    expect(result.persons[0].kind).toBe("hypothesis");
  });

  it("nepreverené zistenia agreguje do práve jedného varovania", () => {
    const result = normalizeAnalysisData({
      persons: [{ name: "A" }, { name: "B" }, { name: "C" }],
    });

    const citationWarnings = result.quality.warnings.filter((w) => w.includes("zistení"));
    expect(citationWarnings).toEqual(["3 zistení nemá overiteľnú citáciu."]);
    expect(result.quality.partial).toBe(true);
    expect(result.quality.materiallyValid).toBe(true);
  });

  it("zdroje nesú integritnú poznámku aj keď sha256 chýba", () => {
    const result = normalizeAnalysisData(
      {},
      {
        sources: [
          { document: "a.pdf", method: "pdf-text", pages: 4, sha256: "deadbeef1234" },
          { document: "b.jpg", method: "image-ocr", pages: null, sha256: null },
        ],
      },
    );

    expect(result.sources).toHaveLength(2);
    for (const source of result.sources) {
      expect(source.integrityNote).toBe(
        "SHA-256 potvrdzuje nemennosť bajtov súboru, nie pravosť ani pôvod dokumentu.",
      );
    }
    expect(result.sources[0].sha256).toBe("deadbeef1234");
    expect(result.sources[0].pages).toBe(4);
    expect(result.sources[1].sha256).toBeNull();
    expect(result.sources[1].pages).toBeNull();
  });

  it("slovenské hodnoty ostávajú doslovné; mení sa len mapovanie kľúčov", () => {
    const description = "Mária Mníšek sa stretla v Kúti.";
    const result = normalizeAnalysisData(
      {
        persons: [{ name: "Kristián Ján Nejedlý", description }],
        metadata: { nazov_dokumentu: "Úmrtný list č. 42/2024" },
      },
      {
        verifyExcerpt: () => ({ verified: true, page: 2 }),
      },
    );

    expect(result.persons[0].name).toBe("Kristián Ján Nejedlý");
    expect(result.persons[0].description).toBe(description);
    expect(result.metadata.document_name).toBe("Úmrtný list č. 42/2024");
    expect(result.persons[0].provenance.excerpt).toBe(description);
    expect(result.persons[0].provenance.verified).toBe(true);
    expect(result.persons[0].kind).toBe("observation");
  });
});

describe("safeAnalysisErrorMessage", () => {
  it("keeps the missing-key message and drops stacks and secrets", () => {
    expect(safeAnalysisErrorMessage(new Error("Mistral AI kľúč nie je nakonfigurovaný."))).toBe(
      "Mistral AI kľúč nie je nakonfigurovaný.",
    );
    expect(
      safeAnalysisErrorMessage(new Error("Analýza zlyhala.\n    at runAnalysis (analyze.ts:1:1)")),
    ).toBe("Analýza zlyhala.");
    expect(safeAnalysisErrorMessage(new Error("request failed Bearer sk-live-secretvalue"))).toBe(
      "Analýza zlyhala.",
    );
    expect(safeAnalysisErrorMessage(new Error("MISTRAL_API_KEY=sk-live-secretvalue"))).toBe(
      "Analýza zlyhala.",
    );
  });
});
