# Timley · Job discovery and application tracking

A searchable board of **internship and new-grad listings** collected from public
lists. Normalization excludes explicitly non-US listings while retaining rows
without usable location data. Built with Next.js, Supabase, and Tailwind.

Public browsing, saved jobs, the application tracker, saved searches, and
in-app alerts work anonymously from browser storage. A deployment may
optionally configure Supabase account continuity, but signing in never uploads
browser data by itself.

Public discovery pages are generated from the real active snapshot. They cover
adequately populated role types, categories, explicit remote and sponsorship
evidence, canonical locations, allowlisted hiring seasons, jobs first observed
this week, and unaffiliated campus filter bundles. Thin or stale collections
stay out of the directory and sitemap.

## How it works

```
6 community lists ─┐
                   ├─▶ Supabase Edge ingestion ─▶ canonical `jobs` +
3 official ATS ────┘      (guarded + audited)       `job_sources`
                                                         │
                                      `timley_public_jobs` read model
                                                         │
                                                         ▼
                                     Next.js board, tracker, and alerts
```

The checked-in Supabase Edge Function is the only production writer. Supabase
`pg_cron` runs the six community feeds at 06:15 and 18:15 UTC and the three
official ATS feeds at 00:45 and 12:45 UTC. The two daily attempts are
non-overlapping, so a transient upstream failure gets a second chance without
returning to the previous high-cost schedule. Vercel does not run ingestion.

Every source is evaluated independently. A healthy source can publish even if
another source fails, while failed, partial, malformed, or anomalous snapshots
cannot deactivate that source's prior listings. See
[`docs/ingestion-operations.md`](docs/ingestion-operations.md) for deployment,
health checks, and incident procedures. `npm run ingest` remains a local parser
diagnostic for the older compatibility implementation; it is not the
production writer.

### Data sources

