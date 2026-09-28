/**
 * Export the public job feed into the bundled snapshot before a production
 * build. Visitors then read jobs from the deployment itself, so cold starts
 * cost Supabase nothing; the live reader only fetches rows changed since
 * this export, within its budget. One export reads each current listing once.
 *
 * The build never fails because of this step. When the export is skipped,
 * unreachable or implausible, the committed snapshot is used unchanged.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Must match SELECT_FIELDS in lib/jobs/live.ts (a test enforces this).
export const PUBLIC_JOB_FIELDS = [
  'id', 'title', 'company', 'category', 'role_type', 'primary_apply_url', 'display_location',
  'location_type', 'major_ids', 'niche_ids', 'posted_date', 'first_seen_at', 'last_seen_at',
  'last_checked_at', 'updated_at', 'is_active', 'salary_raw', 'sponsorship', 'company_domain',
  'company_domain_confidence', 'primary_source', 'employer_evidence', 'employer_checked_at',
];
// Must match RETENTION_DAYS in lib/jobs/live.ts (a test enforces this).
export const RETENTION_DAYS = 90;
export const SHARD_COUNT = 11;
const PAGE_SIZE = 1000;
// Rows changed during this window are re-read by the live reader, covering
// transactions that began before the export and committed after it.
const CAPTURE_OVERLAP_MS = 15 * 60_000;
const DEFAULT_SUPABASE_URL = 'https://ogkocdharscqzdrnlpnq.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ejWVjfUaEx5WAdrN72s7FQ_RwO7CDEh';
const DATA_DIR = new URL('../data/fallback/', import.meta.url);

/** Production builds export by default; previews and CI use the committed copy. */
export function shouldExport(env) {
  if (env.TIMLEY_USE_DEMO_JOBS === 'true' || env.TIMLEY_EXPORT_FEED === 'false') return false;
  return env.TIMLEY_EXPORT_FEED === 'true' || env.VERCEL_ENV === 'production';
}

export function supabaseTarget(env) {
  let url = DEFAULT_SUPABASE_URL;
  try {
    const candidate = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) url = candidate.origin;
  } catch {
    // Keep the known-good project.
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
    ? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    : DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}

export function exportPageUrl(baseUrl, cutoff, offset) {
  const url = new URL('/rest/v1/jobs', baseUrl);
  url.searchParams.set('select', PUBLIC_JOB_FIELDS.join(','));
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('first_seen_at', `gte.${cutoff.toISOString()}`);
  url.searchParams.set('or', `(posted_date.is.null,posted_date.gte.${cutoff.toISOString().slice(0, 10)})`);
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  return url;
}

function totalFrom(contentRange) {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export async function fetchPublicRows({ url, key, now = Date.now(), fetchImpl = fetch }) {
  const startedAt = now;
  const cutoff = new Date(startedAt - RETENTION_DAYS * 86_400_000);
  const request = async (offset, count) => {
    const response = await fetchImpl(exportPageUrl(url, cutoff, offset), {
      headers: { Accept: 'application/json', apikey: key, ...(count ? { Prefer: 'count=exact' } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`upstream_http_${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('upstream_invalid_json_shape');
    return { rows, total: count ? totalFrom(response.headers.get('content-range')) : null };
  };
  const first = await request(0, true);
  if (first.total === null) throw new Error('upstream_missing_count');
  const rows = [...first.rows];
  for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) {
    rows.push(...(await request(offset, false)).rows);
  }
  if (rows.length !== first.total) throw new Error('upstream_incomplete_export');
  return { rows, capturedAt: new Date(startedAt - CAPTURE_OVERLAP_MS).toISOString() };
}

/** Refuse exports that look broken rather than replacing a good snapshot. */
export function validateRows(rows, { minimumRows }) {
  if (rows.length < minimumRows) throw new Error('export_too_small');
  const ids = new Set();
  let incomplete = 0;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null || typeof row.id !== 'string' || !row.id) throw new Error('export_invalid_row');
    if (ids.has(row.id)) throw new Error('export_duplicate_ids');
    ids.add(row.id);
    if (row.is_active !== true) throw new Error('export_inactive_row');
    if (!row.title || !row.company || !row.primary_apply_url || !row.first_seen_at) incomplete += 1;
  }
  if (incomplete > Math.max(3, rows.length * 0.02)) throw new Error('export_incomplete_rows');
}

export function shardRows(rows, count = SHARD_COUNT) {
  const size = Math.ceil(rows.length / count);
  return Array.from({ length: count }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

async function committedRowCount(dataDir) {
  let total = 0;
  for (let index = 0; index < SHARD_COUNT; index += 1) {
    const file = new URL(`jobs-${String(index).padStart(2, '0')}.json`, dataDir);
    total += JSON.parse(await readFile(file, 'utf8')).length;
  }
  return total;
}

export async function writeSnapshot({ rows, capturedAt }, dataDir = DATA_DIR) {
  const shards = shardRows(rows);
  await Promise.all(shards.map((shard, index) =>
    writeFile(new URL(`jobs-${String(index).padStart(2, '0')}.json`, dataDir), JSON.stringify(shard)),
  ));
  await writeFile(new URL('captured-at.json', dataDir), `${JSON.stringify({ capturedAt })}\n`);
}

/** Returns what happened; never throws, so a build is never blocked. */
export async function runExport({ env = process.env, dataDir = DATA_DIR, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!shouldExport(env)) return { status: 'skipped' };
  try {
    const exported = await fetchPublicRows({ ...supabaseTarget(env), now, fetchImpl });
    // Seasons shrink the market, so only an implausibly small feed is refused.
    const minimumRows = Math.max(500, Math.floor((await committedRowCount(dataDir)) * 0.3));
    validateRows(exported.rows, { minimumRows });
    await writeSnapshot(exported, dataDir);
    return { status: 'written', rows: exported.rows.length, capturedAt: exported.capturedAt };
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message) ? error.message : 'export_failed';
    return { status: 'kept-committed', reason: code };
  }
}

async function main() {
  const result = await runExport();
  if (result.status === 'kept-committed') {
    console.warn(`Feed export failed (${result.reason}); building with the committed snapshot.`);
  } else {
    console.log(JSON.stringify({ event: 'feed_export', ...result }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
