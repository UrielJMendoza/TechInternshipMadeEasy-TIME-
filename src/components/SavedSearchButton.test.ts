import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_BOARD_FILTERS } from "@/lib/boardFilterState";
import { SavedSearchButton } from "./SavedSearchButton";

function renderedButton(): string {
  return renderToStaticMarkup(
    createElement(SavedSearchButton, {
      filters: {
        ...DEFAULT_BOARD_FILTERS,
        query: "platform engineering",
        locationIds: ["denver-co"],
        visaSponsorship: true,
        minimumSalary: "100000",
      },
    }),
  );
}

test("saved-search popover exposes the complete accessible local form", () => {
  const markup = renderedButton();

  assert.match(markup, /<details[^>]*>/);
  assert.match(markup, /<summary[^>]*>Save search<\/summary>/);
  assert.match(markup, /<form[^>]*aria-describedby=/);
  const nameInput = (markup.match(/<input[^>]*>/g) ?? []).find((input) =>
    input.includes('name="saved-search-name"'),
  );
  assert.ok(nameInput);
  assert.match(nameInput, /required=""/);
  assert.match(nameInput, /maxLength="80"/);
  assert.match(markup, /<select[^>]*name="frequency"/);
  for (const frequency of ["instant", "daily", "weekly", "paused"]) {
    assert.match(markup, new RegExp(`value="${frequency}"`));
  }
  assert.match(markup, /value="daily" selected=""/);
  assert.match(markup, /role="status" aria-live="polite"/);
  assert.match(markup, /href="\/alerts"/);
  assert.match(markup, /Manage alerts/);
});

test("delivery defaults and privacy language remain truthful", () => {
  const markup = renderedButton();
  const inApp = markup.match(
    /<input[^>]*name="channel-in-app"[^>]*>/,
  )?.[0];
  const browser = markup.match(
    /<input[^>]*name="channel-browser"[^>]*>/,
  )?.[0];
  const email = markup.match(
    /<input[^>]*name="channel-email"[^>]*>/,
  )?.[0];

  assert.ok(inApp);
  assert.match(inApp, /checked=""/);
  assert.ok(browser);
  assert.doesNotMatch(browser, /checked=""/);
  assert.ok(email);
  assert.doesNotMatch(email, /checked=""/);
  assert.match(email, /disabled=""/);
  assert.match(markup, /start in this browser/);
  assert.match(markup, /Saving or signing in does not upload/);
  assert.match(markup, /explicitly select and sync/);
  assert.match(markup, /does not request notification permission/);
  assert.match(markup, /Email delivery is not available/);
});

test("the component saves the complete filter object without requesting permission", () => {
  const source = readFileSync(
    new URL("./SavedSearchButton.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /createSearch\(\{\s*name,\s*filters,\s*frequency,\s*channels,\s*\}\)/s,
  );
  assert.doesNotMatch(source, /requestPermission|Notification\./);
  assert.doesNotMatch(
    source,
    /signIn\(|signUp\(|createContinuityProvider|\.auth\./,
  );
});
