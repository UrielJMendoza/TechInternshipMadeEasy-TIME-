import type { Freshness, SortKey } from "@/lib/boardFilterState";

export const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["featured", "Featured"],
  ["newest", "Newest"],
  ["company", "Company A–Z"],
  ["salary", "Top salary"],
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
