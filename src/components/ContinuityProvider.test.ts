import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createUnavailableContinuityProvider } from "../lib/continuityProvider";
import {
  CONTINUITY_LOCAL_CHANGE_EVENT,
  ContinuityProvider,
  continuityOperationStillCurrent,
  continuityPreferenceStorageKey,
  continuityRecoveryStorageKey,
  continuitySelectedCategoriesEqual,
  parseContinuityPreference,
  serializeContinuityPreference,
  shouldScheduleAutomaticSync,
  useContinuity,
} from "./ContinuityProvider";
import {
  CONTINUITY_SNAPSHOT_FORMAT,
  CONTINUITY_SNAPSHOT_VERSION,
  DEFAULT_SYNC_SELECTION,
  type ContinuitySnapshot,
} from "../lib/continuitySnapshot";

const NOW = "2026-07-23T12:00:00.000Z";

function emptySnapshot(capturedAt: string): ContinuitySnapshot {
  return {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt,
    categories: {
      savedJobs: {
        urls: ["https://jobs.test/1"],
        updatedAt: { "https://jobs.test/1": NOW },
        tombstones: {},
      },
    },
  };
}

test("per-user consent is strict, private by default, and never keyed by email", () => {
  const preference = {
    version: 1 as const,
    consent: false,
    selection: { ...DEFAULT_SYNC_SELECTION },
    lastSyncedAt: null,
  };
  const parsed = parseContinuityPreference(
    serializeContinuityPreference(preference),
  );

  assert.deepEqual(parsed, preference);
  assert.equal(parsed?.selection.applications, false);
  assert.match(
    continuityPreferenceStorageKey("opaque-user-id"),
    /opaque-user-id$/,
  );
  assert.match(
    continuityRecoveryStorageKey("opaque-user-id"),
    /opaque-user-id$/,
  );
  assert.equal(
    parseContinuityPreference(
      JSON.stringify({ ...preference, email: "private@example.com" }),
    ),
    null,
  );
});

test("automatic sync requires configuration, a session, prior consent, and visibility", () => {
  assert.equal(
    shouldScheduleAutomaticSync({
      configured: true,
      hasSession: true,
      consent: true,
      visible: true,
    }),
    true,
  );
  for (const override of [
    { configured: false },
    { hasSession: false },
    { consent: false },
    { visible: false },
  ]) {
    assert.equal(
      shouldScheduleAutomaticSync({
        configured: true,
        hasSession: true,
        consent: true,
        visible: true,
        ...override,
      }),
      false,
    );
  }
});

test("selected-category comparison ignores capture bookkeeping but detects product changes", () => {
  const first = emptySnapshot(NOW);
  const recaptured = emptySnapshot("2026-07-23T13:00:00.000Z");
  const changed = {
    ...recaptured,
    categories: {
      savedJobs: {
        urls: ["https://jobs.test/2"],
        updatedAt: { "https://jobs.test/2": NOW },
        tombstones: {},
      },
    },
  } satisfies ContinuitySnapshot;

  assert.equal(continuitySelectedCategoriesEqual(first, recaptured), true);
  assert.equal(continuitySelectedCategoriesEqual(first, changed), false);
});

test("in-flight continuity work is bound to its captured account, generation, and selection", () => {
  const selection = { ...DEFAULT_SYNC_SELECTION };
  const input = {
    expectedUserId: "account-a",
    expectedGeneration: 4,
    expectedSelection: selection,
    currentUserId: "account-a",
    currentGeneration: 4,
    currentSelection: { ...selection },
  };
  assert.equal(continuityOperationStillCurrent(input), true);
  assert.equal(
    continuityOperationStillCurrent({
      ...input,
      currentUserId: "account-b",
    }),
    false,
  );
  assert.equal(
    continuityOperationStillCurrent({
      ...input,
      currentGeneration: 5,
    }),
    false,
  );
  assert.equal(
    continuityOperationStillCurrent({
      ...input,
      currentSelection: { ...selection, applications: true },
    }),
    false,
  );
});

test("disabled continuity is an inert wrapper and leaves anonymous content visible", () => {
  function Consumer() {
    const continuity = useContinuity();
    return createElement(
      "span",
      {
        "data-configured": String(continuity.configured),
        "data-status": continuity.status,
        "data-applications": String(
          continuity.syncSelection.applications,
        ),
      },
      "Anonymous route",
    );
  }

  const markup = renderToStaticMarkup(
    createElement(
      ContinuityProvider,
      { adapter: createUnavailableContinuityProvider() },
      createElement(Consumer),
    ),
  );
  assert.match(markup, /Anonymous route/);
  assert.match(markup, /data-configured="false"/);
  assert.match(markup, /data-status="disabled"/);
  assert.match(markup, /data-applications="false"/);
});

