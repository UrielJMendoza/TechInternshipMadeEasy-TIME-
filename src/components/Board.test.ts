import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Board } from "./Board";
import type { Internship } from "@/lib/types";

const fixture: Internship = {
  id: "fixture-1",
  title: "Cloud Infrastructure Engineering Intern with a deliberately long title",
  company: "Example Labs",
  location: "Remote; Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  salary: null,
  link: "https://example.com/jobs/fixture-1",
  source: "fixture",
  sponsorship: "offers-sponsorship",
  posted_date: "2026-07-10",
  first_seen_at: "2026-07-10T00:00:00Z",
  last_seen_at: "2026-07-10T00:00:00Z",
  is_active: true,
};

test("board renders its initial server markup with the new tracking controls", () => {
  const markup = renderToStaticMarkup(
    createElement(Board, {
      jobs: [fixture],
      loadError: false,
      partialData: false,
      generatedAt: "2026-07-10T12:00:00Z",
      updatedAt: "2026-07-10T11:00:00Z",
    }),
  );

  assert.match(markup, /Example Labs/);
  assert.match(
    markup,
    /Cloud Infrastructure Engineering Intern with a deliberately long title/,
  );
  assert.match(markup, /View details for Cloud Infrastructure Engineering Intern/);
  assert.match(markup, />Remote</);
  assert.match(markup, />Advanced</);
  assert.match(markup, /aria-label="Major"/);
  assert.match(markup, /aria-label="Specialization"/);
  assert.match(markup, /Track/);
  assert.match(markup, />Apply</);
  assert.match(markup, /Est\. \$30–50\/hr/);
  assert.match(markup, /Timley estimate/);
  assert.match(markup, /labeled as an estimate/);
  assert.match(markup, /<summary[^>]*>Save search<\/summary>/);
  assert.match(markup, /href="\/alerts"/);
});

test("saved-search creation lives with result actions, outside the sticky filter grid", () => {
  const source = readFileSync(
    new URL("./Board.tsx", import.meta.url),
    "utf8",
  );
  const resultsStart = source.indexOf('id="job-results"');
  const savedSearchControl = source.indexOf(
    "<SavedSearchButton filters={filters} />",
  );

  assert.ok(resultsStart >= 0);
  assert.ok(savedSearchControl > resultsStart);
});

test("board keeps pagination bounded and exposes an intentional load-more state", () => {
  const jobs = Array.from({ length: 61 }, (_, index) => ({
    ...fixture,
    id: `fixture-${index}`,
    link: `https://example.com/jobs/fixture-${index}`,
    title: `Cloud role ${index}`,
  }));
  const markup = renderToStaticMarkup(
    createElement(Board, {
      jobs,
      loadError: false,
      partialData: false,
      generatedAt: "2026-07-10T12:00:00Z",
      updatedAt: "2026-07-10T11:00:00Z",
    }),
  );

  assert.equal((markup.match(/data-testid="job-row"/g) ?? []).length, 30);
  assert.match(markup, /Showing 30 of 61 roles/);
  assert.match(markup, /Load 30 more/);
  assert.match(markup, /31 remaining/);
});

test("board distinguishes full errors from a usable partial feed", () => {
  const errorMarkup = renderToStaticMarkup(
    createElement(Board, {
      jobs: [],
      loadError: true,
      partialData: false,
      generatedAt: "2026-07-10T12:00:00Z",
      updatedAt: null,
    }),
  );
  assert.match(errorMarkup, /Listings are temporarily unavailable/);
  assert.match(errorMarkup, /Listings could not be loaded/);
  assert.match(errorMarkup, /Try again/);

  const partialMarkup = renderToStaticMarkup(
    createElement(Board, {
      jobs: [fixture],
      loadError: false,
      partialData: true,
      generatedAt: "2026-07-10T12:00:00Z",
      updatedAt: "2026-07-10T11:00:00Z",
    }),
  );
  assert.match(partialMarkup, /Partial feed loaded/);
  assert.match(partialMarkup, /Example Labs/);
  assert.match(partialMarkup, /result count may be incomplete/);
});
