import type { Metadata } from "next";
import { SOURCE_REGISTRY } from "@/supabase/functions/ingest/lib/ingest/sourceRegistry";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "How Timley works · Sources, dates, and ranking",
  description: "How Timley finds, verifies, deduplicates, dates, and ranks internships and new-grad jobs.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <main id="main-content">
      <SiteHeader />
      <article className="method-shell">
        <header className="method-intro">
          <p className="eyebrow">Methodology</p>
          <h1>How Timley works</h1>
          <p>
            Timley is built to make early-career listings easier to search without
            making stronger claims than the underlying source can support.
          </p>
        </header>

        <div className="method-sections">
          <section id="sources">
            <h2>Where jobs come from</h2>
            <p>
              Timley combines configured employer job boards with clearly named
              community discovery lists. Every result opens the employer’s
              application page, and source labels describe how Timley found it.
            </p>
            <ul>{Object.values(SOURCE_REGISTRY).map(source => <li key={source.id}><a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul>
          </section>

          <section>
            <h2>What the date labels mean</h2>
            <dl>
              <div>
                <dt>Posted</dt>
                <dd>The date came from a configured employer job board.</dd>
              </div>
              <div>
                <dt>Source reports</dt>
                <dd>A community source supplied the date; Timley has not treated it as employer-verified.</dd>
              </div>
              <div>
                <dt>Found by Timley</dt>
                <dd>No usable posting date was available, so Timley shows when the listing was first observed.</dd>
              </div>
            </dl>
            <p>
              A source date newer than Timley’s first observation is called out as
              a possible repost or source update. It is not silently presented as
              a brand-new job.
            </p>
          </section>

          <section>
            <h2>How duplicates are removed</h2>
            <p>
              Timley merges exact provider-native identities—such as the same
              employer board and requisition ID across URL variants. Similar
              company names, titles, or locations alone are never enough to merge
              two jobs because employers can publish distinct, look-alike openings.
            </p>
          </section>

          <section>
            <h2>How results are ordered</h2>
            <p>
              A verified employer date can determine recency. Otherwise Timley
              uses the earlier of its first observation and the source-reported date.
              Importing an older listing or changing an unverified date cannot make
              it newly posted. Jobs in the same recency group are grouped by company so related recent
              openings stay close together.
            </p>
          </section>

          <section>
            <h2>How eligibility is described</h2>
            <p>
              A senior-sounding title alone does not exclude graduates. Employer
              requirements take precedence. Shortened source titles are labelled
              instead of being presented as complete, and missing descriptions or
              compensation are not invented.
            </p>
          </section>

          <section>
            <h2>Availability and privacy</h2>
            <p>
              If the live data service is unavailable, Timley keeps search usable
              with the last verified bundled snapshot and continues checking in
              the background. Saves, application statuses, and notes stay in this
              browser. Timley does not collect résumés or application data.
            </p>
          </section>
        </div>

        <div className="method-actions">
          <a className="button primary" href="/jobs">Browse jobs</a>
          <a className="text-link" href="/">Back to Timley</a>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
