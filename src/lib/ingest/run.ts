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

interface SnapshotAssessment {
  completeSnapshot: boolean;
  warning?: string;
}

const MINIMUM_ACCEPTED_BY_SOURCE: Record<string, number> = {
  simplify: 100,
  zshah101: 50,
  zapplyjobs: 25,
  northwesternfintech: 20,
  speedyapply: 50,
  vanshb03: 25,
};
const DEFAULT_MINIMUM_ACCEPTED = 20;
const MINIMUM_BASELINE_FOR_RATIO = 20;
const MINIMUM_BASELINE_RETENTION = 0.5;
const BASELINE_QUERY_TIMEOUT_MS = 5_000;

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

/**
 * A complete snapshot can deactivate every active row omitted from its source.
 * Refuse that authority when a parser returns a suspiciously small result. The
 * active-row baseline catches sudden drops; source-specific floors still fail
 * closed if the baseline lookup is unavailable.
 */
export function assessSourceSnapshot(input: {
  source: string;
  fetched: number;
  accepted: number;
  activeBaseline: number | null;
  configuredComplete: boolean;
}): SnapshotAssessment {
  if (!input.configuredComplete) return { completeSnapshot: false };

  if (input.fetched <= 0 || input.accepted <= 0) {
    return {
      completeSnapshot: false,
      warning: "snapshot guard: source returned no eligible listings",
    };
  }

  const minimum = MINIMUM_ACCEPTED_BY_SOURCE[input.source] ?? DEFAULT_MINIMUM_ACCEPTED;
  const baseline = input.activeBaseline;
  if (baseline !== null && baseline >= MINIMUM_BASELINE_FOR_RATIO) {
    const minimumFromBaseline = Math.ceil(baseline * MINIMUM_BASELINE_RETENTION);
    const safeMinimum = Math.max(minimum, minimumFromBaseline);
    if (input.accepted < safeMinimum) {
      return {
        completeSnapshot: false,
        warning:
          `snapshot guard: accepted ${input.accepted} listings, below the safe minimum ` +
          `${safeMinimum} for an active baseline of ${baseline}`,
      };
    }
  }

  if (input.accepted < minimum) {
    return {
      completeSnapshot: false,
      warning:
        `snapshot guard: accepted ${input.accepted} listings, below the ` +
        `${input.source} minimum of ${minimum}`,
    };
  }

  return { completeSnapshot: true };
}

export const snapshotSafetyLimits = {
  minimumAcceptedBySource: MINIMUM_ACCEPTED_BY_SOURCE,
  defaultMinimumAccepted: DEFAULT_MINIMUM_ACCEPTED,
  minimumBaselineForRatio: MINIMUM_BASELINE_FOR_RATIO,
  minimumBaselineRetention: MINIMUM_BASELINE_RETENTION,
} as const;

export async function runIngest(secret: string): Promise<IngestResult> {
  const settled = await Promise.allSettled(SOURCES.map((source) => source.fetch()));

  const fetched: Record<string, number | string> = {};
  const prepared = settled.map((result, index) => {
    const source = SOURCES[index];
    if (result.status === "rejected") {
      return { source, error: String(result.reason) };
    }

    try {
      if (!Array.isArray(result.value)) {
        throw new TypeError("source parser returned a non-array result");
      }
      const accepted = applyPostFilters(result.value);
      return { source, fetched: result.value.length, accepted };
    } catch (error) {
      return { source, error: String(error) };
    }
  });

  if (prepared.every((result) => "error" in result)) {
    for (const result of prepared) {
      fetched[result.source.source] = "error: " + result.error;
    }
    throw new Error("all sources failed: " + JSON.stringify(fetched));
  }

  const { supabase } = await import("../supabase");
  const database = supabase();
  const baselineEntries = await Promise.all(
    prepared.map(async (result) => {
      if ("error" in result) return [result.source.source, null] as const;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BASELINE_QUERY_TIMEOUT_MS);
      try {
        const { count, error } = await database
          .from("internships")
          .select("id", { count: "exact", head: true })
          .eq("source", result.source.source)
          .eq("is_active", true)
          .abortSignal(controller.signal);
        return [
          result.source.source,
          error || typeof count !== "number" ? null : count,
        ] as const;
      } catch {
        return [result.source.source, null] as const;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
  const activeBaselines = new Map(baselineEntries);
  const sourceResults: SourceRun[] = [];
  const jobs: NormalizedJob[] = [];

  for (const result of prepared) {
    if ("error" in result) {
      fetched[result.source.source] = "error: " + result.error;
      sourceResults.push({
        source: result.source.source,
        fetched: 0,
        accepted: 0,
        succeeded: false,
        complete_snapshot: false,
        error: result.error,
      });
      continue;
    }

    const assessment = assessSourceSnapshot({
      source: result.source.source,
      fetched: result.fetched,
      accepted: result.accepted.length,
      activeBaseline: activeBaselines.get(result.source.source) ?? null,
      configuredComplete: result.source.completeSnapshot,
    });
    fetched[result.source.source] = result.fetched;
    sourceResults.push({
      source: result.source.source,
      fetched: result.fetched,
      accepted: result.accepted.length,
      succeeded: true,
      complete_snapshot: assessment.completeSnapshot,
      ...(assessment.warning ? { error: assessment.warning } : {}),
    });
    jobs.push(...result.accepted);
  }

  if (jobs.length === 0) {
    throw new Error("successful sources yielded no eligible listings: " + JSON.stringify(fetched));
  }

  const deduped = dedupeJobs(jobs);

  const { data, error } = await database.rpc("ingest_upsert_v3", {
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
