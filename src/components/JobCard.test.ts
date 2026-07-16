import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobCard } from "./JobCard";
import type { Internship } from "@/lib/types";

const fixture: Internship = {
  id: "semantic-card",
  tracking_key: "job:semantic-card",
  title: "Platform Engineering Intern",
  company: "Example Systems",
  location: "Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  term_keys: ["summer-2027"],
  salary: "$42/hr",
  link: "https://example.test/jobs/platform-intern",
  source: "fixture",
  sponsorship: "offers-sponsorship",
  posted_date: "2026-07-10",
  first_seen_at: "2026-07-10T00:00:00Z",
  last_seen_at: "2026-07-10T00:00:00Z",
  last_checked_at: "2026-07-10T00:00:00Z",
  is_active: true,
  company_domain: "example.com",
  country_code: "US",
  region_code: "CO",
  city: "Denver",
  metro_id: "denver",
  location_type: "onsite",
  normalization_confidence: 1,
  contributing_sources: ["fixture"],
  salary_currency: "USD",
  salary_minimum: 42,
  salary_maximum: 42,
  salary_cadence: "hourly",
  annualized_salary_minimum: 87_360,
  annualized_salary_maximum: 87_360,
  salary_parse_confidence: 1,
  salary_provenance: "source-listed",
  listing_changes: [],
};

function renderCard(
  dense = false,
  overrides: Partial<Internship> = {},
  saved = false,
): string {
  return renderToStaticMarkup(
    createElement(JobCard, {
      job: { ...fixture, ...overrides },
      now: new Date("2026-07-11T00:00:00Z").getTime(),
      dense,
      saved,
      stage: "not_applied",
      onToggleSaved: () => undefined,
      onStageChange: () => undefined,
    }),
  );
}

test("job card exposes one visible semantic listing link and a named article", () => {
  const markup = renderCard();

  assert.match(markup, /<article[^>]+aria-labelledby="[^"]+"/);
  assert.match(
    markup,
    /<a[^>]+aria-label="Platform Engineering Intern at Example Systems — open listing\. Internship term: Summer 2027"[^>]*>[\s\S]*?<h2[^>]*>Platform Engineering Intern<\/h2>[\s\S]*?<\/a>/,
  );
  assert.match(markup, /id="[^"]+"[^>]*>Example Systems<\/span>/);
  assert.match(markup, /<time dateTime="2026-07-10"[^>]*>1d ago<\/time>/);
});

test("Apply and the visible Track trigger render in card and dense modes", () => {
  for (const dense of [false, true]) {
    const markup = renderCard(dense);
    const applyTag = markup.match(
      /<a[^>]+aria-label="Apply to Platform Engineering Intern at Example Systems \(opens in a new tab\)"[^>]*>/,
    )?.[0];

    assert.ok(applyTag);
    assert.doesNotMatch(applyTag, /\bhidden\b/);
    assert.match(applyTag, /min-h-11/);
    assert.match(
      markup,
      /<button[^>]+aria-haspopup="menu"[^>]*>[\s\S]*?<span>Track<\/span>/,
    );
    assert.match(markup, /<button[^>]+type="button"[^>]+aria-label="Add to To apply"/);
  }

  assert.match(renderCard(false, {}, true), /aria-label="Remove from To apply"/);
});

test("internship terms stay visible in card and dense modes with bounded overflow", () => {
  for (const dense of [false, true]) {
    const markup = renderCard(dense, {
      term_keys: ["fall-2026", "spring-2027", "summer-2027"],
    });
    const groupTag = markup.match(
      /<span[^>]+data-testid="job-term-badges"[^>]*>/,
    )?.[0];

    assert.ok(groupTag);
    assert.match(groupTag, /aria-label="Internship terms: Fall 2026, Spring 2027, Summer 2027"/);
    assert.doesNotMatch(groupTag, /\bhidden\b/);
    assert.match(markup, />Fall 2026</);
    assert.match(markup, />Spring 2027</);
    assert.match(markup, />\+1</);
  }
});

test("internships without a normalized term say that the term is not listed", () => {
  const markup = renderCard(false, { season: null, term_keys: [] });

  assert.match(markup, /data-term-keys="not-listed"/);
  assert.match(markup, /aria-label="Internship term: Term not listed"/);
  assert.match(markup, />Term not listed</);
});

test("job card forwards only the confidence-gated company domain to the logo", () => {
  const markup = renderCard();

  assert.match(markup, /%2Fapi%2Fcompany-logo%3Fdomain%3Dexample\.com/);
  assert.doesNotMatch(markup, /favicon\.vemetric\.com/);
});

test("job card exposes source trust, provenance, change history, and report actions", () => {
  const markup = renderCard();

  assert.match(markup, /Source &amp; trust details/);
  assert.match(markup, /Contributing sources/);
  assert.match(markup, /Source-listed; not independently verified/);
  assert.match(markup, /No changes recorded/);
  assert.match(markup, /Closed role/);
  assert.match(markup, /Wrong location/);
  assert.match(markup, /Wrong pay/);
});
