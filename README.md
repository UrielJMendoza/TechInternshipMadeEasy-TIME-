# TIME · Tech Internships Made Easy

A live, searchable board of **2027 tech internships and new grad roles**, auto-updated
from maintained GitHub lists. Built with Next.js (App Router), Supabase and Tailwind.

## How it works

```
GitHub source lists ──▶ ingestion (fetch → parse → normalize → dedupe)
      every 2h               │  upsert via secret-gated Postgres RPC
 (Supabase pg_cron ──▶       ▼
  'ingest' edge fn)   Supabase `internships` table
                             │  public read (RLS)
                             ▼
                 Next.js board (tabs · search · filters · sort)
```

Two ingestion paths run the **same parser code**:

- **Supabase-side (always on):** a pg_cron job (`ingest-listings`, `15 */2 * * *`)
  invokes the `ingest` edge function every 2 hours. This keeps data fresh with no
  other infrastructure. The edge function source is generated from `src/lib/ingest`
  — if you change the parsers, redeploy it.
- **Vercel-side (optional):** `vercel.json` schedules `/api/ingest` daily
  (Hobby-plan cron granularity). Requires a `CRON_SECRET` env var on Vercel.

### Data sources

| Source | Format | Feeds |
|---|---|---|
| [zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships](https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships) | JSON API (`docs/api/jobs.json`) | Internships |
| [vanshb03/Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships) | README markdown table | Internships |
| [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs) | README + `NEW_GRAD_USA.md` tables | Internships + New Grad |

### Deduplication

The same job appears across sources with cosmetic differences, so dedupe runs in
two passes (`src/lib/ingest/normalize.ts`):

1. **Apply URL** — identical link (after stripping tracking params) is always the
   same job.
2. **Fuzzy key** — `company|title|location` where the company drops corporate
   suffixes ("Varda Space" → "varda"), the title drops season/year noise
   ("(Fall 2026)"), and the location reduces to the first city with state/country
   tokens removed ("San Mateo, California, United States" → "san-mateo").

Roles that disappear from every source are marked inactive (not deleted), so the
board only shows live postings.

## Deploying the site (one-time)

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repo.
   No configuration is required — the site works immediately (the Supabase URL and
   publishable key are public-by-design fallbacks in `src/lib/supabase.ts`).
2. *(Optional, enables the daily Vercel backup cron)* In Project → Settings →
   Environment Variables, add `CRON_SECRET` = the value stored in Supabase
   `app_meta` (`cron_secret` key).

## Development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

### Ingestion

```bash
npm run ingest        # one-off: fetch all sources and upsert into Supabase
```

Trigger the deployed route manually:

```bash
curl "https://<deployment>/api/ingest?key=$CRON_SECRET"
```

### Security model

The browser and the Next.js server only ever hold the *publishable* Supabase key,
which RLS limits to reading listings. All writes go through a `security definer`
Postgres function (`ingest_upsert`) that checks a secret stored in the `app_meta`
table — the Supabase service-role key never leaves Supabase.
