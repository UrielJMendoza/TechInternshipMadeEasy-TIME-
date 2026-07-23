import { SOURCE_CATALOG } from "@/lib/sourceCatalog";
import { SOURCE_LABELS, type Internship } from "@/lib/types";

const DAY_MS = 86_400_000;
export const VERIFICATION_FRESHNESS_DAYS = 30;

export type ListingEvidenceState =
  | "verified"
  | "active"
  | "possibly-closed"
  | "expired";

export interface ListingEvidence {
  state: ListingEvidenceState;
  label: string;
  description: string;
}

export interface JobSourceDetails {
  label: string;
  repositoryUrl: string | null;
}

export function listingEvidenceFor(
  job: Internship,
  now: number,
): ListingEvidence {
  if (job.expiration_status === "expired") {
    return {
      state: "expired",
      label: "Expired",
      description:
        "This listing remained absent from its source for at least 30 days after Timley marked it possibly closed. The application may no longer accept submissions.",
    };
  }

  if (!job.is_active) {
    return {
      state: "possibly-closed",
      label: "Possibly closed",
      description:
        "This role is no longer present in its latest successful complete source snapshot. Timley has not confirmed closure at the employer destination.",
    };
  }

  const verificationTime = job.last_verified_at ?? job.last_seen_at;
  const lastSeen = Date.parse(verificationTime);
  const verificationAge = Number.isFinite(lastSeen)
    ? Math.max(0, Math.floor((now - lastSeen) / DAY_MS))
    : Number.POSITIVE_INFINITY;

  if (verificationAge > VERIFICATION_FRESHNESS_DAYS) {
    return {
      state: "possibly-closed",
      label: "Possibly closed",
      description:
        "Timley has not verified this listing in its source feed for more than 30 days. Confirm availability before applying.",
    };
  }

  if (
    job.verification_status === "source-observed" ||
    job.verification_status === "destination-reachable"
  ) {
    return {
      state: "verified",
      label: "Verified at source",
      description:
        job.verification_status === "destination-reachable"
          ? "Timley observed this listing in its source feed and recently reached the application destination."
          : "Timley observed this listing in its source feed recently. This verifies source presence, not that the employer destination is still accepting applications.",
    };
  }

  return {
    state: "active",
    label: "Active listing",
    description:
      "This role is present in Timley’s current active feed. Always confirm final details on the employer’s application page.",
  };
}

export function sourceDetailsFor(sourceId: string): JobSourceDetails {
  const source = SOURCE_CATALOG.find((entry) => entry.id === sourceId);
  return {
    label:
      source?.label ??
      SOURCE_LABELS[sourceId] ??
      (sourceId || "Unknown source"),
    repositoryUrl: source?.repositoryUrl ?? null,
  };
}

export function missingJobEvidence(job: Internship): string[] {
  const missing: string[] = [];
  if (!job.location.trim()) missing.push("location");
  if (!job.season?.trim()) missing.push("start period");
  if (!job.salary?.trim()) missing.push("employer-listed compensation");
  if (!job.sponsorship?.trim()) missing.push("sponsorship evidence");
  if (!job.posted_date) missing.push("original posting date");
  if (!job.source.trim()) missing.push("source");
  if (!job.last_verified_at) missing.push("source verification time");
  return missing;
}

export function formatEvidenceDate(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function similarJobsFor(
  selected: Internship,
  jobs: readonly Internship[],
  limit = 3,
): Internship[] {
  return jobs
    .filter(
      (job) =>
        job.is_active &&
        job.id !== selected.id &&
        job.link !== selected.link &&
        (job.company === selected.company ||
          job.category === selected.category),
    )
    .map((job) => ({
      job,
      score:
        (job.company === selected.company ? 8 : 0) +
        (job.category === selected.category ? 4 : 0) +
        (job.role_type === selected.role_type ? 2 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.job.first_seen_at) - Date.parse(a.job.first_seen_at) ||
        a.job.company.localeCompare(b.job.company),
    )
    .slice(0, Math.max(0, limit))
    .map(({ job }) => job);
}
