import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  FolderOpen,
  UploadCloud,
  FileText,
  Sparkles,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  History,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SherlockResults,
  type SherlockAnalysis,
} from "./sherlock-results";

// Podporované formáty a limit backendu (200 MiB).
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
// Nad 60 MiB backend spracúva obsah v dvoch analytických častiach.
const LARGE_FILE_BYTES = 60 * 1024 * 1024;

const SUPPORTED_FORMATS = {
  pdf: { mime: "application/pdf", label: "PDF" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  txt: { mime: "text/plain", label: "TXT" },
  md: { mime: "text/markdown", label: "MD" },
  csv: { mime: "text/csv", label: "CSV" },
  json: { mime: "application/json", label: "JSON" },
} as const;

const FILE_ACCEPT = Object.entries(SUPPORTED_FORMATS)
  .map(([ext, f]) => `.${ext},${f.mime}`)
  .join(",");

const SUPPORTED_FORMATS_TEXT = "PDF, DOCX, TXT, MD, CSV, JSON";
const LARGE_FILE_NOTE = "Po nahratí bude obsah spracovaný v dvoch analytických častiach.";

function detectFormat(file: File): string | null {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1) : "";
  if (ext in SUPPORTED_FORMATS) return ext;
  const entry = Object.entries(SUPPORTED_FORMATS).find(([, f]) => f.mime === file.type);
  return entry ? entry[0] : null;
}

function formatLabel(format: string | null): string {
  if (!format) return "Neznámy formát";
  return SUPPORTED_FORMATS[format as keyof typeof SUPPORTED_FORMATS]?.label ?? format.toUpperCase();
}

