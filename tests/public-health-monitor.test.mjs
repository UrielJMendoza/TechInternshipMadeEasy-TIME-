import assert from 'node:assert/strict';
import test from 'node:test';
import { describeUnhealthy, validatePublicHealth } from '../scripts/check-public-health.mjs';

const now = Date.parse('2026-09-05T06:00:00Z');
const healthy = () => ({ ok: true, status: 'healthy', mode: 'live', counts: { canonicalJobs: 100, activeJobs: 100, invalidRows: 0, duplicateDeltaIds: 0 }, ingestion: { healthy: true, sources: ['ashby:notion', 'gh:tenstorrentuniversity', 'lever:hermeus', 'northwesternfintech', 'simplify', 'speedyapply', 'vanshb03', 'zapplyjobs', 'zshah101'].map(source => ({ source, healthy: true, lastSuccessAt: '2026-09-05T00:45:00Z' })) } });

test('monitor accepts a live feed with all nine fresh sources', () => {
  assert.deepEqual(validatePublicHealth(healthy(), now), { canonicalJobs: 100, activeJobs: 100, healthySources: 9 });
});
test('monitor accepts recent data served while an over-budget sync is deferred', () => {
  assert.equal(validatePublicHealth({ ...healthy(), mode: 'deferred' }, now).canonicalJobs, 100);
});
test('monitor rejects fallback data even when cached jobs remain available', () => {
  assert.throws(() => validatePublicHealth({ ...healthy(), mode: 'fallback' }, now), /live feed/);
});
test('monitor rejects stale or missing sources despite a successful HTTP response', () => {
  const stale = healthy(); stale.ingestion.sources[0].lastSuccessAt = '2026-09-04T00:00:00Z';
  assert.throws(() => validatePublicHealth(stale, now), /recent successful refresh/);
  const missing = healthy(); missing.ingestion.sources.pop();
  assert.throws(() => validatePublicHealth(missing, now), /recent successful refresh/);
});
test('monitor rejects empty feeds and invalid or repeated feed rows', () => {
  for (const change of [{canonicalJobs: 0}, {activeJobs: 0}, {invalidRows: 1}, {duplicateDeltaIds: 1}]) {
    const data = healthy(); Object.assign(data.counts, change);
    assert.throws(() => validatePublicHealth(data, now));
  }
});
test('monitor explains a quota restriction and ignores unsafe failure text', () => {
  assert.equal(
    describeUnhealthy({ lastFailureCode: 'upstream_http_402', fallbackCapturedAt: '2026-08-31T22:15:17.000Z' }),
    'Live feed failure: upstream_http_402. Supabase restricted the project, usually because the organization exceeded its plan quota; check Supabase billing and usage. Visitors are seeing bundled data captured 2026-08-31T22:15:17.000Z.',
  );
  assert.equal(describeUnhealthy({ lastFailureCode: 'upstream_timeout' }), 'Live feed failure: upstream_timeout.');
  assert.equal(describeUnhealthy({ lastFailureCode: '::error::injected\nline', fallbackCapturedAt: 'not a date' }), '');
  assert.equal(describeUnhealthy(null), '');
});
