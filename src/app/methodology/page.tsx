import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";
import { SOURCE_CATALOG } from "@/lib/sourceCatalog";

const title = "Data methodology";
const description =
  "How Timley collects, normalizes, filters, deduplicates, and labels public job listings.";

export const metadata: Metadata = publicPageMetadata({
  title,
  description,
  path: "/methodology",
});

function SectionHeading({
  id,
  eyebrow,
  title: sectionTitle,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl"
      >
        {sectionTitle}
      </h2>
      <div className="mt-4 text-base leading-7 text-muted">{children}</div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg text-fg">
      <section className="border-b border-border bg-raised">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
            Data methodology
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
            A clear path from public source to useful listing.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Timley organizes public internship and new-grad lists. It cleans
            inconsistent fields and removes obvious duplicates, while keeping
            uncertainty visible instead of inventing missing details.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="sources"
        className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
      >
        <SectionHeading
          id="sources"
          eyebrow="01 · Sources"
          title="Public lists, named directly"
        >
          <p>
            The current ingestion adapters read the repositories below. Timley
            is not endorsed by the maintainers or by employers appearing in
            their lists. Follow each repository for its own definitions,
            update history, and contribution rules.
          </p>
          <p className="mt-4">
            Timley&apos;s checked-in schedule requests one refresh daily at
            12:00 UTC. Upstream repositories update on their own schedules, so
            a faster upstream change may not appear until Timley&apos;s next
            successful refresh.
          </p>
        </SectionHeading>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {SOURCE_CATALOG.map((source, index) => (
            <article key={source.id} className="ui-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-faint">
                    Source {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-fg">
                    {source.label}
                  </h3>
                </div>
                <span className="ui-badge bg-info-soft text-info">
                  {source.format}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                {source.coverage}
              </p>
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                {source.repositories.map((repository) => (
                  <li key={repository.url}>
                    <a
                      className="font-semibold text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
                      href={repository.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {repository.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionHeading
            eyebrow="02 · Processing"
            title="Deterministic cleanup, with conservative fallbacks"
          >
            <p>
              The same checked-in rules run across each refresh. Background
              automation supports parsing, categorization, validation, and
              deduplication; it does not provide career advice.
            </p>
          </SectionHeading>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
            {[
              {
                number: "1",
                title: "Fetch and parse",
                body: "Adapters fetch the six source groups concurrently and translate their JSON or README fields into one job shape.",
              },
              {
                number: "2",
                title: "Normalize",
                body: "Whitespace, markdown, and decorative symbols are cleaned. Employer aliases are explicit and legal suffixes are removed conservatively. Application URLs lose tracking parameters and normalize known ATS locale, apply/detail, hostname, and casing variants without dropping job-identifying parameters.",
              },
              {
                number: "3",
                title: "Filter",
                body: "Dated rows older than 120 days are removed; rows without a usable posting date remain eligible. Location parts must be recognized as U.S., a U.S. territory, generic U.S., or remote; foreign and unrecognized parts are discarded. A row stays only if an eligible part remains, while a truly blank source location remains eligible rather than being guessed.",
              },
              {
                number: "4",
                title: "Deduplicate",
                body: "Strong matches use canonical application URL, canonical employer plus requisition or external job ID, or a source-provided content fingerprint. A posting-date identity can resolve exact cross-source observations only when stronger IDs are absent. Title and location alone never merge listings.",
              },
              {
                number: "5",
                title: "Store evidence",
                body: "Each canonical record stores its original source, first and last observation, last source verification, canonical application URL, structured pay and sponsorship evidence, duplicate group, and explicit active, possibly-closed, or expired state.",
              },
            ].map((step) => (
              <li key={step.number} className="bg-bg p-5 sm:p-6">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft font-mono text-xs font-bold text-accent">
                  {step.number}
                </span>
                <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-xl border border-warning/35 bg-warning-soft p-5 text-sm leading-6 text-fg sm:p-6">
            <p className="font-bold text-warning">Known operational limit</p>
            <p className="mt-2">
              A source may mark its missing rows possibly closed only after
              reporting a successful, complete, nonempty snapshot. That
              protects against a failed fetch, but a silently partial parse
              that still reports success could hide valid rows until a later
              refresh. All six adapters still declare complete snapshots.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="03 · Evidence"
          title="Pay and sponsorship stay distinguishable from estimates"
        >
          <p>
            Timley makes the origin of these high-stakes details visible so
            users can decide what still needs verification.
          </p>
        </SectionHeading>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <article className="ui-card p-6 sm:p-8">
            <span className="ui-badge bg-success-soft text-success">
              Source-listed pay
            </span>
            <h3 className="mt-5 text-xl font-bold">Pay evidence</h3>
            <p className="mt-3 leading-7 text-muted">
              If an upstream listing supplies explicit salary or hourly-rate
              text, Timley preserves it as employer-listed pay evidence. Timley
              does not scrape or derive a salary from unrelated employer data.
              When pay is missing,
              the product may show a broad U.S. range based only on Timley&apos;s
              role category and internship or new-grad type. Those values are
              marked <strong className="text-fg">Est.</strong> and are not an
              employer quote, offer, or prediction.
            </p>
          </article>

          <article className="ui-card p-6 sm:p-8">
            <span className="ui-badge bg-info-soft text-info">
              Explicit source signal
            </span>
            <h3 className="mt-5 text-xl font-bold">
              Sponsorship information
            </h3>
            <p className="mt-3 leading-7 text-muted">
              Timley maps only explicit source text or source symbols into
              labels such as offers sponsorship, no sponsorship, or U.S.
              citizenship required. It does not infer a policy from an
              employer&apos;s history, industry, or location. When a source
              provides no usable signal, sponsorship remains unknown.
            </p>
          </article>
        </div>
      </section>

      <section className="border-t border-border bg-raised">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.35fr] lg:px-8">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              Reading freshness
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Observation is not a guarantee.
            </h2>
          </div>
          <div className="space-y-4 text-base leading-7 text-muted">
            <p>
              A source-supplied posting date is used when available. Otherwise,
              the date Timley first saw the row supports its relative age.
              &ldquo;Verified at source&rdquo; and &ldquo;Last verified&rdquo;
              mean Timley observed the listing in the named upstream feed.
              Timley does not currently perform a comprehensive live
              destination-link check, so these labels do not prove that an
              employer is still accepting applications.
            </p>
            <p>
              A listing absent from a successful complete source snapshot is
              marked <strong className="text-fg">Possibly closed</strong> and
              removed from active results. If it remains absent for 30 days,
              its stored state becomes <strong className="text-fg">Expired</strong>.
              Neither state is presented as employer-confirmed closure.
            </p>
            <p>
              Listing reports open a prefilled public GitHub issue for the user
              to review. Timley does not receive report text through its own
              backend; GitHub&apos;s sign-in and abuse controls apply.
            </p>
            <p>
              Before applying, open the employer&apos;s destination and verify
              the deadline, location, eligibility, pay, and sponsorship terms.
              The{" "}
              <a
                href="/status"
                className="font-semibold text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
              >
                data status page
              </a>{" "}
              reports only what the current visible database snapshot can
              establish. It withholds fetch health when live run data is not
              publicly readable.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
