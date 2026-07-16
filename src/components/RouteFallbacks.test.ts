import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorFallback from "@/app/error";
import Loading from "@/app/loading";

test("route loading fallback announces progress without exposing skeletons", () => {
  const markup = renderToStaticMarkup(createElement(Loading));

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /role="status">Loading job listings/);
  assert.match(markup, /aria-hidden="true"/);
});

test("route error fallback exposes an alert and retry action", () => {
  const markup = renderToStaticMarkup(
    createElement(ErrorFallback, {
      error: new Error("fixture"),
      reset: () => undefined,
    }),
  );

  assert.match(markup, /role="alert"/);
  assert.match(markup, />Something went wrong<\/h1>/);
  assert.match(markup, /<button[^>]+type="button"[^>]*>Try again<\/button>/);
});
