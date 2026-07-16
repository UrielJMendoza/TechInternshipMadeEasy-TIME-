import assert from "node:assert/strict";
import test from "node:test";
import {
  UNKNOWN_TERM_KEY,
  buildTermFacetOptions,
  isInternshipTermKey,
  matchesTermFilter,
  sortTermKeys,
  termKeysFromValues,
  termLabelFromKey,
} from "./jobTerms";

test("extracts explicit internship terms in both orders", () => {
  assert.deepEqual(
    termKeysFromValues([
      "Software Engineer Intern - Fall 2026",
      "2026 Fall Co-op",
      "Summer Intern 2027 - Software Developer",
    ]),
    ["fall-2026", "summer-2027"],
  );
});

test("term filters use OR semantics and keep unknown explicit", () => {
  assert.equal(matchesTermFilter(["fall-2026", "summer-2027"], []), true);
  assert.equal(
    matchesTermFilter(["fall-2026", "summer-2027"], ["summer-2027"]),
    true,
  );
  assert.equal(matchesTermFilter([], [UNKNOWN_TERM_KEY]), true);
  assert.equal(matchesTermFilter(["fall-2026"], [UNKNOWN_TERM_KEY]), false);
  assert.equal(
    matchesTermFilter(["fall-2026"], ["summer-2027", UNKNOWN_TERM_KEY]),
    false,
  );
});

test("preserves explicit multi-term titles", () => {
  assert.deepEqual(
    termKeysFromValues([
      "Software Engineer Intern Fall 2026/Winter 2027",
      "Flight Software Engineering Intern - Summer/Fall 2026",
    ]),
    ["summer-2026", "fall-2026", "winter-2027"],
  );
});

test("does not guess from bare seasons, years, dates, or repository context", () => {
  assert.deepEqual(
    termKeysFromValues([
      "Fall internship",
      "2027 Software Engineer Intern",
      "Software Engineer - 2026 Start",
      "Summer Internship",
      "Posted July 15, 2026",
    ]),
    [],
  );
});

test("normalizes Autumn, punctuation, duplicates, labels, and ordering", () => {
  assert.deepEqual(
    termKeysFromValues(["Autumn-2026", "Fall 2026", "Spring 2027"]),
    ["fall-2026", "spring-2027"],
  );
  assert.equal(isInternshipTermKey("fall-2026"), true);
  assert.equal(isInternshipTermKey(UNKNOWN_TERM_KEY), true);
  assert.equal(isInternshipTermKey("fall-26"), false);
  assert.equal(termLabelFromKey("summer-2027"), "Summer 2027");
  assert.equal(termLabelFromKey(UNKNOWN_TERM_KEY), "Term not listed");
  assert.deepEqual(
    sortTermKeys([
      UNKNOWN_TERM_KEY,
      "summer-2027",
      "fall-2026",
      "winter-2027",
    ]),
    ["fall-2026", "winter-2027", "summer-2027", UNKNOWN_TERM_KEY],
  );
});

test("builds chronological, bounded facet options with unknown last", () => {
  assert.deepEqual(
    buildTermFacetOptions([
      { id: "summer-2027", count: 8 },
      { id: "fall-2026", count: 4 },
      { id: UNKNOWN_TERM_KEY, count: 3 },
      { id: "summer-2027", count: 2.9 },
      { id: "invalid", count: 999 },
    ]),
    [
      { id: "fall-2026", label: "Fall 2026", count: 4 },
      { id: "summer-2027", label: "Summer 2027", count: 10 },
      { id: UNKNOWN_TERM_KEY, label: "Term not listed", count: 3 },
    ],
  );
});
