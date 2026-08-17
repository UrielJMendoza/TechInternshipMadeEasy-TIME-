import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";

const title = "Privacy";
const description =
  "How Timley handles browser data, sharing, product events, optional account continuity, exports, reminders, and saved-search alerts.";

export const metadata: Metadata = publicPageMetadata({
  title,
  description,
  path: "/privacy",
});

const localRecords = [
  {
    name: "Filter preferences",
    key: "timley:filters:v1",
    detail:
      "Your job filters. URL query parameters take priority when they are present.",
  },
  {
    name: "Filter update time",
    key: "timley:filters:updated-at:v1",
    detail:
      "When optional continuity handles filters, this adjacent timestamp lets the newest local or cloud filter set win without changing the established filter value.",
  },
  {
    name: "View preference",
    key: "timley:view",
    detail: "Your card or table density choice.",
  },
  {
    name: "Tracker view preference",
    key: "timley:tracker-view:v1",
    detail: "Your list or board choice for the application workspace.",
  },
  {
    name: "Saved jobs",
    key: "timley:saved",
    detail:
      "The application URLs you chose to bookmark. These URLs are included in a JSON backup you create.",
  },
  {
    name: "Application workspace",
    key: "timley:applications:v3",
    detail:
      "Your stages, dates, next actions, interview dates, personal notes, optional contact, compensation notes, location or work arrangement, and application URL. Older Timley stage and saved-job records are migrated locally when present.",
  },
  {
    name: "Saved searches",
    key: "timley:saved-searches:v1",
    detail:
      "The names, complete filters, frequencies, and channel choices you save. These are not included in a Tracker JSON backup.",
  },
  {
    name: "Saved-search deletion markers",
    key: "timley:saved-searches:tombstones:v1",
    detail:
      "Bounded local deletion markers that prevent an older browser-tab write from restoring a search you deleted.",
  },
  {
    name: "Search-alert inbox",
    key: "timley:search-alerts:v1",
    detail:
      "The local in-app inbox, per-search run times, and a bounded role-ID list used to avoid alerting the same role more than once.",
  },
  {
    name: "Search-alert browser setting",
    key: "timley:search-alerts:browser-enabled:v1",
    detail:
      "Whether you explicitly enabled foreground browser notices for saved searches. A search must also have its Browser channel enabled.",
  },
  {
    name: "Legacy company follows",
    key: "timley:followed-companies:v1",
    detail:
      "A bounded list created by the retired company pages. It stays in this browser until you clear local product data.",
  },
  {
    name: "Browser reminder setting",
    key: "timley:reminders:browser:v1",
    detail:
      "Whether you explicitly enabled Timley to use an already granted browser-notification permission.",
  },
  {
    name: "Reminder deduplication",
    key: "timley:reminders:last-notification:v1",
    detail:
      "A local date-and-item marker that prevents Timley from repeating the same foreground reminder that day.",
  },
  {
    name: "Optional continuity session",
    key: "timley:continuity:auth:v1",
    detail:
      "When account continuity is configured and you sign in, Supabase uses this browser key for its persistent PKCE authentication session. It is not created by anonymous browsing.",
  },
  {
    name: "Per-account sync preference",
    key: "timley:continuity:preference:v1:<user-id>",
    detail:
      "For a signed-in account, this stores whether first-sync consent was completed, the selected categories, and the last successful sync time. After consent, selected local changes can sync automatically while Timley is open.",
  },
  {
    name: "Per-account sync recovery",
    key: "timley:continuity:recovery:v1:<user-id>",
    detail:
      "A bounded pre-sync recovery envelope saved before any cloud write. It can include notes, contacts, or compensation notes when tracker data was selected.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg text-fg">
      <section className="border-b-2 border-fg bg-bg">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
            Privacy
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
            Local by default. Sync only when you choose it.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Browsing, saving roles, tracking applications, saved searches, and
            in-app alerts work without an account and start in this browser.
            Where account continuity is configured, signing in still uploads
            nothing until you explicitly select data categories and sync.
          </p>
          <p className="mt-5 font-mono text-xs text-faint">
            Last updated July 26, 2026
          </p>
        </div>
      </section>

      <section
        aria-labelledby="local-data"
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
      >
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              On your device
            </p>
            <h2 id="local-data" className="mt-3 text-2xl font-bold tracking-tight">
              Browser persistence
            </h2>
            <p className="mt-4 leading-7 text-muted">
              Timley uses your browser&apos;s local storage for these records.
              It does not silently send personal notes, contact information,
              saved searches, or alert history to a server.
            </p>
          </div>

          <div className="space-y-3">
            {localRecords.map((record) => (
              <article key={record.key} className="ui-card p-5 sm:p-6">
                <h3 className="font-bold">{record.name}</h3>
                <code className="mt-2 inline-block rounded-md bg-raised px-2 py-1 font-mono text-xs text-muted">
                  {record.key}
                </code>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {record.detail}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-sm border border-info/30 bg-info-soft p-6 sm:p-8">
          <h2 className="text-lg font-bold text-info">Control and deletion</h2>
          <div className="mt-3 max-w-3xl space-y-3 leading-7 text-fg">
            <p>
              Deleting an application removes that local record from the
              current browser. Archiving is different: an archived application
              remains stored locally and is included in later JSON backups.
              Previously downloaded files remain wherever you saved them until
              you remove those files.
            </p>
            <p>
              Clearing Timley&apos;s site data, using a private window, changing
              browsers, or changing devices can make unexported records
              unavailable. Unless you previously completed an explicit sync of
              the relevant category, there is no account copy to restore.
              Create a JSON backup before clearing browser data if you want a
              portable tracker copy.
            </p>
            <p>
              Deleting a saved search removes its settings and visible alerts.
              A bounded role-ID deduplication list remains until site data is
              cleared so the same role is not alerted twice. Signing out does
              not clear any of this browser-local data.
            </p>
            <p>
              If the account workspace offers and you choose Clear local data,
              Timley removes only its documented product-data and preference
              keys. It also removes legacy{" "}
              <code>timley:applications:v2</code> and{" "}
              <code>timley:applied</code> inputs so they cannot remigrate. The
              checkbox does not directly clear the continuity authentication
              session or recovery state; the provider handles its session
              and removes the deleted account&apos;s per-user sync preference
              and recovery keys after successful account deletion. Timley does
              not call a broad browser-storage clear or remove unrelated origin
              data.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              Your exports
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Backups, calendars, and notifications
            </h2>
            <p className="mt-4 leading-7 text-muted">
              These features start with an action you choose in the tracker.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">JSON backup</h3>
              <p className="mt-3 leading-7 text-muted">
                A JSON backup is created as a local download. It includes
                application records, personal notes, optional contact details,
                and saved-job URLs so you can restore them later. Treat the
                downloaded file as private.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">CSV and calendar files</h3>
              <p className="mt-3 leading-7 text-muted">
                CSV and ICS exports are generated as local downloads. Timley
                does not import them into another service for you. If you
                import an ICS file, the calendar app you select receives the
                event details in that file and handles them under its own
                privacy terms.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Browser notifications</h3>
              <p className="mt-3 leading-7 text-muted">
                Timley asks for notification permission only after you
                explicitly choose to enable tracker reminders or saved-search
                browser alerts. Tracker reminders are best-effort foreground
                notices in the tracker. Saved-search browser checks run only
                while the Alerts page is open, at most once per day unless you
                request a manual refresh. Your browser and operating system
                process the notification content and control how it appears.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Saved-search alerts</h3>
              <p className="mt-3 leading-7 text-muted">
                While the Alerts page is open, Timley refreshes its server jobs
                snapshot at most once per day or when you request a manual
                refresh, then evaluates due searches in your browser. Delivery
                history retains why a role matched, the triggering search, its
                frequency, and a filtered results link for both in-app and
                browser-only matches. Email alerts are scaffolded but
                unavailable, and Timley does not collect an email address for
                alert delivery.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Continuity recovery data</h3>
              <p className="mt-3 leading-7 text-muted">
                A sync plan creates bounded recovery data with the exact
                selected local state from before the merge and the intended
                merged state. If a browser write cannot finish after the cloud
                save, Timley can provide that recovery JSON. It may contain
                notes or contacts when tracker sync was selected, so treat it
                as private.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              Service data
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              What Timley processes to deliver the site
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Job listing records</h3>
              <p className="mt-3 leading-7 text-muted">
                Timley&apos;s server reads public job repositories and stores
                normalized listing fields in Supabase. Those records describe
                jobs and sources; they are not tied to a Timley user account.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Ordinary network metadata</h3>
              <p className="mt-3 leading-7 text-muted">
                Hosting and data-delivery providers may process routine request
                information, such as IP address, browser details, timestamps,
                and requested pages, to serve and protect the site under their
                own policies.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">
                Privacy-conscious product events
              </h3>
              <p className="mt-3 leading-7 text-muted">
                Timley can emit a small, provider-neutral set of product events
                for search, filters, job actions, saved searches, alerts,
                sharing, and tracker return visits. Search length and counts
                are bucketed. Events never include raw search text, saved-search
                names, company or job identity, public or private URLs,
                personal notes, contact information, or compensation notes.
                No analytics network destination is configured by this code.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">
                Optional account continuity
              </h3>
              <p className="mt-3 leading-7 text-muted">
                On a configured deployment, Supabase processes your email,
                authentication session, and the data categories you explicitly
                select for sync. Selecting tracker data includes application
                records, personal notes, and optional contacts; Timley warns
                about those fields before the first sync.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Company images</h3>
              <p className="mt-3 leading-7 text-muted">
                When a company image is available, your browser may request it
                from Vemetric&apos;s favicon service. Timley uses a
                no-referrer request and shows a letter fallback when an image
                cannot be loaded.
              </p>
            </article>
            <article className="ui-card p-6">
              <h3 className="text-lg font-bold">Third-party destinations</h3>
              <p className="mt-3 leading-7 text-muted">
                Source repositories and employer application pages have their
                own privacy practices. Their policies apply after you follow an
                external link from Timley.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
          <h2 className="text-2xl font-bold tracking-tight">
            Optional accounts and device access
          </h2>
          <div className="space-y-4 leading-7 text-muted">
            <p>
              Account continuity is available only when a deployment has
              Supabase authentication, the continuity database table and
              policies, email delivery, and allowed redirect URLs configured.
              If any required provider setup is missing, Timley keeps the
              feature unavailable rather than substituting credentials.
            </p>
            <p>
              Signing in never uploads browser data by itself. The first sync
              requires category selection. Merge keeps the newest application
              record for each role and unions set-like categories. Timley saves
              the merged cloud snapshot first and updates local data only after
              that save succeeds; if it fails, the existing browser copy
              remains available. If a later browser write is partial, the
              precomputed recovery data preserves both the pre-sync and intended
              merged states.
            </p>
            <p>
              Completing the first sync records consent for those selected
              categories. Later changes to selected data can sync automatically
              while Timley is open, including after focus returns. Change the
              category selection before editing if you no longer want a
              category included.
            </p>
            <p>
              The selectable cloud categories are saved-job URLs, application
              records, filter preferences, and saved searches. Search-alert
              inbox history, delivered-role IDs, browser-notification
              preferences, and tracker reminder markers are not included in
              the continuity snapshot. Tracker JSON backup is also separate
              from account continuity.
            </p>
            <p>
              Signing out ends the local account session but leaves browser
              data in place. When the server-side account-deletion credential
              is configured, deleting an account removes the Supabase account
              and its continuity snapshot, ends the local session, and removes
              that account&apos;s local sync preference and recovery envelope.
              Anonymous product data is separate and is cleared only if you
              make that additional choice. Previously downloaded exports remain
              wherever you saved them.
            </p>
            <p>
              Because local tracker data is readable by anyone with access to
              your browser profile, use your device&apos;s security controls on
              shared computers.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