test("sign-in remains separate from sync and recovery precedes remote and local writes", () => {
  const source = readFileSync(
    new URL("./ContinuityProvider.tsx", import.meta.url),
    "utf8",
  );
  const signInStart = source.indexOf("const signIn = useCallback");
  const signInEnd = source.indexOf("const signOut = useCallback");
  const signInSource = source.slice(signInStart, signInEnd);
  assert.ok(signInStart >= 0 && signInEnd > signInStart);
  assert.doesNotMatch(
    signInSource,
    /performSync\(|upsertSnapshot\(/,
  );

  const recoveryWrite = source.indexOf("serializeContinuityRecovery(");
  const remoteWrite = source.indexOf("adapter.upsertSnapshot(");
  const localWrite = source.indexOf(
    "commitContinuitySnapshotToStorage(",
    remoteWrite,
  );
  assert.ok(recoveryWrite >= 0);
  assert.ok(remoteWrite > recoveryWrite);
  assert.ok(localWrite > remoteWrite);
  assert.match(source, /transaction\.rollback\(\)/);
  assert.match(source, /scope: "local"|adapter\.signOut/);

  const signOutSource = source.slice(
    source.indexOf("const signOut = useCallback"),
    source.indexOf("const updatePassword = useCallback"),
  );
  const deletionSource = source.slice(
    source.indexOf("const deleteAccount = useCallback"),
    source.indexOf("const restoreRecovery = useCallback"),
  );
  assert.doesNotMatch(signOutSource, /removeItem|APPLICATION_STORAGE_KEY/);
  assert.match(deletionSource, /continuityPreferenceStorageKey/);
  assert.match(deletionSource, /continuityRecoveryStorageKey/);
  assert.ok((deletionSource.match(/\btry\s*\{/g) ?? []).length >= 2);
  assert.match(
    deletionSource,
    /sessionRef\.current\?\.user\.id === deletedUserId/,
  );
  assert.doesNotMatch(deletionSource, /APPLICATION_STORAGE_KEY|timley:saved/);
});

test("all local writers announce one shared continuity event and filters timestamp user edits", () => {
  const applicationHook = readFileSync(
    new URL("../hooks/useApplicationTracking.ts", import.meta.url),
    "utf8",
  );
  const boardHook = readFileSync(
    new URL("../hooks/useBoardFilters.ts", import.meta.url),
    "utf8",
  );
  const localHook = readFileSync(
    new URL("../hooks/useLocalStorageState.ts", import.meta.url),
    "utf8",
  );
  const savedSearchHook = readFileSync(
    new URL("../hooks/useSavedSearches.ts", import.meta.url),
    "utf8",
  );

  assert.equal(
    CONTINUITY_LOCAL_CHANGE_EVENT,
    "timley:continuity:local-change:v1",
  );
  assert.match(applicationHook, /dispatchContinuityLocalChange\("applications"\)/);
  assert.match(applicationHook, /APPLICATION_TOMBSTONE_STORAGE_KEY/);
  assert.match(applicationHook, /recordApplicationTombstone/);
  assert.match(applicationHook, /nextContinuityTimestamp/);
  assert.match(localHook, /dispatchContinuityLocalChange\("savedJobs"\)/);
  assert.match(localHook, /SAVED_JOB_UPDATED_AT_STORAGE_KEY/);
  assert.match(localHook, /SAVED_JOB_TOMBSTONE_STORAGE_KEY/);
  assert.match(localHook, /recordSavedJobTombstone/);
  assert.match(savedSearchHook, /dispatchContinuityLocalChange\("savedSearches"\)/);
  assert.match(boardHook, /dispatchContinuityLocalChange\("filters"\)/);
  assert.match(boardHook, /BOARD_FILTER_UPDATED_AT_STORAGE_KEY/);
  assert.match(boardHook, /pristineDefaultHydration/);
  assert.match(boardHook, /if \(userEdited\)/);
  for (const source of [
    applicationHook,
    boardHook,
    localHook,
    savedSearchHook,
  ]) {
    assert.match(source, /CONTINUITY_LOCAL_CHANGE_EVENT/);
    assert.match(source, /detail\.source === "sync"/);
  }
});

test("cross-tab preference and recovery events are exact control-plane updates", () => {
  const source = readFileSync(
    new URL("./ContinuityProvider.tsx", import.meta.url),
    "utf8",
  );
  const preferenceStart = source.indexOf(
    "if (event.key === preferenceKey)",
  );
  const recoveryStart = source.indexOf(
    "if (event.key === recoveryKey)",
    preferenceStart,
  );
  const productEventStart = source.indexOf(
    "const category = event.key",
    recoveryStart,
  );
  assert.ok(preferenceStart >= 0);
  assert.ok(recoveryStart > preferenceStart);
  assert.ok(productEventStart > recoveryStart);

  const preferenceBlock = source.slice(
    preferenceStart,
    recoveryStart,
  );
  assert.match(preferenceBlock, /authGenerationRef\.current \+= 1/);
  assert.match(preferenceBlock, /selectionRef\.current = nextSelection/);
  assert.match(preferenceBlock, /consentRef\.current = nextConsent/);
  assert.doesNotMatch(
    preferenceBlock,
    /scheduleAutomaticSync\(|performSyncRef/,
  );
  const recoveryBlock = source.slice(
    recoveryStart,
    productEventStart,
  );
  assert.match(recoveryBlock, /parseContinuityRecovery\(event\.newValue\)/);
  assert.doesNotMatch(
    recoveryBlock,
    /scheduleAutomaticSync\(|performSyncRef/,
  );
});

test("the root layout wraps the existing shell without auth gating", () => {
  const layout = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /<ContinuityProvider>/);
  assert.match(layout, /<SiteHeader \/>/);
  assert.match(layout, /\{children\}/);
  assert.match(layout, /<SiteFooter \/>/);
  assert.doesNotMatch(layout, /redirect\(|requireAuth|getSession/);
});
