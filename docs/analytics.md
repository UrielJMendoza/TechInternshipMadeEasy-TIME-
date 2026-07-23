# Privacy-conscious product analytics

Timley exposes a small, typed event contract for understanding whether core product loops work. The implementation is provider-neutral: it dispatches a `timley:analytics` browser event and, only when the host has already supplied `window.dataLayer`, appends the same bounded event. This repository does not configure an analytics vendor or network destination.

## Event contract

| Event | Allowed fields |
| --- | --- |
| `search` | role type, query-length bucket, result-count bucket |
| `filter` | filter group, enabled state, selection-count bucket |
| `job_opened` | surface, role type, Timley category |
| `apply_clicked` | surface, role type, Timley category |
| `job_saved` | surface, role type, Timley category, saved/unsaved state |
| `stage_changed` | surface, previous stage, next stage |
| `search_saved` | cadence, in-app/browser channel flags, public-filter-count bucket |
| `alert_enabled` | in-app or browser channel, enabled state |
| `collection_shared` | copy/native method, collection kind, public-filter-count bucket |
| `tracker_revisited` | local-record-count bucket |

Count buckets are `0`, `1`, `2-5`, `6-20`, `21-50`, and `51+`. Query-length buckets are `0`, `1-3`, `4-10`, `11-30`, and `31+`.

## Prohibited data

Event APIs do not accept arbitrary property bags. Do not add raw search text, saved-search names, job titles, company names, listing IDs, application or share URLs, tracker notes, contacts, email addresses, compensation notes, or exported-record contents. The existing event functions intentionally use role type, category, surface, state transitions, flags, and coarse buckets instead.

Private tracker state also stays out of shared URLs. Public job links allowlist public search criteria and remove saved-only state, application stages, and application-stage sorting.

## Delivery, consent, and retention

By default, events remain in the page as browser events and are not sent by this module. A deployment that connects a vendor is responsible for disclosing that vendor, establishing the appropriate consent basis, limiting access, and setting a short documented retention period. The vendor adapter must consume only the fields above; it must not enrich them with Timley tracker storage or account-continuity snapshots.

The source contract lives in `src/lib/analytics.ts`. Privacy-facing language lives on `/privacy`.
