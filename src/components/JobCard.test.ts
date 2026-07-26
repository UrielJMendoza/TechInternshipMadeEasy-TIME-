import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobCard } from "./JobCard";
import type { Internship } from "@/lib/types";

const listedJob: Internship = {
  id: "card-job",
  title: "Cloud Platform Engineering Intern",
  company: "Example Labs",
  location: "Remote; Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  salary: "$42/hr",
  link: "https://example.com/jobs/card-job",
  source: "simplify",
  sponsorship: "Offers visa sponsorship",
  posted_date: "2026-07-21",
  first_seen_at: "2026-07-21T00:00:00Z",
  last_seen_at: "2026-07-22T00:00:00Z",
  last_verified_at: "2026-07-22T00:00:00Z",
  verification_status: "source-observed",
  is_active: true,
};

function renderCard(dense: boolean, job = listedJob): string {
  return renderToStaticMarkup(
    createElement(JobCard, {
      job,
      now: Date.parse("2026-07-22T12:00:00Z"),
      dense,
      saved: false,
      stage: "not_applied",
      onOpenDetails: () => undefined,
      onToggleSaved: () => undefined,
      onStageChange: () => undefined,
    }),
  );
}

test("card and compact-card modes retain details and the external Apply action", () => {
  for (const dense of [false, true]) {
    const markup = renderCard(dense);
    assert.match(markup, /data-job-id="card-job"/);
    assert.match(markup, /Example Labs/);
    assert.match(markup, /Cloud Platform Engineering Intern/);
    assert.match(markup, /Denver, CO/);
    assert.match(markup, /Summer 2027/);
    assert.match(markup, /Sponsorship confirmed/);
    assert.match(markup, /Verified at source/);
    assert.match(markup, /View details for Cloud Platform Engineering Intern/);
    assert.match(
      markup,
      /href="https:\/\/example\.com\/jobs\/card-job" target="_blank" rel="noopener noreferrer"/,
    );
    assert.match(markup, /ui-button--apply/);
    assert.match(markup, />Apply</);
    assert.doesNotMatch(markup, /absolute inset-0 z-0[^>]*href=/);
  }
});

test("long location lists use an accessible user-controlled disclosure", () => {
  const markup = renderCard(false, {
    ...listedJob,
    location:
      "Remote; Denver, CO; Austin, TX; Seattle, WA; New York, NY",
  });

  assert.match(markup, /<details[^>]*location-summary--expandable/);
  assert.match(markup, /Remote; Denver, CO/);
  assert.match(markup, /View 3 more locations/);
  assert.match(markup, /Show fewer locations/);
  assert.equal((markup.match(/<li>/g) ?? []).length, 5);
  assert.match(markup, /for Cloud Platform Engineering Intern at Example Labs/);
});

test("compensation and sponsorship meaning never relies on color alone", () => {
  const listedMarkup = renderCard(false);
  assert.match(listedMarkup, /data-salary-kind="source-listed"/);
  assert.match(listedMarkup, /Employer-listed/);
  assert.match(listedMarkup, /\$42\/hr/);

  const estimateMarkup = renderCard(false, {
    ...listedJob,
    salary: null,
    sponsorship: null,
  });
  assert.match(estimateMarkup, /data-salary-kind="category-estimate"/);
  assert.match(estimateMarkup, /Timley estimate/);
  assert.match(estimateMarkup, /Est\. \$30–50\/hr/);
  assert.match(estimateMarkup, /Sponsorship unknown/);
});
