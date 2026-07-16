# TIME · Tech Internships Made Easy

`timley.dev` is a searchable board for US internships and new-grad roles drawn
from six maintained public job lists. It uses Next.js 16, React 19, Tailwind CSS
4, and Supabase.

Coverage is limited to listings the registered sources expose and that pass the
application URL, freshness, and explicit US-location checks. Source-listed pay
is not independently verified. Category estimates are visually secondary and
never participate in salary sorting.

## Architecture

```text
six-source registry
        │
        ▼
shared TypeScript adapters ── fetch limits · runtime schemas · normalization
        │
        ▼
Supabase Edge Function ── Bearer auth before adapter import
        │
        ▼
SECURITY INVOKER RPCs ── rate limit · lease · advisory lock · quarantine
        │
        ▼
jobs + job_sources ── immutable tracking_key · source observations
        │
        ▼
Next.js Server Component (30 rows) ── POST /api/jobs cursor pages
```

There is one scheduler: Supabase `pg_cron` invokes the committed `ingest` Edge
Function at minute 15 every two hours. Its URL and opaque credential live in
Supabase Vault. The Edge handler hashes the Bearer value and validates only the
digest through a service-role-only database function, so the credential is not
duplicated into Edge configuration. There is no Vercel cron. The Next.js ingest
route remains an authenticated manual recovery path and runs the same shared
ingestion module.

The initial page is queried on the server and contains 30 jobs. Search, filters,
sorting, counts, facets, and later cursor pages are database-backed; the full
catalog is not serialized into the initial React Server Component payload.
The default “Newest openings” order uses each listing's effective opening date.
Internships show normalized work-term badges such as Fall 2026 and Summer 2027,
including every explicit term when a source lists more than one. The Term filter
also exposes “Term not listed” instead of guessing from a posting date or a bare
year.

See [Architecture and trust boundaries](docs/architecture.md) for the detailed
data, security, and browser-state contracts.

## Sources

The typed registry in `src/lib/ingest/sourceRegistry.ts` is the canonical source
of source labels, feed URLs, parser versions, formats, response limits, and
expected markers.

| Source | Feed coverage |
| --- | --- |
| [SimplifyJobs](https://github.com/SimplifyJobs/Summer2026-Internships) | Internship and new-grad JSON feeds |
| [zshah101/Automated-List](https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships) | Internship JSON feed |
| [zapplyjobs/Internships-2027](https://github.com/zapplyjobs/Internships-2027) | Internship Markdown tables |
| [Northwestern Fintech / Quant](https://github.com/northwesternfintech/2027QuantInternships) | Quant and technical internship Markdown tables |
| [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs) | Internship and new-grad Markdown tables |
| [vanshb03/Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships) | Internship Markdown tables |

Upstream content is untrusted. Each adapter enforces a deadline, bounded retry
policy, maximum bytes, expected content types, runtime schemas, and source
markers. Ambiguous or non-US locations are rejected. An incomplete, invalid, or
anomalous source snapshot is quarantined and cannot deactivate jobs; a source
observation must be absent from two consecutive healthy snapshots before it can
become inactive.

## Local development

Prerequisites:

- Node.js 22 or newer
- npm
- Docker Desktop or another Docker-compatible daemon for local Supabase and
  database/browser tests

Install and start the app:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The app has no hardcoded Supabase project or credential fallback. A browser-only
development session needs these values in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is supported only as a compatibility alternative
to the publishable key. Never place a secret or service-role key in a
`NEXT_PUBLIC_` variable.

For the complete local stack, start Supabase and inspect its local-only values:

```bash
npx supabase start
npx supabase status -o env
npm run test:db
npm run types:check
```

The hosted application needs only the two browser-safe values above. Local or
manual ingestion additionally uses `SUPABASE_URL` and either
`SUPABASE_SECRET_KEY` or the legacy-compatible `SUPABASE_SERVICE_ROLE_KEY`; the
fail-closed Next.js manual ingestion route also uses `CRON_SECRET`. Production
ingestion instead runs through the Supabase Edge scheduler, whose opaque
credential exists only in Supabase Vault and whose code identity is always the
reviewed artifact checksum. Keep optional server values unprefixed and out of
Git.

Do not run `npm run ingest` against an environment until you have confirmed that
`SUPABASE_URL` points to the intended local or explicitly approved target. It
fetches live upstream feeds and writes through the service client.

## Generated database types

`src/lib/database.types.ts` is generated from the reset local Supabase schema.
Do not hand-edit it or replace its types with database casts.

```bash
npx supabase start
npm run test:db
npm run types:generate
npm run types:check
```

Review the generated diff before keeping it. Type generation never needs a
production connection.

## Browser-owned application data

Roles starred into the user-facing **To apply** collection and application
stages are keyed by the immutable database `tracking_key`, not by an application
URL. This is the existing saved-role data under a clearer label, so the UI
change does not require users to migrate or re-enter anything. Versioned,
idempotent migrations map known legacy URLs through a bounded digest-only alias
resolver and retain unmatched records for later recovery. The resolver exposes
only a caller-supplied SHA-256 digest and the same opaque tracking key already
used by public job rows; the private alias table and raw URLs remain hidden.
Cross-tab changes merge by timestamp.

Saved-role state, removal tombstones, application stages, notes, follow-up
dates, deadlines, recruiter/contact data, and unmatched legacy records can be
exported and imported together as validated JSON or CSV. Former
application-only backups remain import-compatible. This data stays in the
browser; there is no account or cloud sync. A deployment or application
rollback must never clear these storage keys.

Company logos are shown only for high-confidence ingested company domains. The
browser requests the same-origin `/api/company-logo` proxy, which validates the
domain and bounded PNG response and adds shared caching. Missing or failed logos
fall back to a letter avatar.

## Validation and releases

Available checks and their prerequisites are documented in
[Testing and CI](docs/testing.md). Running commands is not evidence by itself;
record each exit status and retain Playwright reports/screenshots for review.

Production changes are intentionally manual and protected. CI has read-only
repository permissions and contains no database push, secret update, function
deployment, Vercel deployment, or production ingest step.

Before any production mutation, follow the gated
[Production migration, release, and rollback runbook](docs/production-runbook.md).
It requires review of the complete diff, migration dry run, generated artifacts,
test results, screenshots, secret-rotation plan, and rollback decision. Stop at
its review gate unless an authorized operator explicitly approves the release.

## Security summary

- Cron authentication accepts `Authorization: Bearer` only and fails closed.
- Authentication completes before any source adapter import or upstream fetch.
- Publishable clients are read-only under RLS. The only private-table exception
  is the bounded digest-only legacy alias resolver, which returns no URLs or
  user data; service credentials remain server-only.
- Ingestion mutation RPCs are `SECURITY INVOKER` and executable only by
  `service_role`; one private `SECURITY DEFINER` helper validates a hashed Vault
  credential and returns only a boolean.
- Public and authenticated roles cannot read private `app_meta` data or mutate
  canonical jobs.
- A durable lease, transaction advisory lock, and minimum interval prevent
  overlapping or abusive ingest runs.
- The Edge Function imports the shared runner directly. A generated source
  checksum identifies the exact deployed ingestion artifact; the Git commit is
  recorded separately as the surrounding release identity.
- Secrets are absent from migrations, URLs, query strings, logs, and committed
  configuration.

Report a security issue privately to the repository maintainers. Do not include
credentials, production records, or sensitive request headers in a public issue.
