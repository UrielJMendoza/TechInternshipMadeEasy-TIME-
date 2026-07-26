import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "./landing/LandingPage";
import type { Internship } from "@/lib/types";

const fixture: Internship = {
  id: "landing-fixture",
  title: "Software Engineering Intern",
  company: "NVIDIA",
  location: "Denver, CO",
  category: "software",
  role_type: "internship",
  season: "Summer 2027",
  salary: "$42/hr",
  link: "https://example.com/jobs/landing-fixture",
  source: "simplify",
  sponsorship: "offers-sponsorship",
  posted_date: "2026-07-20",
  first_seen_at: "2026-07-20T12:00:00.000Z",
  last_seen_at: "2026-07-22T11:00:00.000Z",
  is_active: true,
};

function renderLanding(jobs: Internship[] = [fixture]): string {
  return renderToStaticMarkup(
    createElement(LandingPage, {
      jobs,
      companies: jobs.length > 0 ? ["NVIDIA"] : [],
      showcaseJob: jobs[0] ?? null,
      generatedAt: "2026-07-22T12:00:00.000Z",
    }),
  );
}

test("landing page renders only the compact product structure in order", () => {
  const markup = renderLanding();
  const ids = [
    'id="landing-title"',
    'id="company-marquee-title"',
    'id="job-discovery"',
    'id="tracker-showcase"',
  ];

  let previous = -1;
  for (const id of ids) {
    const index = markup.indexOf(id);
    assert.ok(index > previous, `${id} must appear in the expected order`);
    previous = index;
  }

  assert.match(markup, /Browse jobs/);
  assert.match(markup, /View all jobs/);
  assert.match(markup, /Open tracker/);
  assert.match(markup, /Application tracker/);
  assert.match(markup, /NVIDIA/);
  assert.match(markup, /href="\/jobs\/landing-fixture"/);
  assert.doesNotMatch(markup, /Your next role/);
  assert.doesNotMatch(markup, /right on time/);
  assert.doesNotMatch(markup, /Internships \+ new grad/i);
  assert.doesNotMatch(markup, /No account required/);
  assert.doesNotMatch(markup, /Find what fits/);
  assert.doesNotMatch(markup, /Keep the details/);
  assert.doesNotMatch(markup, /Every application/);
  assert.doesNotMatch(markup, /Ready for what opens next/);
  assert.doesNotMatch(markup, /Featured current roles/);
  assert.doesNotMatch(markup, />Save</);
  assert.doesNotMatch(markup, /—/);

  for (const removedId of [
    'id="final-cta-title"',
    'id="problem"',
    'id="freshness"',
    'id="product-statistics"',
    'id="faq"',
  ]) {
    assert.doesNotMatch(markup, new RegExp(removedId));
  }
});

test("landing actions lead to jobs and tracker without dead hashes", () => {
  const markup = renderLanding();

  assert.match(markup, /href="\/jobs"/);
  assert.match(markup, /href="\/tracker"/);
  assert.doesNotMatch(markup, /href="\/methodology"/);
  assert.doesNotMatch(markup, /href="\/status"/);
  assert.doesNotMatch(markup, /href="#"/);
  assert.doesNotMatch(markup, /href="javascript:/);
});

test("company marquee has one accessible copy and one hidden clone", () => {
  const markup = renderLanding();
  assert.match(
    markup,
    /role="region"[^>]*aria-label="Companies with current active listings on Timley/,
  );
  assert.match(markup, /aria-hidden="true" class="landing-company-marquee__copy"/);
  assert.match(markup, /Companies hiring now/);
  assert.doesNotMatch(markup, /landing-company-pill/);
});

test("missing live data renders restrained fallbacks without invented companies", () => {
  const markup = renderLanding([]);
  assert.match(markup, /Current results will appear/);
  assert.doesNotMatch(markup, /company-marquee-title/);
  assert.doesNotMatch(markup, /NVIDIA/);
});
