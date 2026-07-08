# TIME · Tech Internships Made Easy

A live, searchable board of **2027 tech internships and new grad roles**, auto-updated
from maintained GitHub lists. Built with Next.js (App Router), Supabase and Tailwind,
deployed on Vercel.

## How it works

```
GitHub source lists ──▶ ingestion (fetch → parse → normalize → dedupe)
                              │  upsert via secret-gated Postgres RPC
                              ▼
                    Supabase `internships` table
                              │  public read (RLS)
                              ▼
                  Next.js board (tabs · search · filters · sort)
                              +
                  daily Resend email digest of newly-seen roles
```

### Data sources

| Source | Format | Feeds |
|---|---|---|
| [zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships](https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships) | JSON API (`docs/api/jobs.json`) | Internships |
| [vanshb03/Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships) | README markdown table | Internships |
| [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs) | README + `NEW_GRAD_USA.md` tables | Internships + New Grad |

Rows are deduped across sources by normalized `company + title + location`.
Roles that disappear from every source are marked inactive (not deleted), so the
board only shows live postings.

## Development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

### Environment variables

See [.env.example](.env.example). `CRON_SECRET` must match the value stored in the
`app_meta` table (`cron_secret` key) in Supabase — writes go through `security definer`
RPCs (`ingest_upsert`, `digest_take`) gated on that secret, so no service-role key is
ever deployed.

### Ingestion

```bash
npm run ingest        # one-off: fetch all sources and upsert into Supabase
```

In production it runs on a schedule (no action needed):

- **Vercel Cron** (`vercel.json`): daily ingest at 12:00 UTC, daily digest at 12:30 UTC.
- **Supabase pg_cron**: hits `/api/ingest` every 2 hours for fresher data than the
  Hobby-plan daily cron allows.

Trigger manually: `curl "https://<deployment>/api/ingest?key=$CRON_SECRET"`

### Email digest

`/api/digest` emails a plain-text summary of roles first seen since the previous
digest, via [Resend](https://resend.com). Set `RESEND_API_KEY`, `DIGEST_TO` and
(once you've verified a domain in Resend) `DIGEST_FROM`. Without a key the route
no-ops gracefully.
