"use client";

import Link from "next/link";
import {
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  useContinuity,
  type ContinuitySyncStatus,
} from "@/components/ContinuityProvider";
import {
  APPLICATION_STORAGE_KEY,
  LEGACY_APPLICATION_STORAGE_KEY,
  LEGACY_APPLIED_STORAGE_KEY,
  LEGACY_SAVED_STORAGE_KEY,
} from "@/lib/applicationTracking";
import { BOARD_FILTER_STORAGE_KEY } from "@/lib/boardFilterState";
import {
  APPLICATION_TOMBSTONE_STORAGE_KEY,
  BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
  SAVED_JOB_TOMBSTONE_STORAGE_KEY,
  SAVED_JOB_UPDATED_AT_STORAGE_KEY,
  captureContinuitySnapshot,
  serializeContinuitySnapshot,
  type SyncSelection,
} from "@/lib/continuitySnapshot";
import {
  SAVED_SEARCH_STORAGE_KEY,
  SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
} from "@/lib/savedSearches";
import { SEARCH_ALERT_STORAGE_KEY } from "@/lib/searchAlerts";
import { FOLLOWED_COMPANIES_STORAGE_KEY } from "@/lib/followedCompanies";

const README_CONTINUITY_URL =
  "https://github.com/UrielJMendoza/TechInternshipMadeEasy-TIME-#optional-account-continuity";
const BROWSER_ALERT_PREFERENCE_KEY =
  "timley:search-alerts:browser-enabled:v1";
const REMINDER_PREFERENCE_KEY = "timley:reminders:browser:v1";
const LAST_NOTIFICATION_KEY =
  "timley:reminders:last-notification:v1";
const JOB_VIEW_STORAGE_KEY = "timley:view";
const TRACKER_VIEW_STORAGE_KEY = "timley:tracker-view:v1";

export const TIMLEY_PRODUCT_STORAGE_KEYS: readonly string[] =
  Object.freeze([
    BOARD_FILTER_STORAGE_KEY,
    BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
    JOB_VIEW_STORAGE_KEY,
    TRACKER_VIEW_STORAGE_KEY,
    LEGACY_SAVED_STORAGE_KEY,
    SAVED_JOB_UPDATED_AT_STORAGE_KEY,
    SAVED_JOB_TOMBSTONE_STORAGE_KEY,
    APPLICATION_STORAGE_KEY,
    APPLICATION_TOMBSTONE_STORAGE_KEY,
    LEGACY_APPLICATION_STORAGE_KEY,
    LEGACY_APPLIED_STORAGE_KEY,
    SAVED_SEARCH_STORAGE_KEY,
    SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
    SEARCH_ALERT_STORAGE_KEY,
    BROWSER_ALERT_PREFERENCE_KEY,
    REMINDER_PREFERENCE_KEY,
    LAST_NOTIFICATION_KEY,
    FOLLOWED_COMPANIES_STORAGE_KEY,
  ]);

const COMPLETE_LOCAL_BACKUP_SELECTION: Readonly<SyncSelection> =
  Object.freeze({
    savedJobs: true,
    applications: true,
    filters: true,
    savedSearches: true,
  });

const SYNC_OPTIONS: ReadonlyArray<{
  key: keyof SyncSelection;
  title: string;
  description: string;
}> = [
  {
    key: "savedJobs",
    title: "Saved jobs",
    description: "The job URLs you bookmarked.",
  },
  {
    key: "applications",
    title: "Tracker and applications",
    description:
      "Stages, dates, actions, interviews, personal notes, optional contacts, compensation details, location details, and application URLs.",
  },
  {
    key: "filters",
    title: "Job filters",
    description: "Your latest job-search filter preferences.",
  },
  {
    key: "savedSearches",
    title: "Saved searches",
    description:
      "Saved-search names, filters, frequency, channels, and deletion markers. Alert inbox history is not included.",
  },
];

type PendingAction =
  | "delete"
  | "first-sync"
  | "manual-sync"
  | "password-update"
  | "recovery"
  | "resend"
  | "restore"
  | "sign-in"
  | "sign-out"
  | "sign-up"
  | null;

interface WorkspaceMessage {
  kind: "error" | "success";
  text: string;
}

export interface TimleyProductClearResult {
  removed: string[];
  failed: string[];
}

