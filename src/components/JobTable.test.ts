import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobTable } from "./JobTable";
import type { Internship } from "@/lib/types";

const job: Internship = {
  id: "table-job",
  title: "Product Engineering Intern",
  company: "Example Labs",
  location: "New York, NY",
  category: "product",
  role_type: "internship",
  season: "Summer 2027",
  salary: "$40/hr",
  link: "https://example.com/jobs/table-job",
  source: "simplify",
  sponsorship: null,
  posted_date: "2026-07-20",
  first_seen_at: "2026-07-20T00:00:00Z",
  last_seen_at: "2026-07-22T00:00:00Z",
  is_active: true,
};

test("table view is semantic, aligned, and preserves every primary action", () => {
  const markup = renderToStaticMarkup(
    createElement(JobTable, {
      jobs: [job],
      now: Date.parse("2026-07-22T00:00:00Z"),
      saved: new Set<string>(),
      applications: {},
      onOpenDetails: () => undefined,
      onToggleSaved: () => undefined,
      onStageChange: () => undefined,
    }),
  );

  assert.match(markup, /<table/);
  assert.match(markup, /<caption class="sr-only">/);
  assert.match(markup, /data-job-id="table-job"/);
  assert.match(markup, /Product Engineering Intern/);
  assert.match(markup, /New York, NY/);
  assert.match(markup, /Summer 2027/);
  assert.match(markup, /Employer-listed/);
  assert.match(markup, /Sponsorship unknown/);
  assert.match(markup, /Track/);
  assert.match(markup, /ui-button--apply/);
  assert.match(markup, />Apply</);
});
