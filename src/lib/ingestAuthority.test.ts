import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { INGEST_SOURCE_CHECKSUM } from "../../supabase/functions/ingest/manifest.ts";
import {
  COMMUNITY_SOURCE_IDS,
  OFFICIAL_SOURCE_IDS,
  SOURCE_IDS,
  SOURCE_REGISTRY,
} from "../../supabase/functions/ingest/lib/ingest/sourceRegistry.ts";

const EXPECTED_COMMUNITY_SOURCES = [
  "simplify",
  "zshah101",
  "zapplyjobs",
  "northwesternfintech",
  "speedyapply",
  "vanshb03",
] as const;

const EXPECTED_OFFICIAL_SOURCES = [
  "gh:tenstorrentuniversity",
  "ashby:notion",
  "lever:hermeus",
] as const;

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260818120000_make_edge_ingest_authoritative.sql",
    import.meta.url,
  ),
  "utf8",
);
const productionHardeningMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260716182254_production_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const termFiltersMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260716182330_add_job_term_filters.sql",
    import.meta.url,
  ),
  "utf8",
);
const expectedArtifactMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260819042500_expect_ingest_artifact_version_v2.sql",
    import.meta.url,
  ),
  "utf8",
);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("the checked-in Edge registry derives from deployed v17 with all nine sources", () => {
  assert.deepEqual(COMMUNITY_SOURCE_IDS, EXPECTED_COMMUNITY_SOURCES);
  assert.deepEqual(OFFICIAL_SOURCE_IDS, EXPECTED_OFFICIAL_SOURCES);
  assert.deepEqual(SOURCE_IDS, [
    ...EXPECTED_COMMUNITY_SOURCES,
    ...EXPECTED_OFFICIAL_SOURCES,
  ]);
  assert.equal(new Set(SOURCE_IDS).size, 9);
  assert.match(INGEST_SOURCE_CHECKSUM, /^[a-f0-9]{64}$/);

  for (const source of SOURCE_IDS) {
    const definition = SOURCE_REGISTRY[source];
    assert.equal(definition.id, source);
    assert.ok(definition.feeds.length > 0);
    for (const feed of definition.feeds) {
      assert.match(feed.url, /^https:\/\//);
    }
  }
  for (const source of EXPECTED_COMMUNITY_SOURCES) {
    assert.match(SOURCE_REGISTRY[source].parser_version, /-v3$/);
  }
  for (const source of EXPECTED_OFFICIAL_SOURCES) {
    assert.match(SOURCE_REGISTRY[source].parser_version, /-v1$/);
  }
});

test("production monitoring expects the reviewed Edge artifact", () => {
  assert.ok(expectedArtifactMigration.includes(INGEST_SOURCE_CHECKSUM));
  assert.match(expectedArtifactMigration, /update app_meta\.ingest_settings/);
});

test("Vercel does not schedule the legacy heavy ingestion route", () => {
  const config = JSON.parse(
    readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
  ) as { crons?: unknown[] };
  assert.equal(config.crons?.length ?? 0, 0);
});

test("the immutable production baseline makes the migration chain complete", () => {
  assert.equal(
    sha256(productionHardeningMigration),
    "7b405cc3306ce10a7f69eac3e614e656738dce4fa315396e35757e93b38172f8",
  );
  assert.equal(
    sha256(termFiltersMigration),
    "84a0f108ec203a30a2bd3f573531d3a31e6e16f57779c3cf3348e75086b0437d",
  );
  assert.match(
    productionHardeningMigration,
    /create table if not exists public\.ingest_runs/,
  );
  assert.match(
    productionHardeningMigration,
    /create table if not exists app_meta\.ingest_lease/,
  );
  assert.match(
    productionHardeningMigration,
    /create or replace function public\.apply_ingest_snapshot/,
  );
});

test("the Edge entrypoint routes explicit community and official modes", () => {
  const entrypoint = readFileSync(
    new URL("../../supabase/functions/ingest/index.ts", import.meta.url),
    "utf8",
  );
  const runner = readFileSync(
    new URL(
      "../../supabase/functions/ingest/lib/ingest/run.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(entrypoint, /body\.mode === "official"/);
  assert.match(entrypoint, /runOfficialIngest/);
  assert.match(entrypoint, /runIngest/);
  for (const source of EXPECTED_OFFICIAL_SOURCES) {
    assert.ok(runner.includes(`"${source}"`), `${source} has an adapter`);
  }
});

test("the operations migration is bounded, twice daily, and audit preserving", () => {
  assert.match(
    migration,
    /alter function public\.apply_ingest_snapshot\(uuid, jsonb, jsonb, text, integer\)[\s\S]*set statement_timeout = '55s'/,
  );
  assert.match(migration, /security invoker/);
  assert.match(migration, /where run\.status = 'running'/);
  assert.match(migration, /status = 'failed'/);
  assert.match(
    migration,
    /previous\.parser_version = btrim\(source_result->>'parser_version'\)/,
  );
  for (const absoluteGuard of [
    "invalid_source_result",
    "source_failed",
    "partial_snapshot",
    "zero_accepted",
    "schema_invalid",
    "expected_markers_missing",
    "rejection_rate_high",
    "accepted_payload_mismatch",
    "invalid_payload",
  ]) {
    assert.ok(migration.includes(absoluteGuard), `${absoluteGuard} remains`);
  }
  assert.match(migration, /delete from app_meta\.ingest_lease/);
  assert.doesNotMatch(migration, /delete from public\.ingest_(?:source_)?runs/);
  assert.match(migration, /perform cron\.unschedule\(scheduled_job\.jobid\)/);
  assert.match(migration, /'ingest-listings',\s*'15 6,18 \* \* \*'/);
  assert.match(migration, /'ingest-official-ats',\s*'45 0,12 \* \* \*'/);
  assert.equal(
    migration.match(
      /select app_meta\.reap_stale_ingest_runs\(interval '20 minutes'\);\s+\n\s*with configuration as/g,
    )?.length,
    2,
  );
  assert.doesNotMatch(migration, /reaper as materialized/);
  assert.doesNotMatch(migration, /\*\/[26]/);
  assert.match(migration, /'mode', 'community'/);
  assert.match(migration, /'mode', 'official'/);
  assert.match(
    migration,
    /revoke execute on function public\.ingest_upsert_v3\(jsonb, text, jsonb\)\s+from public, anon, authenticated/,
  );
});

test("the private health view covers every source without exposing audit data", () => {
  assert.match(
    migration,
    /view app_meta\.ingest_source_health\s+with \(security_invoker = true\)/,
  );
  for (const source of SOURCE_IDS) {
    assert.ok(migration.includes(`('${source}'::text)`), `${source} is monitored`);
  }
  assert.match(migration, /source_run\.complete_snapshot/);
  assert.match(migration, /source_run\.run_id is not null/);
  assert.match(migration, /source_run\.schema_valid/);
  assert.match(migration, /source_run\.expected_markers_present/);
  assert.match(migration, /source_run\.accepted_count > 0/);
  assert.match(migration, /not source_run\.quarantined/);
  assert.match(migration, /interval '26 hours'/);
  assert.match(
    migration,
    /revoke all on app_meta\.ingest_source_health\s+from public, anon, authenticated, service_role/,
  );
});
