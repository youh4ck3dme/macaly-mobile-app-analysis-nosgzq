import { useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PdfSandboxUpload() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const finalizeUpload = useAction(api.files.finalizeUpload);
  const removeFile = useMutation(api.files.remove);
  const filesResult = useQuery(api.files.listMyFiles, {});

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = filesResult === undefined;
  const isError = filesResult !== undefined && !filesResult.ok;
  const files = filesResult?.ok ? filesResult.files : [];

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
      setSelectedFile(null);
      setSelectedFormat(null);
      setError(validationError);
      setStatus("error");
      return;
    }
    setSelectedFile(file);
    setSelectedFormat(detectFormat(file));
    setError(null);
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

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setSelectedFormat(null);
    setError(null);
    setStatus("idle");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setStatus("uploading");
    setProgress(0);
    setError(null);

    try {
      const urlResult = await generateUploadUrl({});
      if (!urlResult.ok) {
        throw new Error(urlResult.message);
      }

      const uploadUrl = urlResult.uploadUrl;
      const contentType = selectedFile.type || "application/octet-stream";

      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setProgress(percent);
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.statusText || "Nahrávanie zlyhalo"));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Sieťová chyba počas nahrávania.")));
        xhr.addEventListener("abort", () => reject(new Error("Nahrávanie bolo prerušené.")));
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.send(selectedFile);
      });

      const response = JSON.parse(xhr.responseText) as { storageId?: string };
      const storageId = response.storageId;
      if (!storageId) {
        throw new Error("Server nevrátil ID uloženého súboru.");
      }

      const saveResult = await finalizeUpload({
        storageId: storageId as Id<"_storage">,
        filename: selectedFile.name,
        contentType,
        size: selectedFile.size,
      });
      if (!saveResult.ok) {
        throw new Error(saveResult.message);
      }

      setStatus("success");
      setSelectedFile(null);
      setSelectedFormat(null);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nahrávanie zlyhalo.";
      setError(message);
      setStatus("error");
      setProgress(0);
    }
  };

  const handleDelete = async (id: Id<"files">) => {
    const result = await removeFile({ id });
    if (!result.ok) {
      console.error("Odstránenie súboru zlyhalo:", result.message);
    }
  };

  return (
    <div className="space-y-4" data-testid="pdf-sandbox">
      <div
        data-testid="pdf-dropzone"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/50 hover:bg-accent",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="sr-only"
          onChange={handleInputChange}
          disabled={status === "uploading"}
          data-testid="pdf-file-input"
        />
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <UploadCloud className="size-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Kliknite alebo presuňte dokument sem
          </p>
          <p className="text-xs text-muted-foreground">
            Podporované formáty: {SUPPORTED_FORMATS_TEXT} • Max. 200 MB
          </p>
        </div>
      </div>

      {selectedFile && status !== "success" && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="pdf-selected-file">
          <div className="flex items-start gap-3">
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
              onClick={clearSelection}
              disabled={status === "uploading"}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              aria-label="Odstrániť výber"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {status !== "idle" && (
        <div
          className="space-y-1"
          data-testid="pdf-progress"
          data-state={
            status === "uploading" ? "loading" : status === "success" ? "ready" : "error"
          }
        >
          {status === "uploading" && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Nahrávanie…</span>
                <span className="font-medium text-foreground">{progress}%</span>
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
          {status === "error" && error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center gap-2 rounded-xl border border-chart-2/30 bg-chart-2/10 p-4 text-sm text-chart-2" data-testid="pdf-success">
          <CheckCircle2 className="size-5" />
          <span>Súbor bol úspešne nahraný.</span>
        </div>
      )}

      {error && status !== "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="pdf-error">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || status === "uploading"}
        data-testid="pdf-upload-button"
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {status === "uploading" ? "Nahráva sa…" : "Nahrať dokument"}
      </button>

      <div className="pt-2">
        <h2 className="mb-2 text-sm font-medium text-foreground">Nahrané súbory</h2>
        <div data-testid="pdf-file-list" data-state={isLoading ? "loading" : isError ? "error" : "ready"}>
          {isLoading && (
            <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              Načítavam súbory…
            </p>
          )}
          {isError && filesResult && !filesResult.ok && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
              {filesResult.message}
            </p>
          )}
          {!isLoading && !isError && files.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Zatiaľ tu nie sú žiadne nahrané súbory.
            </p>
          )}
          {!isLoading && !isError && files.length > 0 && (
            <ul className="space-y-3">
              {files.map((file) => (
                <li
                  key={file._id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  data-testid="pdf-file-item"
                  data-file-id={file._id}
                  data-format={file.format ?? undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.format ? `${formatLabel(file.format)} • ` : ""}
                        {formatBytes(file.size)} • {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <OpenFileButton fileId={file._id} filename={file.filename} />
                      <button
                        type="button"
                        onClick={() => void handleDelete(file._id)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Zmazať súbor"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function OpenFileButton({ fileId, filename }: { fileId: Id<"files">; filename: string }) {
  const [requested, setRequested] = useState(false);
  const result = useQuery(api.files.getDownloadUrl, requested ? { fileId } : "skip");

  useEffect(() => {
    if (requested && result) {
      if (result.ok && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setRequested(false);
    }
  }, [requested, result, filename]);

  const isLoading = requested && !result;

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => setRequested(true)}
      className="flex items-center gap-1 rounded-md p-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
      aria-label="Otvoriť súbor"
      title="Otvoriť súbor"
    >
      {isLoading ? (
        <span className="size-4 animate-pulse rounded-full bg-primary/50" />
      ) : (
        <ExternalLink className="size-4" />
      )}
    </button>
  );
}
