import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

test("shared header and footer expose every working primary destination", () => {
  const markup = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      createElement(SiteHeader),
      createElement(SiteFooter),
    ),
  );

  for (const href of [
    "/",
    "/jobs",
    "/tracker",
    "/alerts",
    "/account",
    "/#how-it-works",
    "/methodology",
    "/status",
    "/changelog",
    "/privacy",
    "/terms",
    "/methodology#sources",
  ]) {
    assert.match(
      markup,
      new RegExp(`href="${href.replace(/[/?#-]/g, "\\$&")}"`),
      `missing ${href}`,
    );
  }

  assert.match(
    markup,
    /href="https:\/\/github\.com\/UrielJMendoza\/TechInternshipMadeEasy-TIME-\/issues\/new"/,
  );
  assert.match(markup, /<summary[^>]*aria-label="Open navigation menu"/);
  for (const href of ["/alerts", "/account"]) {
    assert.equal(
      (markup.match(new RegExp(`href="${href}"`, "g")) ?? []).length,
      3,
      `${href} should appear in desktop navigation, mobile navigation, and the footer`,
    );
  }
  assert.doesNotMatch(markup, /signed in as|sign out|log out/i);
  assert.doesNotMatch(markup, /href="#"/);
  assert.doesNotMatch(markup, /href="javascript:/);
});
