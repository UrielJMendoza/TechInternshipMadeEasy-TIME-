"use client";

import { useEffect, useRef, useState } from "react";
import type { ApplicationRecords } from "@/lib/applicationTracking";
import {
  buildTrackerCsv,
  buildTrackerIcs,
  getUpcomingTrackerItems,
  parseTrackerBackup,
  serializeTrackerBackup,
} from "@/lib/trackerExport";

const REMINDER_PREFERENCE_KEY = "timley:reminders:browser:v1";
const LAST_NOTIFICATION_KEY = "timley:reminders:last-notification:v1";

interface RestoredBackup {
  records: ApplicationRecords;
  savedJobs: string[];
}

interface TrackerDataControlsProps {
  records: ApplicationRecords;
  savedJobs: string[];
  onRestore: (backup: RestoredBackup) => void;
}

export function TrackerDataControls({
  records,
  savedJobs,
  onRestore,
}: TrackerDataControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTick, setReminderTick] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setNotificationsEnabled(
          localStorage.getItem(REMINDER_PREFERENCE_KEY) === "enabled" &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted",
        );
      } catch {
        setNotificationsEnabled(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!notificationsEnabled) return;
    const refresh = () => setReminderTick((current) => current + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [notificationsEnabled]);

  useEffect(() => {
    if (
      !notificationsEnabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    const items = getUpcomingTrackerItems(records, new Date(), 7).filter(
      (item) => item.status === "overdue" || item.status === "today",
    );
    if (items.length === 0) return;

    const today = localDateStamp(new Date());
    const notificationKey = `${today}:${items.map((item) => item.id).join("|")}`;
    try {
      if (localStorage.getItem(LAST_NOTIFICATION_KEY) === notificationKey) {
        return;
      }
      new Notification("Timley application reminder", {
        body: `${items.length} application ${
          items.length === 1 ? "action needs" : "actions need"
        } attention today.`,
        tag: "timley-application-reminders",
      });
      localStorage.setItem(LAST_NOTIFICATION_KEY, notificationKey);
    } catch {
      // In-app reminders remain available if the browser suppresses a notice.
    }
  }, [notificationsEnabled, records, reminderTick]);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") {
      setStatus("Browser notifications are not supported here.");
      return;
    }

    let permission: NotificationPermission;
    try {
      permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
    } catch {
      setStatus("The browser could not open notification settings.");
      return;
    }
    if (permission !== "granted") {
      setStatus("Browser notifications were not enabled.");
      return;
    }

    try {
      localStorage.setItem(REMINDER_PREFERENCE_KEY, "enabled");
    } catch {
      // The current page can still use the granted permission.
    }
    setNotificationsEnabled(true);
    setStatus(
      "Browser reminders enabled. Timley can notify you while it is open.",
    );
  };

  const disableNotifications = () => {
    try {
      localStorage.removeItem(REMINDER_PREFERENCE_KEY);
    } catch {
      // Keep the UI update when storage is unavailable.
    }
    setNotificationsEnabled(false);
    setStatus("Browser reminders disabled in Timley.");
  };

  return (
    <details className="relative">
      <summary className="ui-button ui-button--secondary cursor-pointer list-none">
        Data & reminders
      </summary>
      <div className="ui-popover absolute right-0 z-[var(--layer-popover)] mt-2 w-[min(24rem,calc(100vw-2rem))] p-4">
        <section aria-labelledby="export-heading">
          <h3 id="export-heading" className="text-sm font-extrabold">
            Export and restore
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Downloads are created on this device. JSON includes notes,
            contacts, application details, and saved-job URLs.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                downloadText(
                  `timley-applications-${dateStamp()}.csv`,
                  buildTrackerCsv(records),
                  "text/csv;charset=utf-8",
                )
              }
              className="ui-button ui-button--secondary ui-button--sm"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() =>
                downloadText(
                  `timley-calendar-${dateStamp()}.ics`,
                  buildTrackerIcs(records),
                  "text/calendar;charset=utf-8",
                )
              }
              className="ui-button ui-button--secondary ui-button--sm"
            >
              Export calendar
            </button>
            <button
              type="button"
              onClick={() =>
                downloadText(
                  `timley-backup-${dateStamp()}.json`,
                  serializeTrackerBackup(records, savedJobs),
                  "application/json;charset=utf-8",
                )
              }
              className="ui-button ui-button--secondary ui-button--sm"
            >
              Download backup
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ui-button ui-button--secondary ui-button--sm"
            >
              Restore backup
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a Timley JSON backup"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;

              const parsed = parseTrackerBackup(await file.text());
              if (!parsed.ok) {
                setStatus(parsed.error);
                return;
              }

              const recordCount = Object.keys(parsed.backup.records).length;
              if (
                !window.confirm(
                  `Merge ${recordCount} application records from this backup? Newer records already in Timley will be kept.`,
                )
              ) {
                setStatus("Restore canceled.");
                return;
              }

              onRestore({
                records: parsed.backup.records,
                savedJobs: parsed.backup.savedJobs,
              });
              setStatus(
                `Backup restored. ${recordCount} records checked; newer local records were kept.`,
              );
            }}
          />
        </section>

        <section
          aria-labelledby="notification-heading"
          className="mt-4 border-t border-border pt-4"
        >
          <h3 id="notification-heading" className="text-sm font-extrabold">
            Browser reminders
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Optional notifications are best-effort while Timley is open. Your
            browser asks for permission only after you choose Enable.
          </p>
          <button
            type="button"
            onClick={
              notificationsEnabled
                ? disableNotifications
                : enableNotifications
            }
            className="ui-button ui-button--secondary ui-button--sm mt-3"
          >
            {notificationsEnabled
              ? "Disable browser reminders"
              : "Enable browser reminders"}
          </button>
        </section>

        <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-faint">
          Tracker data starts in this browser and is not uploaded by signing
          in. Optional continuity includes it only after you explicitly select
          tracker sync, which includes notes and optional contacts. Archive
          keeps a record; permanent deletion removes the local record. Keep a
          backup before clearing site data.
        </p>
        {status && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 text-xs font-semibold text-muted"
          >
            {status}
          </p>
        )}
      </div>
    </details>
  );
}

function downloadText(
  filename: string,
  content: string,
  type: string,
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function localDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
