import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";

const title = "Terms";
const description =
  "Terms for using Timley's public job-discovery and application-tracking service.";

export const metadata: Metadata = publicPageMetadata({
  title,
  description,
  path: "/terms",
});

const sections = [
  {
    title: "What Timley provides",
    body: (
      <>
        Timley organizes job listings from public sources and provides local
        application-tracking tools. It is not an employer, recruiter,
        employment agency, or AI career-coaching service. Using Timley does not
        create an employment or advisory relationship.
      </>
    ),
  },
  {
    title: "Verify before you act",
    body: (
      <>
        Listings can be incomplete, changed, duplicated, or closed. Confirm the
        role, deadline, location, eligibility, compensation, and sponsorship
        terms on the employer&apos;s application page. Estimates are labeled
        and are not employer offers. Timley does not guarantee interviews,
        offers, or any other outcome.
      </>
    ),
  },
  {
    title: "Third-party sources and links",
    body: (
      <>
        Public repository maintainers and linked employers control their own
        content and destinations. Their terms and privacy practices apply when
        you visit them. Their appearance on Timley does not imply a partnership
        or endorsement.
      </>
    ),
  },
  {
    title: "Local data and optional continuity",
    body: (
      <>
        Saved jobs, filters, application records, saved searches, and alerts
        start in your browser. Timley does not silently send notes, contacts,
        or other browser data to its servers. Where account continuity is
        configured, signing in alone uploads nothing: you must select
        categories and start the first sync. Selecting tracker data includes
        personal notes and optional contacts and is labeled accordingly. Alert
        inbox history and browser-notification preferences are not synced.
      </>
    ),
  },
  {
    title: "Sync, sign-out, and account deletion",
    body: (
      <>
        Sync merges the newest application record per role and unions set-like
        data. Timley saves the cloud snapshot before applying the merge to this
        browser, so a failed cloud save does not replace the local copy.
        Recovery data can contain every selected field and should be handled
        like a private backup. Signing out leaves local data in place. On
        deployments with the required server-side credential, account deletion
        removes the Supabase account and cloud snapshot plus that account&apos;s
        local sync preference and recovery envelope; clearing separate
        anonymous product data is an additional optional action.
      </>
    ),
  },
  {
    title: "Backup and export",
    body: (
      <>
        JSON backups, CSV exports, and ICS files are local downloads you
        request. A JSON backup includes application records, notes, optional
        contacts, and saved-job URLs. Importing an ICS file gives its event
        details to the calendar app you choose, whose terms and privacy
        practices then apply.
      </>
    ),
  },
  {
    title: "Alerts, reminders, archives, and deletion",
    body: (
      <>
        Notification permission is requested only after you choose to enable
        tracker reminders or saved-search browser alerts. They are
        best-effort foreground notices while Timley is open; no background
        push service is implemented. Email alerts are unavailable. Deleting an
        application removes its local record. Archiving keeps it locally and
        in later JSON backups. Clearing site data can permanently remove
        unexported records.
      </>
    ),
  },
  {
    title: "Acceptable use",
    body: (
      <>
        Use Timley lawfully and do not attempt to disrupt the service,
        circumvent access controls, introduce malicious code, or misuse source
        or employer systems reached through the site.
      </>
    ),
  },
  {
    title: "Availability and changes",
    body: (
      <>
        Timley is provided on an as-available basis. Features, sources, and
        these terms may change as the product evolves. Material changes will be
        reflected by an updated date on this page.
      </>
    ),
  },
] as const;

export default function TermsPage() {
  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg text-fg">
      <section className="border-b border-border bg-raised">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
            Terms
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
            Straightforward terms for a focused product.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            These terms cover Timley&apos;s public job-discovery,
            browser-local application tracking, alerts, and optional account
            continuity.
          </p>
          <p className="mt-5 font-mono text-xs text-faint">
            Last updated July 22, 2026
          </p>
        </div>
      </section>

      <section
        aria-label="Timley terms"
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section, index) => (
            <article key={section.title} className="ui-card p-6 sm:p-7">
              <p className="font-mono text-xs font-bold text-accent">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-3 text-xl font-bold tracking-tight">
                {section.title}
              </h2>
              <p className="mt-3 leading-7 text-muted">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-border bg-raised p-6 sm:p-8">
          <h2 className="text-xl font-bold">Questions about the data?</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            Review the{" "}
            <a
              href="/methodology"
              className="font-semibold text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
            >
              methodology
            </a>{" "}
            for source and labeling rules, and the{" "}
            <a
              href="/status"
              className="font-semibold text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
            >
              data status
            </a>{" "}
            page for the current visible snapshot.
          </p>
        </div>
      </section>
    </main>
  );
}
