import { parseSimplifyFeed } from './lib/ingest/sources/simplify.ts';
import { SOURCE_REGISTRY } from './lib/ingest/sourceRegistry.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }

const NOW = Date.UTC(2026, 8, 28, 18, 0, 0);
const [internships, newGrad] = SOURCE_REGISTRY.simplify.feeds;

function listing(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `listing-${index}`,
    company_name: 'Acme',
    title: `Software Engineer Intern ${index}`,
    url: `https://jobs.lever.co/acme/${index}`,
    locations: ['San Francisco, CA'],
    terms: ['Summer 2027'],
    category: 'Software',
    sponsorship: 'Offers Sponsorship',
    active: true,
    is_visible: true,
    date_posted: Math.floor(NOW / 1000) - 3600,
    ...overrides,
  };
}

Deno.test('closed and hidden Simplify rows are skipped before schema validation', () => {
  const rows = [
    listing(1),
    listing(2, { active: false }),
    listing(3, { is_visible: false }),
    // Malformed closed rows used to fail validation and mark the feed schema-invalid.
    { active: false, is_visible: true, title: 42 },
    { company_name: '', active: false },
    listing(4),
  ];
  const snapshot = parseSimplifyFeed(JSON.stringify(rows), internships, NOW);
  assert(snapshot.jobs.length === 2, `expected 2 open jobs, got ${snapshot.jobs.length}`);
  assert(snapshot.jobs.every((job) => job.external_id === 'listing-1' || job.external_id === 'listing-4'));
  assert(snapshot.raw_count === 6, 'raw_count still reports every row in the feed');
  assert(snapshot.parsed_count === 2);
  assert(!snapshot.health.issues.some((issue) => issue.code === 'invalid_row'), 'closed rows are not validated');
  assert(snapshot.health.schema_valid);
  assert(snapshot.health.complete, 'a malformed closed row no longer fails the whole source');
});

Deno.test('open Simplify rows are still fully validated and filtered by term', () => {
  const rows = [
    listing(1),
    listing(2, { title: 42 }),
    listing(3, { terms: ['Summer 2024'] }),
    listing(4, { url: 'http://insecure.example/job' }),
  ];
  const snapshot = parseSimplifyFeed(JSON.stringify(rows), internships, NOW);
  assert(snapshot.jobs.length === 1 && snapshot.jobs[0].external_id === 'listing-1');
  assert(snapshot.health.issues.some((issue) => issue.code === 'invalid_row'), 'malformed open rows are reported');
  assert(snapshot.health.issues.some((issue) => issue.code === 'invalid_url'));
  assert(!snapshot.health.schema_valid);

  const graduates = parseSimplifyFeed(JSON.stringify([listing(5, { terms: ['Summer 2024'] })]), newGrad, NOW);
  assert(graduates.jobs.length === 1, 'new-grad listings ignore internship terms');
});

Deno.test('Simplify listings older than 90 days are skipped; undated ones are kept', () => {
  const day = 86_400;
  const rows = [
    listing(1, { date_posted: Math.floor(NOW / 1000) - 89 * day }),
    listing(2, { date_posted: Math.floor(NOW / 1000) - 91 * day }),
    listing(3, { date_posted: 0 }),
    listing(4, { date_posted: undefined }),
  ];
  const snapshot = parseSimplifyFeed(JSON.stringify(rows), newGrad, NOW);
  const ids = snapshot.jobs.map((job) => job.external_id).sort();
  assert(JSON.stringify(ids) === JSON.stringify(['listing-1', 'listing-3', 'listing-4']), `got ${ids}`);
  assert(snapshot.health.complete);
});

Deno.test('a full-size Simplify feed parses the open minority', () => {
  // Shape of the real feed: ~37,000 rows, about one in eight open.
  const rows = Array.from({ length: 37_000 }, (_, index) => listing(index, { active: index % 8 === 0 }));
  const started = performance.now();
  const snapshot = parseSimplifyFeed(JSON.stringify(rows), internships, NOW);
  const elapsed = performance.now() - started;
  assert(snapshot.raw_count === 37_000);
  assert(snapshot.jobs.length === 4_625, `expected 4,625 open jobs, got ${snapshot.jobs.length}`);
  console.log(`parsed 37,000 Simplify rows in ${elapsed.toFixed(0)} ms`);
});
