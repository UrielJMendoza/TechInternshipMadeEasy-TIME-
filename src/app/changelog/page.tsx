import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";

const title = "Changelog";
const description =
  "A factual record of Timley product and data-experience changes.";

export const metadata: Metadata = publicPageMetadata({
  title,
  description,
  path: "/changelog",
});

const releases = [
  {
    label: "Module 7",
    title: "Public discovery, company evidence, and safe sharing",
    summary:
      "Timley adds useful public pages from real listing observations while keeping thin pages, private tracker state, and unproved employer claims out of the growth loop.",
    changes: [
      "Added data-backed discovery pages for role types, categories, remote work, explicit sponsorship evidence, locations, hiring seasons, and jobs first observed this week.",
      "Added company observation pages with active roles, recently removed source records, Timley categories, listed locations, employer-listed pay evidence, role-level sponsorship evidence, and history only when the data is adequate.",
      "Added stable public job-detail URLs, copy and native sharing, generic unaffiliated campus collections, and browser-local company follows.",
      "Added canonical and social metadata, robots rules, a data-driven XML sitemap, collection and breadcrumb structured data, and JobPosting data only on legitimate active detail pages.",
      "Public filtered links now remove saved-only and application-stage state. Recently removed detail pages suppress Apply and JobPosting data, use noindex, and age out of public history after 90 days.",
      "Added a typed privacy-conscious analytics contract that uses coarse buckets and never accepts raw searches, job or company identity, URLs, notes, or contact information.",
    ],
  },
  {
    label: "Module 6",
    title: "Saved-search alerts and optional account continuity",
    summary:
      "Timley keeps anonymous local use intact while adding deliberate foreground alerts and a conditionally available continuity path.",
    changes: [
      "Added a local saved-search alert inbox with match reasons, triggering-search and frequency details, direct filtered-result links, global role deduplication, pause controls, and confirmed unsubscribe or deletion.",
      "Added optional foreground browser notices behind an explicit permission action. Email alerts remain visibly unavailable until a real delivery provider is implemented.",
      "Added a provider-isolated Supabase continuity path that is unavailable unless public browser configuration, authentication, database policies, email delivery, and redirects are set up.",
      "Signing in does not upload browser data. First sync requires category selection, and selecting tracker data explicitly warns that notes and optional contacts are included.",
      "Continuity merge keeps the newest application record per role and unions set-like data, saves the cloud snapshot first, and only then updates the browser copy so failed saves remain recoverable.",
      "Sign-out leaves browser data in place. Configured account deletion removes the Supabase account and its cloud snapshot; clearing local data remains a separate optional action.",
    ],
  },
  {
    label: "Prompt 2",
    title: "Dedicated product landing page and routes",
    summary:
      "Timley now separates product explanation from the job-discovery workspace while keeping public browsing account-free.",
    changes: [
      "Added a dedicated landing page grounded in the real job board, freshness fields, saving flow, and application stages.",
      "Moved the discovery workspace to /jobs and preserved legacy root filter URLs by carrying their query parameters forward.",
      "Added dedicated tracker, methodology, data-status, changelog, privacy, and terms destinations with shared navigation.",
      "Derived company references and product statistics from current listing data; no endorsements, usage figures, or outcome claims were added.",
      "Added restrained motion with reduced-motion behavior and responsive layouts across marketing and product sections.",
    ],
  },
  {
    label: "Prompt 1B",
    title: "Modernization foundation",
    summary:
      "A corrected visual foundation established Timley as a focused job-discovery and application-tracking product.",
    changes: [
      "Introduced a deep ink and navy marketing surface alongside a cool-light application workspace.",
      "Added shared controls, cards, badges, focus treatments, spacing, layers, and motion tokens.",
      "Improved the responsive shell and product hierarchy without changing filters, URL state, saved roles, stages, or browser persistence.",
      "Kept blue for primary actions, green for verified or positive states, and amber for estimates or caution.",
      "Added design-system checks for contrast, motion, theme boundaries, and reduced-motion behavior.",
    ],
  },
] as const;

export default function ChangelogPage() {
  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg text-fg">
      <section className="border-b-2 border-fg bg-bg">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
            Changelog
          </p>
          <h1 className="mt-4 text-4xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
            What changed in Timley.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Product changes recorded without invented launch history, growth
            figures, partnerships, or outcome claims.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="release-date"
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
      >
        <div className="grid gap-8 md:grid-cols-[10rem_1fr] md:gap-12">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.14em] text-faint uppercase">
              Updated
            </p>
            <h2 id="release-date" className="mt-2 text-lg font-bold">
              <time dateTime="2026-07-23">July 23, 2026</time>
            </h2>
          </div>

          <div className="space-y-8">
            {releases.map((release) => (
              <article key={release.label} className="ui-card p-6 sm:p-8">
                <span className="ui-badge bg-accent-soft text-accent">
                  {release.label}
                </span>
                <h3 className="mt-5 text-2xl font-bold tracking-tight">
                  {release.title}
                </h3>
                <p className="mt-3 leading-7 text-muted">{release.summary}</p>
                <ul className="mt-6 space-y-3 border-t border-border pt-6 text-sm leading-6 text-muted">
                  {release.changes.map((change) => (
                    <li key={change} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-[0.6rem] size-1.5 shrink-0 rounded-full bg-accent"
                      />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
