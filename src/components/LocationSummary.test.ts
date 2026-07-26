import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocationSummary } from "./LocationSummary";

function render(location: string, maxVisible = 2): string {
  return renderToStaticMarkup(
    createElement(LocationSummary, {
      location,
      maxVisible,
      jobLabel: "Software Intern at Example Labs",
    }),
  );
}

test("short and missing locations stay concise", () => {
  const short = render("Remote; Denver, CO");
  assert.match(short, /Remote; Denver, CO/);
  assert.doesNotMatch(short, /<details/);

  const missing = renderToStaticMarkup(
    createElement(LocationSummary, {
      location: "",
      fallback: "Unavailable",
    }),
  );
  assert.match(missing, /Unavailable/);
});

test("long location lists expose every sanitized location on demand", () => {
  const markup = render(
    "Remote; Denver, CO; Austin, TX; Seattle, WA; New York, NY",
  );

  assert.match(markup, /<details[^>]*location-summary--expandable/);
  assert.doesNotMatch(markup, /<details[^>]* open/);
  assert.match(markup, /View 3 more locations/);
  assert.match(markup, /Show fewer locations/);
  assert.match(markup, /for Software Intern at Example Labs/);
  assert.equal((markup.match(/<li>/g) ?? []).length, 5);
});
