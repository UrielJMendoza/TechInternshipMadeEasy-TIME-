import type { Json } from "../database.types.ts";
import { getJobLocationFacetIds } from "../jobLocations.ts";
import {
  UNKNOWN_TERM_KEY,
  sortTermKeys,
  termKeysFromValues,
} from "../jobTerms.ts";
import { runtimeEnv } from "../runtimeEnv.ts";
import { serviceSupabase } from "../supabase.server.ts";
import type {
  Category,
  NormalizedJob,
  NormalizationConfidence,
  SourceId,
  StructuredLocation,
} from "../types.ts";
import {
  applyPostFilters,
  companyDomainFromApplicationUrl,
} from "./normalize.ts";
import {
  COMMUNITY_SOURCE_IDS,
  OFFICIAL_SOURCE_IDS,
  SOURCE_REGISTRY,
} from "./sourceRegistry.ts";
import type { SourceSnapshot } from "./contracts.ts";
import { rejectedCountAfterPostFilters } from "./contracts.ts";
import { fetchNorthwesternQuantSnapshot } from "./sources/northwestern-quant.ts";
import { fetchSimplifySnapshot } from "./sources/simplify.ts";
import { fetchSpeedySnapshot } from "./sources/speedy.ts";
import { fetchVanshSnapshot } from "./sources/vansh.ts";
import { fetchZapplySnapshot } from "./sources/zapply.ts";
import { fetchZshahSnapshot } from "./sources/zshah.ts";
import {
  fetchAshbyNotionSnapshot,
  fetchGreenhouseTenstorrentSnapshot,
  fetchLeverHermeusSnapshot,
} from "./sources/official-ats.ts";

const PARSER_VERSION = "timley-parser-v3";
const OFFICIAL_PARSER_VERSION = "timley-official-ats-v1";

const ADAPTERS: Record<SourceId, () => Promise<SourceSnapshot>> = {
  simplify: fetchSimplifySnapshot,
  zshah101: fetchZshahSnapshot,
  zapplyjobs: fetchZapplySnapshot,
  northwesternfintech: fetchNorthwesternQuantSnapshot,
  speedyapply: fetchSpeedySnapshot,
  vanshb03: fetchVanshSnapshot,
  "gh:tenstorrentuniversity": fetchGreenhouseTenstorrentSnapshot,
  "ashby:notion": fetchAshbyNotionSnapshot,
  "lever:hermeus": fetchLeverHermeusSnapshot,
};

export interface SourceRun {
  source: SourceId;
  raw_fetched: number;
  parsed: number;
  accepted: number;
  rejected: number;
  succeeded: boolean;
  complete_snapshot: boolean;
  schema_valid: boolean;
  markers_present: boolean;
  parser_version: string;
  snapshot_checksum: string;
  duration_ms: number;
  error: string | null;
}

export interface IngestResult {
  run_id: string;
  sourceResults: SourceRun[];
  total: number;
  acceptedObservations: number;
  inserted: number;
  updated: number;
  deactivated: number;
  healthy_sources: number;
  quarantined_sources: number;
  snapshot_checksum: string;
}

function codeVersion(override?: string): string {
  return (
    override ??
    runtimeEnv("VERCEL_GIT_COMMIT_SHA") ??
    runtimeEnv("INGEST_CODE_VERSION") ??
    "local-unreviewed"
  ).slice(0, 128);
}