type Source = "sandbox" | "upload";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "kB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function SherlockAnalyzer() {
  const listMyFiles = useQuery(api.files.listMyFiles, {});
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFileMetadata = useMutation(api.files.saveFileMetadata);
  const listMyAnalyses = useQuery(api.analyses.listMyAnalyses, {});
  const removeAnalysis = useMutation(api.analyses.remove);
  const runAnalyze = useAction(api.analyze.analyze);

  const [source, setSource] = useState<Source>("sandbox");
  const [selectedSandboxIds, setSelectedSandboxIds] = useState<Id<"files">[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<Id<"files"> | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<{
    id: Id<"analyses">;
    data: SherlockAnalysis | null;
    name: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const files = listMyFiles?.ok ? listMyFiles.files : [];
  const filesLoading = listMyFiles === undefined;
  const analyses = listMyAnalyses?.ok ? listMyAnalyses.analyses : [];
  const analysesLoading = listMyAnalyses === undefined;

  // Aktívna analýza: beží akcia, alebo čakáme na výsledok identified analýzy.
  const awaitingResult = currentAnalysis !== null && currentAnalysis.data === null;
  const showAnalysisProgress = running || awaitingResult;

  // Trvalý záznam analýzy zo servera – zdroj pravdy o priebehu.
  const trackedRecord = currentAnalysis
    ? analyses.find((a) => a._id === currentAnalysis.id)
    : undefined;
  const persistedProgress =
    typeof trackedRecord?.progress === "number" ? trackedRecord.progress : null;
  const persistedLabel = trackedRecord?.progressLabel ?? null;

  const toggleSandbox = (id: Id<"files">) => {
    setSelectedSandboxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setRunError(null);
  };

  const validateFile = (file: File): string | null => {
    if (!detectFormat(file)) {
      return `Nepodporovaný formát súboru. Povolené formáty sú ${SUPPORTED_FORMATS_TEXT}.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Súbor je príliš veľký. Maximálna veľkosť je 200 MB (tento má ${formatBytes(file.size)}).`;
    }
    return null;
  };

  const handleFile = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      setStatus("error");
      setSelectedFile(null);
      setSelectedFormat(null);
      return;
    }
    setSelectedFile(file);
    setSelectedFormat(detectFormat(file));
    setUploadError(null);
    setStatus("idle");
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const clearUpload = () => {
    setSelectedFile(null);
    setSelectedFormat(null);
    setUploadedFileId(null);
    setUploadError(null);
    setStatus("idle");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setStatus("uploading");
    setProgress(0);
    setUploadError(null);
    try {
      const urlResult = await generateUploadUrl({});
      if (!urlResult.ok) throw new Error(urlResult.message);
      const contentType = selectedFile.type || "application/octet-stream";
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(xhr.statusText || "Nahrávanie zlyhalo"));
        });
        xhr.addEventListener("error", () => reject(new Error("Sieťová chyba počas nahrávania.")));
        xhr.open("POST", urlResult.uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.send(selectedFile);
      });
      const response = JSON.parse(xhr.responseText) as { storageId?: string };
      if (!response.storageId) throw new Error("Server nevrátil ID súboru.");
      const saveResult = await saveFileMetadata({
        storageId: response.storageId as Id<"_storage">,
        filename: selectedFile.name,
        contentType,
        size: selectedFile.size,
      });
      if (!saveResult.ok) throw new Error(saveResult.message);
      setUploadedFileId(saveResult.fileId as Id<"files">);
      setStatus("success");
      setSelectedFile(null);
      setSelectedFormat(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Nahrávanie zlyhalo.");
      setStatus("error");
      setProgress(0);
    }
  };

  const canAnalyze = source === "sandbox"
    ? selectedSandboxIds.length > 0
    : uploadedFileId !== null && status === "success";

  const handleAnalyze = async () => {
    setRunError(null);
    setCurrentAnalysis(null);

    let fileIds: Id<"files">[];
    if (source === "sandbox") {
      fileIds = selectedSandboxIds;
      if (fileIds.length === 0) {
        setRunError("Vyberte aspoň jeden súbor zo sandboxu.");
        return;
      }
    } else {
      // Priamy upload: súbor už bol nahraný a máme jeho ID.
      if (!uploadedFileId) {
        setRunError("Najprv nahrajte dokument tlačidlom „Nahrať dokument“.");
        return;
      }
      fileIds = [uploadedFileId];
    }

    setRunning(true);
    try {
      const result = await runAnalyze({ fileIds });
      if (!result.ok) {
        setRunError(result.message);
        return;
      }
      const analysisId = result.analysisId as Id<"analyses">;
      const analysisName = `Analýza ${new Date().toLocaleDateString("sk-SK")}`;
      // Načítať uložený výsledok - analýza je synchrónna, hľadáme v zozname.
      const latest = listMyAnalyses?.ok
        ? listMyAnalyses.analyses.find((a) => a._id === analysisId)
        : undefined;
      if (latest && latest.data) {
        setCurrentAnalysis({
          id: latest._id,
          data: latest.data as SherlockAnalysis,
          name: latest.name,
        });
      } else {
        // Počkáme, kým sa query aktualizuje; priebeh sledujeme z persistovaného záznamu.
        setCurrentAnalysis({
          id: analysisId,
          data: null,
          name: analysisName,
        });
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Analýza zlyhala.");
    } finally {
      setRunning(false);
    }
  };

  const openAnalysis = (id: Id<"analyses">, data: unknown, name: string) => {
    setCurrentAnalysis({ id, data: data as SherlockAnalysis | null, name });
    setRunError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4" data-testid="sherlock-analyzer">
      {/* Prepínač zdroja */}
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Zdroj súborov">
        <button
          type="button"
          role="tab"
          aria-selected={source === "sandbox"}
          onClick={() => setSource("sandbox")}
          data-testid="sherlock-source-sandbox"
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
            source === "sandbox"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <FolderOpen className="size-4" />
          Z môjho sandboxu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === "upload"}
          onClick={() => setSource("upload")}
          data-testid="sherlock-source-upload"
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
            source === "upload"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <UploadCloud className="size-4" />
          Nahrať nový
        </button>
      </div>

      {/* Sandbox výber */}
      {source === "sandbox" && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="sherlock-sandbox-files">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Vaše nahrané súbory</h2>
            <span className="text-xs text-muted-foreground">
              {selectedSandboxIds.length} vybrané
            </span>
          </div>
          <div data-state={filesLoading ? "loading" : !listMyFiles?.ok ? "error" : "ready"}>
            {filesLoading && (
              <p className="py-4 text-center text-sm text-muted-foreground">Načítavam súbory…</p>
            )}
            {!filesLoading && listMyFiles && !listMyFiles.ok && (
              <p className="py-4 text-center text-sm text-destructive">{listMyFiles.message}</p>
            )}
            {!filesLoading && listMyFiles?.ok && files.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Zatiaľ tu nie sú žiadne nahrané súbory. Prepnite na „Nahrať nový“ alebo ich
                pridajte v Sandboxe.
              </p>
            )}
            {!filesLoading && listMyFiles?.ok && files.length > 0 && (
              <ul className="space-y-2">
                {files.map((file) => {
                  const selected = selectedSandboxIds.includes(file._id);
                  return (
                    <li key={file._id}>
                      <button
                        type="button"
                        onClick={() => toggleSandbox(file._id)}
                        aria-pressed={selected}
                        data-testid="sherlock-sandbox-file"
                        data-format={file.format ?? undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/40",
                        )}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <FileText className="size-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{file.filename}</span>
                          <span className="block text-xs text-muted-foreground">
                            {file.format ? `${formatLabel(file.format)} • ` : ""}
                            {formatBytes(file.size)} • {formatDate(file.uploadedAt)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {selected && <CheckCircle2 className="size-3.5" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Priamy upload */}
      {source === "upload" && (
        <div className="space-y-3">
          <div
            data-testid="sherlock-dropzone"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={handleInputChange}
              disabled={status === "uploading"}
              data-testid="sherlock-file-input"
            />
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <UploadCloud className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Kliknite alebo presuňte dokument sem</p>
              <p className="text-xs text-muted-foreground">
                Podporované formáty: {SUPPORTED_FORMATS_TEXT} • Max. 200 MB
              </p>
            </div>
          </div>

          {selectedFile && status !== "success" && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="sherlock-selected-file">
              <FileText className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatLabel(selectedFormat)} • {formatBytes(selectedFile.size)}
                </p>
                {selectedFile.size > LARGE_FILE_BYTES && (
                  <p className="mt-1 text-xs text-muted-foreground">{LARGE_FILE_NOTE}</p>
                )}
              </div>
              <button
                type="button"
                onClick={clearUpload}
                disabled={status === "uploading"}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                aria-label="Odstrániť výber"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {status !== "idle" && (
            <div
              className="space-y-1"
              data-testid="sherlock-progress"
              data-state={
                status === "uploading" ? "loading" : status === "success" ? "ready" : "error"
              }
            >
              {status === "uploading" && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Nahrávanie…</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </>
              )}
              {status === "success" && (
                <div className="flex items-center gap-2 text-xs text-chart-2">
                  <CheckCircle2 className="size-4" />
                  <span>Nahrávanie dokončené.</span>
                </div>
              )}
              {status === "error" && uploadError && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 rounded-xl border border-chart-2/30 bg-chart-2/10 p-4 text-sm text-chart-2" data-testid="sherlock-upload-success">
              <CheckCircle2 className="size-5" />
              <span>Súbor bol nahraný. Teraz spustite analýzu.</span>
            </div>
          )}

          {uploadError && status !== "error" && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="sherlock-upload-error">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || status === "uploading"}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="sherlock-upload-button"
          >
            {status === "uploading" ? "Nahráva sa…" : "Nahrať dokument"}
          </button>
        </div>
      )}

      {/* Tlačidlo analýzy */}
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={running || !canAnalyze}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        data-testid="sherlock-run"
        data-state={running ? "loading" : "ready"}
      >
        {running ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            Sherlock analyzuje dokumenty…
          </>
        ) : (
          <>
            <Sparkles className="size-5" />
            Spustiť Sherlock analýzu
          </>
        )}
      </button>

      {/* Priebeh analýzy - zobrazuje trvalé hodnoty z backendu, keď sú dostupné. */}
      {showAnalysisProgress && (
        <div
          className="space-y-2 rounded-xl border border-border bg-card p-4"
          data-testid="sherlock-analysis-progress"
          data-state={runError ? "error" : "loading"}
          aria-live="polite"
        >
          {runError ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <span>{runError}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {trackedRecord
                    ? (persistedLabel ?? "Analýza prebieha…")
                    : "Pripravuje sa analýza…"}
                </span>
                {persistedProgress !== null && (
                  <span className="font-medium text-foreground">{persistedProgress}%</span>
                )}
              </div>
              {persistedProgress !== null ? (
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={persistedProgress}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${persistedProgress}%` }}
                  />
                </div>
              ) : (
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Analýza sa pripravuje"
                >
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {runError && !showAnalysisProgress && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="sherlock-run-error">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <span>{runError}</span>
        </div>
      )}

      {/* Aktuálny výsledok */}
      {currentAnalysis && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="text-lg font-bold">{currentAnalysis.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => setCurrentAnalysis(null)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Zavrieť výsledok"
            >
              <X className="size-4" />
            </button>
          </div>
          {currentAnalysis.data ? (
            <SherlockResults analysis={currentAnalysis.data} />
          ) : !showAnalysisProgress ? (
            <div
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
              data-testid="sherlock-loading-result"
              data-state="loading"
            >
              <Loader2 className="size-5 animate-spin" />
              <span>Analýza sa dokončuje, výsledok sa čoskoro zobrazí…</span>
            </div>
          ) : null}
        </div>
      )}

      {/* História analýz */}
      <div className="pt-2">
        <div className="mb-2 flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Predchádzajúce analýzy</h2>
        </div>
        <div data-testid="sherlock-analysis-list" data-state={analysesLoading ? "loading" : "ready"}>
          {analysesLoading && (
            <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              Načítavam analýzy…
            </p>
          )}
          {!analysesLoading && analyses.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Zatiaľ tu nie sú žiadne analýzy.
            </p>
          )}
          {!analysesLoading && analyses.length > 0 && (
            <ul className="space-y-2">
              {analyses.map((a) => (
                <li
                  key={a._id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors",
                    currentAnalysis?.id === a._id ? "border-primary" : "border-border",
                  )}
                  data-testid="sherlock-analysis-item"
                  data-analysis-id={a._id}
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openAnalysis(a._id, a.data, a.name)}
                      className="block w-full text-left"
                      data-testid="sherlock-analysis-open"
                    >
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.createdAt)} • {a.fileIds.length} súbor(ov) •{" "}
                        {a.status === "ready"
                          ? "hotová"
                          : a.status === "analyzing"
                            ? "analyzuje sa"
                            : "chyba"}
                      </p>
                      {a.status === "error" && a.errorMessage && (
                        <p className="mt-1 text-xs text-destructive">{a.errorMessage}</p>
                      )}
                    </button>
                  </div>
                  <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                  {a.status !== "analyzing" && (
                    <button
                      type="button"
                      onClick={() => void removeAnalysis({ analysisId: a._id })}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Zmazať analýzu"
                      data-testid="sherlock-analysis-delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
