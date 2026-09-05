"use client";

import { useEffect, useState, type FormEvent } from "react";

const TOKEN_KEY = "timley:reporter-token:v1";
const PENDING_KEY = "timley:pending-reports:v1";
let memoryToken = "";

type PendingReport = {
  jobId: string;
  kind: string;
  details: string;
  reporterToken: string;
};

function reporterToken(): string {
  if (memoryToken) return memoryToken;
  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  } catch {
    // A memory-only token still lets the current tab submit one report.
  }
  memoryToken = window.crypto.randomUUID();
  try {
    window.localStorage.setItem(TOKEN_KEY, memoryToken);
  } catch {
    // Browser storage is optional.
  }
  return memoryToken;
}

function pendingReports(): PendingReport[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingReport => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.jobId === "string" &&
        typeof candidate.kind === "string" &&
        typeof candidate.details === "string" &&
        typeof candidate.reporterToken === "string"
      );
    }).slice(-25);
  } catch {
    return [];
  }
}

function writePendingReports(reports: PendingReport[]): boolean {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(reports.slice(-25)));
    return true;
  } catch {
    // Retry storage is best effort when local storage is unavailable.
    return false;
  }
}

function queueReport(report: PendingReport): boolean {
  const reports = pendingReports();
  const withoutDuplicate = reports.filter((candidate) =>
    !(candidate.jobId === report.jobId && candidate.kind === report.kind)
  );
  return writePendingReports([...withoutDuplicate, report]);
}

async function sendReport(report: PendingReport): Promise<Response> {
  return fetch(`/api/jobs/${encodeURIComponent(report.jobId)}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      kind: report.kind,
      details: report.details,
      reporterToken: report.reporterToken,
    }),
  });
}

async function retryPendingReports() {
  const reports = pendingReports();
  if (reports.length === 0) return;
  const remaining: PendingReport[] = [];
  for (const report of reports) {
    try {
      const response = await sendReport(report);
      if ((response.status >= 500 || response.status === 429)) remaining.push(report);
    } catch {
      remaining.push(report);
    }
  }
  writePendingReports(remaining);
}

export function ReportListing({ jobId }: { jobId: string }) {
  const [kind, setKind] = useState("closed");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"" | "success" | "queued" | "error">("");

  useEffect(() => {
    void retryPendingReports();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus("");
    const report = {
      jobId,
      kind,
      details: details.trim().slice(0, 500),
      reporterToken: reporterToken(),
    };
    try {
      const response = await sendReport(report);
      if (response.status >= 500) {
        setStatus(queueReport(report) ? "queued" : "error");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setStatus(queueReport(report) ? "queued" : "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="report-listing">
      <summary>Report listing</summary>
      {status === "success" ? (
        <p role="status">Thanks. Timley recorded this report for review.</p>
      ) : status === "queued" ? (
        <p role="status">Saved on this device. Timley will retry the report automatically when the data service is available.</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            <span>What looks wrong?</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="closed">Role is closed</option>
              <option value="duplicate">Duplicate listing</option>
              <option value="wrong_location">Location is wrong</option>
              <option value="wrong_pay">Pay information is wrong</option>
              <option value="wrong_sponsorship">Sponsorship information is wrong</option>
              <option value="wrong_title">Title or requirements are wrong</option>
              <option value="wrong_logo">Company logo is wrong</option>
            </select>
          </label>
          <label>
            <span>Optional detail</span>
            <textarea
              value={details}
              maxLength={500}
              rows={3}
              placeholder="What did you notice?"
              onChange={(event) => setDetails(event.target.value)}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send report"}
          </button>
          {status === "error" ? (
            <p className="report-error" role="alert">The report could not be saved. Please try again.</p>
          ) : null}
        </form>
      )}
    </details>
  );
}
