import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobDetailsContent } from "./JobDetailsDrawer";
import type { Internship } from "@/lib/types";

const job: Internship = {
  id: "detail-job",
  title: "Security Engineering Intern",
  company: "Example Labs",
  location: "Austin, TX",
  category: "security",
  role_type: "internship",
  season: "Fall 2026",
  salary: "$38/hr",
  link: "https://example.com/jobs/detail-job",
  source: "simplify",
  sponsorship: "Offers visa sponsorship",
  posted_date: "2026-07-15",
  first_seen_at: "2026-07-16T00:00:00Z",
  last_seen_at: "2026-07-21T00:00:00Z",
  last_verified_at: "2026-07-21T00:00:00Z",
  verification_status: "source-observed",
  canonical_url: "https://example.com/jobs/detail-job",
  requisition_id: "req-12345",
  duplicate_group: "dup-example",
  is_active: true,
};

const similar = {
  ...job,
  id: "similar-job",
  title: "Cloud Security Intern",
  link: "https://example.com/jobs/similar-job",
};

function renderDetails(selected = job): string {
  return renderToStaticMarkup(
    createElement(JobDetailsContent, {
      job: selected,
      now: Date.parse("2026-07-22T00:00:00Z"),
      saved: false,
      stage: "not_applied",
      similarJobs: selected.is_active ? [similar] : [],
      onToggleSaved: () => undefined,
      onStageChange: () => undefined,
      onSelectSimilar: () => undefined,
    }),
  );
}

test("job details show the complete real evidence trail", () => {
  const markup = renderDetails();
  for (const expected of [
    "Security Engineering Intern",
    "Example Labs",
    "Austin, TX",
    "Security",
    "SimplifyJobs",
    "First seen",
    "Last observed in source",
    "$38/hr",
    "Employer-listed pay",
    "Sponsorship confirmed",
    "Offers visa sponsorship",
    "Verified at source",
    "Last verified",
    "Canonical application URL",
    "Listing identifier",
    "Duplicate group",
    "Report listing",
    "Incorrect sponsorship",
    "Save role",
    "application stage",
    "Cloud Security Intern",
  ]) {
    assert.ok(markup.includes(expected), `Expected details to include ${expected}`);
  }
  assert.match(markup, /data-listing-state="verified"/);
  assert.match(markup, /data-salary-kind="source-listed"/);
});

test("partial and old-source details are explicit without claiming confirmed closure", () => {
  const markup = renderDetails({
    ...job,
    location: "",
    season: null,
    salary: null,
    sponsorship: null,
    posted_date: null,
    last_seen_at: "2026-05-01T00:00:00Z",
    last_verified_at: "2026-05-01T00:00:00Z",
  });
  assert.match(markup, /data-listing-state="possibly-closed"/);
  assert.match(markup, /Possibly closed/);
  assert.match(markup, /Confirm availability/);
  assert.match(markup, /Partial listing data/);
  assert.match(markup, /Timley estimate/);
  assert.match(markup, /Sponsorship unknown/);
  assert.doesNotMatch(markup, /confirmed closure/i);
});

test("possibly closed role details suppress the external Apply footer", () => {
  const markup = renderDetails({ ...job, is_active: false });
  assert.match(markup, /data-listing-state="possibly-closed"/);
  assert.match(markup, /Possibly closed/);

  const source = readFileSync(
    new URL("./JobDetailsDrawer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /presentation="detail-drawer"/);
  assert.match(source, /ui-button--apply w-full/);
  assert.match(source, /Listing may no longer be active/);
});