interface StorageRemover {
  removeItem(key: string): void;
}

export function clearTimleyProductData(
  storage: StorageRemover,
): TimleyProductClearResult {
  const removed: string[] = [];
  const failed: string[] = [];
  for (const key of TIMLEY_PRODUCT_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { removed, failed };
}

export function shouldLockAccountControls(
  hasPendingAction: boolean,
  syncStatus: ContinuitySyncStatus,
): boolean {
  return hasPendingAction || syncStatus === "syncing";
}

function submittedValue(
  form: FormData,
  field: string,
  trim = false,
): string {
  const value = form.get(field);
  const text = typeof value === "string" ? value : "";
  return trim ? text.trim() : text;
}

function accountRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL("/account", window.location.origin).toString();
}

function stableTimestamp(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return "Unavailable";
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(milliseconds))} UTC`;
}

function messageClasses(kind: WorkspaceMessage["kind"]): string {
  return kind === "error"
    ? "border-error/30 bg-error-soft text-error"
    : "border-success/30 bg-success-soft text-success";
}

function FormMessage({
  message,
}: {
  message: WorkspaceMessage | null;
}) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`mt-4 rounded-lg border px-4 py-3 text-sm leading-6 ${messageClasses(message.kind)}`}
    >
      {message.text}
    </p>
  );
}

function Field({
  autoComplete,
  children,
  name,
  type = "text",
}: {
  autoComplete: string;
  children: ReactNode;
  name: string;
  type?: "email" | "password" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{children}</span>
      <input
        className="ui-control ui-input w-full"
        type={type}
        name={name}
        autoComplete={autoComplete}
        required
      />
    </label>
  );
}

export function AccountWorkspace() {
  const {
    capabilities,
    configured,
    deleteAccount,
    firstSync,
    lastSyncedAt,
    localSummary,
    manualSync,
    recoveryAvailable,
    recoveryMode,
    resendSignUpVerification,
    restoreRecovery,
    sendPasswordReset,
    session,
    setSyncSelection,
    signIn,
    signOut,
    signUp,
    status,
    syncError,
    syncSelection,
    syncStatus,
    updatePassword,
  } = useContinuity();
  const [pending, setPending] = useState<PendingAction>(null);
  const [authMessage, setAuthMessage] =
    useState<WorkspaceMessage | null>(null);
  const [syncMessage, setSyncMessage] =
    useState<WorkspaceMessage | null>(null);
  const [accountMessage, setAccountMessage] =
    useState<WorkspaceMessage | null>(null);
  const [backupMessage, setBackupMessage] =
    useState<WorkspaceMessage | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [alsoClearBrowserData, setAlsoClearBrowserData] =
    useState(false);

  const syncInProgress = syncStatus === "syncing";
  const controlsLocked = shouldLockAccountControls(
    pending !== null,
    syncStatus,
  );
  const hasSyncSelection = Object.values(syncSelection).some(Boolean);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("sign-in");
    setAuthMessage(null);
    const result = await signIn({
      email: submittedValue(form, "email", true),
      password: submittedValue(form, "password"),
    });
    setPending(null);
    setAuthMessage(
      result.ok
        ? { kind: "success", text: "Signed in on this browser." }
        : { kind: "error", text: result.error.message },
    );
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("sign-up");
    setAuthMessage(null);
    const result = await signUp({
      email: submittedValue(form, "email", true),
      password: submittedValue(form, "password"),
      redirectTo: accountRedirectUrl(),
    });
    setPending(null);
    setAuthMessage(
      result.ok
        ? {
            kind: "success",
            text: result.data.confirmationRequired
              ? "Account created. Check your email to verify it before signing in."
              : "Account created and signed in on this browser.",
          }
        : { kind: "error", text: result.error.message },
    );
  }

  async function handleResendVerification(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("resend");
    setAuthMessage(null);
    const result = await resendSignUpVerification({
      email: submittedValue(form, "email", true),
      redirectTo: accountRedirectUrl(),
    });
    setPending(null);
    setAuthMessage(
      result.ok
        ? {
            kind: "success",
            text: "Verification email requested. Check your inbox and spam folder.",
          }
        : { kind: "error", text: result.error.message },
    );
  }

  async function handleRecoveryRequest(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("recovery");
    setAuthMessage(null);
    const result = await sendPasswordReset({
      email: submittedValue(form, "email", true),
      redirectTo: accountRedirectUrl(),
    });
    setPending(null);
    setAuthMessage(
      result.ok
        ? {
            kind: "success",
            text: "If an eligible account exists, a password-recovery email has been requested.",
          }
        : { kind: "error", text: result.error.message },
    );
  }

  async function handlePasswordUpdate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (syncInProgress) return;
    const form = new FormData(event.currentTarget);
    const password = submittedValue(form, "password");
    const confirmation = submittedValue(form, "password-confirmation");
    if (password !== confirmation) {
      setAuthMessage({
        kind: "error",
        text: "The new passwords do not match.",
      });
      return;
    }
    setPending("password-update");
    setAuthMessage(null);
    const result = await updatePassword({ password });
    setPending(null);
    setAuthMessage(
      result.ok
        ? {
            kind: "success",
            text: "Password updated. You can continue using this account.",
          }
        : { kind: "error", text: result.error.message },
    );
  }

  async function runSync(kind: "first-sync" | "manual-sync") {
    if (syncInProgress) return;
    setPending(kind);
    setSyncMessage(null);
    const result =
      kind === "first-sync" ? await firstSync() : await manualSync();
    setPending(null);
    setSyncMessage(
      result.ok
        ? {
            kind: "success",
            text:
              kind === "first-sync"
                ? "First sync completed. Future selected local changes can sync automatically while you are signed in."
                : "Selected account data is up to date.",
          }
        : {
            kind: "error",
            text:
              result.error ??
              "Continuity sync could not be completed.",
          },
    );
  }

  async function handleRestoreRecovery() {
    if (syncInProgress) return;
    if (
      !window.confirm(
        "Restore the pre-sync local copy for the categories recorded in recovery? This replaces those categories in this browser.",
      )
    ) {
      return;
    }
    setPending("restore");
    setSyncMessage(null);
    const result = await restoreRecovery();
    setPending(null);
    setSyncMessage(
      result.ok
        ? {
            kind: "success",
            text: "The pre-sync local copy was restored. Automatic sync is paused until you explicitly sync again.",
          }
        : {
            kind: "error",
            text:
              result.error ??
              "The pre-sync local copy could not be restored.",
          },
    );
  }

  function downloadLocalContinuityBackup() {
    if (syncInProgress) return;
    setBackupMessage(null);
    try {
      const snapshot = captureContinuitySnapshot(
        window.localStorage,
        COMPLETE_LOCAL_BACKUP_SELECTION,
      );
      const serialized = serializeContinuitySnapshot(snapshot);
      const blob = new Blob([serialized], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `timley-local-continuity-${snapshot.capturedAt.slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setBackupMessage({
        kind: "success",
        text: "Local continuity backup downloaded. Keep it private.",
      });
    } catch {
      setBackupMessage({
        kind: "error",
        text: "This browser could not create the local continuity backup.",
      });
    }
  }

  async function handleSignOut() {
    if (syncInProgress) return;
    setPending("sign-out");
    setAccountMessage(null);
    const result = await signOut();
    setPending(null);
    setAccountMessage(
      result.ok
        ? {
            kind: "success",
            text: "Signed out. Your saved jobs, tracker, searches, alerts, and continuity recovery remain in this browser.",
          }
        : { kind: "error", text: result.error.message },
    );
  }

  async function handleDeleteAccount(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (syncInProgress) return;
    if (deleteText !== "DELETE") return;
    if (
      !window.confirm(
        "Permanently delete this account and its synced snapshot? This cannot be undone.",
      )
    ) {
      return;
    }

    setPending("delete");
    setAccountMessage(null);
    const result = await deleteAccount();
    if (!result.ok) {
      setPending(null);
      setAccountMessage({
        kind: "error",
        text: `${result.error.message} Timley could not confirm whether the account was deleted. The deletion service may be unavailable in this deployment. The optional browser-product cleanup did not run, so local product data remains.`,
      });
      return;
    }

    let message =
      "Account and synced snapshot deleted. This browser’s anonymous Timley product data remains on this device.";
    let kind: WorkspaceMessage["kind"] = "success";
    if (alsoClearBrowserData) {
      const cleared = clearTimleyProductData(window.localStorage);
      if (cleared.failed.length > 0) {
        kind = "error";
        message = `The account and synced snapshot were deleted, but browser storage blocked removal of ${cleared.failed.length} local Timley product ${cleared.failed.length === 1 ? "record" : "records"}. No unrelated browser data was touched.`;
      } else {
        message =
          "Account, synced snapshot, and this browser’s anonymous Timley product data were deleted. Downloaded files and unrelated browser data were not changed.";
      }
    }
    setPending(null);
    setDeleteText("");
    setAlsoClearBrowserData(false);
    setAccountMessage({ kind, text: message });
  }

  function updateSyncSelection(
    category: keyof SyncSelection,
    checked: boolean,
  ) {
    if (syncInProgress) return;
    setSyncSelection({
      ...syncSelection,
      [category]: checked,
    });
    setSyncMessage(null);
  }

  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg text-fg"
    >
      <section className="border-b border-border bg-raised">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
                Optional account continuity
              </p>
              <h1 className="mt-3 text-4xl leading-tight font-bold tracking-[-0.035em] sm:text-5xl">
                Your account, without an account wall.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
                Public browsing, local tracking, and search alerts work
                without signing in. When continuity is available, you decide
                which eligible browser data is copied to your account.
              </p>
            </div>
            <span
              className={`ui-badge w-fit ${
                configured
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {configured
                ? "Continuity configured"
                : "Browser-only deployment"}
            </span>
          </div>
          <FormMessage message={accountMessage} />
        </div>
      </section>

      {!configured || status === "disabled" ? (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="ui-card grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] lg:p-10">
            <div>
              <p className="ui-badge border-warning/30 bg-warning-soft text-warning">
                Accounts unavailable
              </p>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">
                Account continuity is not enabled in this deployment.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-muted">
                Nothing is wrong with local Timley. You can still browse and
                save jobs, manage the complete application tracker, and use
                local search alerts. This page does not upload browser data.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/jobs" className="ui-button ui-button--primary">
                  Browse jobs
                </Link>
                <Link
                  href="/tracker"
                  className="ui-button ui-button--secondary"
                >
                  Open tracker
                </Link>
                <Link
                  href="/alerts"
                  className="ui-button ui-button--secondary"
                >
                  Manage alerts
                </Link>
              </div>
            </div>
            <aside className="rounded-xl border border-info/30 bg-info-soft p-5 sm:p-6">
              <h2 className="font-bold text-info">
                Deployment setup reference
              </h2>
              <p className="mt-3 text-sm leading-6">
                Deployment owners can follow the project README&apos;s
                optional-account-continuity section. Credentials are never
                entered on this page.
              </p>
              <a
                href={README_CONTINUITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4"
              >
                Read deployment setup
                <span aria-hidden>&nbsp;↗</span>
              </a>
            </aside>
          </div>
        </section>
      ) : status === "initializing" ? (
        <section
          aria-live="polite"
          aria-busy="true"
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
        >
          <div className="ui-card p-8 text-center">
            <h2 className="text-xl font-bold">
              Checking this browser&apos;s account session…
            </h2>
            <p className="mt-3 text-muted">
              Your local jobs, tracker, and alerts remain available.
            </p>
          </div>
        </section>
      ) : status === "error" ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-error/30 bg-error-soft p-6 sm:p-8">
            <h2 className="text-xl font-bold text-error">
              Account continuity could not initialize.
            </h2>
            <p className="mt-3 max-w-2xl leading-7">
              No local data was uploaded or removed. You can reload to retry,
              or keep using Timley&apos;s browser-only jobs, tracker, and
              alerts.
            </p>
          </div>
        </section>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          {recoveryMode === "password-update" ? (
            <>
              <section
                aria-labelledby="password-update-title"
                className="rounded-xl border border-info/30 bg-info-soft p-6 sm:p-8"
              >
                <div className="max-w-2xl">
                  <p className="font-mono text-xs font-bold tracking-[0.14em] text-info uppercase">
                    Password recovery
                  </p>
                  <h2
                    id="password-update-title"
                    className="mt-2 text-2xl font-bold"
                  >
                    Choose a new password
                  </h2>
                  <p className="mt-3 leading-7 text-muted">
                    This browser opened a valid recovery session. Update the
                    password to finish recovery.
                  </p>
                  <form
                    className="mt-6 grid gap-4 sm:grid-cols-2"
                    onSubmit={handlePasswordUpdate}
                  >
                    <Field
                      name="password"
                      type="password"
                      autoComplete="new-password"
                    >
                      New password
                    </Field>
                    <Field
                      name="password-confirmation"
                      type="password"
                      autoComplete="new-password"
                    >
                      Confirm new password
                    </Field>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="ui-button ui-button--primary"
                        disabled={controlsLocked}
                        aria-busy={pending === "password-update"}
                      >
                        Update password
                      </button>
                    </div>
                  </form>
                </div>
              </section>
              <div className="mb-8">
                <FormMessage message={authMessage} />
              </div>
            </>
          ) : null}

          {status === "signed-out" || !session ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <section
                  aria-labelledby="sign-in-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <p className="font-mono text-xs font-bold tracking-[0.14em] text-accent uppercase">
                    Existing account
                  </p>
                  <h2
                    id="sign-in-title"
                    className="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Sign in
                  </h2>
                  <p className="mt-3 leading-7 text-muted">
                    Signing in does not upload local data. Sync remains a
                    separate choice after authentication.
                  </p>
                  <form
                    className="mt-6 space-y-4"
                    onSubmit={handleSignIn}
                  >
                    <Field
                      name="email"
                      type="email"
                      autoComplete="email"
                    >
                      Email
                    </Field>
                    <Field
                      name="password"
                      type="password"
                      autoComplete="current-password"
                    >
                      Password
                    </Field>
                    <button
                      type="submit"
                      className="ui-button ui-button--primary w-full sm:w-auto"
                      disabled={controlsLocked}
                      aria-busy={pending === "sign-in"}
                    >
                      Sign in
                    </button>
                  </form>
                </section>

                <section
                  aria-labelledby="sign-up-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <p className="font-mono text-xs font-bold tracking-[0.14em] text-accent uppercase">
                    New account
                  </p>
                  <h2
                    id="sign-up-title"
                    className="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Create an account
                  </h2>
                  <p className="mt-3 leading-7 text-muted">
                    Email verification may be required. Creating an account
                    still does not sync this browser until you choose data
                    categories.
                  </p>
                  <form
                    className="mt-6 space-y-4"
                    onSubmit={handleSignUp}
                  >
                    <Field
                      name="email"
                      type="email"
                      autoComplete="email"
                    >
                      Email
                    </Field>
                    <Field
                      name="password"
                      type="password"
                      autoComplete="new-password"
                    >
                      Password
                    </Field>
                    <button
                      type="submit"
                      className="ui-button ui-button--primary w-full sm:w-auto"
                      disabled={controlsLocked}
                      aria-busy={pending === "sign-up"}
                    >
                      Create account
                    </button>
                  </form>
                </section>
              </div>

              {recoveryMode !== "password-update" ? (
                <FormMessage message={authMessage} />
              ) : null}

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section
                  aria-labelledby="verification-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <h2
                    id="verification-title"
                    className="text-xl font-bold tracking-tight"
                  >
                    Resend verification
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Request another verification message for an account that
                    has not been confirmed.
                  </p>
                  <form
                    className="mt-5 space-y-4"
                    onSubmit={handleResendVerification}
                  >
                    <Field
                      name="email"
                      type="email"
                      autoComplete="email"
                    >
                      Account email
                    </Field>
                    <button
                      type="submit"
                      className="ui-button ui-button--secondary w-full sm:w-auto"
                      disabled={controlsLocked}
                      aria-busy={pending === "resend"}
                    >
                      Resend verification email
                    </button>
                  </form>
                </section>

                <section
                  aria-labelledby="recovery-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <h2
                    id="recovery-title"
                    className="text-xl font-bold tracking-tight"
                  >
                    Recover a password
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Request a secure recovery link. Return to this account page
                    from the email to choose a new password.
                  </p>
                  <form
                    className="mt-5 space-y-4"
                    onSubmit={handleRecoveryRequest}
                  >
                    <Field
                      name="email"
                      type="email"
                      autoComplete="email"
                    >
                      Account email
                    </Field>
                    <button
                      type="submit"
                      className="ui-button ui-button--secondary w-full sm:w-auto"
                      disabled={controlsLocked}
                      aria-busy={pending === "recovery"}
                    >
                      Send recovery email
                    </button>
                  </form>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                <section
                  aria-labelledby="account-status-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <p className="font-mono text-xs font-bold tracking-[0.14em] text-success uppercase">
                    Signed in
                  </p>
                  <h2
                    id="account-status-title"
                    className="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Account status
                  </h2>
                  <dl className="mt-6 space-y-4">
                    <div>
                      <dt className="text-xs font-bold tracking-wide text-faint uppercase">
                        Email
                      </dt>
                      <dd className="mt-1 break-all font-semibold">
                        {session.user.email ?? "Email unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold tracking-wide text-faint uppercase">
                        Verification
                      </dt>
                      <dd className="mt-1">
                        {session.user.emailVerified
                          ? "Verified"
                          : "Not yet verified"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold tracking-wide text-faint uppercase">
                        Last successful sync
                      </dt>
                      <dd className="mt-1">
                        {lastSyncedAt ? (
                          <time dateTime={lastSyncedAt}>
                            {stableTimestamp(lastSyncedAt)}
                          </time>
                        ) : (
                          "No sync completed on this browser"
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-7 border-t border-border pt-6">
                    <h3 className="font-bold">Sign out safely</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Signing out leaves local product data, sync preferences,
                      and recovery data in this browser. It does not delete the
                      account or its synced snapshot.
                    </p>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary mt-4"
                      onClick={handleSignOut}
                      disabled={controlsLocked}
                      aria-busy={pending === "sign-out"}
                    >
                      Sign out
                    </button>
                  </div>
                </section>

                <section
                  aria-labelledby="sync-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-xs font-bold tracking-[0.14em] text-accent uppercase">
                        Explicit sync controls
                      </p>
                      <h2
                        id="sync-title"
                        className="mt-2 text-2xl font-bold tracking-tight"
                      >
                        Choose what can sync
                      </h2>
                    </div>
                    <span
                      aria-live="polite"
                      className={`ui-badge ${
                        syncStatus === "error"
                          ? "border-error/30 bg-error-soft text-error"
                          : syncStatus === "synced"
                            ? "border-success/30 bg-success-soft text-success"
                            : "border-border bg-raised text-muted"
                      }`}
                    >
                      {syncStatus === "syncing"
                        ? "Syncing"
                        : syncStatus === "synced"
                          ? "Synced"
                          : syncStatus === "error"
                            ? "Needs attention"
                            : "Not syncing"}
                    </span>
                  </div>
                  <p className="mt-4 leading-7 text-muted">
                    Every category is independent. Saved jobs, filters, and
                    saved searches start selected; tracker and applications
                    start unchecked because they can hold private details.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Deselecting a category stops future local reads and
                    uploads for that category. It does not erase category data
                    already stored in the account snapshot. Permanently
                    deleting the account removes that cloud snapshot.
                  </p>
                  {syncInProgress ? (
                    <p
                      role="status"
                      className="mt-4 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm leading-6 text-info"
                    >
                      Sync is in progress. Category, account, backup, and
                      recovery controls are temporarily unavailable until it
                      finishes.
                    </p>
                  ) : null}

                  <fieldset className="mt-6 space-y-3">
                    <legend className="sr-only">
                      Account sync categories
                    </legend>
                    {SYNC_OPTIONS.map((option) => (
                      <label
                        key={option.key}
                        className={`flex min-h-20 items-start gap-3 rounded-xl border p-4 ${
                          syncSelection[option.key]
                            ? "border-accent bg-accent-soft"
                            : "border-border bg-surface"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                          checked={syncSelection[option.key]}
                          disabled={controlsLocked}
                          onChange={(event) =>
                            updateSyncSelection(
                              option.key,
                              event.currentTarget.checked,
                            )
                          }
                        />
                        <span>
                          <span className="block font-bold">
                            {option.title}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-muted">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="mt-5 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm leading-6">
                    <strong className="text-warning">
                      Tracker data is private.
                    </strong>{" "}
                    Enabling tracker and application sync uploads personal
                    notes, optional contact information, and compensation
                    details when those fields exist.
                  </div>

                  <div className="mt-6 rounded-xl border border-info/30 bg-info-soft p-4 text-sm leading-6">
                    <strong className="text-info">
                      Merge is additive and local-first.
                    </strong>{" "}
                    Saved jobs are unioned. Applications keep the newest
                    record for each role; saved-search deletion markers prevent
                    stale records from returning, and the newest filter set
                    wins. Timley stores a pre-sync local recovery copy before
                    replacing selected local categories.
                  </div>

                  {!hasSyncSelection ? (
                    <p className="mt-4 text-sm font-semibold text-warning">
                      Select at least one category before syncing.
                    </p>
                  ) : null}

                  <div className="mt-6 flex flex-wrap gap-3">
                    {!lastSyncedAt ? (
                      <button
                        type="button"
                        className="ui-button ui-button--primary"
                        onClick={() => void runSync("first-sync")}
                        disabled={
                          controlsLocked || !hasSyncSelection
                        }
                        aria-busy={pending === "first-sync"}
                      >
                        Start first sync
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ui-button ui-button--primary"
                        onClick={() => void runSync("manual-sync")}
                        disabled={
                          controlsLocked || !hasSyncSelection
                        }
                        aria-busy={pending === "manual-sync"}
                      >
                        Sync now
                      </button>
                    )}
                  </div>

                  {syncMessage ? (
                    <FormMessage message={syncMessage} />
                  ) : syncError ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-lg border border-error/30 bg-error-soft px-4 py-3 text-sm leading-6 text-error"
                    >
                      {syncError}
                    </p>
                  ) : null}
                </section>
              </div>

              <section
                aria-labelledby="local-summary-title"
                className="ui-card mt-6 p-6 sm:p-8"
              >
                <div className="max-w-3xl">
                  <p className="font-mono text-xs font-bold tracking-[0.14em] text-accent uppercase">
                    Detected in this browser
                  </p>
                  <h2
                    id="local-summary-title"
                    className="mt-2 text-2xl font-bold tracking-tight"
                  >
                    Selected local data summary
                  </h2>
                  <p className="mt-3 leading-7 text-muted">
                    To protect private data, this summary inspects only the
                    categories currently selected for sync. An unchecked
                    tracker is shown as not inspected, not as empty.
                  </p>
                </div>

                <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      key: "savedJobs" as const,
                      label: "Saved jobs",
                      count: localSummary?.savedJobCount,
                    },
                    {
                      key: "applications" as const,
                      label: "Applications",
                      count: localSummary?.applicationCount,
                    },
                    {
                      key: "savedSearches" as const,
                      label: "Saved searches",
                      count: localSummary?.savedSearchCount,
                    },
                    {
                      key: "filters" as const,
                      label: "Filter preferences",
                      count:
                        localSummary?.included.filters === true ? 1 : 0,
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="rounded-xl border border-border bg-raised p-4"
                    >
                      <dt className="text-xs font-bold tracking-wide text-faint uppercase">
                        {item.label}
                      </dt>
                      <dd className="mt-2 text-2xl font-bold">
                        {!syncSelection[item.key]
                          ? "Not inspected"
                          : localSummary
                            ? item.count
                            : "Checking…"}
                      </dd>
                    </div>
                  ))}
                </dl>

                {syncSelection.applications && localSummary ? (
                  <p className="mt-5 text-sm leading-6 text-muted">
                    {localSummary.applicationsWithSensitiveFields} selected
                    application{" "}
                    {localSummary.applicationsWithSensitiveFields === 1
                      ? "record contains"
                      : "records contain"}{" "}
                    personal notes, optional contact information, or
                    compensation details.
                  </p>
                ) : null}
              </section>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section
                  aria-labelledby="backup-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <h2
                    id="backup-title"
                    className="text-xl font-bold tracking-tight"
                  >
                    Local continuity backup
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Download all four eligible local categories directly in
                    this browser, independent of the cloud checkboxes above.
                    This file can include tracker notes, contacts, and
                    compensation details. It does not include alert inbox
                    history or notification preferences.
                  </p>
                  <button
                    type="button"
                    className="ui-button ui-button--secondary mt-5"
                    onClick={downloadLocalContinuityBackup}
                    disabled={controlsLocked}
                  >
                    Download local continuity backup
                  </button>
                  <FormMessage message={backupMessage} />
                </section>

                <section
                  aria-labelledby="recovery-copy-title"
                  className="ui-card p-6 sm:p-8"
                >
                  <h2
                    id="recovery-copy-title"
                    className="text-xl font-bold tracking-tight"
                  >
                    Pre-sync recovery
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    After a sync plan is prepared, Timley retains the exact
                    selected local state from before that merge. Restoring it
                    replaces only those recorded categories in this browser
                    and pauses automatic sync.
                  </p>
                  <button
                    type="button"
                    className="ui-button ui-button--secondary mt-5"
                    onClick={handleRestoreRecovery}
                    disabled={
                      controlsLocked || !recoveryAvailable
                    }
                    aria-busy={pending === "restore"}
                  >
                    Restore pre-sync local copy
                  </button>
                  {!recoveryAvailable ? (
                    <p className="mt-3 text-xs leading-5 text-faint">
                      No restorable pre-sync copy is currently available.
                    </p>
                  ) : null}
                </section>
              </div>

              <section
                aria-labelledby="delete-account-title"
                className={`mt-8 rounded-xl border p-6 sm:p-8 ${
                  capabilities.accountDeletion
                    ? "border-error/30 bg-error-soft"
                    : "border-warning/30 bg-warning-soft"
                }`}
              >
                <div className="max-w-3xl">
                  <p
                    className={`font-mono text-xs font-bold tracking-[0.14em] uppercase ${
                      capabilities.accountDeletion
                        ? "text-error"
                        : "text-warning"
                    }`}
                  >
                    {capabilities.accountDeletion
                      ? "Danger zone"
                      : "Deletion unavailable"}
                  </p>
                  <h2
                    id="delete-account-title"
                    className="mt-2 text-2xl font-bold"
                  >
                    {capabilities.accountDeletion
                      ? "Permanently delete account"
                      : "Account deletion is not offered"}
                  </h2>
                  {capabilities.accountDeletion ? (
                    <p className="mt-3 leading-7">
                      Deletion removes the account, its synced snapshot, and
                      that account&apos;s local continuity preference and
                      recovery metadata. Anonymous product data stays in this
                      browser unless you separately select the option below.
                      Downloaded files are never removed.
                    </p>
                  ) : (
                    <p className="mt-3 leading-7">
                      This deployment has not declared account deletion
                      available to the browser. The required server-side
                      deletion setup may also be absent, so Timley does not
                      show or send a destructive request. Your account, cloud
                      snapshot, and browser data remain unchanged.
                    </p>
                  )}
                </div>

                {!capabilities.accountDeletion ? (
                  <p
                    role="status"
                    className="mt-5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning"
                  >
                    You can still sign out safely. Signing out leaves local
                    product data, sync preferences, and recovery data in this
                    browser.
                  </p>
                ) : (
                  <form
                    className="mt-6 max-w-2xl space-y-5"
                    onSubmit={handleDeleteAccount}
                  >
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold">
                        Type DELETE to confirm
                      </span>
                      <input
                        className="ui-control ui-input w-full max-w-sm"
                        value={deleteText}
                        onChange={(event) =>
                          setDeleteText(event.currentTarget.value)
                        }
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        disabled={controlsLocked}
                        aria-describedby="delete-account-help"
                      />
                    </label>
                    <p
                      id="delete-account-help"
                      className="text-sm leading-6 text-muted"
                    >
                      A native confirmation prompt appears before Timley sends
                      the deletion request.
                    </p>
                    <label className="flex items-start gap-3 rounded-xl border border-error/30 bg-surface p-4">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-[var(--error)]"
                        checked={alsoClearBrowserData}
                        disabled={controlsLocked}
                        onChange={(event) =>
                          setAlsoClearBrowserData(
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <span>
                        <span className="block font-bold">
                          Also clear this browser&apos;s anonymous Timley
                          product data
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-muted">
                          Clears saved jobs and their update/deletion markers,
                          current and legacy tracker data plus application
                          deletion markers, filters, saved searches, alert
                          inbox history, reminder settings, and view
                          preferences. It does not clear unrelated site or
                          browser data.
                        </span>
                      </span>
                    </label>
                    <button
                      type="submit"
                      className="ui-button border-error bg-error text-white hover:opacity-90"
                      disabled={
                        controlsLocked || deleteText !== "DELETE"
                      }
                      aria-busy={pending === "delete"}
                    >
                      Permanently delete account
                    </button>
                    <p className="text-xs leading-5 text-faint">
                      If deletion is not enabled server-side or the request
                      fails, Timley reports the failure and does not run the
                      optional browser-product cleanup.
                    </p>
                  </form>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
