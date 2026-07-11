import assert from "node:assert/strict";
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
      generatedAt: "2026-07-10T12:00:00Z",
      updatedAt: "2026-07-10T11:00:00Z",
    }),
  );

  assert.match(markup, /Example Labs/);
  assert.match(markup, /Remote Only/);
  assert.match(markup, /Visa Sponsorship/);
  assert.match(markup, /Track/);
  assert.match(markup, /Est\. \$30–50\/hr/);
  assert.match(markup, /Pay guide:/);
  assert.match(markup, /broad US category ranges/);
});
