import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SherlockAnalyzer } from "@/components/sherlock-analyzer";

const state = vi.hoisted(() => ({
  analyses: [] as Array<Record<string, unknown>>,
}));

vi.mock("convex/react", async () => {
  const actual: typeof import("convex/react") = await vi.importActual("convex/react");
  const functionName = Symbol.for("functionName");
  const useQueryMock = (fn: unknown) => {
    const name = (fn as Record<symbol, string> | null)?.[functionName];
    if (name === "analyses:listMyAnalyses") {
      return { ok: true, analyses: state.analyses };
    }
    if (name === "files:listMyFiles") {
      return { ok: true, files: [] };
    }
    return undefined;
  };
  return {
    ...actual,
    useQuery: useQueryMock as unknown as typeof actual.useQuery,
    useMutation: (() => () => Promise.resolve({ ok: true })) as unknown as typeof actual.useMutation,
    useAction: (() => () => Promise.resolve({ ok: true })) as unknown as typeof actual.useAction,
  };
});

function record(status: string, extra: Record<string, unknown> = {}) {
  return {
    _id: "rec1",
    name: "Test analýza",
    createdAt: Date.parse("2024-01-01"),
    fileIds: ["f1"],
    status,
    ...extra,
  };
}

describe("SherlockAnalyzer stavy analýz", () => {
  it("vo fronte: bežiaca analýza bez možnosti mazania", () => {
    state.analyses = [record("queued")];
    render(<SherlockAnalyzer />);

    expect(screen.getByTestId("sherlock-analysis-list")).toHaveTextContent("vo fronte");
    expect(screen.queryByTestId("sherlock-analysis-delete")).toBeNull();
  });

  it("succeeded: otvorenie záznamu s dátami vykreslí výsledok", () => {
    state.analyses = [
      record("succeeded", {
        data: { timeline: [{ id: "T001", title: "Udalosť" }] },
      }),
    ];
    render(<SherlockAnalyzer />);
    fireEvent.click(screen.getByTestId("sherlock-analysis-open"));

    expect(screen.getByTestId("sherlock-results")).toBeInTheDocument();
    expect(screen.getByTestId("sherlock-analysis-delete")).toBeInTheDocument();
  });

  it("failed: zobrazí slovenské chybové hlásenie a label chyba", () => {
    state.analyses = [record("failed", { errorMessage: "OCR nebolo možné spustiť." })];
    render(<SherlockAnalyzer />);

    expect(screen.getByTestId("sherlock-analysis-list")).toHaveTextContent("chyba");
    expect(screen.getByText("OCR nebolo možné spustiť.")).toBeInTheDocument();
    expect(screen.getByTestId("sherlock-analysis-delete")).toBeInTheDocument();
  });

  it("starý stav ready stále vykreslí výsledok", () => {
    state.analyses = [
      record("ready", {
        data: { persons: [{ id: "P001", name: "Ján Novák" }] },
      }),
    ];
    render(<SherlockAnalyzer />);
    fireEvent.click(screen.getByTestId("sherlock-analysis-open"));

    expect(screen.getByTestId("person-card")).toBeInTheDocument();
    expect(screen.getByTestId("sherlock-analysis-list")).toHaveTextContent("hotová");
  });
});
