import assert from "node:assert/strict";
import test from "node:test";
import type { Internship } from "@/lib/types";
import {
  listingReportUrl,
  REPORT_REASONS,
} from "./ReportListing";

const job: Internship = {
  id: "report-job",
  title: "Software Engineering Intern",
  company: "Example Labs",
  location: "Denver, CO",
  category: "software",
  role_type: "internship",
  season: "Summer 2027",
  salary: null,
  link: "https://example.com/jobs/report-job?utm_source=list",
  canonical_url: "https://example.com/jobs/report-job",
  canonical_record_key: "job_stable",
  source: "simplify",
  original_source: "simplify",
  sponsorship: null,
  posted_date: "2026-07-20",
  first_seen_at: "2026-07-20T00:00:00Z",
  last_seen_at: "2026-07-22T00:00:00Z",
  is_active: true,
};

test("every listing report reason produces a reviewable GitHub issue without a Timley backend", () => {
  assert.deepEqual(REPORT_REASONS, [
    "Closed link",
    "Duplicate",
    "Incorrect location",
    "Incorrect pay",
    "Incorrect sponsorship",
    "Incorrect classification",
    "Other issue",
  ]);

  for (const reason of REPORT_REASONS) {
    const url = new URL(listingReportUrl(job, reason, "Evidence changed."));
    assert.equal(url.hostname, "github.com");
    assert.equal(
      url.pathname,
      "/UrielJMendoza/TechInternshipMadeEasy-TIME-/issues/new",
    );
    assert.match(url.searchParams.get("title") ?? "", new RegExp(reason));
    assert.match(url.searchParams.get("body") ?? "", /job_stable/);
    assert.match(
      url.searchParams.get("body") ?? "",
      /https:\/\/example\.com\/jobs\/report-job/,
    );
    assert.match(url.searchParams.get("body") ?? "", /Evidence changed\./);
  }
});
