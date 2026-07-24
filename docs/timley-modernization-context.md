# Timley modernization context

Updated 2026-07-24 after the landing visual refresh.

## Product guardrails

Timley is a job-discovery and application-tracking utility, not a career-AI platform. Job browsing stays public and account-free. Preserve search, filters, job data, saves, application stages, URL state, and browser storage unless a later prompt explicitly changes them. Do not make unproved coverage, speed, outcome, usage, testimonial, or employer-relationship claims. Background automation may normalize, categorize, verify source observations, and deduplicate listings; it must not become AI career coaching.

## Stack, routes, and deployment

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4/PostCSS, Hanken Grotesk Variable, Supabase JS, npm.
- `/`: 5-minute ISR marketing landing page built from the same active listing snapshot as the product.
- `/jobs`: 5-minute ISR job-discovery application with compact card and semantic table results, responsive filtering, and an internal job-detail drawer.
- `/jobs/[id]`: stable database-UUID detail page. Legitimate active records are indexable and can emit `JobPosting`; recently removed records are retained for at most 90 days with no Apply action, no `JobPosting`, and `noindex`; unknown or older records are 404.
- `/discover` and `/discover/[slug]`: data-backed role-type, category, remote, explicit-sponsorship, location, allowlisted-season, and first-observed-this-week collections. Known thin pages render truthfully with `noindex`; only adequate, fresh collections enter directories and the sitemap.
- `/discover/locations` and `/discover/seasons`: directories containing only currently indexable collections.
- `/companies` and `/companies/[slug]`: company observation directories and detail pages built from active roles plus bounded recently removed source observations. Pages never imply endorsement.
- `/collections/campus` and `/collections/campus/[slug]`: generic, unaffiliated public filter bundles. Timley has no institution-affiliation field and makes no campus-specific claim.
- `/tracker`: 5-minute ISR shell for the complete browser-local application workspace, with list and board views, actions, reminders, editing, exports, and restore joined to the current active feed.
- `/alerts`: 5-minute ISR shell for local saved-search evaluation, inspectable in-app/browser delivery history, channel and frequency controls, filter editing, and optional foreground browser notices. While this page is open, it requests a coalesced server-component refresh about every five minutes and when focus or visibility returns.
- `/account`: public optional-continuity workspace. Anonymous/local use remains available when the provider is absent; configured deployments expose sign-up, sign-in, recovery, category-selected sync, sign-out, and separated account/local-data deletion.
- `/methodology` and `/status`: retired public pages that redirect cleanly to `/jobs`; neither appears in navigation, metadata, internal links, or the sitemap.
- `/changelog`, `/privacy`, and `/terms`: working footer destinations.
- `/api/ingest`: unchanged secret-gated GET/POST ingestion route with a 60-second limit.
- `/api/account`: conditionally available authenticated account deletion. It validates the caller with the configured Supabase project and requires a server-only service credential; without complete server configuration it fails closed.
- `/robots.txt` allows public pages, disallows `/api/`, and advertises `/sitemap.xml`. The sitemap always includes useful static pages and adds only complete-snapshot, adequately populated collection/company pages plus legitimate active UUID job pages.
- `src/proxy.ts`: root-only legacy redirect. Any known board query key on `/` redirects to `/jobs`; unrelated attribution survives, but private saved-only and application-stage query keys are removed.
- `vercel.json` still schedules the checked-in ingestion route daily at 12:00 UTC. The repository does not prove any faster external schedule.

## Landing refinement (module 8)

