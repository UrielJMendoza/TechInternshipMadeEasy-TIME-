import Link from "next/link";
import { LocationSummary } from "@/components/LocationSummary";
import { classifySponsorship } from "@/lib/jobFilters";
import { jobPublicPath } from "@/lib/publicCatalog";
import { CATEGORY_LABELS, type Internship } from "@/lib/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function sponsorshipLabel(job: Internship): string | null {
  const status = classifySponsorship(job.sponsorship);
  if (status === "offers-sponsorship") return "Sponsorship offered";
  if (status === "no-sponsorship") return "No sponsorship";
  if (status === "citizens-only") return "Citizenship restriction";
  return null;
}

export function PublicJobList({
  jobs,
  emptyMessage = "No current roles meet this collection’s evidence rules.",
  closed = false,
}: {
  jobs: readonly Internship[];
  emptyMessage?: string;
  closed?: boolean;
}) {
  if (jobs.length === 0) {
    return (
      <div className="ui-card border-dashed px-5 py-10 text-center text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ol className="grid gap-3">
      {jobs.map((job) => {
        const sponsorship = sponsorshipLabel(job);
        return (
          <li key={job.id}>
            <article className="ui-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-accent-hover">
                    {job.company}
                  </p>
                  <h3 className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-fg">
                    <Link
                      href={jobPublicPath(job)}
                      prefetch={false}
                      className="hover:text-accent-hover"
                    >
                      {job.title}
                    </Link>
                  </h3>
                  <div className="mt-1.5 text-sm text-muted">
                    <LocationSummary
                      location={job.location}
                      maxVisible={2}
                      fallback="Location unavailable"
                      jobLabel={`${job.title} at ${job.company}`}
                    />
                  </div>
                </div>
                <span
                  className={`ui-badge ${closed ? "ui-badge--warning" : "ui-badge--neutral"}`}
                >
                  {closed
                    ? job.verification_status === "destination-closed"
                      ? "Destination closed"
                      : "Removed from source"
                    : job.role_type === "internship"
                      ? "Internship"
                      : "New grad"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-faint">
                <span className="ui-badge ui-badge--neutral">
                  {CATEGORY_LABELS[job.category]}
                </span>
                {job.salary?.trim() ? (
                  <span className="ui-badge ui-badge--success">
                    Employer-listed pay: {job.salary}
                  </span>
                ) : null}
                {sponsorship ? (
                  <span className="ui-badge ui-badge--neutral">
                    {sponsorship}
                  </span>
                ) : null}
                <span>
                  {closed
                    ? `Last observed ${formatDate(job.last_seen_at)}`
                    : `First observed ${formatDate(job.first_seen_at)}`}
                </span>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
