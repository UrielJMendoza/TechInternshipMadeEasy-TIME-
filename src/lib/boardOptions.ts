import type { Freshness, SortKey } from "@/lib/boardFilterState";

export const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["featured", "Featured"],
  ["newest", "Newest openings"],
  ["company", "Company A–Z"],
  ["salary", "Highest listed pay"],
  ["location", "Location A–Z"],
  ["application-stage", "Application stage"],
];

export const FRESHNESS_OPTIONS: ReadonlyArray<
  readonly [Freshness, string]
> = [
  ["all", "All"],
  ["hot", "Hot"],
  ["new", "New"],
];
