"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { MAX_APPLICATION_IMPORT_BYTES } from "@/lib/applicationTrackingTransfer";

type TransferFormat = "json" | "csv";
type TransferAction = `export-${TransferFormat}` | `import-${TransferFormat}`;
type TransferStatus = {
  kind: "progress" | "success" | "error";
  message: string;
};

type ExportCallback = () => string | Promise<string>;
type ImportCallback = (raw: string) => void | Promise<void>;

export interface ApplicationTrackingTransferProps {
  exportJson: ExportCallback;
  exportCsv: ExportCallback;
  importJson: ImportCallback;
  importCsv: ImportCallback;
  ready?: boolean;
  storageAvailable?: boolean | null;
  unmatchedCount?: number;
}

const FORMAT_DETAILS = {
  json: {
    accept: ".json,application/json",
    extension: ".json",
    mediaTypes: ["application/json"] as readonly string[],
    blobType: "application/json;charset=utf-8",
    label: "JSON backup",
  },
  csv: {
    accept: ".csv,text/csv,application/csv,application/vnd.ms-excel",
    extension: ".csv",
    mediaTypes: [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
    ] as readonly string[],
    blobType: "text/csv;charset=utf-8",
    label: "CSV spreadsheet",
  },
} as const;

const MAX_IMPORT_MEGABYTES = MAX_APPLICATION_IMPORT_BYTES / (1024 * 1024);

function isAcceptedFile(file: File, format: TransferFormat): boolean {
  const details = FORMAT_DETAILS[format];
  return (
    file.name.toLowerCase().endsWith(details.extension) ||
    details.mediaTypes.includes(file.type.toLowerCase())
  );
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return "Something went wrong. Please check the file and try again.";
  }
  return error.message.trim().slice(0, 240);
}

