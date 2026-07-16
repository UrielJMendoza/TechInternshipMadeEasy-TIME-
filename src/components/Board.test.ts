import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Board } from "./Board";
import type { Internship } from "@/lib/types";

const fixture: Internship = {
  id: "fixture-1",
  tracking_key: "00000000-0000-4000-8000-000000000001",
  title: "Cloud Infrastructure Engineering Intern with a deliberately long title",
  company: "Example Labs",
  location: "Remote; Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  term_keys: ["summer-2027"],
  salary: null,
  link: "https://example.com/jobs/fixture-1",
  source: "fixture",
  sponsorship: "offers-sponsorship",
  posted_date: "2026-07-10",
  first_seen_at: "2026-07-10T00:00:00Z",
  last_seen_at: "2026-07-10T00:00:00Z",
  last_checked_at: "2026-07-10T00:00:00Z",
  is_active: true,
  company_domain: null,
  country_code: "US",
  region_code: "CO",
  city: "Denver",
  metro_id: "denver",
  location_type: "remote",
  normalization_confidence: 1,
  contributing_sources: ["fixture"],
  salary_currency: null,
  salary_minimum: null,
  salary_maximum: null,
  salary_cadence: null,
  annualized_salary_minimum: null,
  annualized_salary_maximum: null,
  salary_parse_confidence: null,
  salary_provenance: null,
  listing_changes: [],
};

test("board gates browser-owned state during its initial server render", () => {
  const markup = renderToStaticMarkup(
    createElement(Board, {
      jobs: [fixture],
      loadError: false,
      generatedAt: "2026-07-10T12:00:00Z",
      updatedAt: "2026-07-10T11:00:00Z",
    }),
  );

  assert.doesNotMatch(markup, /Example Labs/);
  assert.match(markup, /data-testid="job-toolbar" data-filters-ready="false" aria-hidden="true" inert=""/);
  assert.match(markup, /data-view-toggle-ready="false"/);
  assert.match(markup, /invisible pointer-events-none/);
  assert.match(markup, /aria-label="Table view" aria-pressed="false" disabled="" tabindex="-1"/);
  assert.match(markup, /Remote Only/);
  assert.match(markup, /Visa Sponsorship/);
  assert.match(markup, /Restoring your saved roles, filters, and application stages/);
  assert.match(markup, /Pay guide:/);
  assert.match(markup, /broad US category ranges/);
  assert.match(markup, /<h2[^>]*>Tracking data<\/h2>/);
  assert.match(markup, /Restoring tracking data/);
});
