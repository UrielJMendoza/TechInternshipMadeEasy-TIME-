import type {
  Freshness,
  MinimumSalary,
  SortKey,
} from "@/lib/boardFilterState";

export const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["featured", "Featured"],
  ["newest", "Newest"],
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

export const MINIMUM_SALARY_OPTIONS: ReadonlyArray<
  readonly [MinimumSalary, string]
> = [
  ["any", "Any listed pay"],
  ["40000", "$40k+"],
  ["60000", "$60k+"],
  ["80000", "$80k+"],
  ["100000", "$100k+"],
  ["120000", "$120k+"],
];