- Prompt 1 shortened `/` to the header, hero, active-company marquee, search showcase, tracker showcase, compact CTA, and global footer. The problem, trust/freshness, workflow, statistics, and FAQ marketing sections and their component imports were removed.
- Primary navigation now contains Find Jobs, Companies, Tracker, Alerts, Account, and one Browse Jobs action. Discover duplication, How It Works, Methodology, and Data Status navigation were removed from desktop, mobile, and footer surfaces.
- `/methodology` and `/status` now redirect to `/jobs`; both were removed from the sitemap, metadata-bearing page implementations, and internal public links. Technical source and data documentation remains in the repository, while listing-level freshness, pay, sponsorship, verification, and source details remain intact.
- Prompt 2 rebuilt the hero around “Find it early. Track it cleanly.” and the account-free product promise. It uses layered current-listing, job-detail, and tracker surfaces on an original midnight-blue field, with blue Find Jobs and Open Tracker actions and no badge, statistics, evidence table, or technical disclaimer.
- The company marquee now lives inside the hero, uses transparent logo/name lockups with a continuous fade-masked loop, pauses on hover/focus, becomes a static single accessible row for reduced motion, and hides failed images. Companies are selected only from active listings that match curated company-domain aliases; recognizable active companies are prioritized before other curated active employers.
- Prompt 3 replaced the checklist-based discovery section with a large typographic search showcase and current result rows. It replaced the three generic tracker columns with the full Saved, Applied, Assessment, Interview, and Offer pipeline plus restrained next-action and note surfaces. Both sections use one deliberate motion moment and keep content present without animation.
- Prompt 4 removed stale landing components, imports, links, statistics helpers, navigation expectations, and deleted-section tests. The production browser audit found no horizontal overflow at 390×844, 768×1024, 1024×768, 1440×900, or the 200%-zoom reflow approximation; desktop/mobile navigation, `/jobs`, `/tracker`, and both retired-route redirects worked.
- The live audit rendered current-listing hero/search rows and 12 prioritized active-company logo lockups with no failed images. Landmark structure, heading order, accessible mobile disclosure, duplicate-marquee hiding, focus pause, reduced-motion CSS, and color contrast tests remain covered. `public/og-v2.png` is the finished 1200×630 Timley social card.

## Landing visual refresh (2026-07-24)

- The homepage now uses a warm-paper, charcoal, crisp-white, and coral system. The hero keeps the established two-tone headline structure with the editorial line “Your next role, right on time.” Blue and purple ambient gradients were removed from the landing experience.
- The header is a slimmer warm glass surface with compact oval navigation, route-aware active states, and a coral Browse Jobs action. The footer and other marketing-token surfaces inherit the same warm direction; the application product retains its established functional theme outside the landing page.
- Homepage previews remain data-backed. They select distinct active listings whose companies have curated domains, prioritizing recognizable employers before other eligible companies. Landing preview logos never guess a domain; a provider failure shows the deterministic monogram instead of a generic globe.
- Company ticker marks render at full brand color with a light brightness, saturation, and contrast correction. Hover and focus add a short lift and color response while preserving pause-on-interaction and reduced-motion behavior.
- Motion remains transform-based and restrained: quick button compression, small card tilts, a low-amplitude warm light drift, and shorter section reveals. Authored landing copy contains no em dashes.

## Job data

Six public GitHub source groups are fetched concurrently by `src/lib/ingest/run.ts`. The checked-in Vercel schedule remains daily at 12:00 UTC. Source adapters parse JSON or Markdown, then `normalize.ts` cleans, categorizes, removes tracking parameters, normalizes known Greenhouse/Lever/Ashby/Workday variants, excludes explicit non-US locations and stale dated rows, and builds conservative trust identity.

Employer identity removes legal suffixes and uses a small explicit alias map; meaningful words such as `Labs`, `Capital`, `Trading`, and `Space` are no longer dropped. Strong duplicate matches use canonical application URL, canonical employer plus requisition/external job ID, or a source-provided content fingerprint. Exact company/title/location/posting-date identity is a fallback only when stronger IDs are absent. Undated title/location matches remain separate, and conflicting requisition IDs cannot merge. Stable canonical record keys and duplicate groups are deterministic hashes of the strongest available evidence.

Supabase RPC `ingest_upsert_v3` stores original source, canonical employer/URL, external and requisition IDs, normalized title/location, content fingerprint when supplied, last source verification, verification status, explicit expiration status, closed timestamp, pay evidence, sponsorship status/source/confidence, duplicate group, and canonical record key. Exact existing source/URL rows are rekeyed before upsert to preserve their database UUID and first-seen history. Missing rows become `possibly-closed` only after a successful complete nonempty source snapshot and become `expired` after 30 days. The migration was applied to the live internship-tracker database and backfilled legacy observations without inventing destination checks.

