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
  // "deferred" serves recent data while an over-budget sync waits; the feed
  // marks it healthy only while that data is younger than a day.
  const serving = health.mode === "live" || health.mode === "deferred";
  const healthy = health.status === "healthy" && serving && ingestion?.healthy === true;

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
      lastFailureCode: health.lastFailureCode,
      pendingRows: health.pendingRows,
      sync: { mode: health.lastSyncMode, fetchedRows: health.lastSyncFetchedRows },
      counts: {
        baselineRows: health.baselineRows,
        deltaRows: health.deltaRows,
        mergedRows: health.mergedRows,
        mappedRows: health.mappedRows,
        canonicalJobs: health.canonicalJobs,
        activeJobs: health.activeJobs,
        invalidRows: health.invalidRows,
        duplicateDeltaIds: health.duplicateDeltaIds,
        expiredRows: health.expiredRows,
      },
      refreshDurationMs: health.refreshDurationMs,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