async function checksum(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function confidence(value: NormalizationConfidence | undefined): number {
  return value === "high" ? 1 : value === "medium" ? 0.7 : 0.3;
}

function primaryLocation(job: NormalizedJob): StructuredLocation | null {
  return job.locations?.find((location) => location.eligible) ?? null;
}

const CS_CATEGORIES = new Set<Category>([
  "software", "cloud", "data-ml", "quant", "security",
]);
const ENGINEERING_CATEGORIES = new Set<Category>([
  "hardware", "mechanical", "electrical", "civil", "aerospace",
  "manufacturing", "industrial", "materials",
]);
const BUSINESS_CATEGORIES = new Set<Category>([
  "finance", "consulting", "accounting", "operations", "product",
  "marketing", "supply-chain", "quant",
]);

function taxonomyIds(job: NormalizedJob): { major_ids: string[]; niche_ids: string[] } {
  const majorIds = ["all"];
  if (CS_CATEGORIES.has(job.category)) majorIds.push("computer-science");
  if (ENGINEERING_CATEGORIES.has(job.category)) majorIds.push("engineering");
  if (BUSINESS_CATEGORIES.has(job.category)) majorIds.push("business");

  const nicheIds = ["all"];
  const nicheByCategory: Partial<Record<Category, string>> = {
    software: "software-engineering",
    cloud: "cloud-infra",
    security: "security",
    "data-ml": "data-ml",
    quant: "quant",
    hardware: "hardware-firmware",
    electrical: "electrical",
    mechanical: "mechanical",
    civil: "civil",
    aerospace: "aerospace",
    manufacturing: "manufacturing",
    industrial: "industrial",
    materials: "materials",
    finance: "finance",
    consulting: "consulting",
    accounting: "accounting",
    operations: "operations",
    product: "product",
    marketing: "marketing",
    "supply-chain": "supply-chain",
  };
  const categoryNiche = nicheByCategory[job.category];
  if (categoryNiche) nicheIds.push(categoryNiche);
  if (job.category === "cloud" && /\b(?:site reliability|sre)\b/i.test(job.title)) {
    nicheIds.push("site-reliability");
  }
  return { major_ids: majorIds, niche_ids: nicheIds };
}

function fallbackLocationFacet(location: StructuredLocation): string | null {
  if (location.metro_id) {
    return {
      nyc: "new-york-ny",
      "sf-bay": "san-francisco-bay-area",
      seattle: "seattle-wa",
      austin: "austin-tx",
      chicago: "chicago-il",
      boston: "boston-ma",
      "los-angeles": "los-angeles-ca",
      "washington-dc": "washington-dc",
      denver: "denver-co",
    }[location.metro_id] ?? null;
  }
  const label = [location.city, location.region_code].filter(Boolean).join(" ");
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `place:${slug}` : null;
}

function jobPayload(job: NormalizedJob): Json {
  const location = primaryLocation(job);
  const compensation = job.compensation ?? null;
  const taxonomy = taxonomyIds(job);
  const companyDomain = companyDomainFromApplicationUrl(job.company, job.link);
  const facets = getJobLocationFacetIds(job.location);
  if (facets.length === 0 && location) {
    const fallback = fallbackLocationFacet(location);
    if (fallback) facets.push(fallback as ReturnType<typeof getJobLocationFacetIds>[number]);
  }

  return {
    title: job.title,
    company: job.company,
    category: job.category,
    role_type: job.role_type,
    season: job.season,
    term_keys: sortTermKeys(
      [
        ...(job.term_keys ?? []),
        ...termKeysFromValues([
          job.season ?? "",
          job.raw_title ?? job.title,
        ]),
      ],
    ).filter((key) => key !== UNKNOWN_TERM_KEY),
    sponsorship: job.sponsorship,
    link: job.link,
    source: job.source,
    source_url: job.source_url ?? SOURCE_REGISTRY[job.source as SourceId]?.homepage ?? null,
    external_id: job.external_id,
    requisition_id: job.requisition_id,
    dedupe_key: job.dedupe_key,
    location: job.location,
    raw_location: job.raw_location ?? job.location,
    country_code: location?.country_code ?? null,
    region_code: location?.region_code ?? null,
    city: location?.city ?? null,
    metro_id: location?.metro_id ?? null,
    location_type: location?.location_type ?? "onsite",
    normalization_confidence: confidence(location?.normalization_confidence),
    location_facets: facets,
    major_ids: taxonomy.major_ids,
    niche_ids: taxonomy.niche_ids,
    search_text: [job.title, job.company, job.location, job.category].join(" "),
    posted_date: job.posted_date,
    salary_raw: compensation?.raw_text ?? null,
    salary_currency: compensation?.currency ?? null,
    salary_minimum: compensation?.minimum ?? null,
    salary_maximum: compensation?.maximum ?? null,
    salary_cadence: compensation?.cadence ?? null,
    annualized_salary_minimum: compensation?.annualized_minimum ?? null,
    annualized_salary_maximum: compensation?.annualized_maximum ?? null,
    salary_parse_confidence: compensation
      ? confidence(compensation.parse_confidence)
      : null,
    company_domain: companyDomain,
    company_domain_confidence: companyDomain ? 1 : null,
    parser_version: SOURCE_REGISTRY[job.source as SourceId]?.parser_version ?? PARSER_VERSION,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultNumber(value: unknown, key: string): number {
  return isRecord(value) && typeof value[key] === "number" ? value[key] : 0;
}

async function failRun(
  runId: string,
  sourceResults: SourceRun[],
  error: unknown,
  startedAt: number,
  db = serviceSupabase(),
): Promise<void> {
  const message = error instanceof Error ? error.message : "ingestion failed";
  const { error: recordError } = await db.rpc("fail_ingest_run", {
    run_id: runId,
    source_results: sourceResults as unknown as Json,
    error_message: message,
    duration_ms: Math.max(0, Date.now() - startedAt),
  });
  if (recordError) console.error("unable to record failed ingest run", recordError.message);
}

export async function runSources(
  sourceIds: readonly SourceId[],
  origin: string,
  parserVersion: string,
  codeVersionOverride?: string,
  dependencies?: { db: ReturnType<typeof serviceSupabase>; adapters?: typeof ADAPTERS },
): Promise<IngestResult> {
  const startedAt = Date.now();
  const db = dependencies?.db ?? serviceSupabase();
  const { data: runId, error: beginError } = await db.rpc("begin_ingest_run", {
    trigger_origin: origin,
    ingest_code_version: codeVersion(codeVersionOverride),
    parser_version: parserVersion,
  });
  if (beginError || !runId) {
    throw new Error(beginError?.message ?? "unable to begin ingest run");
  }

  const sourceResults: SourceRun[] = [];

  try {
    // Process one source at a time so decoded feeds and normalization graphs can
    // be collected before the next source. Build each database payload once.
    const payload: Json[] = [];
    const sourceHashes: string[] = [];
    for (const source of sourceIds) {
      const sourceStartedAt = Date.now();
      try {
        const snapshot = await (dependencies?.adapters ?? ADAPTERS)[source]();
        const accepted = applyPostFilters(snapshot.jobs);
        const sourcePayload = accepted.map(jobPayload);
        const snapshotHash = await checksum(sourcePayload.map((job) => JSON.stringify(job)).sort());
        payload.push(...sourcePayload);
        sourceHashes.push(`${source}:${snapshotHash}`);
        sourceResults.push({
          source,
          raw_fetched: snapshot.raw_count,
          parsed: snapshot.parsed_count,
          accepted: accepted.length,
          rejected: rejectedCountAfterPostFilters(snapshot, accepted.length),
          succeeded: true,
          complete_snapshot: snapshot.health.complete,
          schema_valid: snapshot.health.schema_valid,
          markers_present: snapshot.health.markers_valid,
          parser_version: snapshot.parser_version,
          snapshot_checksum: snapshotHash,
          duration_ms: Date.now() - sourceStartedAt,
          error: snapshot.health.issues.length
            ? snapshot.health.issues.slice(0, 10).map((issue) => issue.code).join(",") : null,
        });
      } catch (error) {
        sourceResults.push({
          source, raw_fetched: 0, parsed: 0, accepted: 0, rejected: 0,
          succeeded: false, complete_snapshot: false, schema_valid: false,
          markers_present: false, parser_version: SOURCE_REGISTRY[source].parser_version,
          snapshot_checksum: "", duration_ms: Date.now() - sourceStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (sourceResults.every((source) => !source.succeeded)) {
      throw new Error("all ingestion sources failed");
    }

    const snapshotChecksum = await checksum(sourceHashes.sort());
    const { data, error } = await db.rpc("apply_ingest_snapshot", {
      run_id: runId,
      jobs_payload: payload,
      source_results: sourceResults as unknown as Json,
      snapshot_checksum: snapshotChecksum,
      duration_ms: Math.max(0, Date.now() - startedAt),
    });
    if (error) throw new Error(`apply_ingest_snapshot failed: ${error.message}`);

    return {
      run_id: runId,
      sourceResults,
      total: payload.length,
      acceptedObservations: payload.length,
      inserted: resultNumber(data, "inserted"),
      updated: resultNumber(data, "updated"),
      deactivated: resultNumber(data, "deactivated"),
      healthy_sources: resultNumber(data, "healthy_sources"),
      quarantined_sources: resultNumber(data, "quarantined_sources"),
      snapshot_checksum: snapshotChecksum,
    };
  } catch (error) {
    await failRun(runId, sourceResults, error, startedAt, db);
    throw error;
  }
}

export function runIngest(
  origin: string,
  codeVersionOverride?: string,
): Promise<IngestResult> {
  return runSources(
    COMMUNITY_SOURCE_IDS,
    origin,
    PARSER_VERSION,
    codeVersionOverride,
  );
}

function officialTriggerOrigin(origin: string): string {
  const normalized = origin.trim() || "official-ats";
  return normalized.slice(0, 64);
}

export function runOfficialIngest(
  origin: string,
  codeVersionOverride?: string,
): Promise<IngestResult> {
  return runSources(
    OFFICIAL_SOURCE_IDS,
    officialTriggerOrigin(origin),
    OFFICIAL_PARSER_VERSION,
    codeVersionOverride,
  );
}

/** A complete single-source refresh uses the same quarantine and lease rules. */
export function runSourceIngest(source: SourceId, origin: string, version?: string): Promise<IngestResult> {
  if (!(COMMUNITY_SOURCE_IDS as readonly SourceId[]).includes(source)) throw new Error("Unsupported community source");
  return runSources([source], origin, PARSER_VERSION, version);
}