function pluralizeRecords(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

export function ApplicationTrackingTransfer({
  exportJson,
  exportCsv,
  importJson,
  importCsv,
  ready = true,
  storageAvailable = true,
  unmatchedCount = 0,
}: ApplicationTrackingTransferProps) {
  const titleId = useId();
  const helpId = useId();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const [activeAction, setActiveAction] = useState<TransferAction | null>(null);
  const [status, setStatus] = useState<TransferStatus | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
      }
      if (downloadUrlRef.current !== null) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
    };
  }, []);

  const releasePreviousDownload = () => {
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (downloadUrlRef.current !== null) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
  };

  const beginAction = (action: TransferAction): boolean => {
    if (!ready || busyRef.current) return false;
    busyRef.current = true;
    setActiveAction(action);
    return true;
  };

  const finishAction = () => {
    busyRef.current = false;
    if (mountedRef.current) setActiveAction(null);
  };

  const download = async (format: TransferFormat) => {
    const action = `export-${format}` as const;
    if (!beginAction(action)) return;
    const details = FORMAT_DETAILS[format];
    setStatus({ kind: "progress", message: `Preparing ${details.label}…` });

    try {
      const raw = await (format === "json" ? exportJson() : exportCsv());
      if (!mountedRef.current) return;
      if (typeof raw !== "string") {
        throw new Error("The export did not produce a text file.");
      }
      if (new TextEncoder().encode(raw).byteLength > MAX_APPLICATION_IMPORT_BYTES) {
        throw new Error(
          `The export exceeds the supported ${MAX_IMPORT_MEGABYTES} MB backup limit.`,
        );
      }

      releasePreviousDownload();
      const blob = new Blob([raw], { type: details.blobType });
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `timley-tracking-data-${new Date()
        .toISOString()
        .slice(0, 10)}${details.extension}`;
      anchor.hidden = true;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }

      cleanupTimerRef.current = window.setTimeout(() => {
        if (downloadUrlRef.current === url) {
          URL.revokeObjectURL(url);
          downloadUrlRef.current = null;
        }
        cleanupTimerRef.current = null;
      }, 1_000);
      setStatus({
        kind: "success",
        message: `${details.label} downloaded.`,
      });
    } catch (error) {
      if (mountedRef.current) {
        setStatus({
          kind: "error",
          message: `Could not export ${details.label}: ${errorMessage(error)}`,
        });
      }
    } finally {
      finishAction();
    }
  };

  const readImport = async (file: File, format: TransferFormat) => {
    const action = `import-${format}` as const;
    if (!beginAction(action)) return;
    const details = FORMAT_DETAILS[format];
    setStatus({ kind: "progress", message: `Reading ${file.name}…` });

    try {
      if (!isAcceptedFile(file, format)) {
        throw new Error(`Choose a ${details.extension} file.`);
      }
      if (file.size === 0) throw new Error("The selected file is empty.");
      if (file.size > MAX_APPLICATION_IMPORT_BYTES) {
        throw new Error(
          `The selected file exceeds the ${MAX_IMPORT_MEGABYTES} MB limit.`,
        );
      }

      const raw = await file.text();
      if (!mountedRef.current) return;
      if (new TextEncoder().encode(raw).byteLength > MAX_APPLICATION_IMPORT_BYTES) {
        throw new Error(
          `The selected file exceeds the ${MAX_IMPORT_MEGABYTES} MB limit.`,
        );
      }
      await (format === "json" ? importJson(raw) : importCsv(raw));
      if (mountedRef.current) {
        setStatus({
          kind: "success",
          message: `${file.name} imported successfully.`,
        });
      }
    } catch (error) {
      if (mountedRef.current) {
        setStatus({
          kind: "error",
          message: `Could not import ${file.name}: ${errorMessage(error)}`,
        });
      }
    } finally {
      finishAction();
    }
  };

  const selectImport = (
    event: ChangeEvent<HTMLInputElement>,
    format: TransferFormat,
  ) => {
    const file = event.currentTarget.files?.[0];
    // Allow the same file to be selected again after a validation failure.
    event.currentTarget.value = "";
    if (file) void readImport(file, format);
  };

  const controlsDisabled = !ready || activeAction !== null;
  const safeUnmatchedCount = Number.isFinite(unmatchedCount)
    ? Math.max(0, Math.trunc(unmatchedCount))
    : 0;
  const storageMessage = !ready
    ? "Restoring tracking data…"
    : storageAvailable === false
      ? "Browser storage is unavailable. Export a backup before closing this tab."
      : storageAvailable === true
        ? "Tracking data is saved only in this browser."
        : "Checking browser storage…";

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={!ready || activeAction !== null}
      className="mt-8 rounded-2xl border border-border bg-surface p-4 sm:flex sm:items-start sm:justify-between sm:gap-6"
    >
      <div className="min-w-0 sm:max-w-sm">
        <h2 id={titleId} className="text-sm font-bold text-fg">
          Tracking data
        </h2>
        <p id={helpId} className="mt-1 text-xs leading-relaxed text-muted">
          Back up or move saved roles, tracked stages, notes, and follow-ups.
          Imports are limited to {MAX_IMPORT_MEGABYTES} MB.
        </p>
        <p
          data-storage-state={
            !ready
              ? "loading"
              : storageAvailable === false
                ? "unavailable"
                : storageAvailable === true
                  ? "available"
                  : "checking"
          }
          className={`mt-2 text-xs font-medium ${
            storageAvailable === false ? "text-hot" : "text-faint"
          }`}
        >
          {storageMessage}
        </p>
        {safeUnmatchedCount > 0 && (
          <p className="mt-2 text-xs leading-relaxed text-champagne">
            {pluralizeRecords(safeUnmatchedCount)} from older links could not be
            matched to a current listing. They remain preserved in backups.
          </p>
        )}
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:w-[19rem]">
        <fieldset
          disabled={controlsDisabled}
          className="col-span-2 grid grid-cols-2 gap-2"
        >
          <legend className="sr-only">Transfer tracking data</legend>
          <button
            type="button"
            aria-describedby={helpId}
            onClick={() => void download("json")}
            className="min-h-10 rounded-xl border border-border bg-raised px-3 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
          >
            {activeAction === "export-json" ? "Preparing…" : "Export JSON"}
          </button>
          <button
            type="button"
            aria-describedby={helpId}
            onClick={() => void download("csv")}
            className="min-h-10 rounded-xl border border-border bg-raised px-3 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
          >
            {activeAction === "export-csv" ? "Preparing…" : "Export CSV"}
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            hidden
            disabled={controlsDisabled}
            accept={FORMAT_DETAILS.json.accept}
            onChange={(event) => selectImport(event, "json")}
          />
          <input
            ref={csvInputRef}
            type="file"
            hidden
            disabled={controlsDisabled}
            accept={FORMAT_DETAILS.csv.accept}
            onChange={(event) => selectImport(event, "csv")}
          />
          <button
            type="button"
            aria-describedby={helpId}
            onClick={() => jsonInputRef.current?.click()}
            className="min-h-10 rounded-xl border border-accent/45 bg-accent/10 px-3 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
          >
            {activeAction === "import-json" ? "Importing…" : "Import JSON"}
          </button>
          <button
            type="button"
            aria-describedby={helpId}
            onClick={() => csvInputRef.current?.click()}
            className="min-h-10 rounded-xl border border-accent/45 bg-accent/10 px-3 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
          >
            {activeAction === "import-csv" ? "Importing…" : "Import CSV"}
          </button>
        </fieldset>

        {status && (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={`col-span-2 rounded-lg px-2.5 py-2 text-xs font-medium ${
              status.kind === "error"
                ? "bg-[rgba(255,69,58,0.14)] text-[#ff8c85]"
                : status.kind === "success"
                  ? "bg-new-soft text-new"
                  : "bg-raised text-muted"
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </section>
  );
}
