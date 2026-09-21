import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildAnalysisExport,
  SherlockResults,
  type SherlockAnalysis,
} from "@/components/sherlock-results";

const analysis: SherlockAnalysis = {
  metadata: { document_name: "Prípad 12", page_count: 2 },
  persons: [{ id: "p1", name: "Ján Novák" }],
  evidence: [{ id: "e1", content: "Záznam", type: "listina" }],
  relationships: [{ person1_id: "p1", person2_id: "p1", type: "súvis" }],
  timeline: [{ id: "t1", title: "Udalosť", timestamp: "2024-01-01T10:00:00Z" }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SherlockResults export", () => {
  it("builds JSON with the complete analysis and timestamp", () => {
    const result = buildAnalysisExport(analysis, "Prípad 12");
    const payload = JSON.parse(result.json);

    expect(payload.exportedAt).toBeTruthy();
    expect(payload.name).toBe("Prípad 12");
    expect(payload.metadata).toEqual(analysis.metadata);
    expect(payload.persons).toEqual(analysis.persons);
    expect(payload.evidence).toEqual(analysis.evidence);
    expect(payload.relationships).toEqual(analysis.relationships);
    expect(payload.timeline).toEqual(analysis.timeline);
  });

  it("sanitizes hostile names into safe filenames", () => {
    const { filename } = buildAnalysisExport(analysis, "../../etc/passwd Analýza");

    expect(filename).not.toContain("/");
    expect(filename).not.toContain("\\");
    expect(filename).not.toContain("..");
    expect(filename).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("shows an enabled export control for a populated analysis", () => {
    render(<SherlockResults analysis={analysis} />);
    expect(screen.getByTestId("export-json")).toBeEnabled();
  });

  it("disables export when all analysis sections are empty", () => {
    render(
      <SherlockResults
        analysis={{ metadata: {}, persons: [], evidence: [], relationships: [], timeline: [] }}
      />,
    );
    expect(screen.getByTestId("export-json")).toBeDisabled();
  });

  it("downloads the exported JSON and revokes its object URL", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    render(<SherlockResults analysis={analysis} />);

    fireEvent.click(screen.getByTestId("export-json"));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});

describe("SherlockResults s poškodenými dátami", () => {
  const malformedAnalysis = {
    metadata: {
      document_name: "Prípad 12",
      upload_date: "2024-05-01",
      page_count: 2,
      language: "sk",
    },
    persons: [0, { id: "P001", name: "Jan Novak", role: "obvinený" }, { id: "P002", name: "" }, true],
    evidence: [0, { id: "E001", type: "photo", content: "fotka" }, "x"],
    relationships: [{ person1_id: "P001", person2_id: "P00X" }],
    timeline: [0, { id: "T001", title: "Udalosť", timestamp: "2024-01-01T10:00:00Z" }],
  } as unknown as SherlockAnalysis;

  it("vykreslí iba validné osoby bez pádu", () => {
    render(<SherlockResults analysis={malformedAnalysis} />);
    expect(screen.getByTestId("sherlock-results")).toBeInTheDocument();
    expect(screen.getAllByTestId("person-card")).toHaveLength(1);
    expect(screen.getAllByTestId("evidence-item")).toHaveLength(1);
  });

  it("export obsahuje iba validné záznamy", () => {
    const { json } = buildAnalysisExport(malformedAnalysis, "Malformed");
    const payload = JSON.parse(json);

    expect(payload.persons).toHaveLength(1);
    expect(payload.evidence).toHaveLength(1);
    expect(payload.relationships).toHaveLength(1);
    expect(payload.timeline).toHaveLength(1);
    expect(payload.metadata).toEqual(malformedAnalysis.metadata);
  });
});