`src/lib/jobs.ts` is the shared server read. It pages active rows, applies the existing 120-day dated cutoff and US-location sanitizer, excludes expired and possibly-closed rows, reads the trust fields, and returns graceful error state. If a later database page fails after usable rows were read, the snapshot retains those rows and marks them as partial instead of discarding them. A separate bounded read exposes only inactive, U.S.-eligible records closed in the last 90 days for company and retained-detail pages. The live RLS migration consolidates current and recent-history access into one public policy; an anon-role verification returned both current and recent rows after deployment.

## Public discovery, companies, and sharing

`src/lib/publicCatalog.ts` is the shared public-page model. Core collections are internships, new-grad roles, software engineering, data/ML, security, explicit U.S. remote, explicit affirmative sponsorship evidence, and jobs first observed in the exact last seven days. Location pages use canonical checked-in location facets. Season pages accept only `Spring|Summer|Fall|Winter YYYY`; arbitrary source strings never become routes. Generic campus collections reuse the existing computer-science, engineering, and business taxonomies.

An indexable collection needs at least 10 legitimate active jobs, at least three distinct canonical companies, a complete snapshot, and a latest visible source observation within 14 days. Known routes below the threshold remain truthful `noindex,follow` pages and stay out of directories and the sitemap. “New this week” uses `first_seen_at`, not source posting date. Every collection renders its real filtered roles server-side, the latest visible source observation, its inclusion method, a non-endorsement disclosure, and `ItemList` data that points to the same visible UUID detail pages.

Company identity reuses the ingestion normalizer and explicit aliases. Company pages enter the index and sitemap at three active roles. They report active role counts, Timley categories, normalized listed locations, employer-listed pay evidence only, and sponsorship classifications per role; missing sponsorship remains unknown and is never generalized into a company policy. “Recently removed from a source” is distinct from employer-confirmed closure. Monthly first-observation history appears only with at least ten observations spanning at least three distinct months and 60 days, and is explicitly not a hiring forecast. Following a company stores only a bounded versioned slug set in `timley:followed-companies:v1`.

`serializeBoardFilters()` and `publicBoardUrl()` now serialize public search criteria only. `collection=saved`, application stages, and application-stage sorting stay in browser storage. Shared locations sort deterministically; restored saved-alert links are re-sanitized; unknown, cross-origin, fragmented, and private query state is rejected or removed. Copy link is always offered and native share is offered when supported. Filtered `/jobs` variants canonicalize to `/jobs` and use `noindex`; the server-rendered collection paths provide matching social previews. No tracker note, contact, saved-search name, or application identity is accepted by a public share URL.

Technical SEO is centralized in `src/lib/seo.ts`: unique title/description helpers, self-canonicals, full Open Graph image metadata, route-specific Twitter copy, index controls, `Organization`, `WebSite` plus search action, `ItemList`, visible-breadcrumb `BreadcrumbList`, and active-detail-only `JobPosting`. The global canonical was removed so a new route cannot silently inherit `/`. The 1200×630 `public/og-v2.png` is the current truthful generic social image.

## Privacy-conscious analytics

`src/lib/analytics.ts` exports only event-specific functions for search, filter, job opened, Apply clicked, job saved, stage changed, search saved, alert enabled, collection shared, and tracker revisited. Search text becomes a length bucket and all counts become coarse buckets. Public job actions retain only surface, role type, and Timley category; stage changes retain only previous/next stage; sharing retains method, collection kind, and a public-filter count.

The contract cannot accept raw query text, saved-search names, titles, company names, listing IDs, URLs, notes, contacts, email addresses, compensation notes, or exports. It dispatches a provider-neutral `timley:analytics` browser event and appends to `window.dataLayer` only if the host already supplied one. This repository configures no analytics vendor or network destination. `docs/analytics.md` documents the field allowlist, prohibited data, delivery boundary, and future deployment responsibilities; `/privacy` repeats the user-facing boundary.

## Job-discovery application

