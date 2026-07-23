import assert from "node:assert/strict";
import test from "node:test";
import { getLegacyJobsRedirect } from "./legacyRouting";

const BOARD_FILTER_KEYS = [
  "tab",
  "q",
  "major",
  "niche",
  "locations",
  "location-order",
  "freshness",
  "collection",
  "sort",
  "stages",
  "remote",
  "visa",
] as const;

test("legacy root URLs redirect when any board filter key is present", () => {
  for (const key of BOARD_FILTER_KEYS) {
    assert.equal(
      getLegacyJobsRedirect("/", `?${key}=value`),
      key === "collection" || key === "stages"
        ? "/jobs"
        : `/jobs?${key}=value`,
    );
  }
});

test("legacy redirect preserves the complete query string", () => {
  const search =
    "?utm_source=bookmark&major=computer-science&utm_source=email&niche=software-engineering&empty=&encoded=a%2Bb";

  assert.equal(getLegacyJobsRedirect("/", search), `/jobs${search}`);
});

test("legacy redirects remove private tracker filters but retain attribution", () => {
  assert.equal(
    getLegacyJobsRedirect(
      "/",
      "?utm_source=club&collection=saved&stages=offer&remote=1",
    ),
    "/jobs?utm_source=club&remote=1",
  );
});

test("root URLs without board filters remain on the landing page", () => {
  assert.equal(getLegacyJobsRedirect("/", ""), null);
  assert.equal(getLegacyJobsRedirect("/", "?utm_source=launch"), null);
});

test("non-root URLs never redirect", () => {
  assert.equal(getLegacyJobsRedirect("/jobs", "?major=computer-science"), null);
  assert.equal(getLegacyJobsRedirect("/methodology", "?q=verification"), null);
});
