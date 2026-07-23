import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertsWorkspaceView } from "./AlertsWorkspace";

function renderWorkspace(
  overrides: Partial<Parameters<typeof AlertsWorkspaceView>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(AlertsWorkspaceView, {
      jobs: [],
      generatedAt: "2026-07-22T12:00:00Z",
      updatedAt: "2026-07-22T11:00:00Z",
      loadError: false,
      partialData: false,
      refreshJobs: () => undefined,
      ...overrides,
    }),
  );
}

test("alerts workspace exposes the complete anonymous management surface", () => {
  const markup = renderWorkspace();

  assert.match(markup, /Search alerts/);
  assert.match(markup, /Anonymous and local/);
  assert.match(markup, /Alert delivery history/);
  assert.match(markup, /Manage saved searches/);
  assert.match(markup, /Refresh jobs and check/);
  assert.match(markup, /Find and save a search/);
  assert.match(markup, /Enable browser alerts/);
  assert.match(markup, /Email alerts/);
  assert.match(markup, /Provider setup required/);
  assert.match(markup, /Email unavailable/);
  assert.match(markup, /not background push/);
  assert.match(markup, /Privacy and persistence/);
  assert.match(markup, /start in this browser/);
  assert.match(markup, /explicitly select and sync/);
  assert.match(markup, /Alert inbox history/);
  assert.match(markup, /remain browser-only/);
  assert.match(markup, /not included in account continuity/);
  assert.match(markup, /or the Tracker JSON backup/);
  assert.match(markup, /bounded role-ID dedupe list remains/);
  assert.match(markup, /Signing out does not silently clear/);
  assert.match(markup, /does not silently transmit personal notes/);
  assert.match(markup, /href="\/jobs"/);
  assert.doesNotMatch(markup, /Sign in|Create account/);
});

test("alerts workspace preserves local state messaging for incomplete feeds", () => {
  const failedMarkup = renderWorkspace({
    loadError: true,
    updatedAt: null,
  });
  const partialMarkup = renderWorkspace({ partialData: true });

  assert.match(failedMarkup, /jobs snapshot could not be loaded/);
  assert.match(failedMarkup, /local alert inbox are still available/);
  assert.match(failedMarkup, /no search is being treated as empty or deleted/);
  assert.match(partialMarkup, /jobs snapshot is partial/);
  assert.match(partialMarkup, /roles that loaded successfully/);
});

test("browser permission is requested only in the explicit enable handler", () => {
  const source = readFileSync(
    new URL("./AlertsWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const enableHandler = source.indexOf(
    "async function enableBrowserAlerts()",
  );
  const permissionRequest = source.indexOf(
    "Notification.requestPermission()",
  );

  assert.ok(enableHandler >= 0);
  assert.ok(permissionRequest > enableHandler);
  assert.equal(
    source.match(/Notification\.requestPermission\(\)/g)?.length,
    1,
  );
  assert.match(
    source,
    /const BROWSER_ALERT_PREFERENCE_KEY\s*=\s*"timley:search-alerts:browser-enabled:v1"/,
  );
  assert.doesNotMatch(source, /timley:reminders:browser:v1/);
  assert.match(
    source,
    /\.filter\(\(search\) => search\.channels\.browser\)/,
  );
  assert.match(source, /browserAlerts\.length > 0/);
  assert.match(source, /browserDeliveryAvailable/);
  assert.match(source, /while the Alerts page is open/);
  assert.match(source, /notification\.onclick/);
  assert.match(source, /window\.location\.assign\(copy\.resultsUrl\)/);
});

test("workspace uses the local engine, complete filters, and confirmed deletion", () => {
  const source = readFileSync(
    new URL("./AlertsWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useSavedSearches\(\)/);
  assert.match(source, /evaluateSearchAlerts\(\{/);
  assert.match(source, /!alertsReady \|\| loadError/);
  assert.match(source, /SEARCH_ALERT_STORAGE_KEY/);
  assert.match(source, /serializeSearchAlertState/);
  assert.match(source, /window\.addEventListener\("focus"/);
  assert.match(source, /document\.addEventListener\("visibilitychange"/);
  assert.match(source, /FOREGROUND_REFRESH_INTERVAL_MS/);
  assert.match(source, /<MobileFilterSheet/);
  assert.match(source, /applications=\{\{\}\}/);
  assert.match(source, /filters=\{editingSearch\.filters\}/);
  assert.match(source, /onApply=\{saveEditedFilters\}/);
  assert.match(source, /Filter summary/);
  assert.match(source, /Saved-only view retained/);
  assert.match(source, /Application stages retained/);
  assert.match(source, /channels:\s*\{\s*\.\.\.input\.channels/s);
  assert.match(source, /email:\s*EMAIL_ALERTS_AVAILABLE/);
  assert.equal(source.match(/window\.confirm\(/g)?.length, 2);
  assert.match(source, /Unsubscribe and delete/);
  assert.match(source, /Remove alert/);
  assert.match(source, /MAX_LENGTH|STATUS_MAX_LENGTH/);
});

test("foreground triggers refresh the real server snapshot without stale evaluation loops", () => {
  const source = readFileSync(
    new URL("./AlertsWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useRouter\(\)/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /FOREGROUND_REFRESH_INTERVAL_MS = 300_000/);
  assert.match(source, /scheduleJobsRefresh/);
  assert.match(source, /window\.addEventListener\("focus"/);
  assert.match(source, /document\.addEventListener\("visibilitychange"/);
  assert.match(source, /MINIMUM_REFRESH_GAP_MS/);
  assert.doesNotMatch(source, /setEvaluationVersion/);
});

test("delivery history keeps browser-only matches inspectable and actionable", () => {
  const source = readFileSync(
    new URL("./AlertsWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const deliveryHistory = useMemo/);
  assert.match(source, /Every delivered in-app or browser match stays inspectable/);
  assert.match(source, /href=\{alert\.resultsUrl\}/);
  assert.match(source, /Why it matched/);
  assert.match(source, /Triggered by/);
  assert.match(source, /Frequency/);
  assert.match(source, /Pause search/);
  assert.match(source, /onUnsubscribe/);
  assert.match(source, /Unsubscribe and delete/);
  assert.doesNotMatch(
    source,
    /alertState\.inbox\.filter\(\s*\(alert\) =>\s*searchById\.get\(alert\.savedSearchId\)\?\.channels\.inApp/s,
  );
});

test("saved-search settings reject a zero-channel configuration accessibly", () => {
  const source = readFileSync(
    new URL("./AlertsWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /!channels\.inApp && !channels\.browser/);
  assert.match(source, /Choose In-app inbox or Browser before saving/);
  assert.match(source, /role=\{channelError \? "alert" : "status"\}/);
  assert.match(source, /aria-live="polite"/);
});

test("public alerts route fetches the same bounded jobs snapshot", () => {
  const pageSource = readFileSync(
    new URL("../app/alerts/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /fetchJobsSnapshot\(\)/);
  assert.match(pageSource, /<AlertsWorkspace \{\.\.\.snapshot\} \/>/);
  assert.match(pageSource, /canonical:\s*"\/alerts"/);
  assert.match(pageSource, /export const revalidate = 300/);
  assert.doesNotMatch(pageSource, /auth|session|redirect|signIn/i);
});