- The hierarchy is now application header, internship/new-grad tabs, large search, essential filters, advanced filters, active chips, sort/view controls, results, and internal details.
- The sticky area is deliberately short. Desktop essentials are location, major, specialization, and remote; sponsorship, hot/new, saved roles, and stages live in the advanced panel. Mobile keeps the large search field and opens the complete existing filter set in the accessible bottom sheet.
- Every existing filter still uses `filterAndSortJobs()` and the established URL/persistence contract. Search uses replace-state; discrete controls use push-state; back/forward and unrelated query parameters remain supported.
- Card results remain the responsive default. The persisted table preference produces a semantic, aligned table at extra-large widths and automatically uses compact cards below that breakpoint without overwriting the preference.
- Result selection opens Timley’s internal detail drawer rather than immediately navigating away. The drawer reuses the existing focus trap, Escape handling, scroll lock, focus return, and portal behavior; it becomes a right-side panel on desktop and a bottom sheet with a sticky action footer on mobile.
- Cards add a restrained `Verified at source` signal only when a structured source-observation or destination-reachable status and verification time support it. Cards retain explicit employer-listed pay, Timley estimate, sponsorship confirmed, no sponsorship, restriction, and unknown labels.
- Details include the full title, company, location, category, opportunity type, start period, source repository, first-seen date, original posting date, last observation, last verification, canonical application destination, requisition/external ID when present, duplicate group, compensation origin, raw sponsorship evidence, save control, tracker stage, report flow, and up to three deterministic related roles from the real active dataset.
- `Verified at source` means the row was recently present in the named upstream feed; details explicitly say this is not comprehensive employer-destination verification. Active observations older than 30 days and selected rows removed from a refreshed feed show `Possibly closed`; stored inactive rows age to `Expired` after 30 days. Neither state claims employer-confirmed closure.
- Employer-listed compensation is green and explicitly labeled `Employer-listed pay`. Timley category estimates remain amber with `Est.`/`Timley estimate`. Unknown fields use neutral unavailable wording, so meaning never depends on color alone.
- External Apply actions use the same blue `ui-button--apply` treatment in cards, table rows, and the sticky detail footer. Possibly-closed and expired roles suppress that action.
- `Report listing` supports closed link, duplicate, incorrect location/pay/sponsorship/classification, and other issue. It opens a prefilled public GitHub issue for review; no report is sent to a Timley backend, and GitHub sign-in/abuse controls apply.
- Intentional states now cover route loading, unexpected route errors, active refresh, empty feed, filtered empty, saved/stage/remote/sponsorship/location empty, partial feed, partial listing evidence, old source observation, selected role removed from the active feed, missing logo, load more, and all-results-loaded.

## Landing page truth rules

- The hero and search preview use current active listings. Empty/error states do not substitute fictional roles, companies, or statistics.
- The marquee deduplicates current active employers, keeps only curated company-domain matches, prioritizes recognizable active companies, and removes a failed logo instead of rendering a letter fallback.
- The marquee label says only that fresh roles come from companies including those shown; it does not imply an employer relationship, partnership, customer, or endorsement.
- Result-card pay, freshness, location, sponsorship, source, and verification semantics remain owned by the product routes. The shorter landing page does not change or weaken those fields.

## Persistence and tracker

- `timley:filters:v1`: filter preferences; URL filter keys take precedence and use History API push/replace plus `popstate`.
- `timley:filters:updated-at:v1`: continuity-only adjacent filter timestamp used for newest-side merge because the established filter snapshot predates per-record timestamps.
- `timley:view`: card/table density.
- `timley:saved`: saved apply-URL set retained for the saved-results collection and included in JSON backup.
- `timley:applications:v3`: rich browser-local application records. Presence of v3 is authoritative; the one-time migration merges v2, legacy `timley:applied`, and saved-only `timley:saved` URLs without replacing a stronger application record. `oa` migrates to `assessment`, existing timestamps survive, and corrupt rows are skipped safely.
- `timley:tracker-view:v1`: list/board preference.
- `timley:reminders:browser:v1` and `timley:reminders:last-notification:v1`: explicit foreground-notification preference and same-day deduplication marker.
- `timley:saved-searches:v1`: named complete `BoardFilters` snapshots with instant, daily, weekly, or paused frequency plus in-app, browser, and unavailable-email channel flags.
- `timley:saved-searches:tombstones:v1`: bounded deletion markers used to converge same-browser tabs without resurrecting a deleted search.
- `timley:search-alerts:v1`: strict versioned local inbox, per-search last-run times, and a bounded globally delivered role-ID set.
- `timley:search-alerts:browser-enabled:v1`: separate explicit foreground browser-alert preference; it does not reuse the tracker-reminder preference.
- `timley:followed-companies:v1`: bounded, sorted public company slugs used only for browser-local follow state.
- `timley:continuity:auth:v1`: Supabase PKCE session persistence only when the optional continuity provider is configured and used.
- `timley:continuity:preference:v1:<encoded-user-id>`: strict per-account first-sync consent, selected categories, and last successful sync time.
- `timley:continuity:recovery:v1:<encoded-user-id>`: strict bounded pre-sync recovery envelope containing the exact local-before and intended-merged snapshots.

