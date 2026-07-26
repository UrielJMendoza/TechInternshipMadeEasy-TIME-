import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FollowCompanyButton } from "@/components/FollowCompanyButton";
import { PublicJobList } from "@/components/PublicJobList";
import { ShareControls } from "@/components/ShareControls";
import { StructuredData } from "@/components/StructuredData";
import { fetchPublicJobsSnapshot } from "@/lib/jobs";
import {
  findCompanyProfile,
  type CompanyCount,
  type CompanyProfile,
} from "@/lib/publicCatalog";
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { CATEGORY_LABELS, type Category } from "@/lib/types";

export const revalidate = 300;

const getSnapshot = cache(fetchPublicJobsSnapshot);

async function getCompany(slug: string) {
  const snapshot = await getSnapshot();
  return {
    snapshot,
    company: findCompanyProfile(
      snapshot.jobs,
      snapshot.recentlyClosedJobs,
      slug,
    ),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { snapshot, company } = await getCompany(slug);
  if (!company) {
    return publicPageMetadata({
      title: "Company not found",
      description: "This Timley company observation page does not exist.",
      path: `/companies/${slug}`,
      indexable: false,
    });
  }
  return publicPageMetadata({
    title: `${company.name} jobs`,
    description: `${company.activeJobs.length} active ${company.name} roles observed in Timley’s current public listing snapshot, with category, location, pay, sponsorship, and freshness evidence.`,
    path: `/companies/${company.slug}`,
    indexable:
      company.indexable && !snapshot.loadError && !snapshot.partialData,
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as Category] ?? value;
}

function CountList({
  counts,
  category = false,
}: {
  counts: readonly CompanyCount[];
  category?: boolean;
}) {
  return (
    <ul className="mt-3 space-y-2">
      {counts.slice(0, 8).map((item) => (
        <li
          key={item.label}
          className="flex items-center justify-between gap-4 text-sm"
        >
          <span className="text-muted">
            {category ? categoryLabel(item.label) : item.label}
          </span>
          <span className="font-extrabold tabular-nums">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

function CompanyEvidence({ company }: { company: CompanyProfile }) {
  const sponsorship = company.sponsorshipCounts;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="ui-card p-5" aria-labelledby="company-categories">
        <h2 id="company-categories" className="text-base font-extrabold">
          Timley categories
        </h2>
        <CountList counts={company.categoryCounts} category />
      </section>
      <section className="ui-card p-5" aria-labelledby="company-locations">
        <h2 id="company-locations" className="text-base font-extrabold">
          Listed locations
        </h2>
        <CountList counts={company.locationCounts} />
      </section>
      <section className="ui-card p-5" aria-labelledby="company-pay">
        <h2 id="company-pay" className="text-base font-extrabold">
          Salary evidence
        </h2>
        <p className="mt-3 text-3xl font-extrabold tabular-nums">
          {company.employerPayCount}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">
          active roles include an employer-listed pay value in the public
          source. Timley does not infer pay for the remaining roles.
        </p>
      </section>
      <section className="ui-card p-5" aria-labelledby="company-sponsorship">
        <h2 id="company-sponsorship" className="text-base font-extrabold">
          Sponsorship evidence by role
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>{sponsorship["offers-sponsorship"]} explicitly offer sponsorship</li>
          <li>{sponsorship["no-sponsorship"]} explicitly do not</li>
          <li>{sponsorship["citizens-only"]} include a citizenship restriction</li>
          <li>{sponsorship.unknown} remain unknown</li>
        </ul>
        <p className="mt-3 text-xs leading-5 text-faint">
          These are listing-level observations, not a company-wide immigration
          policy.
        </p>
      </section>
    </div>
  );
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { snapshot, company } = await getCompany(slug);
  if (!company) notFound();

  const path = `/companies/${company.slug}`;
  const activeJobs = company.activeJobs.slice(0, 30);
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Companies", path: "/companies" },
    { name: company.name, path },
  ];

  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg text-fg"
    >
      <StructuredData
        data={[
          breadcrumbJsonLd(breadcrumbs),
          itemListJsonLd(
            `${company.name} active roles observed by Timley`,
            activeJobs,
            path,
          ),
        ]}
      />
      <section className="border-b-2 border-fg bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Breadcrumbs items={breadcrumbs} />
          <p className="mt-8 text-xs font-extrabold tracking-[0.14em] text-accent-hover uppercase">
            Public listing observations
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
            {company.name} jobs observed by Timley
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
            {company.activeJobs.length} current active roles, with evidence
            taken from public sources. {company.name} has not endorsed this
            page, and Timley does not claim an employer relationship.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <FollowCompanyButton slug={company.slug} company={company.name} />
            <ShareControls
              path={path}
              title={`${company.name} jobs observed by Timley`}
              kind="company"
            />
            <Link
              href={`/jobs?q=${encodeURIComponent(company.name)}`}
              className="ui-button ui-button--primary"
            >
              Filter job search
            </Link>
          </div>
          <p className="mt-4 text-xs text-faint">
            Following is stored only in this browser. First observed{" "}
            {formatDate(company.firstObservedAt)} · latest visible observation{" "}
            {formatDate(company.lastObservedAt)}.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <CompanyEvidence company={company} />

        {company.history.length > 0 ? (
          <section aria-labelledby="company-history">
            <h2 id="company-history" className="text-2xl font-extrabold">
              Monthly first-observation pattern
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Shown only when at least ten observations span multiple months.
              Counts describe when Timley first saw a public record; they are
              not a forecast or proof of when the employer opened hiring.
            </p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {company.history.map((month) => (
                <li key={month.month} className="ui-card p-4">
                  <time dateTime={month.month} className="text-xs text-faint">
                    {month.month}
                  </time>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums">
                    {month.count}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section aria-labelledby="active-company-roles">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="active-company-roles" className="text-2xl font-extrabold">
                Active roles
              </h2>
              <p className="mt-1 text-sm text-muted">
                Showing {activeJobs.length} of {company.activeJobs.length}
                current source-observed roles.
              </p>
            </div>
            <Link
              href={`/jobs?q=${encodeURIComponent(company.name)}`}
              className="ui-button ui-button--secondary"
            >
              Browse in job search
            </Link>
          </div>
          <div className="mt-5">
            <PublicJobList jobs={activeJobs} />
          </div>
        </section>

        <section aria-labelledby="recently-removed-roles">
          <h2 id="recently-removed-roles" className="text-2xl font-extrabold">
            Recently removed from a source
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            These records disappeared from a refreshed public source during
            the last 90 days. Unless a destination-closed check is shown,
            removal is not employer-confirmed closure.
          </p>
          {snapshot.historyLoadError ? (
            <div className="ui-card mt-5 border-dashed px-5 py-8 text-sm text-muted">
              Recent source-removal history is temporarily unavailable; active
              listings remain usable.
            </div>
          ) : (
            <div className="mt-5">
              <PublicJobList
                jobs={company.recentlyClosedJobs.slice(0, 12)}
                closed
                emptyMessage="No recently removed source observations are available for this company."
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
