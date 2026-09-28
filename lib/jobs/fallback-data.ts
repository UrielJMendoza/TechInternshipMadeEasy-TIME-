import fallbackJobs00 from "@/data/fallback/jobs-00.json";
import fallbackJobs01 from "@/data/fallback/jobs-01.json";
import fallbackJobs02 from "@/data/fallback/jobs-02.json";
import fallbackJobs03 from "@/data/fallback/jobs-03.json";
import fallbackJobs04 from "@/data/fallback/jobs-04.json";
import fallbackJobs05 from "@/data/fallback/jobs-05.json";
import fallbackJobs06 from "@/data/fallback/jobs-06.json";
import fallbackJobs07 from "@/data/fallback/jobs-07.json";
import fallbackJobs08 from "@/data/fallback/jobs-08.json";
import fallbackJobs09 from "@/data/fallback/jobs-09.json";
import fallbackJobs10 from "@/data/fallback/jobs-10.json";
import fallbackCapture from "@/data/fallback/captured-at.json";

// Production builds rewrite these files with a fresh export
// (scripts/export-feed-snapshot.mjs); the committed copy is the last resort.
export const BUNDLED_FALLBACK_CAPTURED_AT: string = fallbackCapture.capturedAt;

export const BUNDLED_FALLBACK_ROWS: readonly unknown[] = Object.freeze([
  ...fallbackJobs00,
  ...fallbackJobs01,
  ...fallbackJobs02,
  ...fallbackJobs03,
  ...fallbackJobs04,
  ...fallbackJobs05,
  ...fallbackJobs06,
  ...fallbackJobs07,
  ...fallbackJobs08,
  ...fallbackJobs09,
  ...fallbackJobs10,
]);