The persisted stages are Saved, Preparing, Applied, Assessment, Interview, Offer, Rejected, Withdrawn, and Archived. “Not tracked” remains a virtual result-card state and is no longer offered as a destructive stage-menu action. Stage menus remain keyboard-operated and work from cards, tables, job details, tracker lists, and tracker boards. Saving a result creates or enriches a Saved tracker record without downgrading an application already in progress.

Each record may retain job, company, stage, saved/applied dates, next action and date, multiple interview dates, personal notes, application URL, optional contact, compensation notes, location/work arrangement, and last-updated time. Feed-backed records store a small job snapshot so a removed listing keeps useful identity. Exact keys remain backward compatible, while application-URL aliases reconnect edited/manual records to result-card stage lookups.

The tracker supports application totals, stage totals, search across local details, stage/action-date filters, six sort modes, a responsive list, and a horizontally scrollable desktop board. Board mode becomes vertically grouped, collapsible stage lists below the desktop breakpoint rather than squeezing columns onto mobile. Every card retains the accessible stage menu; drag-and-drop was intentionally not required.

The action dashboard surfaces dated next actions and future interviews. Browser reminders are count-only, explicitly opt-in, and best-effort while Timley is open; permission is never requested on page load. ICS export contains active next actions/interviews plus stage and application URL but omits notes and contacts. CSV contains every tracker field and neutralizes spreadsheet formulas. Versioned JSON backup contains rich records and saved-job URLs; restore validates untrusted input, unions saves, and keeps the newest `updatedAt` value on conflicts.

Anonymous use remains the baseline. Browsing, saving, tracker editing, saved searches, and in-app alerts work from browser storage without an account. Downloads are created locally; a calendar app receives ICS details only if the user imports the file. Archive retains a local record and includes it in backup; confirmed permanent deletion removes it from browser storage. Signing out never clears local data, and clearing browser site data can still lose unexported or unsynced records.

## Saved searches and alerts

Saved searches retain the complete canonical board-filter object, name, frequency, and channel choices. Same-tab custom events and native storage events converge local changes; strict parsing, record caps, and tombstones reject corrupt data and prevent stale resurrection. The `/alerts` workspace reuses `MobileFilterSheet` with an empty private application map so users can edit every stored filter without transmitting application data.

The foreground engine evaluates due public criteria against the latest jobs props received from the refreshed server-component snapshot. It supports role type, keywords, taxonomy, physical-location OR matching or remote-only, explicit sponsorship, employer-listed minimum pay, and freshness. Saved-only collection, private application stages, location ordering, and application-stage sorting remain in the stored search but are removed from its public direct-results URL. A canonical role is globally delivered once across all matching searches. Each local alert records why it matched, the triggering search, frequency, role identity, first-seen time, and a sanitized filtered-results URL. The delivery history and delivered-role list are bounded.

In-app alerts are the always-supported anonymous path. At least one supported local channel is required when editing a saved search. Searches with no supported local channel do not advance their cadence or consume global role deduplication. Browser-only searches remain unevaluated until the per-search Browser channel and the separate global browser preference are both enabled and notification permission is granted. Every delivered browser-only match remains visible in local delivery history with its reason, search, frequency, direct results link, pause control, and confirmed unsubscribe action.

