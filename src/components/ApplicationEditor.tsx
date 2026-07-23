"use client";

import { useRef, useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import {
  APPLICATION_STAGE_LABELS,
  TRACKED_APPLICATION_STAGES,
  type ApplicationRecord,
  type TrackedApplicationStage,
} from "@/lib/applicationTracking";

export interface ApplicationDraft {
  stage: TrackedApplicationStage;
  jobTitle?: string;
  company?: string;
  savedAt?: string;
  appliedAt?: string;
  nextAction?: string;
  nextActionAt?: string;
  interviewDates?: string[];
  notes?: string;
  applicationUrl?: string;
  contact?: string;
  compensationNotes?: string;
  locationArrangement?: string;
}

interface ApplicationEditorProps {
  initial?: ApplicationRecord;
  title: string;
  onClose: () => void;
  onSave: (draft: ApplicationDraft) => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function ApplicationEditor({
  initial,
  title,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: ApplicationEditorProps) {
  const interviewIdRef = useRef(1);
  const [stage, setStage] = useState<TrackedApplicationStage>(
    initial?.stage ?? "saved",
  );
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [savedAt, setSavedAt] = useState(dateInputValue(initial?.savedAt));
  const [appliedAt, setAppliedAt] = useState(dateInputValue(initial?.appliedAt));
  const [nextAction, setNextAction] = useState(initial?.nextAction ?? "");
  const [nextActionAt, setNextActionAt] = useState(
    dateInputValue(initial?.nextActionAt),
  );
  const [interviewDates, setInterviewDates] = useState(() =>
    (initial?.interviewDates?.length ? initial.interviewDates : [""]).map(
      (value, index) => ({ id: `initial-${index}`, value }),
    ),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [applicationUrl, setApplicationUrl] = useState(
    initial?.applicationUrl ?? "",
  );
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [compensationNotes, setCompensationNotes] = useState(
    initial?.compensationNotes ?? "",
  );
  const [locationArrangement, setLocationArrangement] = useState(
    initial?.locationArrangement ?? "",
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      stage,
      jobTitle: clean(jobTitle),
      company: clean(company),
      savedAt: clean(savedAt),
      appliedAt: clean(appliedAt),
      nextAction: clean(nextAction),
      nextActionAt: clean(nextActionAt),
      interviewDates: interviewDates
        .map((date) => date.value.trim())
        .filter(Boolean),
      notes: clean(notes),
      applicationUrl: clean(applicationUrl),
      contact: clean(contact),
      compensationNotes: clean(compensationNotes),
      locationArrangement: clean(locationArrangement),
    });
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      presentation="detail-drawer"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {onArchive && initial?.stage !== "archived" && (
              <button
                type="button"
                onClick={onArchive}
                className="ui-button ui-button--secondary"
              >
                Archive
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Permanently delete this application? Notes, dates, and contact details will be removed from this browser.",
                    )
                  ) {
                    onDelete();
                  }
                }}
                className="ui-button ui-button--quiet text-error"
              >
                Permanently delete
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ui-button ui-button--quiet"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="application-editor-form"
              className="ui-button ui-button--primary"
            >
              Save application
            </button>
          </div>
        </div>
      }
    >
      <form
        id="application-editor-form"
        onSubmit={submit}
        className="space-y-7"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job">
            <input
              data-autofocus
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              className="ui-control ui-input w-full"
              placeholder="Software engineering intern"
              maxLength={160}
              required
            />
          </Field>
          <Field label="Company">
            <input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="ui-control ui-input w-full"
              placeholder="Company name"
              maxLength={120}
              required
            />
          </Field>
          <Field label="Stage">
            <select
              value={stage}
              onChange={(event) =>
                setStage(event.target.value as TrackedApplicationStage)
              }
              className="ui-control ui-input w-full"
            >
              {TRACKED_APPLICATION_STAGES.map((option) => (
                <option key={option} value={option}>
                  {APPLICATION_STAGE_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location / work arrangement">
            <input
              value={locationArrangement}
              onChange={(event) => setLocationArrangement(event.target.value)}
              className="ui-control ui-input w-full"
              placeholder="Denver, CO · Hybrid"
              maxLength={180}
            />
          </Field>
          <Field label="Date saved">
            <input
              type="date"
              value={savedAt}
              onChange={(event) => setSavedAt(event.target.value)}
              className="ui-control ui-input w-full"
            />
          </Field>
          <Field label="Date applied">
            <input
              type="date"
              value={appliedAt}
              onChange={(event) => setAppliedAt(event.target.value)}
              className="ui-control ui-input w-full"
            />
          </Field>
        </div>

        <section aria-labelledby="next-action-heading" className="space-y-4">
          <div>
            <h3 id="next-action-heading" className="text-sm font-extrabold">
              Next action
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Add a concrete follow-up and date to surface it in reminders and
              calendar export.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <Field label="Action">
              <input
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                className="ui-control ui-input w-full"
                placeholder="Follow up with recruiter"
                maxLength={240}
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={nextActionAt}
                onChange={(event) => setNextActionAt(event.target.value)}
                className="ui-control ui-input w-full"
              />
            </Field>
          </div>
        </section>

        <section aria-labelledby="interviews-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 id="interviews-heading" className="text-sm font-extrabold">
                Interview dates
              </h3>
              <p className="mt-1 text-xs text-muted">
                Add as many scheduled interviews as you need.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setInterviewDates((dates) => [
                  ...dates,
                  {
                    id: `added-${interviewIdRef.current++}`,
                    value: "",
                  },
                ])
              }
              className="ui-button ui-button--quiet ui-button--sm"
            >
              Add date
            </button>
          </div>
          <div className="space-y-2">
            {interviewDates.map((date, index) => (
              <div key={date.id} className="flex items-center gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Interview {index + 1}</span>
                  <input
                    type="datetime-local"
                    value={dateTimeInputValue(date.value)}
                    onChange={(event) =>
                      setInterviewDates((dates) =>
                        dates.map((item) =>
                          item.id === date.id
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="ui-control ui-input w-full"
                  />
                </label>
                {interviewDates.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove interview ${index + 1}`}
                    onClick={() =>
                      setInterviewDates((dates) =>
                        dates.filter((item) => item.id !== date.id),
                      )
                    }
                    className="ui-button ui-button--quiet ui-button--sm text-error"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <Field label="Application URL">
          <input
            type="url"
            value={applicationUrl}
            onChange={(event) => setApplicationUrl(event.target.value)}
            className="ui-control ui-input w-full"
            placeholder="https://company.example/jobs/123"
            maxLength={2000}
          />
        </Field>

        <Field label="Optional contact">
          <textarea
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className="ui-control min-h-20 w-full px-3 py-2"
            placeholder="Name, role, email, or profile URL"
            maxLength={1000}
          />
        </Field>

        <Field label="Compensation notes">
          <textarea
            value={compensationNotes}
            onChange={(event) => setCompensationNotes(event.target.value)}
            className="ui-control min-h-20 w-full px-3 py-2"
            placeholder="Salary range, equity, benefits, or negotiation notes"
            maxLength={2000}
          />
        </Field>

        <Field label="Personal notes">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="ui-control min-h-36 w-full px-3 py-2"
            placeholder="Research, conversations, impressions, and anything you want to remember"
            maxLength={10000}
          />
        </Field>

        {onDelete && initial?.updatedAt && (
          <p className="border-t border-border pt-4 text-xs text-faint">
            Last updated{" "}
            <time dateTime={initial.updatedAt}>
              {formatTimestamp(initial.updatedAt)}
            </time>
          </p>
        )}
      </form>
    </BottomSheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function dateInputValue(value: string | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return localDateParts(date).date;
}

function dateTimeInputValue(value: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = localDateParts(date);
  return `${parts.date}T${parts.time}`;
}

function localDateParts(date: Date): { date: string; time: string } {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
