import {
  getPublicJobsFeedHealth,
  getPublicJobsSnapshot,
} from "@/lib/jobs/live";

export async function GET() {
  try {
    await getPublicJobsSnapshot();
  } catch {
    // The health state below remains the single sanitized source of truth.
  }

  const health = getPublicJobsFeedHealth();
  const healthy = health.status === "healthy" && health.mode === "live";

  return Response.json(
    {
      ok: healthy,
      status: health.status,
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
