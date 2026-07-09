import type { NormalizedJob } from "../types";
import { applyPostFilters, dedupeJobs } from "./normalize";
import { fetchSimplify } from "./sources/simplify";
import { fetchSpeedy } from "./sources/speedy";
import { fetchVansh } from "./sources/vansh";
import { fetchZshah } from "./sources/zshah";

export interface IngestResult {
  fetched: Record<string, number | string>;
  total: number;
  afterDedupe: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

// Order matters: dedupeJobs keeps the first occurrence, so richer sources
// (simplify and zshah have real posted dates + categories) win over sparser ones.
const SOURCES: Array<[string, () => Promise<NormalizedJob[]>]> = [
  ["simplify", fetchSimplify],
  ["zshah101", fetchZshah],
  ["speedyapply", fetchSpeedy],
  ["vanshb03", fetchVansh],
];

export async function runIngest(secret: string): Promise<IngestResult> {
  const settled = await Promise.allSettled(SOURCES.map(([, fn]) => fn()));

  const fetched: Record<string, number | string> = {};
  const jobs: NormalizedJob[] = [];
  settled.forEach((result, i) => {
    const name = SOURCES[i][0];
    if (result.status === "fulfilled") {
      fetched[name] = result.value.length;
      jobs.push(...result.value);
    } else {
      fetched[name] = `error: ${result.reason}`;
    }
  });

  if (jobs.length === 0) {
    throw new Error(`all sources failed: ${JSON.stringify(fetched)}`);
  }

  const deduped = dedupeJobs(applyPostFilters(jobs));

  const { supabase } = await import("../supabase");
  const { data, error } = await supabase().rpc("ingest_upsert", {
    payload: deduped,
    secret,
  });
  if (error) throw new Error(`ingest_upsert failed: ${error.message}`);

  return {
    fetched,
    total: jobs.length,
    afterDedupe: deduped.length,
    inserted: data.inserted,
    updated: data.updated,
    deactivated: data.deactivated,
  };
}
