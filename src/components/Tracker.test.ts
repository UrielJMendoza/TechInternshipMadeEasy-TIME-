import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tracker } from "./Tracker";
import {
  APPLICATION_STAGE_LABELS,
  TRACKED_APPLICATION_STAGES,
} from "@/lib/applicationTracking";

test("tracker exposes the complete workspace controls in initial markup", () => {
  const markup = renderToStaticMarkup(
    createElement(Tracker),
  );

  assert.match(markup, /Application workspace/);
  assert.match(markup, /Upcoming actions/);
  assert.match(markup, /browser-first workspace/);
  assert.match(markup, /Signing in never uploads/);
  assert.match(markup, /explicitly select it/);
  assert.match(markup, /Add application/);
  assert.match(markup, /Data &amp; reminders/);
  assert.match(markup, /Export and restore/);
  assert.match(markup, /Export CSV/);
  assert.match(markup, /Export calendar/);
  assert.match(markup, /Download backup/);
  assert.match(markup, /Restore backup/);
  assert.match(markup, /Enable browser reminders/);
  assert.match(markup, /aria-label="Tracker view"/);
  assert.match(markup, />list</);
  assert.match(markup, />board</);
  assert.match(markup, /Company, job, action, notes, or contact/);

  for (const stage of TRACKED_APPLICATION_STAGES) {
    assert.match(markup, new RegExp(APPLICATION_STAGE_LABELS[stage]));
  }
});

test("tracker keeps browser data usable when the active feed is unavailable", () => {
  const source = readFileSync(new URL("./Tracker.tsx", import.meta.url), "utf8");

  assert.match(source, /usePublicJobsFeed\(needsJobsFeed\)/);
  assert.match(source, /Your saved tracker data is available/);
  assert.match(source, /no application is being treated as\s+removed/);
  assert.match(source, /needsJobsFeed = ready && applicationCount > 0/);
});
