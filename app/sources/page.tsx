import type { Metadata } from "next";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getFeedStats } from "@/lib/jobs";

export const metadata: Metadata = {
  title: "Sources & freshness · Timley",
  description: "See where Timley finds jobs, when each source last updated, and how exact duplicates are handled.",
};

function initials(name: string) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function updateAge(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
}

export default function SourcesPage() {
  const stats = getFeedStats();

  return (
    <main id="main-content">
      <SiteHeader active="sources" />
      <section className="page-intro sources-hero">
        <div className="sources-heading-row">
          <div>
            <h1>Sources and freshness</h1>
            <p>Timley keeps employer posting dates, discovery dates, and source health separate, so every freshness label means what it says.</p>
          </div>
        </div>
      </section>

      <section className="sources-content" aria-labelledby="source-list-title">
        <div className="demo-notice">
          <span>Data note</span>
          <div><strong>Prototype catalog.</strong> These representative source records demonstrate Timley&apos;s shared-catalog behavior and can be replaced with production source configuration when live ingestion is connected.</div>
        </div>
        <div className="sources-table-wrap">
          <table className="sources-table">
            <caption id="source-list-title" className="sr-only">Timley source status</caption>
            <thead>
              <tr><th>Source</th><th>Source type</th><th>Last successful update</th></tr>
            </thead>
            <tbody>
              {stats.sourceHealth.map((source) => (
                <tr key={source.id}>
                  <td><div className="source-name"><span className="source-monogram" aria-hidden="true">{initials(source.name)}</span>{source.name}</div></td>
                  <td className="source-type">{source.typeLabel}</td>
                  <td className="source-success">{updateAge(source.lastSuccessfulUpdateAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="method-register">
          <div>
            <dt>Posting dates</dt>
            <dd>“Posted” always refers to an employer-provided date. When a source has no date, Timley says “Newly found” instead.</dd>
          </div>
          <div>
            <dt>Duplicate policy</dt>
            <dd>Timley combines records only when the ATS host, canonical employer, and trusted requisition ID agree. Uncertain lookalikes stay separate.</dd>
          </div>
          <div>
            <dt>Applications</dt>
            <dd>Every Apply button opens the employer’s own application page. Timley never asks you to upload a résumé or create an account.</dd>
          </div>
        </dl>

        <aside className="method-note">
          <h2>How source preference works</h2>
          <p>When an official employer source and a community feed contribute the same exact requisition, Timley shows the official employer application while retaining the other contributing sources for transparency. Title or location similarity alone never triggers an automatic merge.</p>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}
