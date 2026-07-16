import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationTrackingTransfer } from "./ApplicationTrackingTransfer";

const callbacks = {
  exportJson: () => "{}",
  exportCsv: () => "key,stage\r\n",
  importJson: () => undefined,
  importCsv: () => undefined,
};

test("tracking transfer renders semantic export and constrained import controls", () => {
  const markup = renderToStaticMarkup(
    createElement(ApplicationTrackingTransfer, {
      ...callbacks,
      ready: true,
      storageAvailable: true,
      unmatchedCount: 2,
    }),
  );

  assert.match(markup, /<section[^>]+aria-labelledby=/);
  assert.match(markup, /<h2[^>]*>Tracking data<\/h2>/);
  assert.match(markup, />Export JSON<\/button>/);
  assert.match(markup, />Export CSV<\/button>/);
  assert.match(markup, />Import JSON<\/button>/);
  assert.match(markup, />Import CSV<\/button>/);
  assert.match(markup, /accept="\.json,application\/json"/);
  assert.match(
    markup,
    /accept="\.csv,text\/csv,application\/csv,application\/vnd\.ms-excel"/,
  );
  assert.match(markup, /Imports are limited to 5 MB/);
  assert.match(markup, /saved roles, tracked stages, notes, and follow-ups/);
  assert.match(markup, /2 records from older links/);
  assert.match(markup, /data-storage-state="available"/);
  assert.match(markup, /saved only in this browser/);
});

test("tracking transfer disables file operations until browser state is ready", () => {
  const markup = renderToStaticMarkup(
    createElement(ApplicationTrackingTransfer, {
      ...callbacks,
      ready: false,
      storageAvailable: null,
    }),
  );

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /<fieldset disabled=""/);
  assert.match(markup, /<input[^>]+type="file"[^>]+disabled=""/);
  assert.match(markup, /data-storage-state="loading"/);
  assert.match(markup, /Restoring tracking data/);
});

test("tracking transfer surfaces unavailable storage and singular unmatched data", () => {
  const markup = renderToStaticMarkup(
    createElement(ApplicationTrackingTransfer, {
      ...callbacks,
      storageAvailable: false,
      unmatchedCount: 1.9,
    }),
  );

  assert.match(markup, /data-storage-state="unavailable"/);
  assert.match(markup, /Browser storage is unavailable/);
  assert.match(markup, /1 record from older links/);
  assert.doesNotMatch(markup, /1 records from older links/);
});
