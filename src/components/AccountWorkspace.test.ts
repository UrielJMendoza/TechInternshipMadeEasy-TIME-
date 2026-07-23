import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearTimleyProductData,
  shouldLockAccountControls,
  TIMLEY_PRODUCT_STORAGE_KEYS,
} from "./AccountWorkspace";

const componentSource = readFileSync(
  new URL("./AccountWorkspace.tsx", import.meta.url),
  "utf8",
);

test("account route stays public and publishes complete metadata", () => {
  const pageSource = readFileSync(
    new URL("../app/account/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /<AccountWorkspace \/>/);
  assert.match(pageSource, /canonical:\s*"\/account"/);
  assert.match(pageSource, /Optional account continuity/);
  assert.doesNotMatch(
    pageSource,
    /\b(?:redirect|notFound|cookies|headers)\s*\(/,
  );
});

test("unconfigured account state keeps every anonymous product available", () => {
  assert.match(componentSource, /Accounts unavailable/);
  assert.match(
    componentSource,
    /Account continuity is not enabled in this deployment/,
  );
  assert.match(componentSource, /This page does not upload browser data/);
  assert.match(componentSource, /href="\/jobs"/);
  assert.match(componentSource, /href="\/tracker"/);
  assert.match(componentSource, /href="\/alerts"/);
  assert.match(componentSource, /README/);
  assert.doesNotMatch(componentSource, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("configured signed-out state exposes explicit accessible auth flows", () => {
  for (const handler of [
    "signIn",
    "signUp",
    "resendSignUpVerification",
    "sendPasswordReset",
    "updatePassword",
  ]) {
    assert.match(componentSource, new RegExp(`\\b${handler}\\b`));
  }
  assert.match(componentSource, /recoveryMode === "password-update"/);
  assert.match(componentSource, /autoComplete="current-password"/);
  assert.match(componentSource, /autoComplete="new-password"/);
  assert.match(componentSource, /role=\{message\.kind === "error"/);
  assert.match(componentSource, /result\.error\.message/);
  assert.match(componentSource, /Signing in does not upload local data/);
});

test("signed-in workspace requires category consent and keeps applications private by default", () => {
  for (const category of [
    "savedJobs",
    "applications",
    "filters",
    "savedSearches",
  ]) {
    assert.match(componentSource, new RegExp(`key: "${category}"`));
  }
  assert.match(componentSource, /syncSelection\[option\.key\]/);
  assert.match(componentSource, /setSyncSelection\(\{/);
  assert.match(componentSource, /tracker and applications\s+start unchecked/i);
  assert.match(
    componentSource,
    /uploads personal\s+notes, optional contact information, and compensation\s+details/i,
  );
  assert.match(componentSource, /\bfirstSync\(\)/);
  assert.match(componentSource, /\bmanualSync\(\)/);
  assert.match(componentSource, /\brestoreRecovery\(\)/);
  assert.match(componentSource, /lastSyncedAt/);
  assert.match(componentSource, /syncError/);
  assert.match(componentSource, /Saved jobs are unioned/);
  assert.match(componentSource, /newest\s+record for each role/);
  assert.match(componentSource, /pre-sync local recovery copy/);
});

test("foreground sync locks conflicting account controls", () => {
  assert.equal(shouldLockAccountControls(false, "idle"), false);
  assert.equal(shouldLockAccountControls(true, "idle"), true);
  assert.equal(shouldLockAccountControls(false, "syncing"), true);
  assert.equal(shouldLockAccountControls(false, "synced"), false);
  assert.equal(shouldLockAccountControls(false, "error"), false);

  assert.match(
    componentSource,
    /const syncInProgress = syncStatus === "syncing"/,
  );
  assert.match(
    componentSource,
    /Category, account, backup, and\s+recovery controls are temporarily unavailable/,
  );
  assert.match(
    componentSource,
    /checked=\{syncSelection\[option\.key\]\}\s+disabled=\{controlsLocked\}/,
  );
  assert.match(
    componentSource,
    /onClick=\{handleSignOut\}\s+disabled=\{controlsLocked\}/,
  );
  assert.match(
    componentSource,
    /onClick=\{downloadLocalContinuityBackup\}\s+disabled=\{controlsLocked\}/,
  );
  assert.match(
    componentSource,
    /onClick=\{handleRestoreRecovery\}\s+disabled=\{\s*controlsLocked \|\| !recoveryAvailable/,
  );
  assert.match(
    componentSource,
    /value=\{deleteText\}[\s\S]*?disabled=\{controlsLocked\}[\s\S]*?checked=\{alsoClearBrowserData\}[\s\S]*?disabled=\{controlsLocked\}/,
  );
});

test("deselecting a category discloses cloud retention", () => {
  assert.match(
    componentSource,
    /Deselecting a category stops future local reads and\s+uploads for that category/,
  );
  assert.match(
    componentSource,
    /does not erase category data\s+already stored in the account snapshot/,
  );
  assert.match(
    componentSource,
    /Permanently\s+deleting the account removes that cloud snapshot/,
  );
  assert.match(
    componentSource,
    /Enabling tracker and application sync uploads personal\s+notes, optional contact information, and compensation\s+details/i,
  );
});

test("deletion capability hides the destructive flow when setup is undeclared", () => {
  assert.match(componentSource, /!capabilities\.accountDeletion/);
  assert.match(
    componentSource,
    /This deployment has not declared account deletion\s+available to the browser/,
  );
  assert.match(
    componentSource,
    /required server-side\s+deletion setup may also be absent/,
  );
  assert.match(
    componentSource,
    /Timley does not\s+show or send a destructive request/,
  );
  assert.match(componentSource, /Account deletion is not offered/);
});

test("local continuity backup is explicit, local, complete, and private", () => {
  assert.match(componentSource, /COMPLETE_LOCAL_BACKUP_SELECTION/);
  assert.match(componentSource, /captureContinuitySnapshot\(/);
  assert.match(componentSource, /serializeContinuitySnapshot\(/);
  assert.match(componentSource, /new Blob\(/);
  assert.match(componentSource, /Download local continuity backup/);
  assert.match(componentSource, /Keep it private/);
  assert.match(componentSource, /does not include alert inbox/i);
});

test("product cleanup removes only the explicit Timley allowlist", () => {
  assert.deepEqual(TIMLEY_PRODUCT_STORAGE_KEYS, [
    "timley:filters:v1",
    "timley:filters:updated-at:v1",
    "timley:view",
    "timley:tracker-view:v1",
    "timley:saved",
    "timley:saved:updated-at:v1",
    "timley:saved:tombstones:v1",
    "timley:applications:v3",
    "timley:applications:tombstones:v1",
    "timley:applications:v2",
    "timley:applied",
    "timley:saved-searches:v1",
    "timley:saved-searches:tombstones:v1",
    "timley:search-alerts:v1",
    "timley:search-alerts:browser-enabled:v1",
    "timley:reminders:browser:v1",
    "timley:reminders:last-notification:v1",
    "timley:followed-companies:v1",
  ]);
  assert.equal(
    TIMLEY_PRODUCT_STORAGE_KEYS.some((key) =>
      key.startsWith("timley:continuity:"),
    ),
    false,
  );

  const removed: string[] = [];
  const result = clearTimleyProductData({
    removeItem: (key) => {
      removed.push(key);
    },
  });
  assert.deepEqual(removed, TIMLEY_PRODUCT_STORAGE_KEYS);
  assert.deepEqual(result, {
    removed: [...TIMLEY_PRODUCT_STORAGE_KEYS],
    failed: [],
  });
  assert.doesNotMatch(componentSource, /(?:local|session)Storage\.clear\(/);
});

test("cleanup continues safely when one local key cannot be removed", () => {
  const removed: string[] = [];
  const blocked = "timley:applications:v3";
  const result = clearTimleyProductData({
    removeItem: (key) => {
      if (key === blocked) throw new Error("blocked");
      removed.push(key);
    },
  });

  assert.deepEqual(result.failed, [blocked]);
  assert.equal(removed.includes(blocked), false);
  assert.equal(
    removed.length,
    TIMLEY_PRODUCT_STORAGE_KEYS.length - 1,
  );
});

test("account deletion requires typed and native confirmation before scoped cleanup", () => {
  assert.match(componentSource, /deleteText !== "DELETE"/);
  assert.match(
    componentSource,
    /window\.confirm\(\s*"Permanently delete this account/,
  );
  assert.match(componentSource, /await deleteAccount\(\)/);
  assert.match(
    componentSource,
    /if \(alsoClearBrowserData\) \{\s*const cleared = clearTimleyProductData/s,
  );
  assert.match(
    componentSource,
    /useState\(false\)/,
    "browser cleanup must start unchecked",
  );
  assert.match(
    componentSource,
    /anonymous Timley\s+product data/,
  );
  assert.match(
    componentSource,
    /does not\s+clear unrelated site or\s+browser data/,
  );
  assert.match(componentSource, /deletion service may be unavailable/);
});

test("sign-out copy preserves local product and recovery data", () => {
  assert.match(componentSource, /await signOut\(\)/);
  assert.match(
    componentSource,
    /Your saved jobs, tracker, searches, alerts, and continuity recovery remain in this browser/,
  );
  assert.match(
    componentSource,
    /Signing out leaves local product data, sync preferences,\s+and recovery data in this browser/,
  );
});
