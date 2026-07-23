# Trust engine pre-change audit

Recorded 2026-07-22 before Prompt 4 pipeline changes.

## Current source and refresh behavior

- Six public GitHub source groups are fetched concurrently: SimplifyJobs (internships and new grad), zshah101, zapplyjobs, Northwestern FinTech, speedyapply, and vanshb03.
- The checked-in Vercel schedule calls `/api/ingest` once daily at 12:00 UTC. One upstream feed says it rebuilds about every two hours, but Timley does not ingest on that upstream cadence.
- Every adapter is currently marked as a complete snapshot. Fetch failures are isolated, but a successful partial parse can still be treated as complete.
- The database records source-run results, but row-level security has no checked-in public read policy. The public status page therefore reports only active rows represented in the current read snapshot, not live ingest-run health.

## Current normalization and identity

- Text cleanup removes markdown, emoji, and repeated whitespace. Categories are assigned deterministically from title, then source category or adapter hint.
- Company identity is a generated slug with a broad suffix-removal list. That list removes legal suffixes but also meaningful words such as `capital`, `trading`, `space`, and `labs`, which can collapse distinct employers.
- Duplicate detection first compares a lightly cleaned URL, then `company|title|first location`. The URL cleaner removes only `utm_*`, `ref`, and `src`; it does not normalize locale routes, common ATS apply/detail variants, redirect wrappers, or broader tracking parameters.
- Title/location fallback can merge separate requisitions at one employer when title and first location match. Requisition IDs, external job IDs, posting dates, and content fingerprints are not considered.
- Database identity is the mutable fallback dedupe key. A URL, title, location, or company spelling change can create a new database record and break continuity.

## Current freshness, verification, and expiration

- `first_seen_at`, `last_seen_at`, and `is_active` exist. `last_seen_at` means the row appeared in an upstream community feed; it is not a check of the employer destination.
- There is no stored canonical application URL, last-verification timestamp, verification status, duplicate group, canonical record pointer, closed timestamp, or explicit expiration state.
- A successful nonempty complete snapshot immediately deactivates rows missing from that source. The row has no distinction between possibly closed, confirmed closed, and expired.
- Application destinations are not checked for dead links or closure markers. Timley cannot truthfully claim destination reachability.

## Current pay and sponsorship evidence

- speedyapply and zshah101 may provide salary text; other adapters generally do not. Timley does not extract pay from employer pages.
- Missing pay receives a broad category-and-role-type estimate. The UI visually separates source-provided pay from the Timley estimate, but the stored row has no pay-origin field.
- Sponsorship signals are mapped from explicit upstream text or symbols. Unknown values remain null, which is conservative, but the stored row has no structured status, evidence source, or confidence.

## User-facing and reporting gaps

- Job details show source, first seen, original posting date, and last observed, but cannot show a backed `Verified at source` timestamp or a defined possibly-closed/expired state.
- Cards show pay and sponsorship but no concise source-verification signal.
- There is no listing-specific report flow.
- `/methodology` and `/status` exist and avoid unsupported health claims, but they do not yet document the stronger identity model, explicit state machine, or the exact difference between source observation and destination checking.

