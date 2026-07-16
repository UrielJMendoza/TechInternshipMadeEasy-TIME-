import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyLogo } from "./CompanyLogo";

function renderLogo(domain: string | null): string {
  return renderToStaticMarkup(
    createElement(CompanyLogo, {
      company: "Example Systems",
      domain,
      listingUrl: "https://jobs.example.test/platform-intern",
      size: 40,
    }),
  );
}

test("a missing trusted domain renders only the deterministic letter avatar", () => {
  const markup = renderLogo(null);

  assert.match(markup, />E<\/span>/);
  assert.doesNotMatch(markup, /<img\b/);
  assert.doesNotMatch(markup, /company-logo/);
  assert.doesNotMatch(markup, /favicon\.vemetric\.com/);
  assert.doesNotMatch(markup, /Report an incorrect logo/);
});

test("a trusted domain uses the same-origin proxy and offers an accessible report link", () => {
  const markup = renderLogo("example.com");

  assert.match(markup, /%2Fapi%2Fcompany-logo%3Fdomain%3Dexample\.com/);
  assert.doesNotMatch(markup, /favicon\.vemetric\.com/);
  assert.match(markup, /aria-label="Report an incorrect logo for Example Systems \(opens GitHub in a new tab\)"/);
  assert.match(markup, /github\.com\/UrielJMendoza\/TechInternshipMadeEasy-TIME-\/issues\/new/);
});