| Source | Format | Feeds |
|---|---|---|
| [SimplifyJobs/Summer2026-Internships](https://github.com/SimplifyJobs/Summer2026-Internships) + [New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions) | JSON DB (`.github/scripts/listings.json`) | Internships + New Grad |
| [zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships](https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships) | JSON API (`docs/api/jobs.json`) | Internships |
| [zapplyjobs/Internships-2027](https://github.com/zapplyjobs/Internships-2027) | Maintained README tables | Engineering, business, tech, and more |
| [northwesternfintech/2027QuantInternships](https://github.com/northwesternfintech/2027QuantInternships) | Auto-generated README tables | Quant, finance, software, and hardware internships |
| [vanshb03/Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships) | README markdown table | Internships |
| [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs) | README + `NEW_GRAD_USA.md` tables | Internships + New Grad |
| [Tenstorrent University](https://job-boards.greenhouse.io/tenstorrentuniversity) | Greenhouse API | Official internships and early-career roles |
| [Notion](https://jobs.ashbyhq.com/notion) | Ashby API | Official internships and early-career roles |
| [Hermeus](https://jobs.lever.co/hermeus) | Lever API | Official internships and early-career roles |

The SimplifyJobs feeds include active and inactive listing history; the parser
keeps only `active` + `is_visible` rows, and — for
internships — those whose term hasn't already passed, so stale cycles fall off
on their own without a hard-coded season allowlist.

### Deduplication

The same job appears across sources with cosmetic differences, so dedupe runs in
two passes (`src/lib/ingest/normalize.ts`):

1. **Apply URL** — identical link (after stripping tracking params) is always the
   same job.
2. **Fuzzy key** — `company|title|location` where the company drops corporate
   suffixes ("Varda Space" → "varda"), the title drops season/year noise
   ("(Fall 2026)"), and the location reduces to the first city with state/country
   tokens removed ("San Mateo, California, United States" → "san-mateo").

A source can deactivate listings only after it returns a successful, complete,
schema-valid, non-quarantined snapshot. Guards cover missing source markers,
empty output, malformed payloads, excessive rejection rates, and unexpected
count changes. Historical comparisons are scoped to the parser version so a
reviewed parser upgrade can establish a new baseline without weakening the
absolute safeguards. A failed source leaves its prior listings active, and
every attempt is retained in Supabase audit tables. Listings with an explicit
non-US location are excluded, and dated postings older than 120 days are
dropped. Listings without usable location or posting-date data are retained.

## Deploying the site (one-time)

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repo.
   Configure `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for your own project; never reuse
   Timley's hosted credentials in a fork.
2. Apply the checked-in Supabase migrations in timestamp order, deploy
   `supabase/functions/ingest`, then follow the secret and scheduler release
   checklist in [`docs/ingestion-operations.md`](docs/ingestion-operations.md).

### Optional account continuity

Continuity is fail-closed and separate from the public-jobs client. Do not
invent or reuse fallback credentials. To enable it:

1. Apply
   `supabase/migrations/20260723000000_add_optional_continuity.sql` to the same
   Supabase project. It creates the one-snapshot-per-user table, ownership
   policies, and account-deletion relationship.
2. Enable Supabase email/password authentication. Configure production SMTP,
   the Site URL, and every verification/password-recovery redirect URL for the
   exact deployed origins before inviting users.
3. Set these browser-safe environment variables:

   ```text
   NEXT_PUBLIC_TIMLEY_CONTINUITY_PROVIDER=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<browser-publishable-key>
   ```

   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is supported as the legacy browser-key
   alternative. Never place a service-role or secret key in a
   `NEXT_PUBLIC_` variable.
4. To make account deletion available, set
   `NEXT_PUBLIC_TIMLEY_ACCOUNT_DELETION_AVAILABLE=1` to declare the capability
   to the browser UI, plus the server-only
   `TIMLEY_ACCOUNT_DELETION_ENABLED=true` and
   `SUPABASE_SERVICE_ROLE_KEY=<server-service-role-key>` values that enforce
   deletion. The public flag only exposes the confirmed deletion flow; it
   cannot authorize deletion by itself. The URL and public key must identify
   the same project used by browser continuity. Without the complete
   server-side configuration, the deletion endpoint remains unavailable.

The first sync requires the user to choose data categories. Tracker sync
explicitly warns that it includes personal notes and optional contacts. Merge
keeps the newest application record per role and unions set-like data; the
cloud snapshot is saved before merged data replaces the local copy. Sign-out
leaves browser data in place. Account deletion removes the Supabase account and
cloud snapshot when configured; clearing browser data is a separate optional
choice. Eligible cloud categories are saved-job URLs, application records,
filter preferences, and saved searches. Alert inbox history and notification
preferences remain browser-only. Each sync plan also creates bounded recovery
data containing the exact pre-sync local state and intended merged state; treat
recovery JSON as private when tracker data was selected.

After a successful first sync, the per-account category choice and consent are
remembered. Changes to selected categories can sync automatically while Timley
is open or returns to focus. Signing out leaves both product data and the
per-account preference/recovery data in this browser. Successful account
deletion removes the account's auth session, sync preference, and recovery
envelope; the separate anonymous product-data checkbox remains optional.

The account workspace's optional local-product-data clear removes an
explicit allowlist of filters, view preferences, saves, current and legacy
application data, saved searches, alerts, and reminder preferences. The
provider owns continuity-session cleanup. The product-data checkbox does not
call `localStorage.clear()` or `sessionStorage.clear()` and does not erase
unrelated origin data.

### Saved-search alerts

Saved searches and alert delivery history remain local and anonymous. While
the `/alerts` page is open, it refreshes the server-rendered jobs snapshot at
most once per day (or when the user requests a manual refresh), then evaluates
due searches and globally deduplicates roles. Every delivered in-app or browser
match remains inspectable with its reasons, triggering search, frequency, and
filtered-results link. Browser notices require both a per-search Browser
channel and a separate explicit permission action. Other Timley routes do not
run saved-search delivery; there is no service worker or background push
backend. Email alerts are scaffolded but unavailable.

### Public pages, sharing, and analytics

Stable public job-detail URLs use the database UUID. Active details can publish
`JobPosting` structured data; recently removed source observations remain
available for at most 90 days, suppress Apply and `JobPosting`, and use
`noindex`. Collection pages publish `ItemList`, and visible breadcrumbs have
matching breadcrumb data. `robots.txt` and the data-driven XML sitemap exclude
private workspaces, filtered query variants, thin collections, and expired
records. The shared public snapshot is cached across requests. Large public
pages, the public feed, and the sitemap use a six-hour fallback, keeping average
observation lag near three hours without coupling Supabase writes to Vercel
cache regeneration. Dynamic listing and collection paths enter that cache on
demand rather than being prebuilt in bulk.

Deployments using company history must apply
`20260723150000_allow_recent_public_job_history.sql` and
`20260723153000_consolidate_public_job_read_policy.sql`. Together they add the
closed-time index and one RLS policy that preserves the existing active
U.S./120-day read boundary while exposing only U.S.-eligible rows closed during
the last 90 days.

Copy and native sharing use an allowlisted public URL serializer. Saved-only
state, application stages, application-stage sorting, tracker notes, and
contacts never enter public URLs. Company follows are a bounded browser-local
slug list. Campus collections are generic, unaffiliated filter bundles because
the dataset has no institution-affiliation field.

The typed analytics contract is documented in
[`docs/analytics.md`](docs/analytics.md). It emits provider-neutral browser
events with coarse buckets and no raw search text, job or company identity,
URLs, saved-search names, notes, contacts, or compensation notes. This
repository configures no analytics network destination.

## Development

```bash
npm install
npm run dev
```

Run the complete verification suite without assuming a fixed test count:

```bash
npm run lint
npm run typecheck
npm test
npm run build -- --webpack
```

### Ingestion

```bash
npm run ingest:artifact:check  # verify the reviewed Edge artifact manifest
npm run ingest                 # local compatibility-parser diagnostic only
```

Production ingestion is operated through Supabase Edge and `pg_cron`, not a
public Next.js route. Do not place the ingestion Bearer secret in source,
Vercel browser variables, SQL job arguments, or URLs. See the operations guide
for the exact release order and private per-source health query.

### Security model

The browser and the Next.js server use a *publishable* Supabase key and read the
security-invoker `timley_public_jobs` view. The Edge Function verifies a
Vault-backed Bearer secret before importing adapters or fetching upstream data,
then writes with the server-only service role through a guarded snapshot
function. The legacy public ingestion RPC is not executable by browser roles.
Row-level security exposes only active eligible jobs and a bounded 90-day
history needed for stable detail pages.

Optional continuity uses a separate, explicitly configured browser client with
persistent PKCE authentication and user-owned snapshot rows. The
`SUPABASE_SERVICE_ROLE_KEY` is used only by the server-side account-deletion
route after it validates the caller; it must never be exposed to the browser.
