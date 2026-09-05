import {
  getPublicJobsFeedHealth,
  getPublicIngestHealth,
  getPublicJobsSnapshot,
} from "@/lib/jobs/live";

export async function GET() {
  const ingestionRequest = getPublicIngestHealth();
  try {
    await getPublicJobsSnapshot();
  } catch {
    // The health state below remains the single sanitized source of truth.
  }

  const health = getPublicJobsFeedHealth();
  const ingestion = await ingestionRequest;
  const healthy = health.status === "healthy" && health.mode === "live" && ingestion?.healthy === true;

  return Response.json(
    {
      ok: healthy,
      status: healthy ? "healthy" : "degraded",
      ingestion,
      mode: health.mode,
      snapshotAt: health.snapshotAt,
      fallbackCapturedAt: health.fallbackCapturedAt,
      lastAttemptAt: health.lastAttemptAt,
      lastSuccessAt: health.lastSuccessAt,
      nextRetryAt: health.nextRetryAt,
      consecutiveFailures: health.consecutiveFailures,
      counts: {
        baselineRows: health.baselineRows,
        deltaRows: health.deltaRows,
        mergedRows: health.mergedRows,
        mappedRows: health.mappedRows,
        canonicalJobs: health.canonicalJobs,
        activeJobs: health.activeJobs,
        invalidRows: health.invalidRows,
        duplicateDeltaIds: health.duplicateDeltaIds,
      },
      refreshDurationMs: health.refreshDurationMs,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