Browser alerts use a key separate from tracker reminders and are sent only while the Alerts page is open; other Timley routes do not run saved-search delivery. A single foreground notification includes the triggering search and a match reason, and selecting it opens the safe direct filtered-results URL used by the delivery-history row. Permission is never requested on load or merely by selecting the channel. There is no service worker or push backend. Email is visibly scaffolded but unavailable; no alert-delivery address is collected. Search deletion and history-row deletion require confirmation; unsubscribing removes the search and visible associated alerts, while the bounded role-ID list remains until site data is cleared to preserve global deduplication.

## Optional account continuity

`src/lib/continuityProvider.ts` isolates optional continuity behind a provider adapter. It is unavailable unless `NEXT_PUBLIC_TIMLEY_CONTINUITY_PROVIDER=supabase`, a valid HTTPS `NEXT_PUBLIC_SUPABASE_URL`, and a safe browser publishable or anon key are explicitly configured. It never borrows fallback credentials from the public-jobs client and rejects server secret/service-role credentials in browser configuration. The Supabase client is lazy, uses persistent PKCE sessions, normalizes provider errors, and supports email/password sign-up, sign-in, verification resend, password reset/update, session events, a single versioned user snapshot, sign-out, and account deletion.

The continuity UI remains optional and never gates anonymous browsing, tracking, saved searches, or alerts. Signing in does not upload local data. First sync requires explicit category selection; selecting tracker data warns that it contains personal notes and optional contacts. Merge is newest-per-application-record and union-based for set-like categories. The merged snapshot is written remotely first; local data changes only after that save succeeds. A cloud write failure therefore leaves the existing local state recoverable.

Successful first sync persists per-account consent and category selection. Subsequent changes in selected categories schedule a debounced automatic foreground sync while Timley is open; focus and returning visibility also schedule eligible sync. Same-tab writes use `timley:continuity:local-change:v1` as a custom event name, not a storage key, while native `storage` events cover other tabs. Concurrent local changes detected during a network sync prevent local replacement and queue another pass.

The only eligible snapshot categories are saved-job URLs, rich application records, filter preferences plus their adjacent timestamp, and saved searches plus deletion tombstones. Search-alert inbox history, globally delivered role IDs, tracker reminder markers, and browser-notification preferences remain browser-only. Manual Tracker JSON backup is independent from continuity.

Every sync plan also constructs a bounded, strictly parsed recovery envelope containing the exact pre-sync local snapshot, intended merged local snapshot, selection, and creation time. This supports repair when the cloud save succeeds but browser storage writes fail or only some selected category groups commit. Recovery data may include notes, contacts, or compensation notes when tracker sync was selected and must be treated like a private backup.

Sign-out uses local Supabase scope and leaves Timley product data, per-account selection, and recovery data untouched. Account deletion is split deliberately: when `TIMLEY_ACCOUNT_DELETION_ENABLED=true`, the Supabase URL/public key match the browser project, and `SUPABASE_SERVICE_ROLE_KEY` is available only on the server, `/api/account` validates the bearer token, revokes sessions, and removes the Auth account. The cloud continuity snapshot is removed through the configured database relationship; after success, the provider clears that deleted user's local auth session, continuity preference, and recovery keys. Clearing the separate anonymous product data is an additional optional choice; downloaded backups remain outside Timley.

The optional local-product-data clear uses an explicit allowlist rather than `localStorage.clear()` or `sessionStorage.clear()`. It covers filters and their timestamp, view preferences, saved jobs, current and legacy application keys, saved searches and tombstones, alert inbox and browser preference, company follows, and tracker reminder preference/deduplication. Legacy `timley:applications:v2` and `timley:applied` are included so old records cannot remigrate. The checkbox does not directly clear continuity-owned keys; successful provider account deletion clears the deleted user's auth, preference, and recovery keys. Unrelated origin storage is untouched.

This path requires deployment work rather than invented defaults: apply the continuity table/RLS migration, enable and configure Supabase email/password authentication, set production SMTP delivery, and register exact site and recovery/verification redirect URLs. Without those pieces, continuity and deletion remain unavailable while local use continues.

## Shared UI, motion, and metadata

