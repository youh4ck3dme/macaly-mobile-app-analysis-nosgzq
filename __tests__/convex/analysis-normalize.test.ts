import { describe, it, expect } from "vitest";

import { normalizeAnalysisData } from "../../convex/analysisNormalize";

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
    });
    expect(normalizeAnalysisData(null).timeline).toEqual([]);
    expect(normalizeAnalysisData("text").persons).toEqual([]);
  });
});
