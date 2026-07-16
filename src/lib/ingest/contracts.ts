import type { NormalizedJob, SourceId } from "../types.ts";

export interface SnapshotIssue {
  code:
    | "invalid_json"
    | "invalid_schema"
    | "missing_marker"
    | "invalid_row"
    | "invalid_url"
    | "invalid_date"
    | "empty_snapshot";
  message: string;
  row?: number;
  path?: string;
}

export interface SourceSnapshotHealth {
  schema_valid: boolean;
  markers_valid: boolean;
  complete: boolean;
  issues: SnapshotIssue[];
}

export interface SourceSnapshot {
  source: SourceId;
  parser_version: string;
  raw_count: number;
  parsed_count: number;
  accepted_count: number;
  rejected_count: number;
  jobs: NormalizedJob[];
  health: SourceSnapshotHealth;
}

export type SourceAdapter = () => Promise<SourceSnapshot>;

export interface SnapshotCounts {
  raw_count: number;
  parsed_count: number;
  accepted_count: number;
  rejected_count: number;
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function createSnapshot(
  source: SourceId,
  parserVersion: string,
  jobs: NormalizedJob[],
  counts: Partial<SnapshotCounts> = {},
  issues: SnapshotIssue[] = [],
  markerHealth = true,
): SourceSnapshot {
  const rawCount = safeCount(counts.raw_count ?? jobs.length);
  const parsedCount = safeCount(counts.parsed_count ?? jobs.length);
  const reportedAcceptedCount = safeCount(
    counts.accepted_count ?? jobs.length,
  );
  const acceptedCount = jobs.length;
  const normalizedIssues = [...issues];

  if (reportedAcceptedCount !== acceptedCount) {
    normalizedIssues.push({
      code: "invalid_schema",
      message:
        `Snapshot reported ${reportedAcceptedCount} accepted rows but returned ` +
        `${acceptedCount} jobs`,
      path: "accepted_count",
    });
  }

  if (
    acceptedCount === 0 &&
    !normalizedIssues.some((issue) => issue.code === "empty_snapshot")
  ) {
    normalizedIssues.push({
      code: "empty_snapshot",
      message:
        rawCount === 0
          ? "Source returned no candidate rows"
          : "Source produced zero accepted jobs",
    });
  }

  const rejectedCount = safeCount(
    counts.rejected_count ??
      parsedCount - acceptedCount,
  );
  const schemaValid = !normalizedIssues.some((issue) =>
    ["invalid_json", "invalid_schema", "invalid_row"].includes(issue.code),
  );
  const markersValid =
    markerHealth &&
    !normalizedIssues.some((issue) => issue.code === "missing_marker");
  const complete =
    schemaValid &&
    markersValid &&
    acceptedCount > 0 &&
    !normalizedIssues.some((issue) => issue.code === "empty_snapshot");

  return {
    source,
    parser_version: parserVersion,
    raw_count: Math.max(0, rawCount),
    parsed_count: Math.max(0, parsedCount),
    accepted_count: Math.max(0, acceptedCount),
    rejected_count: rejectedCount,
    jobs,
    health: {
      schema_valid: schemaValid,
      markers_valid: markersValid,
      complete,
      issues: normalizedIssues,
    },
  };
}

/** Structural feed failures fail closed; accepted rows survive row-level rejects. */
export function jobsFromHealthySnapshot(snapshot: SourceSnapshot): NormalizedJob[] {
  if (!snapshot.health.complete) {
    const details = snapshot.health.issues
      .slice(0, 3)
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `${snapshot.source} snapshot is incomplete${details ? ` (${details})` : ""}`,
    );
  }
  return snapshot.jobs;
}

export function rejectedCountAfterPostFilters(
  snapshot: SourceSnapshot,
  acceptedCount: number,
): number {
  const postFilterDrops = Math.max(
    snapshot.accepted_count - safeCount(acceptedCount),
    0,
  );
  return snapshot.rejected_count + postFilterDrops;
}

export function combineSnapshots(
  source: SourceId,
  parserVersion: string,
  snapshots: readonly SourceSnapshot[],
): SourceSnapshot {
  const jobs = snapshots.flatMap((snapshot) => snapshot.jobs);
  const issues = snapshots.flatMap((snapshot) => snapshot.health.issues);
  const markerHealth = snapshots.every(
    (snapshot) => snapshot.health.markers_valid,
  );

  return createSnapshot(
    source,
    parserVersion,
    jobs,
    {
      raw_count: snapshots.reduce((sum, snapshot) => sum + snapshot.raw_count, 0),
      parsed_count: snapshots.reduce(
        (sum, snapshot) => sum + snapshot.parsed_count,
        0,
      ),
      accepted_count: snapshots.reduce(
        (sum, snapshot) => sum + snapshot.accepted_count,
        0,
      ),
      rejected_count: snapshots.reduce(
        (sum, snapshot) => sum + snapshot.rejected_count,
        0,
      ),
    },
    issues,
    markerHealth,
  );
}