- `src/app/globals.css` remains the design-system source of truth: warm editorial marketing and cool-light application tokens, one-pixel borders, restrained radii/shadows, visible focus treatment, and explicit responsive behavior.
- `.theme-application` now fully resets semantic aliases so light product previews remain correct when nested inside dark marketing surfaces.
- The global translucent header contains Find Jobs, Companies, Tracker, Alerts, Account, and one Browse Jobs action. Its native mobile disclosure supports keyboard use, Escape-to-close, focus return, and close-on-navigation.
- The compact footer groups core product links, useful discovery collections, changelog, privacy, terms, and repository feedback. There are no placeholder social links or links to retired public pages.
- Landing motion covers short product-state sequencing, section reveal, and the company marquee. Content is visible without JavaScript, animations use transform/opacity where possible, and reduced motion disables loops and movement while preserving content.
- Route-specific canonical, title, description, robots, Open Graph, and Twitter metadata are present. Utility/account workspaces are `noindex,follow`; filtered jobs URLs canonicalize to `/jobs`; thin and recently removed pages are noindex. `public/og-v2.png` is the bespoke 1200×630 Timley social card using the finished palette and layered product motif, with no companies, statistics, or relationship claims.

## Tests and verification

Run:

```sh
npm run lint
npm run typecheck
npm test
npm run build -- --webpack
```

Module 8 verification completed:

- ESLint passed with zero warnings.
- Strict TypeScript passed.
- Run the complete test suite; do not document a fixed count because coverage changes across modules.
- URL-state coverage verifies deterministic public serialization, removal of saved-only/stage state, stored private-state survival, legacy redirect sanitization, and restored-alert URL sanitization.
- Public-catalog coverage verifies real-count/company-diversity/freshness eligibility, exact seven-day first-seen logic, allowlisted seasons, stable UUID paths, active-detail eligibility, role-level company evidence, employer-listed pay only, and adequate multi-month history.
- SEO coverage verifies canonical/robots/social metadata, internal `ItemList` URLs, visible breadcrumb ordering, global `Organization`/`WebSite`, active-detail-only `JobPosting`, crawl controls, complete-snapshot sitemap gates, and expired-record exclusion.
- Growth coverage verifies copy/native share wiring, company follows and clear-data coverage, data-backed discovery/company/campus routes, fresh-role digest links, the changelog, and the active-listing-driven company marquee.
- Analytics coverage verifies the exact event set, coarse buckets, event-specific APIs, wiring across board/tracker/saved-search flows, and absence of private payload field names.
- Saved-search persistence coverage verifies full-filter round trips, strict parsing, bounds, tombstones, deterministic conflict handling, local defaults, safe IDs, and monotonic update times.
- Alert-engine coverage verifies frequency gates, paused searches, zero-channel skipping, browser-only deferral until global delivery is available, global role deduplication, public matching criteria, canonical results links, match explanations, corrupt-state recovery, role-identity fallbacks, and storage bounds.
- Alerts-workspace coverage verifies anonymous/local disclosures, feed-error and partial-feed handling, coalesced Next router refreshes on the five-minute/focus/visibility triggers, explicit browser permission gating, per-search browser-channel enforcement, inspectable browser-only history, complete filter editing, confirmation for destructive actions, and the public `/alerts` route.
- Continuity-provider coverage verifies fail-closed configuration, safe browser-key handling, lazy persistent PKCE auth, auth and recovery methods, normalized errors, bounded versioned snapshots, authenticated row ownership, local-scope sign-out, and same-origin account deletion.
- Continuity-snapshot coverage verifies category gating without reading unselected private application storage, strict and bounded snapshot parsing, newest-record/filter resolution, saved-job and saved-search unions, tombstone preservation, exact pre-sync/intended-merge recovery round trips, and selected-category-only local commits.
- Continuity merge/UI coverage should verify explicit first-sync category selection, the notes/contact warning, newest-record and union semantics, cloud-first/local-second writes, recovery after a failed cloud save, and local-data retention across sign-out or account deletion.
- New persistence coverage verifies authoritative v3 handling; idempotent v2, legacy-applied, and saved-only migration; `oa` to Assessment mapping; snapshot retention; strict rich-field parsing; applied-date invariants; archive/delete restoration; conservative backup merging; and application-URL alias stage lookups.
- Tracker coverage verifies the list/board, export, reminder, search, and all-nine-stage controls plus feed-unavailable continuity. Pure tracker tests cover rich search, stage/action filters, next-action sorting, upcoming/overdue summaries, joins, snapshots, and safe external URLs.
- Export coverage verifies formula-safe CSV, complete JSON round trips, unsafe backup rejection, newest-record restore conflicts, saved-job unions, RFC-style ICS escaping/line endings/stable IDs, deliberate notes/contact omission from calendar output, and upcoming-item classification.
- New normalization coverage verifies employer aliases, legal-suffix conservatism, tracking removal, URL casing, Greenhouse/Lever/Workday variants, ATS/external/requisition ID extraction, stable canonical keys, content fingerprints, true duplicate merges, and false-positive protection for distinct or undated requisitions.
- UI coverage verifies backed source-verification labels, last-verified/canonical/identifier/duplicate evidence, explicit employer pay versus Timley estimates, structured sponsorship language, possibly-closed and expired states, suppressed Apply actions, and every report category.
- The live recent-history migrations succeeded. The consolidated public policy preserves the active U.S./120-day boundary and adds only U.S.-eligible inactive rows closed within 90 days; anon-role verification returned 2,610 current and 1,049 bounded recent records at verification time. The new partial closed-time index is available, and the duplicate-permissive-policy advisor was resolved.
- Run a production webpack build after the final account UI, account API, migration, and disclosure copy land; verify the emitted route table rather than preserving an old route count.

