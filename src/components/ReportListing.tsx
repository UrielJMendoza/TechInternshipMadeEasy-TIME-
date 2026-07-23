"use client";

import { useState, type FormEvent } from "react";
import type { Internship } from "@/lib/types";

export const REPORT_REASONS = [
  "Closed link",
  "Duplicate",
  "Incorrect location",
  "Incorrect pay",
  "Incorrect sponsorship",
  "Incorrect classification",
  "Other issue",
] as const;

export type ListingReportReason = (typeof REPORT_REASONS)[number];

const ISSUE_URL =
  "https://github.com/UrielJMendoza/TechInternshipMadeEasy-TIME-/issues/new";

export function ReportListing({ job }: { job: Internship }) {
  const [reason, setReason] = useState<ListingReportReason>("Closed link");
  const [note, setNote] = useState("");

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.open(
      listingReportUrl(job, reason, note),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <details className="mt-6 rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Report listing
      </summary>
      <form
        onSubmit={submitReport}
        className="border-t border-border px-4 py-4"
      >
        <label className="block text-xs font-bold text-muted">
          What is wrong?
          <select
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as ListingReportReason)
            }
            className="ui-control mt-2 min-h-11 w-full bg-bg px-3 text-sm text-fg"
          >
            {REPORT_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-xs font-bold text-muted">
          Details (optional)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            placeholder="Add only listing-specific context. Do not include personal information."
            className="ui-control mt-2 w-full resize-y bg-bg px-3 py-2.5 text-sm text-fg"
          />
        </label>

        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          Continue to a prefilled public GitHub issue to review and submit the
          report. Timley does not receive this text through its own backend;
          GitHub sign-in and abuse controls apply.
        </p>

        <button
          type="submit"
          className="ui-button ui-button--secondary mt-4 w-full sm:w-auto"
        >
          Review report on GitHub
          <span aria-hidden>↗</span>
        </button>
      </form>
    </details>
  );
}

export function listingReportUrl(
  job: Internship,
  reason: ListingReportReason,
  note: string,
): string {
  const issue = new URL(ISSUE_URL);
  issue.searchParams.set(
    "title",
    `[Listing report] ${reason}: ${job.company} — ${job.title}`,
  );
  issue.searchParams.set(
    "body",
    [
      "## Listing",
      `- Company: ${job.company}`,
      `- Role: ${job.title}`,
      `- Timley record: ${job.canonical_record_key ?? job.id}`,
      `- Application URL: ${job.canonical_url ?? job.link}`,
      `- Source: ${job.original_source ?? job.source}`,
      "",
      "## Report",
      `- Issue: ${reason}`,
      note.trim() ? `- Details: ${note.trim()}` : "- Details: Not provided",
      "",
      "_Generated from Timley’s listing report form. Please remove any personal information before submitting._",
    ].join("\n"),
  );
  return issue.toString();
}
