import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { AuthWrapper } from "../components/auth-wrapper";
import { AppLayout } from "../components/app-layout";
import { CaseForm } from "../components/case-form";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import siteMetadata from "../metadata.json";

const SITE_ORIGIN = "https://nosgzqflza19pn0bs55f4iba.macaly.app";

export const Route = createFileRoute("/")({
  head: () => {
    const page = siteMetadata["/"];
    return {
      meta: [
        { title: page.title },
        { name: "description", content: page.description },
        { property: "og:title", content: page.title },
        { property: "og:description", content: page.description },
        { property: "og:image", content: siteMetadata.default?.openGraph?.images },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `${SITE_ORIGIN}/` }],
    };
  },
  component: App,
});

const STATUS_LABELS: Record<string, string> = {
  active: "Aktívny",
  closed: "Uzavretý",
  archived: "Archivovaný",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Nízka",
  medium: "Stredná",
  high: "Vysoká",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function priorityClass(priority: string): string {
  switch (priority) {
    case "high":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "medium":
      return "border-chart-4/30 bg-chart-4/10 text-chart-4";
    default:
      return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "active":
      return "border-chart-2/30 bg-chart-2/10 text-chart-2";
    case "closed":
      return "border-muted-foreground/30 bg-muted text-muted-foreground";
    case "archived":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function App() {
  return (
    <AuthWrapper>
      <CasesApp />
    </AuthWrapper>
  );
}

function CasesApp() {
  const casesResult = useQuery(api.cases.list, {});
  const removeCase = useMutation(api.cases.remove);

  const [showForm, setShowForm] = useState(false);
  const [editingCase, setEditingCase] = useState<Doc<"cases"> | undefined>(
    undefined,
  );

  const isLoading = casesResult === undefined;
  const isError = casesResult !== undefined && !casesResult.ok;
  const cases = casesResult?.ok ? casesResult.cases : [];

  const listState = isLoading ? "loading" : isError ? "error" : "ready";

  const openCreate = () => {
    setEditingCase(undefined);
    setShowForm(true);
  };

  const openEdit = (c: Doc<"cases">) => {
    setEditingCase(c);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingCase(undefined);
  };

  const handleDelete = async (id: string) => {
    const result = await removeCase({ id: id as Doc<"cases">["_id"] });
    if (!result.ok) {
      console.error("Odstránenie zlyhalo:", result.message);
    }
  };

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Prípady</h1>
          {!showForm && (
            <button
              type="button"
              data-testid="new-case-button"
              onClick={openCreate}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Nový případ
            </button>
          )}
        </div>

        {showForm && (
          <div className="mb-6">
            <CaseForm
              existingCase={editingCase}
              onDone={closeForm}
              onCancel={closeForm}
            />
          </div>
        )}

        <div data-testid="case-list" data-state={listState}>
          {isLoading && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              Načítavam prípady…
            </div>
          )}

          {isError && casesResult && !casesResult.ok && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center text-destructive">
              Chyba: {casesResult.message}
            </div>
          )}

          {!isLoading && !isError && cases.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <p className="text-lg font-medium text-foreground">
                Žádné případy
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vytvorte svoj první případ pomocou tlačidla „Nový případ".
              </p>
            </div>
          )}

          {!isLoading && !isError && cases.length > 0 && (
            <ul className="space-y-3">
              {cases.map((c) => (
                <li
                  key={c._id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="truncate font-semibold text-foreground">
                        {c.title}
                      </h3>
                      {c.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(c.status)}`}
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClass(c.priority)}`}
                        >
                          {PRIORITY_LABELS[c.priority] ?? c.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Vytvorené {formatDate(c.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        data-testid="edit-case-button"
                        onClick={() => openEdit(c)}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        Upravit
                      </button>
                      <button
                        type="button"
                        data-testid="delete-case-button"
                        onClick={() => void handleDelete(c._id)}
                        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        Smazat
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
    </AppLayout>
  );
}