Existing landing, tracker, filtering, compensation, location, legacy routing, URL-state, application-persistence, contrast, motion, and reduced-motion coverage remains intact.

## Known risks

- `Board.tsx` remains a large client orchestration component even though the advanced panel, card, table, save control, and details drawer are separated.
- Application records retain backward-compatible mutable apply-URL keys. Stored application-URL aliases and snapshots reduce orphaning, but canonical variants can still require manual reconciliation.
- Rich tracker data is browser-local unless the user explicitly selects it for a configured sync. Storage quotas, private browsing, browser cleanup, device loss, or an unsaved sync can remove unexported records; manual JSON backup remains the portable recovery path.
- Tracker reminders and saved-search browser alerts have no push backend or service worker. Saved-search checks run only while the Alerts page is open; it refreshes the server jobs snapshot about every five minutes and on focus/visibility return. The browser or operating system can still suppress delivery.
- Email alerts are not implemented. Supabase authentication emails are a separate provider concern and require real SMTP and redirect configuration before production use.
- Optional continuity currently stores one versioned snapshot per account rather than a server-side change log. Cloud-first writes protect the local copy on failure, but simultaneous edits on separate devices still require deterministic merge and a successful subsequent save.
- Account deletion requires a server-only Supabase service credential and matching database cascade. It intentionally cannot work from browser credentials alone.
- `ingest_source_runs` has RLS enabled without a checked-in public read policy. The retired status route no longer exposes a public summary.
- Every ingest adapter is marked as a complete snapshot; a silent partial parse can deactivate valid rows.
- `Verified at source` is intentionally limited to feed presence. A comprehensive destination dead-link/closure checker is not active, so listing details still require users to confirm the external application page.
- The anonymous ingestion RPC is necessary for the current publishable-key server client and is protected by the cron secret, narrowed grants, and `search_path`; Supabase still correctly flags anonymous `SECURITY DEFINER` access. A later deployment-hardening module should use a server-only credential or private database function and revoke anonymous execution.
- Full datasets are serialized and filtered in-browser; scale may eventually require server-side querying.
- Generated company domains remain best-effort for product result cards, where the fixed letter fallback is truthful. The marketing marquee uses curated domains only and hides failed images.
- Company follows are browser-local state, not a server-backed digest subscription. Users can save a company-filtered search for foreground fresh-role alerts.
- The analytics module has no configured delivery provider. A deployment that connects one must disclose the vendor, consent basis, access, and retention while preserving the documented field allowlist.
- Dynamic sitemap entries depend on a complete five-minute snapshot; load or pagination failure deliberately leaves only the useful static sitemap rather than publishing a misleading partial dynamic inventory.
- Automated visual-regression snapshots are not checked into the repository. The 390/768/1024/1440 production-browser matrix was completed manually for module 8 and should be repeated after major landing changes.

## Remaining modernization modules

Module 8 is complete. No additional supplied modernization module is pending in this context.
