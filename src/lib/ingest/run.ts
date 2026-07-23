import type { NormalizedJob } from "../types";
import { applyPostFilters, dedupeJobs } from "./normalize";
import { fetchNorthwesternQuant } from "./sources/northwestern-quant";
import { fetchSimplify } from "./sources/simplify";
import { fetchSpeedy } from "./sources/speedy";
import { fetchVansh } from "./sources/vansh";
import { fetchZapply } from "./sources/zapply";
import { fetchZshah } from "./sources/zshah";

export interface SourceRun {
  source: string;
  fetched: number;
  accepted: number;
  succeeded: boolean;
  complete_snapshot: boolean;
  error?: string;
}

export interface IngestResult {
  fetched: Record<string, number | string>;
  sourceResults: SourceRun[];
  total: number;
  afterDedupe: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

interface SourceDefinition {
  source: string;
  completeSnapshot: boolean;
  fetch: () => Promise<NormalizedJob[]>;
}

// Order matters: dedupeJobs keeps the first occurrence, so richer sources
// with real posted dates and direct application links win duplicate ties.
const SOURCES: SourceDefinition[] = [
  { source: "simplify", completeSnapshot: true, fetch: fetchSimplify },
  { source: "zshah101", completeSnapshot: true, fetch: fetchZshah },
  { source: "zapplyjobs", completeSnapshot: true, fetch: fetchZapply },
  { source: "northwesternfintech", completeSnapshot: true, fetch: fetchNorthwesternQuant },
  { source: "speedyapply", completeSnapshot: true, fetch: fetchSpeedy },
  { source: "vanshb03", completeSnapshot: true, fetch: fetchVansh },
];

export async function runIngest(secret: string): Promise<IngestResult> {
  const settled = await Promise.allSettled(SOURCES.map((source) => source.fetch()));

  const fetched: Record<string, number | string> = {};
  const sourceResults: SourceRun[] = [];
  const jobs: NormalizedJob[] = [];
  let successfulSources = 0;

  settled.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === "fulfilled") {
      successfulSources += 1;
      const accepted = applyPostFilters(result.value);
      fetched[source.source] = result.value.length;
      sourceResults.push({
        source: source.source,
        fetched: result.value.length,
        accepted: accepted.length,
        succeeded: true,
        complete_snapshot: source.completeSnapshot,
      });
      jobs.push(...accepted);
    } else {
      const error = String(result.reason);
      fetched[source.source] = "error: " + error;
      sourceResults.push({
        source: source.source,
        fetched: 0,
        accepted: 0,
        succeeded: false,
        complete_snapshot: source.completeSnapshot,
        error,
      });
    }
  });

  if (successfulSources === 0) {
    throw new Error("all sources failed: " + JSON.stringify(fetched));
  }
  if (jobs.length === 0) {
    throw new Error("successful sources yielded no eligible listings: " + JSON.stringify(fetched));
  }

  const deduped = dedupeJobs(jobs);

  const { supabase } = await import("../supabase");
  const { data, error } = await supabase().rpc("ingest_upsert_v3", {
    payload: deduped,
    secret,
    source_results: sourceResults,
  });
  if (error) throw new Error("ingest_upsert_v3 failed: " + error.message);

  return {
    fetched,
    sourceResults,
    total: jobs.length,
    afterDedupe: deduped.length,
    inserted: data.inserted,
    updated: data.updated,
    deactivated: data.deactivated,
  };
}
