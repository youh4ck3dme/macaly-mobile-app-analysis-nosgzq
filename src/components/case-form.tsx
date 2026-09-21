import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CaseStatus = "active" | "closed" | "archived";
type CasePriority = "low" | "medium" | "high";

const STATUS_OPTIONS: { value: CaseStatus; label: string }[] = [
  { value: "active", label: "Aktívny" },
  { value: "closed", label: "Uzavretý" },
  { value: "archived", label: "Archivovaný" },
];

const PRIORITY_OPTIONS: { value: CasePriority; label: string }[] = [
  { value: "low", label: "Nízka" },
  { value: "medium", label: "Stredná" },
  { value: "high", label: "Vysoká" },
];

type CaseFormProps = {
  existingCase?: Doc<"cases">;
  onDone: () => void;
  onCancel: () => void;
};

export function CaseForm({ existingCase, onDone, onCancel }: CaseFormProps) {
  const isEdit = !!existingCase;
  const createCase = useMutation(api.cases.create);
  const updateCase = useMutation(api.cases.update);

  const [title, setTitle] = useState(existingCase?.title ?? "");
  const [description, setDescription] = useState(existingCase?.description ?? "");
  const [status, setStatus] = useState<CaseStatus>(
    (existingCase?.status as CaseStatus) ?? "active",
  );
  const [priority, setPriority] = useState<CasePriority>(
    (existingCase?.priority as CasePriority) ?? "medium",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Názov prípadu je povinný.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && existingCase) {
        const result = await updateCase({
          id: existingCase._id,
          title: trimmedTitle,
          description: description.trim() || undefined,
          status,
          priority,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
      } else {
        const result = await createCase({
          title: trimmedTitle,
          description: description.trim() || undefined,
          status,
          priority,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
      }
      onDone();
    } catch {
      setError("Uloženie zlyhalo. Skúste to znova.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none disabled:opacity-50";

  const state = error ? "error" : submitting ? "loading" : "ready";

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="case-form"
      data-state={state}
      className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-foreground">
        {isEdit ? "Upraviť prípad" : "Nový prípad"}
      </h2>

      <div className="space-y-1.5">
        <label
          htmlFor="case-title"
          className="text-sm font-medium text-foreground"
        >
          Názov
        </label>
        <input
          id="case-title"
          data-testid="case-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Názov prípadu"
          disabled={submitting}
          className={inputClass}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="case-description"
          className="text-sm font-medium text-foreground"
        >
          Popis
        </label>
        <textarea
          id="case-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Stručný popis prípadu"
          disabled={submitting}
          rows={3}
          className={cn(inputClass, "resize-y")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Stav</label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as CaseStatus)}
            disabled={submitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Priorita
          </label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as CasePriority)}
            disabled={submitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          Zrušiť
        </button>
        <button
          type="submit"
          data-testid="case-submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting
            ? "Ukladám…"
            : isEdit
              ? "Uložiť zmeny"
              : "Vytvoriť prípad"}
        </button>
      </div>
    </form>
  );
}
