import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "./landing/LandingPage";
import type { Internship } from "@/lib/types";

const fixture: Internship = {
  id: "landing-fixture",
  title: "Software Engineering Intern",
  company: "Example Labs",
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
      companies: jobs.map((job) => job.company),
      showcaseJob: jobs[0] ?? null,
      stats:
        jobs.length > 0
          ? {
              openRoles: jobs.length,
              recentlyAdded: jobs.length,
              sourcesRepresented: 1,
              sourceListedPay: jobs.length,
              sponsorshipKnown: jobs.length,
              updatedAt: "2026-07-22T11:00:00.000Z",
            }
          : {
              openRoles: null,
              recentlyAdded: null,
              sourcesRepresented: null,
              sourceListedPay: null,
              sponsorshipKnown: null,
              updatedAt: null,
            },
      generatedAt: "2026-07-22T12:00:00.000Z",
    }),
  );
}

test("landing page renders the required product story in order", () => {
  const markup = renderLanding();
  const ids = [
    'id="landing-title"',
    'id="company-marquee-title"',
    'id="problem"',
    'id="job-discovery"',
    'id="freshness"',
    'id="tracker-showcase"',
    'id="how-it-works"',
    'id="product-statistics"',
    'id="final-cta-title"',
    'id="faq"',
  ];

  let previous = -1;
  for (const id of ids) {
    const index = markup.indexOf(id);
    assert.ok(index > previous, `${id} must appear in the expected order`);
    previous = index;
  }

  assert.match(markup, /Your next opportunity/);
  assert.match(markup, /shouldn&#x27;t be buried/);
  assert.match(markup, /Example Labs/);
  assert.match(markup, /Active in current results/);
  assert.match(markup, /Appearing on Timley—not partnerships or endorsements/);
});

test("landing links and FAQ cover every practical destination without dead hashes", () => {
  const markup = renderLanding();

  for (const href of [
    "/jobs",
    "/tracker",
    "/methodology",
    "/status",
  ]) {
    assert.match(markup, new RegExp(`href="${href.replace("/", "\\/")}`));
  }

  for (const question of [
    "What is Timley?",
    "Where do listings come from?",
    "How often are jobs refreshed?",
    "Does Timley require an account?",
    "Where is tracker data stored?",
    "How do saved-search alerts work?",
    "What does optional account continuity do?",
    "How are salary estimates labeled?",
    "How is sponsorship information determined?",
    "Is Timley an AI career platform?",
  ]) {
    assert.match(markup, new RegExp(question.replace(/[?]/g, "\\?")));
  }

  assert.match(markup, /does not provide AI resume scoring/);
  assert.match(markup, /signing in is optional and does not upload/);
  assert.match(markup, /tracker choice explicitly warns/);
  assert.match(markup, /foreground-only/);
  assert.match(markup, /Email alerts are not available/);
  assert.match(markup, /cloud snapshot before replacing local data/);
  assert.match(markup, /Sign-out leaves local data/);
  assert.doesNotMatch(markup, /href="#"/);
  assert.doesNotMatch(markup, /href="javascript:/);
});

test("company marquee has one accessible copy and a hidden clone", () => {
  const markup = renderLanding();
  assert.match(
    markup,
    /role="region"[^>]*aria-label="Companies with active listings on Timley/,
  );
  assert.match(markup, /aria-hidden="true" class="landing-company-marquee__copy"/);
});

test("missing live data renders honest fallbacks instead of invented companies or zeros", () => {
  const markup = renderLanding([]);
  assert.match(markup, /Live listing totals are temporarily unavailable/);
  assert.match(markup, /Live listing preview unavailable/);
  assert.match(markup, /Company names will appear when the active listing feed is available/);
  assert.match(markup, /Live totals unavailable/);
  assert.doesNotMatch(markup, /Example Labs/);
});
